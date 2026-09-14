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

	test('lets the owner explicitly change identity mode and updates the integration guidance', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}/settings`);
		await page.getByRole('button', { name: 'Identity', exact: true }).click();
		const anonymous = page.getByRole('radio', { name: /Anonymous/u });
		const product = page.getByRole('radio', { name: /Product/u });

		assert.isTrue(await anonymous.isChecked());
		await page.getByRole('button', { name: 'Server events', exact: true }).click();
		assert.notInclude((await page.locator('pre code').textContent()) ?? '', '"distinctId": "opaque-account-42"');

		await page.getByRole('button', { name: 'Identity', exact: true }).click();
		await product.check();
		assert.isTrue(await product.isChecked());
		await page.getByText('New browser and server events must include', { exact: false }).waitFor();
		await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'PATCH'),
			page.getByRole('button', { name: 'Save identity mode' }).click(),
		]);
		assert.isTrue(await product.isChecked());
		await page.getByRole('button', { name: 'Server events', exact: true }).click();
		await page.waitForFunction(() =>
			document.querySelector('pre code')?.textContent?.includes('"distinctId": "opaque-account-42"'),
		);
		assert.equal(
			(await db.selectFrom('websites').select('identity_mode').where('id', '=', website.id).executeTakeFirstOrThrow())
				.identity_mode,
			'product',
		);

		await page.getByRole('button', { name: 'Identity', exact: true }).click();
		await anonymous.check();
		assert.isTrue(await anonymous.isChecked());
		await page.getByText('New events must omit Product identity', { exact: false }).waitFor();
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
		await page.getByRole('button', { name: 'Server events', exact: true }).click();
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
		await page.getByRole('button', { name: 'Server events', exact: true }).click();
		await page.getByText(persisted.prefix, { exact: true }).waitFor();

		await browserContext.loginAs(outsider);
		const forbiddenPage = await browserContext.newPage();
		const forbiddenResponse = await forbiddenPage.goto(new URL(`/websites/${website.id}/settings`, page.url()).href);
		assert.equal(forbiddenResponse?.status(), 404);

		await browserContext.loginAs(owner);
		await page.reload();
		await page.getByRole('button', { name: 'Server events', exact: true }).click();
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

		await page.getByRole('button', { name: 'Server events', exact: true }).click();
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

test.group('Website browser collection settings', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('manages exact hostnames and rotates public keys without ambiguous statuses', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const original = await db
			.selectFrom('website_collection_keys')
			.select(['id', 'key'])
			.where('website_id', '=', website.id)
			.executeTakeFirstOrThrow();
		await fetch('http://localhost:3333/api/events', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'origin': 'https://boring.money' },
			body: JSON.stringify({
				trackingId: original.key,
				name: '$pageview',
				occurredAt: new Date().toISOString(),
				path: '/',
				referrer: null,
				utmSource: null,
				utmMedium: null,
				utmCampaign: null,
			}),
		});
		await browserContext.loginAs(owner);
		await browserContext.grantPermissions(['clipboard-read', 'clipboard-write']);
		const page = await visit(`/websites/${website.id}/settings`);
		await page.getByRole('button', { name: 'Browser collection', exact: true }).click();

		await page.getByRole('textbox', { name: 'Add domain' }).fill(' SHOP.BORING.MONEY. ');
		await page.getByRole('button', { name: 'Add domain' }).click();
		await page.getByText('shop.boring.money', { exact: true }).waitFor();
		assert.sameMembers(
			(
				await db.selectFrom('website_allowed_domains').select('hostname').where('website_id', '=', website.id).execute()
			).map(({ hostname }) => hostname),
			['boring.money', 'shop.boring.money'],
		);

		await page.getByRole('button', { name: 'Create collection key' }).click();
		await page.getByText('Rotation in progress.', { exact: false }).waitFor();
		assert.equal(await page.getByText('Active', { exact: true }).count(), 2);
		assert.equal(await page.getByText('Historical', { exact: false }).count(), 0);
		const keys = await db
			.selectFrom('website_collection_keys')
			.select(['id', 'key'])
			.where('website_id', '=', website.id)
			.where('revoked_at', 'is', null)
			.orderBy('created_at', 'desc')
			.execute();
		assert.lengthOf(keys, 2);
		await page.getByLabel('Snippet key').selectOption(keys[1]!.id);
		assert.include((await page.locator('pre code').last().textContent()) ?? '', keys[1]!.key);
		await page.getByRole('button', { name: 'Copy snippet' }).click();
		assert.include(await page.evaluate(() => navigator.clipboard.readText()), keys[1]!.key);

		const originalRow = page.getByRole('group', { name: `Collection key ${original.key}` });
		let confirmation = '';
		page.once('dialog', async (dialog) => {
			confirmation = dialog.message();
			await dialog.accept();
		});
		await originalRow.getByRole('button', { name: 'Revoke', exact: true }).click();
		await page.getByText('1 / 2 active', { exact: true }).waitFor();
		assert.include(confirmation, 'Revocation is immediate');
		assert.include(confirmation, 'Last used');
		assert.isNotNull(
			(
				await db
					.selectFrom('website_collection_keys')
					.select('revoked_at')
					.where('id', '=', original.id)
					.executeTakeFirstOrThrow()
			).revoked_at,
		);
		assert.isTrue(await page.getByRole('button', { name: 'Revoke', exact: true }).isDisabled());
	});
});

test.group('Website data controls', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('updates raw event retention and exposes the owner export', async ({ assert, browserContext, visit }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}/settings`);

		await page.getByRole('heading', { name: 'Data controls', exact: true }).waitFor();
		assert.isTrue(await page.getByRole('radio', { name: '90 days', exact: true }).isChecked());
		assert.equal(
			await page.getByRole('link', { name: 'Download JSONL export' }).getAttribute('href'),
			'/account/export',
		);

		await page.getByText('180 days', { exact: true }).click();
		await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'PATCH'),
			page.getByRole('button', { name: 'Save retention' }).click(),
		]);

		assert.equal(
			(await db.selectFrom('websites').select('retention_days').where('id', '=', website.id).executeTakeFirstOrThrow())
				.retention_days,
			180,
		);
		assert.isTrue(await page.getByRole('radio', { name: '180 days', exact: true }).isChecked());
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
