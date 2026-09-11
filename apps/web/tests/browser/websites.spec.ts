import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { EventSource } from '#collection/event_source';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';

test.group('Websites', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('creates and displays a Website only inside its workspace', async ({ assert, browserContext, visit }) => {
		const registerUser = await app.container.make(RegisterUser);
		const ownerResult = await registerUser.execute({
			name: 'Ada',
			email: 'ada@example.com',
			password: 'a-secure-password',
		});
		const outsiderResult = await registerUser.execute({
			name: 'Grace',
			email: 'grace@example.com',
			password: 'a-secure-password',
		});

		if (!ownerResult.ok || !outsiderResult.ok) {
			throw new Error('The test users must be created');
		}

		await browserContext.loginAs(ownerResult.value);
		const createPage = await visit('/websites/new');
		await createPage.getByLabel('Name').fill('Boring Money');
		await createPage.getByLabel('Allowed domain').fill('boring.money');
		await createPage.getByRole('button', { name: 'Add website' }).click();
		await createPage.waitForURL(/\/websites\/[0-9a-f-]+$/u);
		await createPage.assertText('h1', 'Boring Money');
		await createPage.assertText('main p.text-4xl', '0');

		const website = await db.selectFrom('websites').select(['id', 'tracking_id']).executeTakeFirstOrThrow();
		assert.match(website.tracking_id, /^[0-9a-f-]{36}$/u);
		await db
			.insertInto('events')
			.values([
				{
					id: randomUUID(),
					website_id: website.id,
					name: '$pageview',
					source: EventSource.Browser,
					occurred_at: new Date(),
					path: '/pricing',
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: 'signup',
					source: EventSource.Browser,
					occurred_at: new Date(),
					path: '/signup',
				},
			])
			.execute();
		await createPage.reload();
		await createPage.assertText('main p.text-4xl', '1');
		await createPage.assertText('h2', 'Install the tracker');
		await createPage.assertText(
			'pre code',
			`<script
  defer
  data-website-id="${website.tracking_id}"
  src="http://localhost:3333/tracker.js"
></script>`,
		);

		await browserContext.loginAs(outsiderResult.value);
		const forbiddenPage = await browserContext.newPage();
		const forbiddenResponse = await forbiddenPage.goto(new URL(`/websites/${website.id}`, createPage.url()).href);
		assert.equal(forbiddenResponse?.status(), 404);
	});
});
