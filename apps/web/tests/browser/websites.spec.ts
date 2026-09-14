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
		await createPage.assertText('section[aria-label="Visit summary"] > div:first-child p:nth-child(2)', '0');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(3) p:nth-child(2)', '0');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(4) p:nth-child(2)', '—');
		await createPage.getByText('Median session duration', { exact: true }).waitFor();
		await createPage.getByRole('navigation', { name: 'Traffic period' }).locator('[aria-current="page"]').waitFor();
		await createPage.locator('[aria-label="Traffic periods"]').waitFor();
		const emptyScale = createPage.locator('[data-chart-scale] span');
		assert.equal(await emptyScale.count(), 1);
		assert.equal(await emptyScale.textContent(), '0');

		const website = await db.selectFrom('websites').select(['id', 'tracking_id']).executeTakeFirstOrThrow();
		assert.match(website.tracking_id, /^[0-9a-f-]{36}$/u);
		const now = Date.now();
		const sessionA = randomUUID();
		const sessionB = randomUUID();
		await db
			.insertInto('events')
			.values([
				{
					id: randomUUID(),
					website_id: website.id,
					name: '$pageview',
					source: EventSource.Browser,
					occurred_at: new Date(now - 40 * 60 * 1_000),
					path: '/pricing',
					anonymous_id: 'visitor-a',
					session_id: sessionA,
					referrer: 'https://google.com/search',
					utm_source: 'newsletter',
					utm_medium: 'email',
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: '$pageview',
					source: EventSource.Browser,
					occurred_at: new Date(now - 35 * 60 * 1_000),
					path: '/pricing',
					anonymous_id: 'visitor-a',
					session_id: sessionA,
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: '$pageview',
					source: EventSource.Browser,
					occurred_at: new Date(now - 31 * 60 * 1_000),
					path: '/docs',
					anonymous_id: 'visitor-b',
					session_id: sessionB,
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: 'signup',
					source: EventSource.Browser,
					occurred_at: new Date(),
					path: '/signup',
					properties: { 'plan': 'pro', 'plan ': 'legacy', 'trial': true, 'variant': 'true' },
				},
				{
					id: randomUUID(),
					website_id: website.id,
					name: 'signup',
					source: EventSource.Browser,
					occurred_at: new Date(),
					path: '/signup',
					properties: { 'plan': 'free', 'plan ': 'next', 'trial': false, 'variant': true },
				},
			])
			.execute();
		await createPage.reload();
		await createPage.assertText('section[aria-label="Visit summary"] > div:first-child p:nth-child(2)', '3');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(2) p:nth-child(2)', '2');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(3) p:nth-child(2)', '2');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(4) p:nth-child(2)', '50.0%');
		await createPage.assertText('section[aria-label="Visit summary"] > div:nth-child(5) p:nth-child(2)', '2m 30s');
		await createPage.getByText('New vs previous 30 days', { exact: true }).first().waitFor();
		const populatedScale = createPage.locator('[data-chart-scale] span');
		assert.equal(await populatedScale.count(), 3);
		assert.deepEqual(await populatedScale.allTextContents(), ['4', '2', '0']);
		assert.equal(await populatedScale.last().textContent(), '0');
		const dailyData = createPage.getByRole('table', { name: 'Daily pageviews data' });
		assert.equal(await dailyData.locator('tbody tr').count(), 30);
		assert.equal(await dailyData.locator('tbody tr:first-child td:last-child').textContent(), '0');
		assert.equal(await dailyData.locator('tbody tr:last-child td:last-child').textContent(), '3');
		const periodNavigation = createPage.getByRole('navigation', { name: 'Traffic period' });
		await periodNavigation.getByRole('link', { name: '7 days' }).click();
		await createPage.waitForURL(/\?period=7$/u);
		assert.equal(await dailyData.locator('tbody tr').count(), 7);
		assert.equal(await periodNavigation.locator('[aria-current="page"]').textContent(), '7 days');
		await createPage.goto(new URL(`/websites/${website.id}?period=invalid`, createPage.url()).href);
		assert.equal(await dailyData.locator('tbody tr').count(), 30);
		assert.equal(await periodNavigation.locator('[aria-current="page"]').textContent(), '30 days');
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

		await db
			.updateTable('websites')
			.set({ retention_days: null, events_available_from: new Date(now - 45 * 24 * 60 * 60 * 1_000) })
			.where('id', '=', website.id)
			.execute();
		await createPage.reload();
		await createPage.assertText('section[aria-label="Visit summary"] > div:first-child p:nth-child(2)', '3');
		assert.equal(await createPage.getByText('Previous period unavailable', { exact: true }).count(), 5);
		assert.equal(await createPage.locator('[aria-label="Traffic periods"]').count(), 0);

		await db
			.updateTable('websites')
			.set({ events_available_from: new Date(now - 10 * 24 * 60 * 60 * 1_000) })
			.where('id', '=', website.id)
			.execute();
		await createPage.reload();
		await createPage.getByRole('heading', { name: 'This report is unavailable' }).waitFor();
		assert.equal(await createPage.getByRole('region', { name: 'Visit summary' }).count(), 0);

		await db
			.updateTable('websites')
			.set({ retention_days: 90, events_available_from: null })
			.where('id', '=', website.id)
			.execute();
		await createPage.getByRole('link', { name: 'Events', exact: true }).click();
		await createPage.waitForURL(/\/websites\/[0-9a-f-]+\/events$/u);
		const knownEvents = createPage.getByRole('table', { name: 'Known custom events' });
		await knownEvents.getByRole('link', { name: 'signup', exact: true }).waitFor();
		await createPage.getByText('Selected custom event', { exact: true }).waitFor();
		assert.equal(
			await createPage.getByRole('table', { name: 'Daily signup event data' }).locator('tbody tr').count(),
			30,
		);
		await createPage.getByRole('combobox', { name: 'Property key' }).selectOption('plan');
		await createPage
			.getByRole('table', { name: 'Top values for plan' })
			.getByRole('rowheader', { name: '"pro"' })
			.waitFor();
		await createPage.getByRole('combobox', { name: 'Property key' }).selectOption({ value: 'plan ' });
		assert.equal(await createPage.getByRole('combobox', { name: 'Property key' }).inputValue(), 'plan ');
		await createPage
			.getByRole('table', { name: 'Top values for plan' })
			.getByRole('rowheader', { name: '"legacy"' })
			.waitFor();
		await createPage.getByRole('combobox', { name: 'Property key' }).selectOption('variant');
		const variants = createPage.getByRole('table', { name: 'Top values for variant' });
		await variants.getByRole('rowheader', { name: '"true"', exact: true }).waitFor();
		await variants.getByRole('rowheader', { name: 'true', exact: true }).waitFor();

		await browserContext.loginAs(outsiderResult.value);
		const forbiddenPage = await browserContext.newPage();
		const forbiddenResponse = await forbiddenPage.goto(new URL(`/websites/${website.id}`, createPage.url()).href);
		assert.equal(forbiddenResponse?.status(), 404);
		const forbiddenEvents = await forbiddenPage.goto(new URL(`/websites/${website.id}/events`, createPage.url()).href);
		assert.equal(forbiddenEvents?.status(), 404);
	});
});
