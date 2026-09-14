import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateCollectionKey } from '#websites/actions/create_collection_key';
import { CreateWebsite } from '#websites/actions/create_website';
import { RevokeCollectionKey } from '#websites/actions/revoke_collection_key';

test.group('Manage Website collection keys', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('keeps the original tracking ID active and allows one overlapping replacement', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const createKey = await app.container.make(CreateCollectionKey);
		const original = await db
			.selectFrom('website_collection_keys')
			.selectAll()
			.where('website_id', '=', website.id)
			.executeTakeFirstOrThrow();

		assert.equal(original.key, website.trackingId);
		assert.isNull(original.revoked_at);
		const replacement = await createKey.execute({ ownerUserId: owner.id, websiteId: website.id });
		assert.isTrue(replacement.ok);

		if (!replacement.ok) {
			return;
		}
		assert.match(replacement.value.key, /^[0-9a-f-]{36}$/u);
		assert.notEqual(replacement.value.key, original.key);
		assert.deepEqual(await createKey.execute({ ownerUserId: owner.id, websiteId: website.id }), {
			ok: false,
			error: { type: 'active_collection_key_limit_reached' },
		});
	});

	test('enforces owner isolation and the two-key limit under concurrent creation', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id);
		const createKey = await app.container.make(CreateCollectionKey);

		assert.deepEqual(await createKey.execute({ ownerUserId: outsider.id, websiteId: website.id }), {
			ok: false,
			error: { type: 'website_not_found' },
		});
		const results = await Promise.all([
			createKey.execute({ ownerUserId: owner.id, websiteId: website.id }),
			createKey.execute({ ownerUserId: owner.id, websiteId: website.id }),
		]);

		assert.lengthOf(
			results.filter((result) => result.ok),
			1,
		);
		assert.deepInclude(results, { ok: false, error: { type: 'active_collection_key_limit_reached' } });
		assert.lengthOf(
			await db
				.selectFrom('website_collection_keys')
				.select('id')
				.where('website_id', '=', website.id)
				.where('revoked_at', 'is', null)
				.execute(),
			2,
		);
	});

	test('refuses the last active key and keeps one key when two revocations race', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const createKey = await app.container.make(CreateCollectionKey);
		const revokeKey = await app.container.make(RevokeCollectionKey);
		const original = await activeKeys(website.id);

		assert.deepEqual(
			await revokeKey.execute({ ownerUserId: owner.id, websiteId: website.id, collectionKeyId: original[0]!.id }),
			{ ok: false, error: { type: 'last_active_collection_key' } },
		);
		const replacement = await createKey.execute({ ownerUserId: owner.id, websiteId: website.id });

		if (!replacement.ok) {
			throw new Error('The replacement key must be created');
		}

		const results = await Promise.all(
			(await activeKeys(website.id)).map(({ id: collectionKeyId }) =>
				revokeKey.execute({ ownerUserId: owner.id, websiteId: website.id, collectionKeyId }),
			),
		);

		assert.lengthOf(
			results.filter((result) => result.ok),
			1,
		);
		assert.deepInclude(results, { ok: false, error: { type: 'last_active_collection_key' } });
		const remaining = await activeKeys(website.id);
		assert.lengthOf(remaining, 1);
		assert.equal(
			(await db.selectFrom('websites').select('tracking_id').where('id', '=', website.id).executeTakeFirstOrThrow())
				.tracking_id,
			remaining[0]!.key,
		);
	});

	test('serializes concurrent creation and revocation without leaving zero or more than two active keys', async ({
		assert,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const createKey = await app.container.make(CreateCollectionKey);
		const revokeKey = await app.container.make(RevokeCollectionKey);
		const original = (await activeKeys(website.id))[0]!;

		await Promise.all([
			createKey.execute({ ownerUserId: owner.id, websiteId: website.id }),
			revokeKey.execute({ ownerUserId: owner.id, websiteId: website.id, collectionKeyId: original.id }),
		]);

		assert.isAtLeast((await activeKeys(website.id)).length, 1);
		assert.isAtMost((await activeKeys(website.id)).length, 2);
	});
});

async function activeKeys(websiteId: string) {
	return db
		.selectFrom('website_collection_keys')
		.select(['id', 'key'])
		.where('website_id', '=', websiteId)
		.where('revoked_at', 'is', null)
		.execute();
}

async function createUser(name: string, email: string) {
	const registerUser = await app.container.make(RegisterUser);
	const result = await registerUser.execute({ name, email, password: 'a-secure-password' });

	if (!result.ok) {
		throw new Error('The test user must be created');
	}
	return result.value;
}

async function createWebsite(ownerUserId: string) {
	const createWebsite = await app.container.make(CreateWebsite);
	const result = await createWebsite.execute({ ownerUserId, name: 'Boring Money', allowedDomain: 'boring.money' });

	if (!result.ok) {
		throw new Error('The test Website must be created');
	}
	return result.value;
}
