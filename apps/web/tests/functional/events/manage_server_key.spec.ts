import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import hash from '@adonisjs/core/services/hash';
import { test } from '@japa/runner';
import { CreateServerKey } from '#collection/actions/create_server_key';
import { RevokeServerKey } from '#collection/actions/revoke_server_key';
import { ServerEventSettingsQuery } from '#collection/queries/server_event_settings_query';
import { ServerKeyAuthenticator } from '#collection/services/server_key_authenticator';
import { db } from '#shared/services/db';

test.group('Website server keys', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('creates a Website-scoped key and persists only its verifiable hash', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);

		const result = await createServerKey.execute({ ownerUserId, websiteId });

		assert.isTrue(result.ok);

		if (!result.ok) {
			return;
		}
		assert.match(result.value.secret, /^ba_sk_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/u);
		assert.equal(result.value.secret.slice(0, result.value.prefix.length), result.value.prefix);

		const persisted = await db.selectFrom('website_server_keys').selectAll().executeTakeFirstOrThrow();
		assert.equal(persisted.website_id, websiteId);
		assert.equal(persisted.prefix, result.value.prefix);
		assert.notInclude(persisted.secret_hash, result.value.secret);
		assert.isTrue(await hash.verify(persisted.secret_hash, result.value.secret));
		assert.isNull(persisted.revoked_at);
	});

	test('rejects a different owner and a second active key', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const outsiderUserId = await createUser();
		const createServerKey = await app.container.make(CreateServerKey);

		const outsiderResult = await createServerKey.execute({ ownerUserId: outsiderUserId, websiteId });
		const created = await createServerKey.execute({ ownerUserId, websiteId });
		const duplicate = await createServerKey.execute({ ownerUserId, websiteId });

		assert.deepEqual(outsiderResult, { ok: false, error: { type: 'website_not_found' } });
		assert.isTrue(created.ok);
		assert.deepEqual(duplicate, { ok: false, error: { type: 'active_server_key_exists' } });
		assert.lengthOf(await db.selectFrom('website_server_keys').select('id').execute(), 1);
	});

	test('keeps one active key when two creations race', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createServerKey = await app.container.make(CreateServerKey);

		const results = await Promise.all([
			createServerKey.execute({ ownerUserId, websiteId }),
			createServerKey.execute({ ownerUserId, websiteId }),
		]);

		assert.lengthOf(
			results.filter((result) => result.ok),
			1,
		);
		assert.deepInclude(results, { ok: false, error: { type: 'active_server_key_exists' } });
		assert.lengthOf(await db.selectFrom('website_server_keys').select('id').execute(), 1);
	});

	test('returns only safe key metadata to the Website owner', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const outsiderUserId = await createUser();
		const createServerKey = await app.container.make(CreateServerKey);
		const settingsQuery = await app.container.make(ServerEventSettingsQuery);
		const created = await createServerKey.execute({ ownerUserId, websiteId });

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		const settings = await settingsQuery.execute(websiteId, ownerUserId);
		const outsiderSettings = await settingsQuery.execute(websiteId, outsiderUserId);

		assert.deepEqual(settings?.serverKey, {
			id: created.value.id,
			prefix: created.value.prefix,
			createdAt: created.value.createdAt,
			revokedAt: null,
		});
		assert.notProperty(settings?.serverKey ?? {}, 'secret');
		assert.notProperty(settings?.serverKey ?? {}, 'secretHash');
		assert.isNull(outsiderSettings);
	});

	test('only the Website owner can revoke a key and revoked secrets stop authenticating', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const outsiderUserId = await createUser();
		const createServerKey = await app.container.make(CreateServerKey);
		const revokeServerKey = await app.container.make(RevokeServerKey);
		const authenticator = await app.container.make(ServerKeyAuthenticator);
		const created = await createServerKey.execute({ ownerUserId, websiteId });

		if (!created.ok) {
			throw new Error('The server key must be created');
		}

		const outsiderResult = await revokeServerKey.execute({ ownerUserId: outsiderUserId, websiteId });
		assert.deepEqual(outsiderResult, { ok: false, error: { type: 'website_not_found' } });
		assert.isNotNull(await authenticator.findActiveTarget(created.value.secret));

		const ownerResult = await revokeServerKey.execute({ ownerUserId, websiteId });

		assert.isTrue(ownerResult.ok);
		assert.isNull(await authenticator.findActiveTarget(created.value.secret));
		const persisted = await db
			.selectFrom('website_server_keys')
			.select(['revoked_at'])
			.where('id', '=', created.value.id)
			.executeTakeFirstOrThrow();
		assert.isNotNull(persisted.revoked_at);

		const replacement = await createServerKey.execute({ ownerUserId, websiteId });
		assert.isTrue(replacement.ok);
	});
});

async function createWebsite() {
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
		})
		.execute();

	return { ownerUserId, websiteId };
}

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
