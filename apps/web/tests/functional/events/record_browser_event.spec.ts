import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import limiter from '@adonisjs/limiter/services/main';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { CreateServerKey } from '#collection/actions/create_server_key';
import { browserEventProtocol } from '#collection/browser_event_protocol';
import { EventSource } from '#collection/event_source';
import { db } from '#shared/services/db';
import { collectionLimits } from '#start/limiter';
import { AddAllowedDomain } from '#websites/actions/add_allowed_domain';
import { CreateCollectionKey } from '#websites/actions/create_collection_key';
import { RevokeCollectionKey } from '#websites/actions/revoke_collection_key';

const endpoint = 'http://localhost:3333/api/events';

async function createWebsite(allowedDomain = 'example.com', identityMode: 'anonymous' | 'product' = 'anonymous') {
	const userId = randomUUID();
	const workspaceId = randomUUID();
	const websiteId = randomUUID();
	const trackingId = randomUUID();

	await db
		.insertInto('users')
		.values({ id: userId, email: `${userId}@example.com`, password: 'unused', name: null, updated_at: null })
		.execute();
	await db.insertInto('workspaces').values({ id: workspaceId, owner_user_id: userId }).execute();
	await db
		.insertInto('websites')
		.values({
			id: websiteId,
			workspace_id: workspaceId,
			name: 'Example',
			tracking_id: trackingId,
			allowed_domain: allowedDomain,
			identity_mode: identityMode,
		})
		.execute();

	return { ownerUserId: userId, websiteId, trackingId };
}

async function postEvent(
	trackingId: string,
	body: Record<string, unknown>,
	origin = 'https://example.com',
	query = '',
	ip = '203.0.113.42',
	userAgent?: string,
) {
	return fetch(`${endpoint}${query}`, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': 'application/json',
			origin,
			'x-forwarded-for': ip,
			...(userAgent ? { 'user-agent': userAgent } : {}),
		},
		body: JSON.stringify({
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path: '/',
			referrer: null,
			utmSource: null,
			utmMedium: null,
			utmCampaign: null,
			...body,
		}),
	});
}

async function postCustomEvent(
	trackingId: string,
	body: Record<string, unknown>,
	origin = 'https://example.com',
	ip = '203.0.113.42',
) {
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': 'application/json',
			origin,
			'x-forwarded-for': ip,
			'user-agent': 'Custom Event Browser',
		},
		body: JSON.stringify({
			trackingId,
			name: 'signup',
			occurredAt: new Date().toISOString(),
			path: '/pricing',
			properties: {},
			...body,
		}),
	});
}

async function postIdentify(
	trackingId: string,
	distinctId: string,
	origin = 'https://example.com',
	ip = '203.0.113.42',
) {
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': 'application/json',
			origin,
			'x-forwarded-for': ip,
			'user-agent': 'Custom Event Browser',
		},
		body: JSON.stringify({
			trackingId,
			name: '$identify',
			occurredAt: new Date().toISOString(),
			path: '/pricing',
			distinctId,
		}),
	});
}

async function postRaw(body: string, contentType: string, ip = '203.0.113.42') {
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': contentType,
			'x-forwarded-for': ip,
			'origin': 'https://example.com',
		},
		body,
	});
}

async function postBatch(
	trackingId: string,
	events: Record<string, unknown>[],
	origin = 'https://example.com',
	ip = '203.0.113.42',
) {
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': 'application/json',
			origin,
			'x-forwarded-for': ip,
			'user-agent': 'Batch Browser',
		},
		body: JSON.stringify({ trackingId, events }),
	});
}

async function postServerBatch(secret: string, events: Record<string, unknown>[]) {
	return fetch('http://localhost:3333/api/server/events', {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'authorization': `Bearer ${secret}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ events }),
	});
}

test.group('POST /api/events', (group) => {
	group.each.setup(async () => {
		await limiter.clear();
		await db.deleteFrom('users').execute();
	});

	test('accepts and persists a private anonymous pageview', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite();

		const response = await postEvent(
			trackingId,
			{
				path: '/pricing/summer%20sale',
				referrer: 'https://search.example/results?q=private#result',
				utmSource: 'newsletter',
				utmMedium: 'email',
				utmCampaign: 'launch',
			},
			undefined,
			'?path=/overridden',
		);

		assert.equal(response.status, 202);
		assert.equal(response.headers.get('access-control-allow-origin'), 'https://example.com');
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.equal(event.website_id, websiteId);
		assert.equal(event.name, '$pageview');
		assert.equal(event.path, '/pricing/summer%20sale');
		assert.equal(event.source, EventSource.Browser);
		assert.equal(event.referrer, 'https://search.example/results');
		assert.equal(event.utm_source, 'newsletter');
		assert.equal(event.utm_medium, 'email');
		assert.equal(event.utm_campaign, 'launch');
		assert.match(event.anonymous_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
		assert.match(event.session_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
		assert.notProperty(event, 'ip');
		assert.notProperty(event, 'user_agent');
	});

	test('persists only coarse dimensions derived from the transient User-Agent', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const userAgent =
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

		const response = await postEvent(trackingId, {}, undefined, '', undefined, userAgent);

		assert.equal(response.status, 202);
		const event = await db
			.selectFrom('events')
			.select(['browser', 'operating_system', 'device'])
			.executeTakeFirstOrThrow();
		assert.deepEqual(event, { browser: 'Edge', operating_system: 'Windows', device: 'Desktop' });
		assert.notInclude(JSON.stringify(event), userAgent);
	});

	test('persists only the Country derived from the trusted client IP', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		const response = await postEvent(trackingId, {}, undefined, '', '81.2.69.142');

		assert.equal(response.status, 202);
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.equal(event.country, 'GB');
		assert.notProperty(event, 'ip');
		assert.notProperty(event, 'ip_address');
	});

	test('persists the ephemeral session supplied by the browser tracker', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const sessionId = randomUUID();

		const response = await postEvent(trackingId, { sessionId });

		assert.equal(response.status, 202);
		assert.equal((await db.selectFrom('events').select('session_id').executeTakeFirstOrThrow()).session_id, sessionId);
	});

	test('keeps pageview empty nullable fields normalized to null', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		const response = await postEvent(trackingId, {
			referrer: '',
			utmSource: '',
			utmMedium: '',
			utmCampaign: '',
		});

		assert.equal(response.status, 202);
		const event = await db
			.selectFrom('events')
			.select(['referrer', 'utm_source', 'utm_medium', 'utm_campaign'])
			.executeTakeFirstOrThrow();
		assert.deepEqual(event, { referrer: null, utm_source: null, utm_medium: null, utm_campaign: null });
	});

	test('accepts primitive custom event properties with the anonymous browser identity', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite();

		const response = await postCustomEvent(trackingId, {
			properties: { plan: 'pro', seats: 3, trial: true, coupon: null, empty: '' },
		});

		assert.equal(response.status, 202);
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.equal(event.website_id, websiteId);
		assert.equal(event.name, 'signup');
		assert.equal(event.path, '/pricing');
		assert.equal(event.source, EventSource.Browser);
		assert.deepEqual(event.properties, { plan: 'pro', seats: 3, trial: true, coupon: null, empty: '' });
		assert.isNull(event.referrer);
		assert.isNull(event.utm_source);
		assert.match(event.anonymous_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
		assert.match(event.session_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
		assert.notProperty(event, 'ip');
		assert.notProperty(event, 'user_agent');
	});

	test('deduplicates an event_id per Website across single, batch, and concurrent ingestion', async ({ assert }) => {
		const first = await createWebsite();
		const second = await createWebsite();
		const eventId = 'checkout_01J8ZV7Y7J6QJ9M8X2P4';

		const responses = await Promise.all([
			postCustomEvent(first.trackingId, { eventId }),
			postCustomEvent(first.trackingId, { eventId }),
			postBatch(first.trackingId, [
				{
					name: 'signup',
					occurredAt: new Date().toISOString(),
					path: '/pricing',
					properties: {},
					eventId,
				},
			]),
			postCustomEvent(second.trackingId, { eventId }),
		]);

		assert.deepEqual(
			responses.map(({ status }) => status),
			[202, 202, 202, 202],
		);
		const events = await db.selectFrom('events').select(['website_id', 'name']).orderBy('website_id').execute();
		assert.lengthOf(events, 2);
		assert.sameMembers(
			events.map(({ website_id }) => website_id),
			[first.websiteId, second.websiteId],
		);
	});

	test('orders collection-key locking before inserts shared by a single request and a batch', async ({ assert }) => {
		const website = await createWebsite();
		const blockerReady = deferred();
		const releaseBlocker = deferred();
		const blocker = db.transaction().execute(async (transaction) => {
			await transaction
				.selectFrom('website_collection_keys')
				.select('id')
				.where('key', '=', website.trackingId)
				.forUpdate()
				.executeTakeFirstOrThrow();
			blockerReady.resolve();
			await releaseBlocker.promise;
		});
		await blockerReady.promise;
		const occurredAt = new Date().toISOString();
		const batch = postBatch(website.trackingId, [
			browserEvent('first', occurredAt),
			browserEvent('shared', occurredAt),
		]);

		await waitForLockWaiters(1);
		const single = postCustomEvent(website.trackingId, { eventId: 'shared' });

		try {
			await waitForLockWaiters(2);
		} finally {
			releaseBlocker.resolve();
		}

		const responses = await Promise.all([batch, single]);
		await blocker;
		assert.deepEqual(
			responses.map(({ status }) => status),
			[202, 202],
		);
		assert.sameMembers(
			(await db.selectFrom('events').select('event_id').execute()).map(({ event_id }) => event_id),
			['first', 'shared'],
		);
	});

	test('serializes concurrent last-use updates before inserting distinct events', async ({ assert }) => {
		const website = await createWebsite();
		const blockerReady = deferred();
		const releaseBlocker = deferred();
		const blocker = db.transaction().execute(async (transaction) => {
			await sql`lock table events in share mode`.execute(transaction);
			blockerReady.resolve();
			await releaseBlocker.promise;
		});
		await blockerReady.promise;
		const requests = [
			postCustomEvent(website.trackingId, { eventId: 'concurrent-a' }),
			postCustomEvent(website.trackingId, { eventId: 'concurrent-b' }),
		];

		try {
			await waitForLockWaiters(2);
		} finally {
			releaseBlocker.resolve();
		}

		const responses = await Promise.all(requests);
		await blocker;
		assert.deepEqual(
			responses.map(({ status }) => status),
			[202, 202],
		);
		assert.sameMembers(
			(await db.selectFrom('events').select('event_id').execute()).map(({ event_id }) => event_id),
			['concurrent-a', 'concurrent-b'],
		);
	});

	test('avoids deadlocks for concurrent browser and server batches with reversed event IDs', async ({ assert }) => {
		const website = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const key = await createServerKey.execute(website);

		if (!key.ok) {
			throw new Error('The server key must be created');
		}

		const occurredAt = new Date().toISOString();
		const browserEvent = (eventId: string) => ({
			name: `browser-${eventId}`,
			occurredAt,
			path: '/',
			properties: {},
			eventId,
		});
		const serverEvent = (eventId: string) => ({
			name: `server-${eventId}`,
			occurredAt,
			path: '/',
			properties: {},
			eventId,
		});
		const [browserResponse, serverResponse] = await Promise.all([
			postBatch(website.trackingId, [browserEvent('shared-a'), browserEvent('shared-b'), browserEvent('browser-only')]),
			postServerBatch(key.value.secret, [serverEvent('shared-b'), serverEvent('shared-a'), serverEvent('server-only')]),
		]);

		assert.equal(browserResponse.status, 202);
		assert.equal(serverResponse.status, 202);
		const events = await db.selectFrom('events').select('event_id').execute();
		assert.sameMembers(
			events.map(({ event_id }) => event_id),
			['shared-a', 'shared-b', 'browser-only', 'server-only'],
		);
	});

	test('validates event_id as an opaque non-whitespace token of at most 255 characters', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		for (const eventId of [
			'',
			'contains space',
			'line\nbreak',
			'x'.repeat(browserEventProtocol.maxEventIdLength + 1),
		]) {
			assert.equal((await postCustomEvent(trackingId, { eventId })).status, 422, JSON.stringify(eventId));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('accepts only random UUIDs as ephemeral browser session IDs', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		for (const sessionId of ['', 'session-a', '00000000-0000-1000-8000-000000000000', 42]) {
			assert.equal((await postCustomEvent(trackingId, { sessionId })).status, 422, JSON.stringify(sessionId));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rejects a mixed invalid batch atomically and preserves identify order', async ({ assert }) => {
		const { trackingId } = await createWebsite('example.com', 'product');
		const occurredAt = new Date().toISOString();
		const invalid = await postBatch(trackingId, [
			{ name: '$identify', occurredAt, path: '/', distinctId: 'product-a' },
			{ name: '$reserved', occurredAt, path: '/', properties: {} },
		]);

		assert.equal(invalid.status, 422);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);

		const accepted = await postBatch(trackingId, [
			{ name: '$identify', occurredAt, path: '/', distinctId: 'product-a', eventId: 'identify-a' },
			{
				name: 'signup',
				occurredAt,
				path: '/',
				properties: {},
				distinctId: 'product-a',
				eventId: 'signup-a',
			},
		]);

		assert.equal(accepted.status, 202);
		const events = await db
			.selectFrom('events')
			.select(['name', 'distinct_id', sql<string>`received_at::text`.as('received_at_text')])
			.orderBy('received_at')
			.orderBy('id')
			.execute();
		assert.deepEqual(
			events.map(({ name, distinct_id }) => ({ name, distinct_id })),
			[
				{ name: '$identify', distinct_id: 'product-a' },
				{ name: 'signup', distinct_id: 'product-a' },
			],
		);
		assert.notEqual(events[0]?.received_at_text, events[1]?.received_at_text);
	});

	test('uses the request User-Agent for every event in a browser batch', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const occurredAt = new Date().toISOString();

		const response = await postBatch(trackingId, [
			{ name: '$pageview', occurredAt, path: '/', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null },
			{ name: 'signup', occurredAt, path: '/', properties: {} },
		]);

		assert.equal(response.status, 202);
		const events = await db
			.selectFrom('events')
			.select(['browser', 'operating_system', 'device'])
			.orderBy('received_at')
			.execute();
		assert.deepEqual(events, [
			{ browser: 'Other', operating_system: 'Other', device: 'Other' },
			{ browser: 'Other', operating_system: 'Other', device: 'Other' },
		]);
	});

	test('uses one IPv6-derived Country for pageviews, custom events, and identify in a batch', async ({ assert }) => {
		const { trackingId } = await createWebsite('example.com', 'product');
		const occurredAt = new Date().toISOString();

		const response = await postBatch(
			trackingId,
			[
				{
					name: '$pageview',
					occurredAt,
					path: '/',
					referrer: null,
					utmSource: null,
					utmMedium: null,
					utmCampaign: null,
				},
				{ name: 'signup', occurredAt, path: '/', properties: {} },
				{ name: '$identify', occurredAt, path: '/', distinctId: 'product-a' },
			],
			undefined,
			'2001:218::',
		);

		assert.equal(response.status, 202);
		assert.deepEqual(
			(await db.selectFrom('events').select(['name', 'country']).orderBy('received_at').execute()).map((event) => ({
				name: event.name,
				country: event.country,
			})),
			[
				{ name: '$pageview', country: 'JP' },
				{ name: 'signup', country: 'JP' },
				{ name: '$identify', country: 'JP' },
			],
		);
	});

	test('does not let an untrusted forwarded hop or country headers spoof Country', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const body = JSON.stringify({
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path: '/',
			referrer: null,
			utmSource: null,
			utmMedium: null,
			utmCampaign: null,
		});

		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'origin': 'https://example.com',
				'x-forwarded-for': '81.2.69.142, 1.1.1.1',
				'x-real-ip': '81.2.69.142',
				'cf-ipcountry': 'GB',
			},
			body,
		});

		assert.equal(response.status, 202);
		assert.isNull((await db.selectFrom('events').select('country').executeTakeFirstOrThrow()).country);

		const directWebsite = await createWebsite('direct.example.com');
		const directResponse = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'origin': 'https://direct.example.com',
				'x-real-ip': '81.2.69.142',
				'cf-ipcountry': 'GB',
			},
			body: body.replace(trackingId, directWebsite.trackingId),
		});

		assert.equal(directResponse.status, 202);
		assert.isNull(
			(
				await db
					.selectFrom('events')
					.select('country')
					.where('website_id', '=', directWebsite.websiteId)
					.executeTakeFirstOrThrow()
			).country,
		);
	});

	test('rolls back earlier batch events when a later identity rule fails', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const occurredAt = new Date().toISOString();
		const response = await postBatch(trackingId, [
			{ name: 'first', occurredAt, path: '/', properties: {} },
			{ name: 'second', occurredAt, path: '/', properties: {}, distinctId: 'not-allowed' },
		]);

		assert.equal(response.status, 422);
		assert.deepEqual(await response.json(), { error: 'distinct_id_not_allowed', index: 1 });
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('charges public batch rate limits by event count', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const events = Array.from({ length: browserEventProtocol.maxBatchEvents }, (_, index) => ({
			name: `event-${index}`,
			occurredAt: new Date().toISOString(),
			path: '/',
			properties: {},
		}));

		for (let batch = 0; batch < collectionLimits.perWebsiteAndSource / events.length; batch++) {
			assert.equal((await postBatch(trackingId, events)).status, 202);
		}

		assert.equal((await postCustomEvent(trackingId, {})).status, 429);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), collectionLimits.perWebsiteAndSource);
	});

	test('charges the public source quota across rotating Websites', async ({ assert }) => {
		const websites = await Promise.all(Array.from({ length: 5 }, () => createWebsite()));
		const events = Array.from({ length: browserEventProtocol.maxBatchEvents }, (_, index) => ({
			name: `event-${index}`,
			occurredAt: new Date().toISOString(),
			path: '/',
			properties: {},
		}));

		for (const website of websites) {
			for (let batch = 0; batch < 5; batch++) {
				assert.equal((await postBatch(website.trackingId, events)).status, 202);
			}
		}

		assert.equal((await postEvent(randomUUID(), {})).status, 429);
	});

	test('bounds public batches by event count and total JSON size', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const event = {
			name: 'large',
			occurredAt: new Date().toISOString(),
			path: '/',
			properties: Object.fromEntries(
				Array.from({ length: browserEventProtocol.maxProperties }, (_, index) => [
					`key-${index}`,
					'x'.repeat(browserEventProtocol.maxPropertyStringLength),
				]),
			),
		};

		assert.equal(
			(
				await postBatch(
					trackingId,
					Array.from({ length: browserEventProtocol.maxBatchEvents + 1 }, () => ({
						name: 'too-many',
						occurredAt: new Date().toISOString(),
						path: '/',
						properties: {},
					})),
				)
			).status,
			422,
		);
		const oversized = JSON.stringify({
			trackingId,
			events: Array.from({ length: browserEventProtocol.maxBatchEvents }, () => event),
		});
		assert.isAbove(Buffer.byteLength(oversized), browserEventProtocol.maxBatchPayloadBytes);
		assert.equal((await postRaw(oversized, 'application/json', '203.0.113.99')).status, 413);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('returns the same public error for an unknown Website and a forbidden Origin', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const forbidden = await postEvent(trackingId, {}, 'https://attacker.example');
		const unknown = await postEvent(randomUUID(), {}, 'https://example.com');

		assert.equal(forbidden.status, 403);
		assert.equal(unknown.status, 403);
		assert.deepEqual(await forbidden.json(), await unknown.json());
	});

	test('accepts every explicit normalized hostname without allowing implicit subdomains', async ({ assert }) => {
		const website = await createWebsite();
		const addDomain = await app.container.make(AddAllowedDomain);
		assert.isTrue(
			(
				await addDomain.execute({
					ownerUserId: website.ownerUserId,
					websiteId: website.websiteId,
					hostname: ' SHOP.Example.COM. ',
				})
			).ok,
		);

		assert.equal((await postEvent(website.trackingId, {}, 'https://example.com')).status, 202);
		assert.equal((await postEvent(website.trackingId, {}, 'http://shop.example.com:4173')).status, 202);
		assert.equal((await postEvent(website.trackingId, {}, 'https://deep.shop.example.com')).status, 403);
	});

	test('accepts localhost, punycode, and IPv4 Origins according to the existing hostname policy', async ({
		assert,
	}) => {
		for (const [hostname, origin] of [
			['localhost', 'http://localhost:5173'],
			['xn--mnich-kva.example', 'https://xn--mnich-kva.example'],
			['192.0.2.1', 'http://192.0.2.1:8080'],
		] as const) {
			const website = await createWebsite(hostname);
			assert.equal(
				(await postEvent(website.trackingId, {}, origin, '', `${website.websiteId.slice(0, 8)}.1`)).status,
				202,
			);
		}
	});

	test('accepts two active collection keys, records use, and makes revocation indistinguishable and immediate', async ({
		assert,
	}) => {
		const website = await createWebsite('example.com', 'product');
		const createKey = await app.container.make(CreateCollectionKey);
		const revokeKey = await app.container.make(RevokeCollectionKey);
		const replacement = await createKey.execute({ ownerUserId: website.ownerUserId, websiteId: website.websiteId });

		if (!replacement.ok) {
			throw new Error('The replacement key must be created');
		}

		assert.equal((await postCustomEvent(website.trackingId, { distinctId: 'product-a' })).status, 202);
		assert.equal((await postIdentify(replacement.value.key, 'product-a')).status, 202);
		assert.isNotNull(
			(
				await db
					.selectFrom('website_collection_keys')
					.select('last_used_at')
					.where('id', '=', replacement.value.id)
					.executeTakeFirstOrThrow()
			).last_used_at,
		);

		const original = await db
			.selectFrom('website_collection_keys')
			.select('id')
			.where('key', '=', website.trackingId)
			.executeTakeFirstOrThrow();
		assert.isTrue(
			(
				await revokeKey.execute({
					ownerUserId: website.ownerUserId,
					websiteId: website.websiteId,
					collectionKeyId: original.id,
				})
			).ok,
		);
		const revoked = await postEvent(website.trackingId, {}, 'https://example.com');
		const unknown = await postEvent(randomUUID(), {}, 'https://example.com');
		const forbidden = await postEvent(replacement.value.key, {}, 'https://attacker.example');
		assert.equal(revoked.status, 403);
		assert.equal(unknown.status, 403);
		assert.equal(forbidden.status, 403);
		const revokedPayload = await revoked.json();
		const unknownPayload = await unknown.json();
		assert.deepEqual(revokedPayload, unknownPayload);
		assert.deepEqual(unknownPayload, await forbidden.json());
	});

	test('rejects a collection lookup that was waiting when its key was revoked', async ({ assert }) => {
		const website = await createWebsite();
		const revocationReady = deferred();
		const releaseRevocation = deferred();
		const revocation = db.transaction().execute(async (transaction) => {
			await transaction.selectFrom('websites').select('id').where('id', '=', website.websiteId).forUpdate().execute();
			await transaction
				.updateTable('website_collection_keys')
				.set({ revoked_at: new Date() })
				.where('key', '=', website.trackingId)
				.execute();
			revocationReady.resolve();
			await releaseRevocation.promise;
		});
		await revocationReady.promise;
		const request = postEvent(website.trackingId, {});

		try {
			await waitForLockWaiters(1);
		} finally {
			releaseRevocation.resolve();
		}

		const response = await request;
		await revocation;
		assert.equal(response.status, 403);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('persists a supplied opaque distinct_id for Product browser events', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite('example.com', 'product');
		const distinctId = 'usr_01J8ZV7Y7J6QJ9M8X2P4';

		const response = await postCustomEvent(trackingId, { distinctId });

		assert.equal(response.status, 202);
		const event = await db
			.selectFrom('events')
			.select(['website_id', 'distinct_id', 'anonymous_id', 'session_id'])
			.executeTakeFirstOrThrow();
		assert.deepEqual(event, {
			website_id: websiteId,
			distinct_id: distinctId,
			anonymous_id: null,
			session_id: null,
		});
	});

	test('captures anonymous browser events before a Product Website identifies', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite('example.com', 'product');

		const response = await postCustomEvent(trackingId, {});

		assert.equal(response.status, 202);
		const event = await db
			.selectFrom('events')
			.select(['website_id', 'distinct_id', 'anonymous_id', 'session_id'])
			.executeTakeFirstOrThrow();
		assert.equal(event.website_id, websiteId);
		assert.isNull(event.distinct_id);
		assert.match(event.anonymous_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
		assert.match(event.session_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
	});

	test('persists the first Product identification once for the current anonymous identity', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite('example.com', 'product');
		assert.equal((await postCustomEvent(trackingId, {})).status, 202);

		const identified = await postIdentify(trackingId, 'product-a');
		const repeated = await postIdentify(trackingId, 'product-a');
		const conflicting = await postIdentify(trackingId, 'product-b');

		assert.equal(identified.status, 202);
		assert.equal(repeated.status, 202);
		assert.equal(conflicting.status, 202);
		const events = await db
			.selectFrom('events')
			.select([
				'website_id',
				'name',
				'source',
				'anonymous_id',
				'session_id',
				'distinct_id',
				'properties',
				'browser',
				'operating_system',
				'device',
			])
			.orderBy('received_at')
			.execute();
		assert.lengthOf(events, 2);
		assert.equal(events[0]?.anonymous_id, events[1]?.anonymous_id);
		assert.deepInclude(events[1], {
			website_id: websiteId,
			name: '$identify',
			source: EventSource.Browser,
			session_id: null,
			distinct_id: 'product-a',
			properties: null,
			browser: 'Other',
			operating_system: 'Other',
			device: 'Other',
		});
	});

	test('rejects Product identity sent to an Anonymous Website', async ({ assert }) => {
		const anonymous = await createWebsite();

		const unexpected = await postCustomEvent(anonymous.trackingId, { distinctId: 'usr_opaque' });
		const identification = await postIdentify(anonymous.trackingId, 'usr_opaque');

		assert.equal(unexpected.status, 422);
		assert.deepEqual(await unexpected.json(), { error: 'distinct_id_not_allowed' });
		assert.equal(identification.status, 422);
		assert.deepEqual(await identification.json(), { error: 'distinct_id_not_allowed' });
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('validates distinct_id as a non-empty string of at most 255 characters', async ({ assert }) => {
		const { trackingId } = await createWebsite('example.com', 'product');

		for (const distinctId of ['', 'x'.repeat(browserEventProtocol.maxDistinctIdLength + 1), 42, { id: 'opaque' }]) {
			const response = await postCustomEvent(trackingId, { distinctId });
			assert.equal(response.status, 422, JSON.stringify(distinctId));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('keeps historical Anonymous identity separate after switching to Product Mode', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite();
		assert.equal((await postCustomEvent(trackingId, {})).status, 202);
		await db.updateTable('websites').set({ identity_mode: 'product' }).where('id', '=', websiteId).execute();

		assert.equal((await postCustomEvent(trackingId, { distinctId: 'usr_after_switch' })).status, 202);

		const events = await db
			.selectFrom('events')
			.select(['anonymous_id', 'session_id', 'distinct_id'])
			.orderBy('received_at')
			.execute();
		assert.isNotNull(events[0]?.anonymous_id);
		assert.isNotNull(events[0]?.session_id);
		assert.isNull(events[0]?.distinct_id);
		assert.deepEqual(events[1], { anonymous_id: null, session_id: null, distinct_id: 'usr_after_switch' });
	});

	test('rejects an origin outside the Website allowlist', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		const response = await postEvent(trackingId, {}, 'https://attacker.example');

		assert.equal(response.status, 403);
		assert.equal(
			await db
				.selectFrom('events')
				.select(({ fn }) => fn.countAll<number>().as('count'))
				.executeTakeFirstOrThrow()
				.then((row) => Number(row.count)),
			0,
		);
	});

	test('reports an invalid persisted domain as an infrastructure failure', async ({ assert }) => {
		const { trackingId } = await createWebsite('invalid domain');

		const response = await postEvent(trackingId, {});

		assert.equal(response.status, 500);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rejects values that are not serialized HTTP origins', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const invalidOrigins = ['https://example.com/private?token=value', 'https://user:password@example.com'];

		for (const origin of invalidOrigins) {
			const response = await postEvent(trackingId, {}, origin);
			assert.equal(response.status, 403);
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('validates the event shape, name, and path', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const invalidEvents = [
			{ name: 'signup', path: '/' },
			{ occurredAt: '2026-09-11' },
			{ occurredAt: '12:00' },
			{ occurredAt: '2026-09-11T12:00:00' },
			{ occurredAt: '2026-02-30T12:00:00Z' },
			{ path: '/pricing?plan=pro' },
			{ path: '/price list' },
			{ path: '/products\\featured' },
			{ path: '/discount/%ZZ' },
			{ path: '/pricing\u0000' },
			{ path: '/pricing\t' },
			{ path: '/pricing\n' },
			{ path: '\n/pricing' },
			{ path: ' /pricing' },
			{ path: `/${'a'.repeat(browserEventProtocol.maxPathLength - 1)} ` },
			{ properties: {} },
			{ utmCampaign: undefined },
			{ referrer: 'https://user:password@example.com/private' },
			{ occurredAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
		];

		for (const event of invalidEvents) {
			const response = await postEvent(trackingId, event);
			assert.equal(response.status, 422, JSON.stringify(event));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rejects reserved custom names, nested values, and property limits', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const invalidEvents = [
			{ name: '$signup' },
			{ name: ' '.repeat(2) },
			{ name: 'signup\uD800' },
			{ name: 'signup\uDC00' },
			{ name: `signup${'x'.repeat(browserEventProtocol.maxNameLength)}` },
			{ properties: { context: { plan: 'pro' } } },
			{ properties: { steps: [1, 2] } },
			{ properties: { value: '\u0000' } },
			{ properties: { value: '\uD800' } },
			{ properties: { plan: 'x'.repeat(browserEventProtocol.maxPropertyStringLength + 1) } },
			{ properties: { ['x'.repeat(browserEventProtocol.maxPropertyKeyLength + 1)]: true } },
			{ properties: { ['\uD800']: true } },
			{ properties: { ['\uDC00']: true } },
			{ properties: Object.fromEntries([['__proto__', 'pro']]) },
			{
				properties: Object.fromEntries(
					Array.from({ length: browserEventProtocol.maxProperties + 1 }, (_, index) => [`key_${index}`, index]),
				),
			},
		];

		for (const event of invalidEvents) {
			const response = await postCustomEvent(trackingId, event);
			assert.equal(response.status, 422, JSON.stringify(event));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rejects JSON bodies larger than the collection contract', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const body = JSON.stringify({
			trackingId,
			name: '$pageview',
			path: '/',
			padding: 'a'.repeat(browserEventProtocol.maxPayloadBytes),
		});

		const response = await postRaw(body, 'application/json');

		assert.equal(response.status, 413);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('applies permissive CORS only to the collection endpoint', async ({ assert }) => {
		const preflight = await fetch(endpoint, {
			method: 'OPTIONS',
			headers: {
				'origin': 'https://example.com',
				'access-control-request-method': 'POST',
				'access-control-request-headers': 'content-type',
			},
		});
		const webPage = await fetch('http://localhost:3333/login', {
			headers: { origin: 'https://example.com' },
		});

		assert.equal(preflight.status, 204);
		assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://example.com');
		assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
		assert.include(preflight.headers.get('access-control-allow-methods'), 'POST');
		assert.include(preflight.headers.get('access-control-allow-headers')?.toLowerCase(), 'content-type');
		assert.isNull(webPage.headers.get('access-control-allow-origin'));
	});

	test('accepts only the JSON media type used by sendBeacon and fetch', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const json = JSON.stringify({
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path: '/',
			referrer: null,
			utmSource: null,
			utmMedium: null,
			utmCampaign: null,
		});

		const accepted = await postRaw(json, 'application/json; charset=utf-8');
		const rejectedText = await postRaw(json, 'text/plain;charset=UTF-8', '203.0.113.43');
		const rejectedForm = await postRaw(
			`trackingId=${trackingId}&name=$pageview&path=/`,
			'application/x-www-form-urlencoded',
		);
		const rejectedMultipart = await postRaw('not multipart', 'multipart/form-data; boundary=collection');

		assert.equal(accepted.status, 202);
		assert.equal(rejectedText.status, 415);
		assert.equal(rejectedForm.status, 415);
		assert.equal(rejectedMultipart.status, 415);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 1);
	});

	test('does not let query parameters repair an invalid body', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		const response = await postEvent(trackingId, { name: 'signup' }, undefined, '?name=$pageview');

		assert.equal(response.status, 422);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('ignores Cloudflare IP headers that bypass the trusted proxy chain', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const body = JSON.stringify({
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path: '/',
			referrer: null,
			utmSource: null,
			utmMedium: null,
			utmCampaign: null,
		});

		for (const cloudflareIp of ['203.0.113.10', '203.0.113.11']) {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'origin': 'https://example.com',
					'cf-connecting-ip': cloudflareIp,
				},
				body,
			});
			assert.equal(response.status, 202);
		}

		const events = await db.selectFrom('events').select(['anonymous_id', 'session_id']).execute();
		assert.equal(events[0]?.anonymous_id, events[1]?.anonymous_id);
		assert.equal(events[0]?.session_id, events[1]?.session_id);
	});

	test('rate limits one source without exposing the IP to PostgreSQL', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		for (let request = 0; request < collectionLimits.perWebsiteAndSource; request++) {
			const response = await postEvent(trackingId, {});
			assert.equal(response.status, 202);
		}

		const response = await postEvent(trackingId, {});

		assert.equal(response.status, 429);
		assert.isAbove(Number(response.headers.get('retry-after')), 0);
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.notProperty(event, 'ip');
		assert.notProperty(event, 'user_agent');
	});

	test('shares the per-Website quota across active collection keys', async ({ assert }) => {
		const website = await createWebsite();
		const createKey = await app.container.make(CreateCollectionKey);
		const replacement = await createKey.execute({ ownerUserId: website.ownerUserId, websiteId: website.websiteId });

		if (!replacement.ok) {
			throw new Error('The replacement key must be created');
		}
		const events = Array.from({ length: browserEventProtocol.maxBatchEvents }, (_, index) => ({
			name: `event-${index}`,
			occurredAt: new Date().toISOString(),
			path: '/',
			properties: {},
		}));

		for (let batch = 0; batch < collectionLimits.perWebsiteAndSource / events.length; batch++) {
			const key = batch % 2 === 0 ? website.trackingId : replacement.value.key;
			assert.equal((await postBatch(key, events)).status, 202);
		}

		assert.equal((await postCustomEvent(replacement.value.key, {})).status, 429);
	});

	test('rate limits a source rotating unknown tracking IDs', async ({ assert }) => {
		for (let request = 0; request < collectionLimits.perSource; request++) {
			const response = await postEvent(randomUUID(), {});
			assert.equal(response.status, 403);
		}

		const response = await postRaw('{ invalid JSON', 'application/json');

		assert.equal(response.status, 429);
		assert.isAbove(Number(response.headers.get('retry-after')), 0);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('keeps the per-Website quota isolated for the same source', async ({ assert }) => {
		const firstWebsite = await createWebsite();
		const secondWebsite = await createWebsite();

		for (let request = 0; request < collectionLimits.perWebsiteAndSource; request++) {
			const response = await postEvent(firstWebsite.trackingId, {});
			assert.equal(response.status, 202);
		}

		const response = await postEvent(secondWebsite.trackingId, {});

		assert.equal(response.status, 202);
	});
});

function browserEvent(eventId: string, occurredAt: string) {
	return { name: 'signup', occurredAt, path: '/', properties: {}, eventId };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});

	return { promise, resolve };
}

async function waitForLockWaiters(expected: number) {
	for (let attempt = 0; attempt < 100; attempt++) {
		const result = await sql<{ count: number }>`
			select count(*)::integer as count
			from pg_stat_activity
			where pid <> pg_backend_pid() and wait_event_type = 'Lock'
		`.execute(db);

		if (result.rows[0]!.count >= expected) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	throw new Error(`Expected at least ${expected} PostgreSQL lock waiters`);
}
