import { randomUUID } from 'node:crypto';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { db } from '#shared/services/db';

test.group('Event retention migration', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('gives existing Websites a safe default and enforces the supported policies', async ({ assert }) => {
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
		await sql`
			insert into websites (id, workspace_id, name, tracking_id, allowed_domain)
			values (${websiteId}, ${workspaceId}, 'Existing Website', ${randomUUID()}, 'example.com')
		`.execute(db);

		const website = await sql<{ events_available_from: Date | null; retention_days: number | null }>`
			select events_available_from, retention_days from websites where id = ${websiteId}
		`.execute(db);

		assert.equal(website.rows[0]?.retention_days, 90);
		assert.isNull(website.rows[0]?.events_available_from);
		for (const retentionDays of [60, 90, 180, 365, null]) {
			await sql`update websites set retention_days = ${retentionDays} where id = ${websiteId}`.execute(db);
		}
		for (const retentionDays of [0, 59, 91, 366]) {
			await assert.rejects(() =>
				sql`update websites set retention_days = ${retentionDays} where id = ${websiteId}`.execute(db),
			);
		}
	});
});
