import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';
import { UpdateWebsiteRetention } from '#websites/actions/update_website_retention';

test.group('Update Website retention', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('updates only a Website owned by the requesting owner', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id);
		const updateRetention = await app.container.make(UpdateWebsiteRetention);

		assert.isFalse(
			await updateRetention.execute({ ownerUserId: outsider.id, websiteId: website.id, retentionDays: 180 }),
		);
		assert.equal(await retentionDays(website.id), 90);
		assert.isTrue(await updateRetention.execute({ ownerUserId: owner.id, websiteId: website.id, retentionDays: 180 }));
		assert.equal(await retentionDays(website.id), 180);
		assert.isTrue(await updateRetention.execute({ ownerUserId: owner.id, websiteId: website.id, retentionDays: null }));
		assert.isNull(await retentionDays(website.id));
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
	const createWebsiteAction = await app.container.make(CreateWebsite);
	const result = await createWebsiteAction.execute({
		ownerUserId,
		name: 'Boring Money',
		allowedDomain: 'boring.money',
	});

	if (!result.ok) {
		throw new Error('The test Website must be created');
	}

	return result.value;
}

async function retentionDays(websiteId: string) {
	return (
		await db.selectFrom('websites').select('retention_days').where('id', '=', websiteId).executeTakeFirstOrThrow()
	).retention_days;
}
