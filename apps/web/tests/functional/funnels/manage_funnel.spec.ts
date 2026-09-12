import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { sql } from 'kysely';
import { CreateFunnel } from '#funnels/actions/create_funnel';
import { UpdateFunnel } from '#funnels/actions/update_funnel';
import { db } from '#shared/services/db';

test.group('Manage Funnel', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('creates and edits an owner-scoped Funnel with ordered typed steps', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const outsiderUserId = await createUser();
		const createFunnel = await app.container.make(CreateFunnel);
		const updateFunnel = await app.container.make(UpdateFunnel);
		const definition = {
			name: ' Checkout conversion ',
			conversionWindowSeconds: 1_800,
			steps: [
				{ eventName: '$pageview', filter: { field: 'path' as const, value: '/pricing' } },
				{
					eventName: 'checkout_started',
					filter: { field: 'property' as const, key: 'trial', value: true },
				},
			],
		};

		const outsiderCreate = await createFunnel.execute({ ownerUserId: outsiderUserId, websiteId, ...definition });
		const created = await createFunnel.execute({ ownerUserId, websiteId, ...definition });

		assert.deepEqual(outsiderCreate, { ok: false, error: { type: 'website_not_found' } });
		assert.isTrue(created.ok);

		if (!created.ok) {
			return;
		}

		const funnel = await db
			.selectFrom('funnels')
			.selectAll()
			.where('id', '=', created.value.id)
			.executeTakeFirstOrThrow();
		assert.equal(funnel.name, 'Checkout conversion');
		assert.equal(funnel.website_id, websiteId);
		assert.equal(funnel.conversion_window_seconds, 1_800);
		assert.deepEqual(
			await db
				.selectFrom('funnel_steps')
				.select(['position', 'event_name', 'filter'])
				.where('funnel_id', '=', created.value.id)
				.orderBy('position')
				.execute(),
			[
				{ position: 1, event_name: '$pageview', filter: { field: 'path', value: '/pricing' } },
				{ position: 2, event_name: 'checkout_started', filter: { field: 'property', key: 'trial', value: true } },
			],
		);

		const outsiderUpdate = await updateFunnel.execute({
			ownerUserId: outsiderUserId,
			websiteId,
			funnelId: created.value.id,
			...definition,
		});
		const updated = await updateFunnel.execute({
			ownerUserId,
			websiteId,
			funnelId: created.value.id,
			name: 'Paid conversion',
			conversionWindowSeconds: 900,
			steps: [
				{ eventName: 'checkout_started', filter: null },
				{ eventName: 'order_completed', filter: { field: 'property', key: 'coupon', value: null } },
				{ eventName: 'invoice_paid', filter: null },
			],
		});

		assert.deepEqual(outsiderUpdate, { ok: false, error: { type: 'funnel_not_found' } });
		assert.isTrue(updated.ok);
		assert.deepEqual(
			await db
				.selectFrom('funnel_steps')
				.select(['position', 'event_name', 'filter'])
				.where('funnel_id', '=', created.value.id)
				.orderBy('position')
				.execute(),
			[
				{ position: 1, event_name: 'checkout_started', filter: null },
				{ position: 2, event_name: 'order_completed', filter: { field: 'property', key: 'coupon', value: null } },
				{ position: 3, event_name: 'invoice_paid', filter: null },
			],
		);
	});

	test('rejects a Funnel with fewer than two steps', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createFunnel = await app.container.make(CreateFunnel);

		const result = await createFunnel.execute({
			ownerUserId,
			websiteId,
			name: 'Incomplete',
			conversionWindowSeconds: 1_800,
			steps: [{ eventName: 'checkout_started', filter: null }],
		});

		assert.deepEqual(result, { ok: false, error: { type: 'invalid_funnel_definition' } });
		assert.lengthOf(await db.selectFrom('funnels').select('id').execute(), 0);
	});

	test('rejects a conversion window longer than the anonymous session lifetime', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const createFunnel = await app.container.make(CreateFunnel);

		const result = await createFunnel.execute({
			ownerUserId,
			websiteId,
			name: 'Too long',
			conversionWindowSeconds: 1_801,
			steps: [
				{ eventName: 'checkout_started', filter: null },
				{ eventName: 'order_completed', filter: null },
			],
		});

		assert.deepEqual(result, { ok: false, error: { type: 'invalid_funnel_definition' } });
		assert.lengthOf(await db.selectFrom('funnels').select('id').execute(), 0);
	});

	test('database rejects persisted filters that the read model cannot decode', async ({ assert }) => {
		const { websiteId } = await createWebsite();
		const funnelId = randomUUID();
		await db
			.insertInto('funnels')
			.values({ id: funnelId, website_id: websiteId, name: 'Checkout', conversion_window_seconds: 1_800 })
			.execute();

		const malformedFilters = [
			'{"field":"path","value":1}',
			'{"field":"path"}',
			'{"field":"property","value":true}',
			'{"field":null,"value":"/pricing"}',
		];

		for (const [index, filter] of malformedFilters.entries()) {
			await assert.rejects(() =>
				db
					.insertInto('funnel_steps')
					.values({
						funnel_id: funnelId,
						position: index + 1,
						event_name: '$pageview',
						filter: sql`${filter}::jsonb`,
					})
					.execute(),
			);
		}
	});
});

async function createWebsite() {
	const ownerUserId = await createUser();
	const workspace = await db
		.selectFrom('workspaces')
		.select('id')
		.where('owner_user_id', '=', ownerUserId)
		.executeTakeFirstOrThrow();
	const websiteId = randomUUID();
	await db
		.insertInto('websites')
		.values({
			id: websiteId,
			workspace_id: workspace.id,
			name: 'Boring Money',
			tracking_id: randomUUID(),
			allowed_domain: 'boring.money',
		})
		.execute();
	return { ownerUserId, websiteId };
}

async function createUser() {
	const userId = randomUUID();
	await db
		.insertInto('users')
		.values({
			id: userId,
			email: `${userId}@example.com`,
			password: '[REDACTED:password]',
			name: null,
			updated_at: null,
		})
		.execute();
	await db.insertInto('workspaces').values({ id: randomUUID(), owner_user_id: userId }).execute();
	return userId;
}
