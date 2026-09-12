import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import limiter from '@adonisjs/limiter/services/main';
import { test } from '@japa/runner';
import { CreateServerKey } from '#collection/actions/create_server_key';
import { RevokeServerKey } from '#collection/actions/revoke_server_key';
import { browserEventProtocol } from '#collection/browser_event_protocol';
import { EventSource } from '#collection/event_source';
import { db } from '#shared/services/db';
import {
	serverAuthenticationFailures,
	serverEventLimits,
	serverEventRateLimitKey,
	serverEventsPerKey,
	serverKeyVerifications,
} from '#start/limiter';

const endpoint = 'http://localhost:3333/api/server/events';

test.group('POST /api/server/events', (group) => {
	group.each.setup(async () => {
		await limiter.clear();
		await db.deleteFrom('users').execute();
	});

	test('authenticates a Website key and appends a server event without requiring Origin', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute({ ownerUserId, websiteId });

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		const response = await postServerEvent(created.value.secret, {
			name: 'invoice.paid',
			occurredAt: new Date().toISOString(),
			path: '/billing',
			properties: { amount: 49, currency: 'CHF', trial: false },
		});

		assert.equal(response.status, 202);
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.equal(event.website_id, websiteId);
		assert.equal(event.source, EventSource.Server);
		assert.equal(event.name, 'invoice.paid');
		assert.equal(event.path, '/billing');
		assert.deepEqual(event.properties, { amount: 49, currency: 'CHF', trial: false });
		assert.isNull(event.anonymous_id);
		assert.isNull(event.session_id);
		assert.isNull(event.referrer);
		assert.isNull(event.utm_source);
	});

	test('persists reliable Product server events with distinct_id and no browser identity', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite('product');
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute({ ownerUserId, websiteId });

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		const response = await postServerEvent(created.value.secret, {
			...serverEventBody(),
			distinctId: 'account_opaque_42',
		});

		assert.equal(response.status, 202);
		const event = await db
			.selectFrom('events')
			.select(['distinct_id', 'anonymous_id', 'session_id'])
			.executeTakeFirstOrThrow();
		assert.deepEqual(event, { distinct_id: 'account_opaque_42', anonymous_id: null, session_id: null });
	});

	test('accepts an atomic batch and deduplicates event_id against single and concurrent requests', async ({
		assert,
	}) => {
		const website = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute(website);

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		const eventId = 'invoice_01J8ZV7Y7J6QJ9M8X2P4';
		const event = { ...serverEventBody(), eventId };
		const responses = await Promise.all([
			postServerEvent(created.value.secret, event),
			postServerEvent(created.value.secret, { events: [event, event] }),
			postServerEvent(created.value.secret, event),
		]);

		assert.deepEqual(
			responses.map(({ status }) => status),
			[202, 202, 202],
		);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 1);

		const invalid = await postServerEvent(created.value.secret, {
			events: [serverEventBody(), { ...serverEventBody(), name: '$identify' }],
		});
		assert.equal(invalid.status, 422);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 1);
	});

	test('rolls back a Product batch and reports the failing event index', async ({ assert }) => {
		const website = await createWebsite('product');
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute(website);

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		const response = await postServerEvent(created.value.secret, {
			events: [{ ...serverEventBody(), distinctId: 'product-a' }, serverEventBody()],
		});

		assert.equal(response.status, 422);
		assert.deepEqual(await response.json(), { error: 'distinct_id_required', index: 1 });
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('charges authenticated batch rate limits by event count', async ({ assert }) => {
		const website = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute(website);

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		await serverEventsPerKey.set(
			serverEventRateLimitKey(created.value.secret),
			serverEventLimits.perKey - browserEventProtocol.maxBatchEvents,
			'1 minute',
		);
		const batch = await postServerEvent(created.value.secret, {
			events: Array.from({ length: browserEventProtocol.maxBatchEvents }, () => serverEventBody()),
		});

		assert.equal(batch.status, 202);
		assert.equal((await postServerEvent(created.value.secret, serverEventBody())).status, 429);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), browserEventProtocol.maxBatchEvents);
	});

	test('enforces the Website identity contract after authenticating server events', async ({ assert }) => {
		const product = await createWebsite('product');
		const anonymous = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const productKey = await createServerKey.execute(product);
		const anonymousKey = await createServerKey.execute(anonymous);

		if (!productKey.ok || !anonymousKey.ok) {
			throw new Error('The server keys must be created');
		}

		const missing = await postServerEvent(productKey.value.secret, serverEventBody());
		const unexpected = await postServerEvent(anonymousKey.value.secret, {
			...serverEventBody(),
			distinctId: 'usr_opaque',
		});

		assert.equal(missing.status, 422);
		assert.deepEqual(await missing.json(), { error: 'distinct_id_required' });
		assert.equal(unexpected.status, 422);
		assert.deepEqual(await unexpected.json(), { error: 'distinct_id_not_allowed' });
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('returns one stable authentication error for missing, malformed, incorrect, and revoked keys', async ({
		assert,
	}) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const revokeServerKey = await app.container.make(RevokeServerKey);
		const created = await createServerKey.execute({ ownerUserId, websiteId });

		if (!created.ok) {
			throw new Error('The server key must be created');
		}
		const validBody = serverEventBody();
		const wrongSecret = `${created.value.prefix}_${'A'.repeat(43)}`;

		for (const secret of ['', 'not-a-key', wrongSecret]) {
			const response = await postServerEvent(secret, validBody);
			assert.equal(response.status, 401);
			assert.deepEqual(await response.json(), { error: 'invalid_server_key' });
		}

		const revoked = await revokeServerKey.execute({ ownerUserId, websiteId });
		assert.isTrue(revoked.ok);
		const response = await postServerEvent(created.value.secret, validBody);
		assert.equal(response.status, 401);
		assert.deepEqual(await response.json(), { error: 'invalid_server_key' });
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('reuses custom event shape, property, path, and timestamp rules', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute({ ownerUserId, websiteId });

		if (!created.ok) {
			throw new Error('The server key must be created');
		}
		const invalidEvents = [
			{ ...serverEventBody(), name: '$pageview' },
			{ ...serverEventBody(), name: ' '.repeat(2) },
			{ ...serverEventBody(), path: '/billing?private=true' },
			{ ...serverEventBody(), occurredAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
			{ ...serverEventBody(), properties: { invoice: { amount: 49 } } },
			{ ...serverEventBody(), properties: { note: 'x'.repeat(browserEventProtocol.maxPropertyStringLength + 1) } },
			{ ...serverEventBody(), extra: true },
		];

		for (const event of invalidEvents) {
			const response = await postServerEvent(created.value.secret, event);
			assert.equal(response.status, 422, JSON.stringify(event));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rate limits each authenticated key without coupling it to the backend IP', async ({ assert }) => {
		const first = await createWebsite();
		const second = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const firstKey = await createServerKey.execute(first);
		const secondKey = await createServerKey.execute(second);

		if (!firstKey.ok || !secondKey.ok) {
			throw new Error('The server keys must be created');
		}
		await serverEventsPerKey.set(
			serverEventRateLimitKey(firstKey.value.secret),
			serverEventLimits.perKey - 1,
			'1 minute',
		);

		const lastAccepted = await postServerEvent(firstKey.value.secret, serverEventBody());
		const limited = await postServerEvent(firstKey.value.secret, serverEventBody());
		const isolated = await postServerEvent(secondKey.value.secret, serverEventBody());

		assert.equal(lastAccepted.status, 202);
		assert.equal(limited.status, 429);
		assert.isAbove(Number(limited.headers.get('retry-after')), 0);
		assert.equal(isolated.status, 202);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 2);
	});

	test('bounds failed authentication attempts by backend IP', async ({ assert }) => {
		const ip = '203.0.113.42';
		await serverAuthenticationFailures.set(ip, serverEventLimits.failedAuthenticationPerSource - 1, '1 minute');

		const lastAttempt = await postServerEvent('invalid', serverEventBody(), ip);
		const limited = await postServerEvent('invalid', serverEventBody(), ip);

		assert.equal(lastAttempt.status, 401);
		assert.equal(limited.status, 429);
		assert.isAbove(Number(limited.headers.get('retry-after')), 0);
	});

	test('does not let accepted or rate-limited keys reset failed authentication attempts', async ({ assert }) => {
		const firstIp = '203.0.113.43';
		const secondIp = '203.0.113.44';
		const website = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute(website);

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		await serverAuthenticationFailures.set(firstIp, serverEventLimits.failedAuthenticationPerSource - 2, '1 minute');
		assert.equal((await postServerEvent('invalid', serverEventBody(), firstIp)).status, 401);
		assert.equal((await postServerEvent(created.value.secret, serverEventBody(), firstIp)).status, 202);
		assert.equal((await postServerEvent('invalid', serverEventBody(), firstIp)).status, 401);
		assert.equal((await postServerEvent('invalid', serverEventBody(), firstIp)).status, 429);

		await serverAuthenticationFailures.set(secondIp, serverEventLimits.failedAuthenticationPerSource - 1, '1 minute');
		await serverEventsPerKey.set(serverEventRateLimitKey(created.value.secret), serverEventLimits.perKey, '1 minute');
		assert.equal((await postServerEvent(created.value.secret, serverEventBody(), secondIp)).status, 429);
		assert.equal((await postServerEvent('invalid', serverEventBody(), secondIp)).status, 401);
		assert.equal((await postServerEvent('invalid', serverEventBody(), secondIp)).status, 429);
	});

	test('bounds verification work when callers rotate suffixes for a known prefix', async ({ assert }) => {
		const website = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);
		const created = await createServerKey.execute(website);

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		await serverKeyVerifications.set(created.value.id, serverEventLimits.verificationsPerKey, '1 minute');
		const wrongSecret = `${created.value.prefix}_${'A'.repeat(43)}`;
		const response = await postServerEvent(wrongSecret, serverEventBody(), '203.0.113.45');

		assert.equal(response.status, 429);
		assert.isAbove(Number(response.headers.get('retry-after')), 0);
		assert.isNull(await serverEventsPerKey.get(serverEventRateLimitKey(wrongSecret)));
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});
});

function serverEventBody() {
	return {
		name: 'invoice.paid',
		occurredAt: new Date().toISOString(),
		path: '/billing',
		properties: { amount: 49 },
	};
}

async function postServerEvent(secret: string, body: Record<string, unknown>, ip?: string) {
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'authorization': `Bearer ${secret}`,
			'content-type': 'application/json',
			...(ip ? { 'x-forwarded-for': ip } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function createWebsite(identityMode: 'anonymous' | 'product' = 'anonymous') {
	const ownerUserId = randomUUID();
	const workspaceId = randomUUID();
	const websiteId = randomUUID();

	await db
		.insertInto('users')
		.values({
			id: ownerUserId,
			email: `${ownerUserId}@example.com`,
			password: '[REDACTED:password]',
			name: null,
			updated_at: null,
		})
		.execute();
	await db.insertInto('workspaces').values({ id: workspaceId, owner_user_id: ownerUserId }).execute();
	await db
		.insertInto('websites')
		.values({
			id: websiteId,
			workspace_id: workspaceId,
			name: 'Example',
			tracking_id: randomUUID(),
			allowed_domain: 'example.com',
			identity_mode: identityMode,
		})
		.execute();

	return { ownerUserId, websiteId };
}
