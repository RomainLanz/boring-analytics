import { randomUUID } from 'node:crypto';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { down, up } from '#database/migrations/1790000000000_create_website_collection_access';
import { db } from '#shared/services/db';
import type { DB } from '#types/db';

class RollbackMigrationTest extends Error {}

test.group('Website collection access migration', () => {
	test('migrates every existing domain and tracking ID without changing their values and rolls back safely', async ({
		assert,
	}) => {
		const ownerUserId = randomUUID();
		const workspaceId = randomUUID();
		const websiteId = randomUUID();
		const trackingId = randomUUID();
		let rollbackError: unknown;

		try {
			await db.transaction().execute(async (transaction) => {
				await down<DB>(transaction);
				await transaction
					.insertInto('users')
					.values({
						id: ownerUserId,
						email: `${ownerUserId}@example.com`,
						password: '[REDACTED:password]',
						name: null,
						updated_at: null,
					})
					.execute();
				await transaction.insertInto('workspaces').values({ id: workspaceId, owner_user_id: ownerUserId }).execute();
				await transaction
					.insertInto('websites')
					.values({
						id: websiteId,
						workspace_id: workspaceId,
						name: 'Existing Website',
						tracking_id: trackingId,
						allowed_domain: 'Example.COM.',
					})
					.execute();

				await up<DB>(transaction);

				const domains = await sql<{ hostname: string }>`
					select hostname from website_allowed_domains where website_id = ${websiteId}
				`.execute(transaction);
				const keys = await sql<{ key: string; revoked_at: Date | null }>`
					select key, revoked_at from website_collection_keys where website_id = ${websiteId}
				`.execute(transaction);
				assert.deepEqual(domains.rows, [{ hostname: 'example.com' }]);
				assert.deepEqual(keys.rows, [{ key: trackingId, revoked_at: null }]);

				const rollingWebsiteId = randomUUID();
				const rollingTrackingId = randomUUID();
				await transaction
					.insertInto('websites')
					.values({
						id: rollingWebsiteId,
						workspace_id: workspaceId,
						name: 'Created during rolling deployment',
						tracking_id: rollingTrackingId,
						allowed_domain: 'Docs.Example.COM.',
					})
					.execute();
				const rollingAccess = await sql<{ hostname: string; key: string }>`
					select domains.hostname, keys.key
					from website_allowed_domains domains
					inner join website_collection_keys keys on keys.website_id = domains.website_id
					where domains.website_id = ${rollingWebsiteId}
				`.execute(transaction);
				assert.deepEqual(rollingAccess.rows, [{ hostname: 'docs.example.com', key: rollingTrackingId }]);

				await down<DB>(transaction);
				const legacy = await transaction
					.selectFrom('websites')
					.select(['tracking_id', 'allowed_domain'])
					.where('id', '=', websiteId)
					.executeTakeFirstOrThrow();
				assert.deepEqual(legacy, { tracking_id: trackingId, allowed_domain: 'Example.COM.' });

				throw new RollbackMigrationTest();
			});
		} catch (error) {
			rollbackError = error;
		}

		assert.instanceOf(rollbackError, RollbackMigrationTest);
	});
});
