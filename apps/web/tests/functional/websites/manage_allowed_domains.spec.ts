import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { AddAllowedDomain } from '#websites/actions/add_allowed_domain';
import { CreateWebsite } from '#websites/actions/create_website';
import { RemoveAllowedDomain } from '#websites/actions/remove_allowed_domain';

test.group('Manage Website allowed domains', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('normalizes exact hostnames and rejects invalid or duplicate entries', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const addDomain = await app.container.make(AddAllowedDomain);

		const added = await addDomain.execute({
			ownerUserId: owner.id,
			websiteId: website.id,
			hostname: ' SHOP.Example.COM. ',
		});
		const duplicate = await addDomain.execute({
			ownerUserId: owner.id,
			websiteId: website.id,
			hostname: 'shop.example.com',
		});
		const unicode = await addDomain.execute({
			ownerUserId: owner.id,
			websiteId: website.id,
			hostname: 'münich.example',
		});
		const origin = await addDomain.execute({
			ownerUserId: owner.id,
			websiteId: website.id,
			hostname: 'https://api.example.com',
		});

		assert.isTrue(added.ok);
		assert.deepEqual(duplicate, { ok: false, error: { type: 'allowed_domain_exists' } });
		assert.deepEqual(unicode, { ok: false, error: { type: 'invalid_allowed_domain' } });
		assert.deepEqual(origin, { ok: false, error: { type: 'invalid_allowed_domain' } });
		assert.sameMembers(
			(await db.selectFrom('website_allowed_domains').select('hostname').execute()).map(({ hostname }) => hostname),
			['boring.money', 'shop.example.com'],
		);
	});

	test('preserves the current localhost, punycode, IPv4, and IPv6 policy', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const addDomain = await app.container.make(AddAllowedDomain);

		for (const hostname of ['localhost', 'xn--mnich-kva.example', '192.0.2.1']) {
			assert.isTrue((await addDomain.execute({ ownerUserId: owner.id, websiteId: website.id, hostname })).ok);
		}
		assert.deepEqual(
			await addDomain.execute({ ownerUserId: owner.id, websiteId: website.id, hostname: '2001:db8::1' }),
			{ ok: false, error: { type: 'invalid_allowed_domain' } },
		);
	});

	test('enforces the owner boundary and the five-domain limit under concurrent additions', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id);
		const addDomain = await app.container.make(AddAllowedDomain);

		assert.deepEqual(
			await addDomain.execute({ ownerUserId: outsider.id, websiteId: website.id, hostname: 'outside.example' }),
			{ ok: false, error: { type: 'website_not_found' } },
		);
		for (const hostname of ['one.example', 'two.example', 'three.example']) {
			assert.isTrue((await addDomain.execute({ ownerUserId: owner.id, websiteId: website.id, hostname })).ok);
		}

		const results = await Promise.all(
			['four.example', 'five.example'].map((hostname) =>
				addDomain.execute({ ownerUserId: owner.id, websiteId: website.id, hostname }),
			),
		);

		assert.lengthOf(
			results.filter((result) => result.ok),
			1,
		);
		assert.deepInclude(results, { ok: false, error: { type: 'allowed_domain_limit_reached' } });
		assert.lengthOf(await db.selectFrom('website_allowed_domains').select('id').execute(), 5);
	});

	test('never removes the last domain when removals race', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const addDomain = await app.container.make(AddAllowedDomain);
		const removeDomain = await app.container.make(RemoveAllowedDomain);
		assert.isTrue(
			(await addDomain.execute({ ownerUserId: owner.id, websiteId: website.id, hostname: 'shop.example.com' })).ok,
		);
		const domains = await db
			.selectFrom('website_allowed_domains')
			.select('id')
			.where('website_id', '=', website.id)
			.execute();

		const results = await Promise.all(
			domains.map(({ id: domainId }) =>
				removeDomain.execute({ ownerUserId: owner.id, websiteId: website.id, domainId }),
			),
		);

		assert.lengthOf(
			results.filter((result) => result.ok),
			1,
		);
		assert.deepInclude(results, { ok: false, error: { type: 'last_allowed_domain' } });
		assert.lengthOf(
			await db.selectFrom('website_allowed_domains').select('id').where('website_id', '=', website.id).execute(),
			1,
		);
		const remaining = await db
			.selectFrom('website_allowed_domains')
			.select('hostname')
			.where('website_id', '=', website.id)
			.executeTakeFirstOrThrow();
		assert.equal(
			(await db.selectFrom('websites').select('allowed_domain').where('id', '=', website.id).executeTakeFirstOrThrow())
				.allowed_domain,
			remaining.hostname,
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

async function createWebsite(ownerUserId: string) {
	const createWebsite = await app.container.make(CreateWebsite);
	const result = await createWebsite.execute({ ownerUserId, name: 'Boring Money', allowedDomain: 'boring.money' });

	if (!result.ok) {
		throw new Error('The test Website must be created');
	}

	return result.value;
}
