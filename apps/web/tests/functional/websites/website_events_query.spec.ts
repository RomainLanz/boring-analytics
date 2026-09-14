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
		const report = await eventsQuery.execute(website.id, owner.id, {
			selectedName: 'signup',
			now: new Date('2026-03-30T12:00:00.000Z'),
		});

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
		assert.isNull(await eventsQuery.execute(website.id, outsider.id, { now: new Date('2026-03-30T12:00:00.000Z') }));
	});

	test('falls back to the highest-volume known event when the selection is unknown', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values(customEvent(website.id, 'signup', '2026-03-15T12:00:00.000Z', {}))
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const report = await eventsQuery.execute(website.id, owner.id, {
			selectedName: '$pageview',
			now: new Date('2026-03-30T12:00:00.000Z'),
		});

		assert.equal(report?.selectedEvent?.name, 'signup');
	});

	test('uses the selected Website-local report period', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values([
				customEvent(website.id, 'signup', '2026-03-23T00:00:00.000Z', {}),
				customEvent(website.id, 'signup', '2026-03-24T00:00:00.000Z', {}),
				customEvent(website.id, 'signup', '2026-03-30T11:00:00.000Z', {}),
			])
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const report = await eventsQuery.execute(website.id, owner.id, {
			selectedName: 'signup',
			now: new Date('2026-03-30T12:00:00.000Z'),
			periodPreset: 7,
		});

		assert.deepEqual(report?.period, { preset: 7, startDate: '2026-03-24', endDate: '2026-03-30' });
		assert.equal(report?.selectedEvent?.volume, 2);
		assert.lengthOf(report?.selectedEvent?.trend ?? [], 7);
	});

	test('filters total and daily trend by Browser or Server source', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values([
				customEvent(website.id, 'signup', '2026-03-29T12:00:00.000Z', {}, EventSource.Browser),
				customEvent(website.id, 'signup', '2026-03-30T10:00:00.000Z', {}, EventSource.Browser),
				customEvent(website.id, 'signup', '2026-03-30T11:00:00.000Z', {}, EventSource.Server),
			])
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const browser = await eventsQuery.execute(website.id, owner.id, {
			selectedName: 'signup',
			now: new Date('2026-03-30T12:00:00.000Z'),
			filter: { kind: 'source', value: 'browser' },
		});
		const server = await eventsQuery.execute(website.id, owner.id, {
			selectedName: 'signup',
			now: new Date('2026-03-30T12:00:00.000Z'),
			filter: { kind: 'source', value: 'server' },
		});

		assert.deepEqual(browser?.activeFilter, { kind: 'source', value: 'browser' });
		assert.equal(browser?.selectedEvent?.volume, 2);
		assert.deepEqual(browser?.selectedEvent?.sources, { browser: 2, server: 0 });
		assert.equal(
			browser?.selectedEvent?.trend.reduce((total, day) => total + day.volume, 0),
			browser?.selectedEvent?.volume,
		);
		assert.equal(server?.selectedEvent?.volume, 1);
		assert.deepEqual(server?.selectedEvent?.sources, { browser: 0, server: 1 });
		assert.equal(
			server?.selectedEvent?.trend.reduce((total, day) => total + day.volume, 0),
			server?.selectedEvent?.volume,
		);
	});

	test('filters by exact primitive JSON type and keeps unusual property keys safe', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const unusualProperties: EventProperties = {
			'plan tier 日本語': 3,
			'active': false,
			'coupon': null,
			'note': '',
		};
		Object.defineProperty(unusualProperties, '__proto__', { value: 'safe', enumerable: true });

		await db
			.insertInto('events')
			.values([
				customEvent(website.id, 'signup', '2026-03-29T12:00:00.000Z', unusualProperties),
				customEvent(website.id, 'signup', '2026-03-30T10:00:00.000Z', {
					'plan tier 日本語': 3,
					'active': true,
				}),
				customEvent(website.id, 'signup', '2026-03-30T11:00:00.000Z', {
					'plan tier 日本語': '3',
				}),
				customEvent(website.id, 'checkout_started', '2026-03-30T11:30:00.000Z', { other: 3 }),
			])
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const execute = (key: string, value: string | number | boolean | null, selectedName = 'signup') =>
			eventsQuery.execute(website.id, owner.id, {
				selectedName,
				now: new Date('2026-03-30T12:00:00.000Z'),
				filter: { kind: 'property', key, value },
			});
		const unfiltered = await eventsQuery.execute(website.id, owner.id, {
			selectedName: 'signup',
			now: new Date('2026-03-30T12:00:00.000Z'),
		});
		const numberValue = await execute('plan tier 日本語', 3);
		const stringValue = await execute('plan tier 日本語', '3');
		const falseValue = await execute('active', false);
		const nullValue = await execute('coupon', null);
		const emptyValue = await execute('note', '');
		const protoValue = await execute('__proto__', 'safe');
		const incompatible = await execute('plan tier 日本語', 3, 'checkout_started');

		assert.deepInclude(unfiltered?.selectedEvent?.properties, {
			key: 'plan tier 日本語',
			values: [
				{ value: 3, count: 2 },
				{ value: '3', count: 1 },
			],
		});
		assert.equal(selectedEvent(numberValue).volume, 2);
		assert.deepEqual(selectedEvent(numberValue).sources, { browser: 2, server: 0 });
		assert.equal(selectedEvent(stringValue).volume, 1);
		assert.equal(selectedEvent(falseValue).volume, 1);
		assert.equal(selectedEvent(nullValue).volume, 1);
		assert.equal(selectedEvent(emptyValue).volume, 1);
		assert.equal(selectedEvent(protoValue).volume, 1);
		assert.deepEqual(protoValue?.activeFilter, { kind: 'property', key: '__proto__', value: 'safe' });
		assert.isNull(incompatible?.activeFilter);
		assert.equal(selectedEvent(incompatible).volume, 1);
		assert.equal(
			selectedEvent(numberValue).trend.reduce((total, day) => total + day.volume, 0),
			selectedEvent(numberValue).volume,
		);
	});

	test('proposes only primitive property values from the selected event and period', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values({
				...customEvent(website.id, 'signup', '2026-03-30T11:00:00.000Z', null),
				properties: { primitive: 'yes', nested: { level: 1 }, list: [1, 2] },
			})
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const report = await eventsQuery.execute(website.id, owner.id, {
			selectedName: 'signup',
			now: new Date('2026-03-30T12:00:00.000Z'),
		});

		assert.deepEqual(report?.selectedEvent?.properties, [{ key: 'primitive', values: [{ value: 'yes', count: 1 }] }]);
	});

	test('marks a report unavailable when retention cannot cover the selected period', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.updateTable('websites')
			.set({ retention_days: 60, events_available_from: null })
			.where('id', '=', website.id)
			.execute();

		const eventsQuery = await app.container.make(WebsiteEventsQuery);
		const report = await eventsQuery.execute(website.id, owner.id, {
			now: new Date('2026-04-01T12:00:00.000Z'),
			periodPreset: 90,
		});

		assert.deepEqual(report?.dataAvailability, {
			status: 'unavailable',
			availableFrom: '2026-02-01T12:00:00.000Z',
		});
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

function customEvent(
	websiteId: string,
	name: string,
	occurredAt: string,
	properties: EventProperties | null,
	source = EventSource.Browser,
) {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name,
		source,
		occurred_at: new Date(occurredAt),
		path: '/',
		properties,
		anonymous_id: 'anonymous-id',
		session_id: 'session-id',
	};
}

function selectedEvent(report: Awaited<ReturnType<WebsiteEventsQuery['execute']>>) {
	if (!report?.selectedEvent) {
		throw new Error('The report must contain a selected event');
	}

	return report.selectedEvent;
}
