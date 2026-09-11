import { randomUUID } from 'node:crypto';
import limiter from '@adonisjs/limiter/services/main';
import { test } from '@japa/runner';
import { db } from '#shared/services/db';
import { collectionLimits } from '#start/limiter';

const endpoint = 'http://localhost:3333/api/events';

async function createWebsite(allowedDomain = 'example.com') {
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
		})
		.execute();

	return { websiteId, trackingId };
}

async function postEvent(
	trackingId: string,
	body: Record<string, unknown>,
	origin = 'https://example.com',
	query = '',
	ip = '203.0.113.42',
) {
	return fetch(`${endpoint}${query}`, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': 'application/json',
			origin,
			'cf-connecting-ip': ip,
		},
		body: JSON.stringify({ trackingId, ...body }),
	});
}

async function postRaw(body: string, contentType: string, ip = '203.0.113.42') {
	return fetch(endpoint, {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'content-type': contentType,
			'cf-connecting-ip': ip,
			'origin': 'https://example.com',
		},
		body,
	});
}

test.group('POST /api/events', (group) => {
	group.each.setup(async () => {
		await limiter.clear();
		await db.deleteFrom('users').execute();
	});

	test('accepts and persists a pageview without an IP address', async ({ assert }) => {
		const { websiteId, trackingId } = await createWebsite();

		const response = await postEvent(
			trackingId,
			{ name: 'pageview', path: '/pricing/summer%20sale' },
			undefined,
			'?path=/overridden',
		);

		assert.equal(response.status, 202);
		assert.equal(response.headers.get('access-control-allow-origin'), 'https://example.com');
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.equal(event.website_id, websiteId);
		assert.equal(event.name, 'pageview');
		assert.equal(event.path, '/pricing/summer%20sale');
		assert.deepEqual(Object.keys(event).sort(), ['id', 'name', 'path', 'received_at', 'website_id']);
	});

	test('rejects an origin outside the Website allowlist', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		const response = await postEvent(trackingId, { name: 'pageview', path: '/' }, 'https://attacker.example');

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

		const response = await postEvent(trackingId, { name: 'pageview', path: '/' });

		assert.equal(response.status, 500);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rejects values that are not serialized HTTP origins', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const invalidOrigins = ['https://example.com/private?token=value', 'https://user:password@example.com'];

		for (const origin of invalidOrigins) {
			const response = await postEvent(trackingId, { name: 'pageview', path: '/' }, origin);
			assert.equal(response.status, 403);
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('validates the event shape, name, and path', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const invalidEvents = [
			{ name: 'signup', path: '/' },
			{ name: 'pageview', path: '/pricing?plan=pro' },
			{ name: 'pageview', path: '/price list' },
			{ name: 'pageview', path: '/products\\featured' },
			{ name: 'pageview', path: '/discount/%ZZ' },
			{ name: 'pageview', path: '/pricing\u0000' },
			{ name: 'pageview', path: '/pricing\t' },
			{ name: 'pageview', path: '/pricing\n' },
			{ name: 'pageview', path: '\n/pricing' },
			{ name: 'pageview', path: ' /pricing' },
			{ name: 'pageview', path: `/${'a'.repeat(2047)} ` },
			{ name: 'pageview', path: '/', properties: {} },
		];

		for (const event of invalidEvents) {
			const response = await postEvent(trackingId, event);
			assert.equal(response.status, 422, JSON.stringify(event));
		}

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rejects JSON bodies larger than the collection contract', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const body = JSON.stringify({ trackingId, name: 'pageview', path: '/', padding: 'a'.repeat(4096) });

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
		assert.include(preflight.headers.get('access-control-allow-methods'), 'POST');
		assert.include(preflight.headers.get('access-control-allow-headers')?.toLowerCase(), 'content-type');
		assert.isNull(webPage.headers.get('access-control-allow-origin'));
	});

	test('accepts JSON media type parameters and rejects form or multipart bodies before parsing', async ({ assert }) => {
		const { trackingId } = await createWebsite();
		const json = JSON.stringify({ trackingId, name: 'pageview', path: '/' });

		const accepted = await postRaw(json, 'application/json; charset=utf-8');
		const rejectedForm = await postRaw(
			`trackingId=${trackingId}&name=pageview&path=/`,
			'application/x-www-form-urlencoded',
		);
		const rejectedMultipart = await postRaw('not multipart', 'multipart/form-data; boundary=collection');

		assert.equal(accepted.status, 202);
		assert.equal(rejectedForm.status, 415);
		assert.equal(rejectedMultipart.status, 415);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 1);
	});

	test('does not let query parameters repair an invalid body', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		const response = await postEvent(trackingId, { name: 'signup', path: '/' }, undefined, '?name=pageview');

		assert.equal(response.status, 422);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});

	test('rate limits one source without exposing the IP to PostgreSQL', async ({ assert }) => {
		const { trackingId } = await createWebsite();

		for (let request = 0; request < collectionLimits.perWebsiteAndSource; request++) {
			const response = await postEvent(trackingId, { name: 'pageview', path: '/' });
			assert.equal(response.status, 202);
		}

		const response = await postEvent(trackingId, { name: 'pageview', path: '/' });

		assert.equal(response.status, 429);
		assert.isAbove(Number(response.headers.get('retry-after')), 0);
		const event = await db.selectFrom('events').selectAll().executeTakeFirstOrThrow();
		assert.deepEqual(Object.keys(event).sort(), ['id', 'name', 'path', 'received_at', 'website_id']);
	});

	test('rate limits a source rotating unknown tracking IDs', async ({ assert }) => {
		for (let request = 0; request < collectionLimits.perSource; request++) {
			const response = await postEvent(randomUUID(), { name: 'pageview', path: '/' });
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
			const response = await postEvent(firstWebsite.trackingId, { name: 'pageview', path: '/' });
			assert.equal(response.status, 202);
		}

		const response = await postEvent(secondWebsite.trackingId, { name: 'pageview', path: '/' });

		assert.equal(response.status, 202);
	});
});
