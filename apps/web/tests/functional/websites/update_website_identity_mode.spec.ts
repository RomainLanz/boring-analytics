import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { db } from '#shared/services/db';
import { UpdateWebsiteIdentityMode } from '#websites/actions/update_website_identity_mode';

test.group('Update Website identity mode', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('lets only the owner change the mode without rewriting historical events', async ({ assert }) => {
		const ownerUserId = await createUser();
		const outsiderUserId = await createUser();
		const workspace = await db
			.selectFrom('workspaces')
			.select('id')
			.where('owner_user_id', '=', ownerUserId)
			.executeTakeFirstOrThrow();
		const websiteId = randomUUID();
		await db
			.insertInto('websites')
			.values({
				id: websiteId,
				workspace_id: workspace.id,
				name: 'Example',
				tracking_id: randomUUID(),
				allowed_domain: 'example.com',
			})
			.execute();
		await db
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				name: 'signup',
				source: 1,
				occurred_at: new Date(),
				path: '/',
				anonymous_id: 'anonymous-before-change',
				session_id: 'session-before-change',
			})
			.execute();
		const updateMode = await app.container.make(UpdateWebsiteIdentityMode);

		const forbidden = await updateMode.execute({ ownerUserId: outsiderUserId, websiteId, identityMode: 'product' });
		const updated = await updateMode.execute({ ownerUserId, websiteId, identityMode: 'product' });

		assert.deepEqual(forbidden, { ok: false, error: { type: 'website_not_found' } });
		assert.deepEqual(updated, { ok: true, value: undefined });
		assert.equal(
			await db
				.selectFrom('websites')
				.select('identity_mode')
				.where('id', '=', websiteId)
				.executeTakeFirstOrThrow()
				.then(({ identity_mode }) => identity_mode),
			'product',
		);
		assert.deepEqual(
			await db.selectFrom('events').select(['anonymous_id', 'session_id', 'distinct_id']).executeTakeFirstOrThrow(),
			{ anonymous_id: 'anonymous-before-change', session_id: 'session-before-change', distinct_id: null },
		);
	});
});

async function createUser() {
	const userId = randomUUID();
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
	await db.insertInto('workspaces').values({ id: randomUUID(), owner_user_id: userId }).execute();
	return userId;
}
