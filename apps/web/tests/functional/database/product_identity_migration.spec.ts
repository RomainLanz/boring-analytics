import { randomUUID } from 'node:crypto';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { db } from '#shared/services/db';

test.group('Product identity migration', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('keeps existing Websites and Funnels anonymous by default', async ({ assert }) => {
		const ownerUserId = randomUUID();
		const workspaceId = randomUUID();
		const websiteId = randomUUID();
		const funnelId = randomUUID();
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
		await sql`
			insert into websites (id, workspace_id, name, tracking_id, allowed_domain)
			values (${websiteId}, ${workspaceId}, 'Existing Website', ${randomUUID()}, 'example.com')
		`.execute(db);
		await sql`
			insert into funnels (id, website_id, name, conversion_window_seconds)
			values (${funnelId}, ${websiteId}, 'Existing Funnel', 1800)
		`.execute(db);

		const website = await sql<{ identity_mode: string }>`
			select identity_mode from websites where id = ${websiteId}
		`.execute(db);
		const funnel = await sql<{ identity_kind: string }>`
			select identity_kind from funnels where id = ${funnelId}
		`.execute(db);

		assert.equal(website.rows[0]?.identity_mode, 'anonymous');
		assert.equal(funnel.rows[0]?.identity_kind, 'session_id');
	});

	test('enforces identity values, distinct_id length, and mode-specific Funnel windows', async ({ assert }) => {
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
				name: 'Product Website',
				tracking_id: randomUUID(),
				allowed_domain: 'example.com',
			})
			.execute();

		await assert.rejects(() => sql`update websites set identity_mode = 'unknown' where id = ${websiteId}`.execute(db));
		for (const distinctId of ['', 'x'.repeat(256)]) {
			await assert.rejects(() =>
				db
					.insertInto('events')
					.values({
						id: randomUUID(),
						website_id: websiteId,
						name: 'signup',
						source: 1,
						occurred_at: new Date(),
						path: '/',
						distinct_id: distinctId,
					})
					.execute(),
			);
		}
		await assert.rejects(() =>
			db
				.insertInto('funnels')
				.values({
					id: randomUUID(),
					website_id: websiteId,
					name: 'Invalid anonymous window',
					identity_kind: 'session_id',
					conversion_window_seconds: 1_801,
				})
				.execute(),
		);
		await assert.rejects(() =>
			db
				.insertInto('funnels')
				.values({
					id: randomUUID(),
					website_id: websiteId,
					name: 'Invalid Product window',
					identity_kind: 'distinct_id',
					conversion_window_seconds: 2_592_001,
				})
				.execute(),
		);

		const indexes = await sql<{ indexname: string }>`
			select indexname from pg_indexes
			where schemaname = current_schema()
				and indexname = 'events_website_name_distinct_id_occurred_at_index'
		`.execute(db);
		assert.lengthOf(indexes.rows, 1);

		const constraints = await sql<{ name: string }>`
			select conname as name from pg_constraint
			where conname in (
				'websites_identity_mode_check',
				'events_distinct_id_check',
				'funnels_identity_kind_check',
				'funnels_conversion_window_check'
			)
		`.execute(db);
		assert.sameMembers(
			constraints.rows.map(({ name }) => name),
			[
				'websites_identity_mode_check',
				'events_distinct_id_check',
				'funnels_identity_kind_check',
				'funnels_conversion_window_check',
			],
		);
	});
});
