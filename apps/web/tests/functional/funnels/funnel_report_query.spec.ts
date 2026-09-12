import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { EventSource } from '#collection/event_source';
import { FunnelReportQuery } from '#funnels/queries/funnel_report_query';
import { db } from '#shared/services/db';

test.group('Funnel report query', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('reports mature sessions through ordered steps while allowing intermediate events', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const funnelId = randomUUID();
		await db
			.insertInto('funnels')
			.values({ id: funnelId, website_id: websiteId, name: 'Checkout conversion', conversion_window_seconds: 1_800 })
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{ funnel_id: funnelId, position: 1, event_name: 'pricing_viewed', filter: null },
				{
					funnel_id: funnelId,
					position: 2,
					event_name: 'checkout_started',
					filter: { field: 'property', key: 'plan', value: 'pro' },
				},
				{ funnel_id: funnelId, position: 3, event_name: 'order_completed', filter: null },
			])
			.execute();

		await db
			.insertInto('events')
			.values([
				event(websiteId, 'session-a', 'pricing_viewed', '2026-03-15T10:00:00.000Z'),
				event(websiteId, 'session-a', 'newsletter_opened', '2026-03-15T10:01:00.000Z'),
				event(websiteId, 'session-a', 'checkout_started', '2026-03-15T10:04:00.000Z', { plan: 'pro' }),
				event(websiteId, 'session-a', 'order_completed', '2026-03-15T10:10:00.000Z'),
				event(websiteId, 'session-b', 'pricing_viewed', '2026-03-16T10:00:00.000Z'),
				event(websiteId, 'session-b', 'checkout_started', '2026-03-16T10:05:00.000Z', { plan: 'free' }),
				event(websiteId, 'session-b', 'checkout_started', '2026-03-16T10:20:00.000Z', { plan: 'pro' }),
				event(websiteId, 'session-b', 'order_completed', '2026-03-16T10:30:00.001Z'),
				event(websiteId, 'session-c', 'pricing_viewed', '2026-03-17T10:01:00.000Z'),
				event(websiteId, 'session-c', 'checkout_started', '2026-03-17T10:04:00.000Z', { plan: 'pro' }),
				event(websiteId, 'session-open', 'pricing_viewed', '2026-03-30T11:45:00.000Z'),
				event(websiteId, 'session-open', 'checkout_started', '2026-03-30T11:47:00.000Z', { plan: 'pro' }),
			])
			.execute();
		const query = await app.container.make(FunnelReportQuery);
		const report = await query.execute(funnelId, websiteId, ownerUserId, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(report?.summary, {
			entrants: 3,
			converted: 1,
			conversionRate: 1 / 3,
			totalDropoffs: 2,
		});
		assert.deepEqual(
			report?.steps.map((step) => ({
				position: step.position,
				entrants: step.entrants,
				stepRate: step.stepRate,
				dropoffs: step.dropoffs,
				medianTimeFromPreviousSeconds: step.medianTimeFromPreviousSeconds,
			})),
			[
				{ position: 1, entrants: 3, stepRate: 1, dropoffs: 0, medianTimeFromPreviousSeconds: null },
				{ position: 2, entrants: 3, stepRate: 1, dropoffs: 2, medianTimeFromPreviousSeconds: 240 },
				{ position: 3, entrants: 1, stepRate: 1 / 3, dropoffs: null, medianTimeFromPreviousSeconds: 360 },
			],
		);
	});

	test('includes exact time boundaries and keeps typed filters and Website sessions isolated', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite();
		const { websiteId: otherWebsiteId } = await createWebsite();
		const funnelId = randomUUID();
		await db
			.insertInto('funnels')
			.values({ id: funnelId, website_id: websiteId, name: 'Trial activation', conversion_window_seconds: 1_800 })
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{
					funnel_id: funnelId,
					position: 1,
					event_name: 'trial_started',
					filter: { field: 'property', key: 'seats', value: 3 },
				},
				{
					funnel_id: funnelId,
					position: 2,
					event_name: 'trial_activated',
					filter: { field: 'property', key: 'assisted', value: false },
				},
				{
					funnel_id: funnelId,
					position: 3,
					event_name: 'plan_selected',
					filter: { field: 'property', key: 'coupon', value: null },
				},
			])
			.execute();

		await db
			.insertInto('events')
			.values([
				event(websiteId, 'exact-boundary', 'trial_started', '2026-03-30T11:30:00.000Z', { seats: 3 }),
				event(websiteId, 'exact-boundary', 'trial_activated', '2026-03-30T11:40:00.000Z', { assisted: false }),
				event(websiteId, 'exact-boundary', 'plan_selected', '2026-03-30T12:00:00.000Z', { coupon: null }),
				event(websiteId, 'string-number', 'trial_started', '2026-03-29T11:00:00.000Z', { seats: '3' }),
				event(websiteId, 'missing-property', 'trial_started', '2026-03-29T12:00:00.000Z', { seats: 3 }),
				event(websiteId, 'missing-property', 'trial_activated', '2026-03-29T12:05:00.000Z'),
				event(websiteId, 'missing-property', 'plan_selected', '2026-03-29T12:10:00.000Z'),
				event(websiteId, 'inverted', 'trial_activated', '2026-03-28T11:00:00.000Z', { assisted: false }),
				event(websiteId, 'inverted', 'trial_started', '2026-03-28T11:05:00.000Z', { seats: 3 }),
				event(websiteId, 'inverted', 'plan_selected', '2026-03-28T11:10:00.000Z', { coupon: null }),
				event(otherWebsiteId, 'exact-boundary', 'trial_started', '2026-03-27T11:00:00.000Z', { seats: 3 }),
				event(otherWebsiteId, 'exact-boundary', 'trial_activated', '2026-03-27T11:05:00.000Z', { assisted: false }),
				event(otherWebsiteId, 'exact-boundary', 'plan_selected', '2026-03-27T11:10:00.000Z', { coupon: null }),
				{ ...event(websiteId, 'ignored', 'trial_started', '2026-03-27T11:00:00.000Z', { seats: 3 }), session_id: null },
			])
			.execute();

		const query = await app.container.make(FunnelReportQuery);
		const report = await query.execute(funnelId, websiteId, ownerUserId, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(
			report?.steps.map((step) => step.entrants),
			[3, 1, 1],
		);
		assert.deepEqual(report?.summary, {
			entrants: 3,
			converted: 1,
			conversionRate: 1 / 3,
			totalDropoffs: 2,
		});
		assert.isNull(await query.execute(funnelId, websiteId, randomUUID(), new Date('2026-03-30T12:00:00.000Z')));
	});

	test('counts each Product identity once across sessions inside a multi-day window', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite('product');
		const funnelId = randomUUID();
		await db
			.insertInto('funnels')
			.values({
				id: funnelId,
				website_id: websiteId,
				name: 'Activation',
				identity_kind: 'distinct_id',
				conversion_window_seconds: 7 * 24 * 60 * 60,
			})
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{ funnel_id: funnelId, position: 1, event_name: 'signup', filter: null },
				{ funnel_id: funnelId, position: 2, event_name: 'project_created', filter: null },
				{ funnel_id: funnelId, position: 3, event_name: 'subscription_started', filter: null },
			])
			.execute();
		await db
			.insertInto('events')
			.values([
				productEvent(websiteId, 'product-a', 'signup', '2026-03-10T10:00:00.000Z'),
				productEvent(websiteId, 'product-a', 'unrelated', '2026-03-11T10:00:00.000Z'),
				productEvent(websiteId, 'product-a', 'project_created', '2026-03-12T10:00:00.000Z'),
				productEvent(websiteId, 'product-a', 'signup', '2026-03-13T10:00:00.000Z'),
				productEvent(websiteId, 'product-a', 'subscription_started', '2026-03-14T10:00:00.000Z'),
				productEvent(websiteId, 'product-b', 'signup', '2026-03-15T10:00:00.000Z'),
				productEvent(websiteId, 'product-b', 'project_created', '2026-03-16T10:00:00.000Z'),
				productEvent(websiteId, 'inverted', 'project_created', '2026-03-17T10:00:00.000Z'),
				productEvent(websiteId, 'inverted', 'signup', '2026-03-18T10:00:00.000Z'),
				productEvent(websiteId, 'inverted', 'subscription_started', '2026-03-19T10:00:00.000Z'),
				productEvent(websiteId, 'open-cohort', 'signup', '2026-03-25T10:00:00.000Z'),
			])
			.execute();
		await db.updateTable('websites').set({ identity_mode: 'anonymous' }).where('id', '=', websiteId).execute();

		const query = await app.container.make(FunnelReportQuery);
		const report = await query.execute(funnelId, websiteId, ownerUserId, new Date('2026-03-30T12:00:00.000Z'));

		assert.equal(report?.funnel.identityKind, 'distinct_id');
		assert.deepEqual(
			report?.steps.map(({ entrants }) => entrants),
			[3, 2, 1],
		);
		assert.deepEqual(report?.summary, {
			entrants: 3,
			converted: 1,
			conversionRate: 1 / 3,
			totalDropoffs: 2,
		});
	});

	test('reports the latest mature Product cohorts at the 30-day window limit', async ({ assert }) => {
		const { ownerUserId, websiteId } = await createWebsite('product');
		const funnelId = randomUUID();
		await db
			.insertInto('funnels')
			.values({
				id: funnelId,
				website_id: websiteId,
				name: 'Long activation',
				identity_kind: 'distinct_id',
				conversion_window_seconds: 30 * 24 * 60 * 60,
			})
			.execute();
		await db
			.insertInto('funnel_steps')
			.values([
				{ funnel_id: funnelId, position: 1, event_name: 'signup', filter: null },
				{ funnel_id: funnelId, position: 2, event_name: 'subscription_started', filter: null },
			])
			.execute();
		await db
			.insertInto('events')
			.values([
				productEvent(websiteId, 'mature', 'signup', '2026-02-20T10:00:00.000Z'),
				productEvent(websiteId, 'mature', 'subscription_started', '2026-03-20T10:00:00.000Z'),
				productEvent(websiteId, 'still-open', 'signup', '2026-03-01T10:00:00.000Z'),
				productEvent(websiteId, 'still-open', 'subscription_started', '2026-03-02T10:00:00.000Z'),
			])
			.execute();

		const query = await app.container.make(FunnelReportQuery);
		const report = await query.execute(funnelId, websiteId, ownerUserId, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(report?.period, { startDate: '2026-01-30', endDate: '2026-02-28' });
		assert.deepEqual(
			report?.steps.map(({ entrants }) => entrants),
			[1, 1],
		);
	});
});

async function createWebsite(identityMode: 'anonymous' | 'product' = 'anonymous') {
	const ownerUserId = randomUUID();
	const workspaceId = randomUUID();
	const websiteId = randomUUID();
	await db
		.insertInto('users')
		.values({
			id: ownerUserId,
			email: `${ownerUserId}@example.com`,
			password: '[REDACTED:password]',
			name: null,
			updated_at: null,
		})
		.execute();
	await db.insertInto('workspaces').values({ id: workspaceId, owner_user_id: ownerUserId }).execute();
	await db
		.insertInto('websites')
		.values({
			id: websiteId,
			workspace_id: workspaceId,
			name: 'Boring Money',
			tracking_id: randomUUID(),
			allowed_domain: 'boring.money',
			timezone: 'UTC',
			identity_mode: identityMode,
		})
		.execute();
	return { ownerUserId, websiteId };
}

function event(
	websiteId: string,
	sessionId: string,
	name: string,
	occurredAt: string,
	properties: Record<string, string | number | boolean | null> | null = null,
) {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name,
		source: EventSource.Browser,
		occurred_at: new Date(occurredAt),
		path: '/',
		properties,
		anonymous_id: 'anonymous-id',
		session_id: sessionId,
	};
}

function productEvent(websiteId: string, distinctId: string, name: string, occurredAt: string) {
	return {
		...event(websiteId, 'unused-session', name, occurredAt),
		anonymous_id: null,
		session_id: null,
		distinct_id: distinctId,
	};
}
