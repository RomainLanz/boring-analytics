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
		await createPage.assertText('section[aria-label="Visit summary"] > div:first-child p:last-child', '0');
		const emptyScale = createPage.locator('[data-chart-scale] span');
		assert.equal(await emptyScale.count(), 1);
		assert.equal(await emptyScale.textContent(), '0');

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
					anonymous_id: 'visitor-a',
					session_id: 'session-a',
					referrer: 'https://google.com/search',
					utm_source: 'newsletter',
					utm_medium: 'email',
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: '$pageview',
					source: EventSource.Browser,
					occurred_at: new Date(),
					path: '/pricing',
					anonymous_id: 'visitor-a',
					session_id: 'session-b',
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: '$pageview',
					source: EventSource.Browser,
					occurred_at: new Date(),
					path: '/docs',
					anonymous_id: 'visitor-b',
					session_id: 'session-c',
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
		await createPage.assertText('section[aria-label="Visit summary"] > div:first-child p:last-child', '3');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(2) p:last-child', '2');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(3) p:last-child', '3');
		const populatedScale = createPage.locator('[data-chart-scale] span');
		assert.equal(await populatedScale.count(), 3);
		assert.deepEqual(await populatedScale.allTextContents(), ['4', '2', '0']);
		assert.equal(await populatedScale.last().textContent(), '0');
		const dailyData = createPage.getByRole('table', { name: 'Daily pageviews data' });
		assert.equal(await dailyData.locator('tbody tr').count(), 30);
		assert.equal(await dailyData.locator('tbody tr:first-child td:last-child').textContent(), '0');
		assert.equal(await dailyData.locator('tbody tr:last-child td:last-child').textContent(), '3');
		const topPages = createPage.getByRole('table', { name: 'Top pages' });
		await topPages.getByRole('columnheader', { name: 'Page', exact: true }).waitFor();
		await topPages.getByRole('columnheader', { name: 'Visitors', exact: true }).waitFor();
		await topPages.getByRole('columnheader', { name: 'Pageviews', exact: true }).waitFor();
		await topPages.getByRole('rowheader', { name: '/pricing', exact: true }).waitFor();
		await createPage.getByRole('table', { name: 'Referrers by visitors' }).waitFor();
		await createPage.getByRole('button', { name: 'UTM sources' }).click();
		await createPage
			.getByRole('table', { name: 'UTM sources by visitors' })
			.getByRole('rowheader', { name: 'newsletter' })
			.waitFor();
		await createPage.getByRole('button', { name: 'UTM campaigns' }).click();
		await createPage.getByText('No UTM campaigns recorded in this period.', { exact: true }).waitFor();
		await createPage.getByText('Install the tracker', { exact: true }).click();
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
