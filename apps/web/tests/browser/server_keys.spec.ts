import app from '@adonisjs/core/services/app';
import hash from '@adonisjs/core/services/hash';
import { test } from '@japa/runner';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';

test.group('Website server key settings', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('reveals a new secret once, keeps its metadata, and revokes it inside the owner Website', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id);
		await browserContext.loginAs(owner);
		await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);
		const page = await visit(`/websites/${website.id}`);

		await page.getByRole('link', { name: 'Settings', exact: true }).click();
		await page.waitForURL(new RegExp(`/websites/${website.id}/settings$`, 'u'));
		await page.getByRole('button', { name: 'Create server key' }).click();
		await page.getByText('Your server key has been generated', { exact: true }).waitFor();
		const secret = (await page.locator('section[aria-labelledby="new-key-title"] code').textContent()) ?? '';
		assert.match(secret, /^ba_sk_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/u);

		const persisted = await db.selectFrom('website_server_keys').selectAll().executeTakeFirstOrThrow();
		assert.equal(persisted.website_id, website.id);
		assert.notInclude(persisted.secret_hash, secret);
		assert.isTrue(await hash.verify(persisted.secret_hash, secret));
		await page.getByRole('button', { name: 'Copy secret' }).click();
		await page.getByRole('button', { name: 'Copied' }).waitFor();
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), secret);

		await page.reload();
		assert.equal(await page.getByText(secret, { exact: true }).count(), 0);
		await page.getByText(persisted.prefix, { exact: true }).waitFor();

		await browserContext.loginAs(outsider);
		const forbiddenPage = await browserContext.newPage();
		const forbiddenResponse = await forbiddenPage.goto(new URL(`/websites/${website.id}/settings`, page.url()).href);
		assert.equal(forbiddenResponse?.status(), 404);

		await browserContext.loginAs(owner);
		await page.reload();
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Revoke key' }).click();
		await page.getByRole('button', { name: 'Create server key' }).waitFor();
		const revoked = await db
			.selectFrom('website_server_keys')
			.select('revoked_at')
			.where('id', '=', persisted.id)
			.executeTakeFirstOrThrow();
		assert.isNotNull(revoked.revoked_at);

		const ingestion = await fetch('http://localhost:3333/api/server/events', {
			method: 'POST',
			headers: { 'authorization': `Bearer ${secret}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				name: 'invoice.paid',
				occurredAt: new Date().toISOString(),
				path: '/billing',
				properties: { amount: 49 },
			}),
		});
		assert.equal(ingestion.status, 401);
	});

	test('resets copy confirmation when rotating a key without reloading', async ({ assert, browserContext, visit }) => {
		const owner = await createUser('Lin', 'lin@example.com');
		const website = await createWebsite(owner.id);
		await browserContext.loginAs(owner);
		await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);
		const page = await visit(`/websites/${website.id}/settings`);

		await page.getByRole('button', { name: 'Create server key' }).click();
		await page.getByText('Your server key has been generated', { exact: true }).waitFor();
		const originalSecret = (await page.locator('section[aria-labelledby="new-key-title"] code').textContent()) ?? '';
		await page.getByRole('button', { name: 'Copy secret' }).click();
		await page.getByRole('button', { name: 'Copied' }).waitFor();

		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Revoke key' }).click();
		await page.getByRole('button', { name: 'Create server key' }).click();
		await page.getByText('Your server key has been generated', { exact: true }).waitFor();
		const replacementSecret = (await page.locator('section[aria-labelledby="new-key-title"] code').textContent()) ?? '';

		assert.notEqual(replacementSecret, originalSecret);
		await page.getByRole('button', { name: 'Copy secret' }).waitFor();
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), originalSecret);
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
