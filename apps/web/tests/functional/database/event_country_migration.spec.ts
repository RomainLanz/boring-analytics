import { randomUUID } from 'node:crypto';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { EventSource } from '#collection/event_source';
import { db } from '#shared/services/db';

test.group('Event Country migration', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('keeps historical Country unknown and permits only browser ISO alpha-2 codes', async ({ assert }) => {
		const userId = randomUUID();
		const workspaceId = randomUUID();
		const websiteId = randomUUID();
		const eventId = randomUUID();
		await db
			.insertInto('users')
			.values({
				id: userId,
				email: `${userId}@example.com`,
				password: '[REDACTED:password]',
				name: null,
				updated_at: null,
			})
			.execute();
		await db.insertInto('workspaces').values({ id: workspaceId, owner_user_id: userId }).execute();
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
				source: EventSource.Browser,
				occurred_at: new Date(),
				path: '/',
			})
			.execute();

		assert.isNull((await sql<{ country: string | null }>`select country from events`.execute(db)).rows[0]?.country);
		await sql`update events set country = 'CH' where id = ${eventId}`.execute(db);
		await assert.rejects(() => sql`update events set country = 'ch' where id = ${eventId}`.execute(db));
		await assert.rejects(() => sql`update events set country = 'CHE' where id = ${eventId}`.execute(db));
		await assert.rejects(() =>
			sql`update events set source = ${EventSource.Server}, country = 'CH' where id = ${eventId}`.execute(db),
		);
	});
});
