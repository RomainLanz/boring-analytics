import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { EventSource } from '#collection/event_source';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';

test.group('Funnels', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('creates, reports, and edits an owner-scoped Funnel', async ({ assert, browserContext, visit }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id);
		const firstStepName = 'landingpageviewwithoutnaturalbreakpoints'.padEnd(64, 'x');
		const finalStepName = 'subscription_started_with_annual_enterprise_contract';
		const longPropertyKey = 'propertywithoutnaturalbreakpoints'.padEnd(64, 'x');
		const now = Date.now();
		await db
			.insertInto('events')
			.values([
				{
					...event(website.id, 'converted', firstStepName, new Date(now - 60 * 60_000), '/pricing'),
					properties: { [longPropertyKey]: 'enterprise' },
				},
				event(website.id, 'converted', 'newsletter_opened', new Date(now - 55 * 60_000)),
				event(website.id, 'converted', finalStepName, new Date(now - 50 * 60_000)),
				{
					...event(website.id, 'abandoned', firstStepName, new Date(now - 45 * 60_000), '/pricing'),
					properties: { [longPropertyKey]: 'starter' },
				},
			])
			.execute();

		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}`);
		await page.getByRole('link', { name: 'Funnels', exact: true }).click();
		await page.getByText('No Funnels yet', { exact: true }).waitFor();
		await page.getByRole('link', { name: 'Create your first Funnel' }).click();
		await page.getByLabel('Funnel name').fill('Signup conversion');
		await page.getByLabel('Event').nth(0).fill(firstStepName);
		await page.getByLabel('Filter').nth(0).selectOption('path');
		await page.getByLabel('Path value').fill('/pricing');
		await page.getByLabel('Event').nth(1).fill(finalStepName);
		await page.getByRole('button', { name: 'Create Funnel' }).click();
		await page.waitForURL(/\/websites\/[0-9a-f-]+\/funnels\/[0-9a-f-]+$/u);

		await page.getByRole('heading', { name: 'Signup conversion' }).waitFor();
		const summary = page.getByRole('region', { name: 'Funnel summary' });
		await summary.getByText('2', { exact: true }).first().waitFor();
		await summary.getByText('1', { exact: true }).first().waitFor();
		await summary.getByText('50%', { exact: true }).waitFor();
		await page.getByText('Current', { exact: true }).first().waitFor();
		await page.getByText('Previous', { exact: true }).first().waitFor();
		await page.getByText('New vs previous 30 days', { exact: true }).first().waitFor();
		await page.getByText('newsletter_opened', { exact: true }).waitFor({ state: 'detached' });
		const finalStepLabel = page.getByText(`2. ${finalStepName}`, { exact: true });

		for (const viewport of [
			{ width: 1280, height: 900 },
			{ width: 900, height: 900 },
			{ width: 390, height: 844 },
		]) {
			await page.setViewportSize(viewport);
			const dimensions = await finalStepLabel.evaluate((element) => ({
				clientHeight: element.clientHeight,
				clientWidth: element.clientWidth,
				lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
				scrollWidth: element.scrollWidth,
				whiteSpace: getComputedStyle(element).whiteSpace,
			}));
			assert.equal(dimensions.whiteSpace, 'normal');
			assert.isAtMost(dimensions.scrollWidth, dimensions.clientWidth);

			if (viewport.width === 1280) {
				assert.isAbove(dimensions.clientHeight, dimensions.lineHeight);
			}
		}
		await page.setViewportSize({ width: 1280, height: 900 });

		const funnelId = page.url().split('/').at(-1);

		if (!funnelId) {
			throw new Error('The Funnel id must be present in the report URL');
		}
		const periodNavigation = page.getByRole('navigation', { name: 'Funnel period' });
		assert.equal(await periodNavigation.getByRole('link', { name: '30 days' }).getAttribute('aria-current'), 'page');
		await periodNavigation.getByRole('link', { name: '7 days' }).click();
		await page.waitForURL(/\?period=7$/u);
		assert.equal(await periodNavigation.getByRole('link', { name: '7 days' }).getAttribute('aria-current'), 'page');
		assert.equal(
			(
				await db
					.selectFrom('funnels')
					.select('conversion_window_seconds')
					.where('id', '=', funnelId)
					.executeTakeFirstOrThrow()
			).conversion_window_seconds,
			1_800,
		);
		await page.goto(new URL(`?period=14`, page.url()).href);
		assert.equal(await periodNavigation.getByRole('link', { name: '30 days' }).getAttribute('aria-current'), 'page');
		await page.getByLabel('Segment by').selectOption('path');
		await page.waitForURL(/\?period=30&segment=path$/u);
		const segmentation = page.getByRole('region', { name: 'Funnel segments' });
		await segmentation.getByRole('columnheader', { name: 'Landing path' }).waitFor();
		await segmentation.getByText('/pricing', { exact: true }).first().waitFor();
		const segmentationRule = segmentation.getByText(
			`Each identity keeps the segment from its first matching ${firstStepName} event. Later events cannot change it.`,
		);
		await segmentationRule.waitFor();

		for (const viewport of [
			{ width: 1280, height: 900 },
			{ width: 900, height: 900 },
			{ width: 390, height: 844 },
		]) {
			await page.setViewportSize(viewport);
			const widths = await segmentationRule.evaluate((element) => ({
				clientWidth: element.clientWidth,
				documentClientWidth: document.documentElement.clientWidth,
				documentScrollWidth: document.documentElement.scrollWidth,
				scrollWidth: element.scrollWidth,
			}));
			assert.isAtMost(widths.scrollWidth, widths.clientWidth);
			assert.isAtMost(widths.documentScrollWidth, widths.documentClientWidth);
		}
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.getByLabel('Segment by').selectOption(`property:${longPropertyKey}`);
		await page.waitForURL(new RegExp(`segment=property&property=${longPropertyKey}$`, 'u'));
		const propertyHeader = segmentation.getByRole('columnheader', { name: `Property · ${longPropertyKey}` });

		for (const viewport of [
			{ width: 1280, height: 900 },
			{ width: 900, height: 900 },
		]) {
			await page.setViewportSize(viewport);
			const dimensions = await propertyHeader.evaluate((element) => ({
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
				whiteSpace: getComputedStyle(element).whiteSpace,
			}));
			assert.equal(dimensions.whiteSpace, 'normal');
			assert.isAtMost(dimensions.scrollWidth, dimensions.clientWidth);
		}
		await page.setViewportSize({ width: 1280, height: 900 });

		await db.updateTable('funnels').set('conversion_window_seconds', 900).where('id', '=', funnelId).execute();
		await page.getByRole('link', { name: 'Edit Funnel' }).click();
		await page.getByLabel('Funnel name').fill('Activated signups');
		await page.getByRole('button', { name: 'Save Funnel' }).click();
		await page.waitForURL(new RegExp(`/funnels/${funnelId}$`, 'u'));
		await page.getByRole('heading', { name: 'Activated signups' }).waitFor();
		assert.equal(
			(
				await db
					.selectFrom('funnels')
					.select('conversion_window_seconds')
					.where('id', '=', funnelId)
					.executeTakeFirstOrThrow()
			).conversion_window_seconds,
			900,
		);
		await page.getByRole('link', { name: 'Edit Funnel' }).click();
		await page.getByLabel('Filter').nth(0).selectOption('property');
		await page.getByLabel('Property key').fill('seats');
		await page.getByLabel('Value type').selectOption('number');
		await page.getByRole('textbox', { name: 'Value', exact: true }).fill(' ');
		await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'PUT'),
			page.getByRole('button', { name: 'Save Funnel' }).click(),
		]);
		assert.match(page.url(), new RegExp(`/funnels/${funnelId}/edit$`, 'u'));
		assert.deepEqual(
			(
				await db
					.selectFrom('funnel_steps')
					.select('filter')
					.where('funnel_id', '=', funnelId)
					.where('position', '=', 1)
					.executeTakeFirstOrThrow()
			).filter,
			{ field: 'path', value: '/pricing' },
		);
		await page.getByLabel('Event').nth(0).fill('a'.repeat(65));
		await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'PUT'),
			page.getByRole('button', { name: 'Save Funnel' }).click(),
		]);
		await page.getByRole('alert').waitFor();
		await page.getByLabel('Event').nth(0).fill(firstStepName);
		await page.getByLabel('Value type').selectOption('string');
		await page.getByRole('textbox', { name: 'Value', exact: true }).fill('');
		await page.getByRole('button', { name: 'Save Funnel' }).click();
		await page.waitForURL(new RegExp(`/funnels/${funnelId}$`, 'u'));
		assert.deepEqual(
			(
				await db
					.selectFrom('funnel_steps')
					.select('filter')
					.where('funnel_id', '=', funnelId)
					.where('position', '=', 1)
					.executeTakeFirstOrThrow()
			).filter,
			{ field: 'property', key: 'seats', value: '' },
		);

		await browserContext.loginAs(outsider);
		const forbiddenPage = await browserContext.newPage();
		const forbiddenResponse = await forbiddenPage.goto(page.url());
		assert.equal(forbiddenResponse?.status(), 404);
	});

	test('creates and updates a valid Funnel definition larger than the collection payload limit', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const firstPath = `/${'a'.repeat(2_047)}`;
		const secondPath = `/${'b'.repeat(2_047)}`;

		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}/funnels/new`);
		await page.getByLabel('Funnel name').fill('Long paths');
		await page.getByLabel('Event').nth(0).fill('$pageview');
		await page.getByLabel('Filter').nth(0).selectOption('path');
		await page.getByLabel('Path value').nth(0).fill(firstPath);
		await page.getByLabel('Event').nth(1).fill('$pageview');
		await page.getByLabel('Filter').nth(1).selectOption('path');
		await page.getByLabel('Path value').nth(1).fill(secondPath);
		await page.getByRole('button', { name: 'Create Funnel' }).click();
		await page.waitForURL(/\/websites\/[0-9a-f-]+\/funnels\/[0-9a-f-]+$/u);

		const funnelId = page.url().split('/').at(-1);

		if (!funnelId) {
			throw new Error('The Funnel id must be present in the report URL');
		}

		await page.getByRole('link', { name: 'Edit Funnel' }).click();
		await page.getByLabel('Funnel name').fill('Long paths updated');
		await page.getByRole('button', { name: 'Save Funnel' }).click();
		await page.waitForURL(new RegExp(`/funnels/${funnelId}$`, 'u'));
		await page.getByRole('heading', { name: 'Long paths updated' }).waitFor();
		assert.deepEqual(
			await db
				.selectFrom('funnel_steps')
				.select('filter')
				.where('funnel_id', '=', funnelId)
				.orderBy('position')
				.execute(),
			[{ filter: { field: 'path', value: firstPath } }, { filter: { field: 'path', value: secondPath } }],
		);
	});

	test('creates a multi-session Product Funnel and keeps its identity after the Website mode changes', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		await db.updateTable('websites').set('identity_mode', 'product').where('id', '=', website.id).execute();
		await db
			.insertInto('events')
			.values([
				productEvent(website.id, 'account-a', 'signup', new Date(Date.now() - 8 * 60 * 60_000)),
				productEvent(website.id, 'account-a', 'activated', new Date(Date.now() - 6 * 60 * 60_000)),
			])
			.execute();

		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}/funnels/new`);
		await page.getByText('Product users', { exact: true }).waitFor();
		await page.getByText('Each distinct_id counts once across browser and server events.', { exact: true }).waitFor();
		const conversionWindow = page.getByLabel('Conversion window');
		assert.include(await conversionWindow.locator('option').allTextContents(), '30 days');
		await page.getByLabel('Funnel name').fill('Product activation');
		await page.getByLabel('Event').nth(0).fill('signup');
		await page.getByLabel('Event').nth(1).fill('activated');
		await conversionWindow.selectOption(String(7 * 24 * 60 * 60));
		await page.getByRole('button', { name: 'Create Funnel' }).click();
		await page.waitForURL(/\/websites\/[0-9a-f-]+\/funnels\/[0-9a-f-]+$/u);
		await page.getByText('Product users · 7 day window', { exact: true }).waitFor();
		await page.getByRole('region', { name: 'Funnel summary' }).getByText('Users', { exact: true }).first().waitFor();

		const funnelId = page.url().split('/').at(-1);

		if (!funnelId) {
			throw new Error('The Funnel id must be present in the report URL');
		}

		await db.updateTable('websites').set('identity_mode', 'anonymous').where('id', '=', website.id).execute();
		await page.getByRole('link', { name: 'Edit Funnel' }).click();
		await page.getByText('Product users', { exact: true }).waitFor();
		assert.equal(await page.getByLabel('Conversion window').inputValue(), String(7 * 24 * 60 * 60));
		await page.getByRole('button', { name: 'Save Funnel' }).click();
		await page.waitForURL(new RegExp(`/funnels/${funnelId}$`, 'u'));
		assert.deepEqual(
			await db
				.selectFrom('funnels')
				.select(['identity_kind', 'conversion_window_seconds'])
				.where('id', '=', funnelId)
				.executeTakeFirstOrThrow(),
			{ identity_kind: 'distinct_id', conversion_window_seconds: 7 * 24 * 60 * 60 },
		);

		await page.goto(new URL(`/websites/${website.id}/funnels/new`, page.url()).href);
		await page.getByText('Anonymous sessions', { exact: true }).waitFor();
		assert.notInclude(await page.getByLabel('Conversion window').locator('option').allTextContents(), '1 hour');
	});

	test('does not present partial Funnel metrics as an empty report after retention truncation', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const funnelId = randomUUID();
		await db
			.updateTable('websites')
			.set({ identity_mode: 'product', retention_days: 60 })
			.where('id', '=', website.id)
			.execute();
		await db
			.insertInto('funnels')
			.values({
				id: funnelId,
				website_id: website.id,
				name: 'Long activation',
				identity_kind: 'distinct_id',
				conversion_window_seconds: 30 * 24 * 60 * 60,
			})
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{ funnel_id: funnelId, position: 1, event_name: 'signup', filter: null },
				{ funnel_id: funnelId, position: 2, event_name: 'activated', filter: null },
			])
			.execute();

		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}/funnels/${funnelId}`);

		await page.getByRole('heading', { name: 'This report is unavailable' }).waitFor();
		assert.equal(await page.getByRole('region', { name: 'Funnel summary' }).count(), 0);
		assert.include(
			await page.getByText('retention settings', { exact: true }).getAttribute('href'),
			`/websites/${website.id}/settings`,
		);
	});

	test('keeps current Funnel metrics when the previous cohort is unavailable', async ({ browserContext, visit }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id);
		const funnelId = randomUUID();
		await db.updateTable('websites').set('retention_days', 90).where('id', '=', website.id).execute();
		await db
			.insertInto('funnels')
			.values({
				id: funnelId,
				website_id: website.id,
				name: 'Mature signup',
				identity_kind: 'distinct_id',
				conversion_window_seconds: 30 * 24 * 60 * 60,
			})
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{ funnel_id: funnelId, position: 1, event_name: 'pricing_viewed', filter: null },
				{ funnel_id: funnelId, position: 2, event_name: 'signup', filter: null },
			])
			.execute();
		await db
			.insertInto('events')
			.values([
				productEvent(website.id, 'converted', 'pricing_viewed', new Date(Date.now() - 45 * 24 * 60 * 60_000)),
				productEvent(website.id, 'converted', 'signup', new Date(Date.now() - 44 * 24 * 60 * 60_000)),
			])
			.execute();

		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}/funnels/${funnelId}`);
		const summary = page.getByRole('region', { name: 'Funnel summary' });

		await summary.getByText('1', { exact: true }).first().waitFor();
		await summary.getByText('Previous 30 days unavailable', { exact: true }).first().waitFor();
	});
});

async function createUser(name: string, email: string) {
	const register = await app.container.make(RegisterUser);
	const result = await register.execute({ name, email, password: 'a-secure-password' });

	if (!result.ok) {
		throw new Error('The test user must be created');
	}

	return result.value;
}

async function createWebsite(ownerUserId: string) {
	const create = await app.container.make(CreateWebsite);
	const result = await create.execute({ ownerUserId, name: 'Boring Money', allowedDomain: 'boring.money' });

	if (!result.ok) {
		throw new Error('The test Website must be created');
	}

	return result.value;
}

function event(websiteId: string, sessionId: string, name: string, occurredAt: Date, path = '/') {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name,
		source: EventSource.Browser,
		occurred_at: occurredAt,
		path,
		properties: null,
		anonymous_id: sessionId,
		session_id: sessionId,
	};
}

function productEvent(websiteId: string, distinctId: string, name: string, occurredAt: Date) {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name,
		source: EventSource.Browser,
		occurred_at: occurredAt,
		path: '/',
		properties: null,
		distinct_id: distinctId,
	};
}
