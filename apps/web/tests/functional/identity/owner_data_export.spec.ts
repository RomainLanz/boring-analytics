import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { EventSource } from '#collection/event_source';
import { RegisterUser } from '#identity/actions/register_user';
import { OwnerDataExport } from '#identity/queries/owner_data_export';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';

test.group('Owner data export', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('streams a versioned portable export containing only the owner non-secret data', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const secondWebsite = await createWebsite(owner.id, 'Documentation', 'docs.boring.money');
		const outsiderWebsite = await createWebsite(outsider.id, 'Private', 'private.example.com');
		const rotatedCollectionKey = randomUUID();
		await db
			.insertInto('website_allowed_domains')
			.values({ id: randomUUID(), website_id: website.id, hostname: 'shop.boring.money' })
			.execute();
		await db
			.insertInto('website_collection_keys')
			.values({ id: randomUUID(), website_id: website.id, key: rotatedCollectionKey })
			.execute();
		await db
			.updateTable('websites')
			.set({ identity_mode: 'product', retention_days: 180 })
			.where('id', '=', website.id)
			.execute();
		await db
			.insertInto('website_server_keys')
			.values({
				id: randomUUID(),
				website_id: website.id,
				prefix: 'ba_server_visible_prefix',
				secret_hash: 'secret-hash-must-not-leak',
			})
			.execute();
		const funnelId = randomUUID();
		await db
			.insertInto('funnels')
			.values({
				id: funnelId,
				website_id: website.id,
				name: 'Checkout',
				identity_kind: 'distinct_id',
				conversion_window_seconds: 86_400,
			})
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{ funnel_id: funnelId, position: 1, event_name: 'signup', filter: null },
				{ funnel_id: funnelId, position: 2, event_name: 'paid', filter: { field: 'path', value: '/checkout' } },
			])
			.execute();
		await db
			.insertInto('events')
			.values([
				...Array.from({ length: 1_001 }, (_, index) => rawEvent(website.id, `owner-${index}`)),
				{
					...rawEvent(website.id, 'browser-technical-dimensions'),
					source: EventSource.Browser,
					browser: 'Chrome',
					operating_system: 'Linux',
					device: 'Desktop',
					country: 'CH',
				},
				rawEvent(secondWebsite.id, 'second-website'),
				rawEvent(outsiderWebsite.id, 'outsider-secret-event'),
				{
					...rawEvent(website.id, 'microsecond-first'),
					id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
					occurred_at: sql<Date>`'2026-03-01T12:00:00.000000Z'::timestamptz`,
					received_at: sql<Date>`'2026-03-01T12:00:00.000001Z'::timestamptz`,
				},
				{
					...rawEvent(website.id, 'microsecond-second'),
					id: '00000000-0000-4000-8000-000000000000',
					occurred_at: sql<Date>`'2026-03-01T12:00:00.000000Z'::timestamptz`,
					received_at: sql<Date>`'2026-03-01T12:00:00.000002Z'::timestamptz`,
				},
			])
			.execute();

		const dataExport = await app.container.make(OwnerDataExport);
		const stream = dataExport.stream(owner.id, new Date('2026-04-01T12:00:00.000Z'));
		const manifest = await stream.next();

		if (manifest.done) {
			throw new Error('The export must start with a manifest');
		}

		await db.insertInto('events').values(rawEvent(website.id, 'after-export-start')).execute();
		const chunks = [manifest.value];

		for await (const chunk of stream) {
			chunks.push(chunk);
		}

		const content = chunks.join('');
		const records = content
			.trimEnd()
			.split('\n')
			.map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
		assert.deepEqual(records[0], {
			type: 'boring-analytics-export',
			schemaVersion: 4,
			exportedAt: '2026-04-01T12:00:00.000Z',
		});
		assert.equal(records.filter(({ type }) => type === 'website').length, 2);
		assert.deepInclude(
			records.find((record) => record.id === website.id),
			{
				allowedDomains: ['boring.money', 'shop.boring.money'],
				collectionKeys: [website.trackingId, rotatedCollectionKey],
			},
		);
		assert.equal(records.filter(({ type }) => type === 'event').length, 1_005);
		assert.equal(records.filter(({ type }) => type === 'funnel').length, 1);
		assert.equal(records.filter(({ type }) => type === 'funnel-step').length, 2);
		assert.include(content, 'owner-1000');
		assert.include(content, '"retentionDays":180');
		assert.notInclude(content, 'after-export-start');
		assert.notInclude(content, 'outsider-secret-event');
		assert.notInclude(content, outsider.id);
		assert.notInclude(content, 'secret-hash-must-not-leak');
		assert.notInclude(content, 'ba_server_visible_prefix');
		assert.notInclude(content, 'ada@example.com');
		assert.notInclude(content, 'userAgent');
		assert.notInclude(content, 'user_agent');
		const firstOwnerEvent = records.find((record) => record.eventId === 'owner-0');
		assert.deepInclude(firstOwnerEvent, {
			browser: null,
			operatingSystem: null,
			device: null,
			country: null,
		});
		assert.deepInclude(
			records.find((record) => record.eventId === 'browser-technical-dimensions'),
			{ browser: 'Chrome', operatingSystem: 'Linux', device: 'Desktop', country: 'CH' },
		);
		const microsecondEvents = records.filter(
			(record) => record.eventId === 'microsecond-first' || record.eventId === 'microsecond-second',
		);
		assert.deepEqual(
			microsecondEvents.map(({ eventId, occurredAt, receivedAt }) => ({ eventId, occurredAt, receivedAt })),
			[
				{
					eventId: 'microsecond-first',
					occurredAt: '2026-03-01T12:00:00.000000Z',
					receivedAt: '2026-03-01T12:00:00.000001Z',
				},
				{
					eventId: 'microsecond-second',
					occurredAt: '2026-03-01T12:00:00.000000Z',
					receivedAt: '2026-03-01T12:00:00.000002Z',
				},
			],
		);
	});
});

async function createUser(name: string, email: string) {
	const registerUser = await app.container.make(RegisterUser);
	const result = await registerUser.execute({ name, email, password: 'a-secure-password' });

	if (!result.ok) {
		throw new Error('The test user must be created');
	}

	return result.value;
}

async function createWebsite(ownerUserId: string, name: string, allowedDomain: string) {
	const createWebsiteAction = await app.container.make(CreateWebsite);
	const result = await createWebsiteAction.execute({ ownerUserId, name, allowedDomain });

	if (!result.ok) {
		throw new Error('The test Website must be created');
	}

	return result.value;
}

function rawEvent(websiteId: string, eventId: string) {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name: 'signup',
		source: EventSource.Server,
		occurred_at: new Date('2026-03-01T12:00:00.000Z'),
		received_at: new Date('2026-03-01T12:00:00.000Z'),
		path: '/signup',
		distinct_id: 'opaque-product-id',
		event_id: eventId,
		properties: { plan: 'pro' },
	};
}
