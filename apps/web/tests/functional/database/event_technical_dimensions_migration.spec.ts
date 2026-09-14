import { randomUUID } from 'node:crypto';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { db } from '#shared/services/db';

test.group('Event technical dimensions migration', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('keeps historical events unknown and only permits complete bounded dimensions', async ({ assert }) => {
		const ownerUserId = randomUUID();
		const workspaceId = randomUUID();
		const websiteId = randomUUID();
		const eventId = randomUUID();
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
			})
			.execute();
		await db
			.insertInto('events')
			.values({
				id: eventId,
				website_id: websiteId,
				name: '$pageview',
				source: 1,
				occurred_at: new Date(),
				path: '/',
			})
			.execute();

		const historical = await db
			.selectFrom('events')
			.select(['browser', 'operating_system', 'device'])
			.executeTakeFirstOrThrow();
		assert.deepEqual(historical, { browser: null, operating_system: null, device: null });
		await assert.rejects(() => sql`update events set browser = 'Chrome' where id = ${eventId}`.execute(db));
		await db.updateTable('events').set({ browser: 'Chrome', operating_system: 'Windows', device: 'Desktop' }).execute();
		await assert.rejects(() =>
			db
				.updateTable('events')
				.set({ browser: 'Chrome 140', operating_system: 'Windows 11', device: 'Pixel 9' })
				.execute(),
		);
	});

	test('has no columns for raw request identifiers', async ({ assert }) => {
		const columns = await sql<{ column_name: string }>`
			select column_name
			from information_schema.columns
			where table_schema = current_schema() and table_name = 'events'
		`.execute(db);
		const names = columns.rows.map(({ column_name }) => column_name);

		assert.notInclude(names, 'ip');
		assert.notInclude(names, 'ip_address');
		assert.notInclude(names, 'user_agent');
		assert.notInclude(names, 'useragent');
	});
});
