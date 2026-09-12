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
		const now = Date.now();
		await db
			.insertInto('events')
			.values([
				event(website.id, 'converted', '$pageview', new Date(now - 60 * 60_000), '/pricing'),
				event(website.id, 'converted', 'newsletter_opened', new Date(now - 55 * 60_000)),
				event(website.id, 'converted', 'signup ', new Date(now - 50 * 60_000)),
				event(website.id, 'abandoned', '$pageview', new Date(now - 45 * 60_000), '/pricing'),
			])
			.execute();

		await browserContext.loginAs(owner);
		const page = await visit(`/websites/${website.id}`);
		await page.getByRole('link', { name: 'Funnels', exact: true }).click();
		await page.getByText('No Funnels yet', { exact: true }).waitFor();
		await page.getByRole('link', { name: 'Create your first Funnel' }).click();
		await page.getByLabel('Funnel name').fill('Signup conversion');
		await page.getByLabel('Event').nth(0).fill('$pageview');
		await page.getByLabel('Filter').nth(0).selectOption('path');
		await page.getByLabel('Path value').fill('/pricing');
		await page.getByLabel('Event').nth(1).fill('signup ');
		await page.getByRole('button', { name: 'Create Funnel' }).click();
		await page.waitForURL(/\/websites\/[0-9a-f-]+\/funnels\/[0-9a-f-]+$/u);

		await page.getByRole('heading', { name: 'Signup conversion' }).waitFor();
		const summary = page.getByRole('region', { name: 'Funnel summary' });
		await summary.getByText('2', { exact: true }).first().waitFor();
		await summary.getByText('1', { exact: true }).first().waitFor();
		await summary.getByText('50%', { exact: true }).waitFor();
		await page.getByText('newsletter_opened', { exact: true }).waitFor({ state: 'detached' });

		const funnelId = page.url().split('/').at(-1);

		if (!funnelId) {
			throw new Error('The Funnel id must be present in the report URL');
		}

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
		await page.getByLabel('Event').nth(0).fill('$pageview');
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
