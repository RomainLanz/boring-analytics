import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { EventSource } from '#collection/event_source';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';
import { WebsiteEventsQuery } from '#websites/queries/website_events_query';
import type { EventProperties } from '#collection/browser_event_protocol';

test.group('Website events query', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('reports known custom events and selected details only for the owner Website', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const otherWebsite = await createWebsite(owner.id, 'Documentation', 'docs.boring.money');

		await db.updateTable('websites').set({ timezone: 'Europe/Zurich' }).where('id', '=', website.id).execute();
		await db
			.insertInto('events')
			.values([
				customEvent(website.id, 'signup', '2026-03-01T00:00:00.000Z', {
					plan: 'pro',
					trial: true,
					seats: 3,
					coupon: null,
				}),
				customEvent(website.id, 'signup', '2026-03-01T12:00:00.000Z', { plan: 'pro', trial: false }),
				customEvent(website.id, 'signup', '2026-03-29T22:00:00.000Z', { plan: 'free', trial: true }),
				customEvent(website.id, 'checkout_started', '2026-01-01T12:00:00.000Z', { plan: 'pro' }),
				{
					...customEvent(website.id, '$pageview', '2026-03-15T12:00:00.000Z', null),
					properties: null,
				},
				customEvent(otherWebsite.id, 'signup', '2026-03-15T12:00:00.000Z', { plan: 'business' }),
			])
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const report = await eventsQuery.execute(website.id, owner.id, 'signup', new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(report?.dataAvailability, { status: 'available' });
		assert.deepEqual(report?.events, [
			{ name: 'signup', volume: 3 },
			{ name: 'checkout_started', volume: 0 },
		]);
		assert.equal(report?.selectedEvent?.name, 'signup');
		assert.equal(report?.selectedEvent?.volume, 3);
		assert.deepEqual(report?.selectedEvent?.trend, [
			...Array.from({ length: 29 }, (_, index) => ({
				date: `2026-03-${String(index + 1).padStart(2, '0')}`,
				volume: index === 0 ? 2 : 0,
			})),
			{ date: '2026-03-30', volume: 1 },
		]);
		assert.deepEqual(report?.selectedEvent?.properties, [
			{ key: 'coupon', values: [{ value: null, count: 1 }] },
			{
				key: 'plan',
				values: [
					{ value: 'pro', count: 2 },
					{ value: 'free', count: 1 },
				],
			},
			{ key: 'seats', values: [{ value: 3, count: 1 }] },
			{
				key: 'trial',
				values: [
					{ value: true, count: 2 },
					{ value: false, count: 1 },
				],
			},
		]);
		assert.isNull(await eventsQuery.execute(website.id, outsider.id, undefined, new Date('2026-03-30T12:00:00.000Z')));
	});

	test('falls back to the highest-volume known event when the selection is unknown', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values(customEvent(website.id, 'signup', '2026-03-15T12:00:00.000Z', {}))
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const report = await eventsQuery.execute(website.id, owner.id, '$pageview', new Date('2026-03-30T12:00:00.000Z'));

		assert.equal(report?.selectedEvent?.name, 'signup');
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

async function createWebsite(ownerUserId: string, name: string, allowedDomain: string) {
	const createWebsiteAction = await app.container.make(CreateWebsite);
	const result = await createWebsiteAction.execute({ ownerUserId, name, allowedDomain });

	if (!result.ok) {
		throw new Error('The test Website must be created');
	}

	return result.value;
}

function customEvent(websiteId: string, name: string, occurredAt: string, properties: EventProperties | null) {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name,
		source: EventSource.Browser,
		occurred_at: new Date(occurredAt),
		path: '/',
		properties,
		anonymous_id: 'anonymous-id',
		session_id: 'session-id',
	};
}
