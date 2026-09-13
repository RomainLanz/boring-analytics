import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { PurgeExpiredEvents } from '#collection/actions/purge_expired_events';
import { EventSource } from '#collection/event_source';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';
import { WebsiteOverviewQuery } from '#websites/queries/website_overview_query';

test.group('Purge expired events', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('purges one received-at batch while preserving retained identity links and indefinite Websites', async ({
		assert,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const retainedWebsite = await createWebsite(owner.id, 'Retained', 'retained.example.com');
		const foreverWebsite = await createWebsite(owner.id, 'Forever', 'forever.example.com');
		await db.updateTable('websites').set({ retention_days: 60 }).where('id', '=', retainedWebsite.id).execute();
		await db.updateTable('websites').set({ retention_days: null }).where('id', '=', foreverWebsite.id).execute();

		const expiredEventId = randomUUID();
		const expiredEventDeduplicationId = 'expired-event';
		await db
			.insertInto('events')
			.values([
				event(retainedWebsite.id, {
					id: expiredEventId,
					eventId: expiredEventDeduplicationId,
					occurredAt: '2026-03-31T12:00:00.000Z',
					receivedAt: '2026-01-01T12:00:00.000Z',
				}),
				event(retainedWebsite.id, {
					id: randomUUID(),
					occurredAt: '2025-01-01T12:00:00.000Z',
					receivedAt: '2026-03-31T12:00:00.000Z',
				}),
				event(foreverWebsite.id, {
					id: randomUUID(),
					occurredAt: '2025-01-01T12:00:00.000Z',
					receivedAt: '2025-01-01T12:00:00.000Z',
				}),
				identification(retainedWebsite.id, {
					id: randomUUID(),
					anonymousId: 'linked-anonymous',
					occurredAt: '2026-01-01T12:00:00.000Z',
					receivedAt: '2026-01-01T12:00:00.000Z',
				}),
				event(retainedWebsite.id, {
					id: randomUUID(),
					anonymousId: 'linked-anonymous',
					occurredAt: '2026-01-01T11:00:00.000Z',
					receivedAt: '2026-03-31T12:00:00.000Z',
				}),
			])
			.execute();

		const purge = await app.container.make(PurgeExpiredEvents);
		assert.equal(
			await purge.execute({
				now: new Date('2026-04-01T00:00:00.000Z'),
				batchSize: 1,
				eventTimeToleranceHours: 0.5,
			}),
			1,
		);
		assert.isUndefined(await db.selectFrom('events').select('id').where('id', '=', expiredEventId).executeTakeFirst());

		const remaining = await db
			.selectFrom('events')
			.select(['website_id', 'name', 'anonymous_id'])
			.orderBy('name')
			.execute();
		assert.lengthOf(remaining, 4);
		assert.isTrue(remaining.some((row) => row.name === '$identify' && row.anonymous_id === 'linked-anonymous'));
		assert.isTrue(remaining.some((row) => row.website_id === foreverWebsite.id));
		assert.deepEqual(
			(
				await db
					.selectFrom('websites')
					.select('events_available_from')
					.where('id', '=', retainedWebsite.id)
					.executeTakeFirstOrThrow()
			).events_available_from,
			new Date('2026-03-31T12:00:00.001Z'),
		);

		await db
			.insertInto('events')
			.values(
				event(retainedWebsite.id, {
					id: randomUUID(),
					eventId: expiredEventDeduplicationId,
					occurredAt: '2026-03-31T12:00:00.000Z',
					receivedAt: '2026-03-31T12:00:00.000Z',
				}),
			)
			.execute();

		const nextWebsite = await createWebsite(owner.id, 'Next', 'next.example.com');
		await db.updateTable('websites').set({ retention_days: 60 }).where('id', '=', nextWebsite.id).execute();
		await db
			.insertInto('events')
			.values(
				event(nextWebsite.id, {
					id: randomUUID(),
					occurredAt: '2026-01-01T12:00:00.000Z',
					receivedAt: '2026-01-01T12:00:00.000Z',
				}),
			)
			.execute();
		assert.equal(await purge.execute({ now: new Date('2026-04-01T00:00:00.000Z'), batchSize: 10 }), 1);
		assert.equal(await purge.execute({ now: new Date('2026-04-01T00:00:00.000Z'), batchSize: 10 }), 0);

		await db.updateTable('websites').set({ retention_days: null }).where('id', '=', retainedWebsite.id).execute();
		const overview = await app.container.make(WebsiteOverviewQuery);
		assert.equal(
			(await overview.execute(retainedWebsite.id, owner.id, new Date('2026-03-01T00:00:00.000Z')))?.dataAvailability
				.status,
			'unavailable',
		);
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

function event(
	websiteId: string,
	input: {
		id: string;
		eventId?: string;
		anonymousId?: string;
		occurredAt: string;
		receivedAt: string;
	},
) {
	return {
		id: input.id,
		website_id: websiteId,
		name: 'signup',
		source: EventSource.Browser,
		occurred_at: new Date(input.occurredAt),
		received_at: new Date(input.receivedAt),
		path: '/',
		anonymous_id: input.anonymousId ?? randomUUID(),
		session_id: randomUUID(),
		event_id: input.eventId,
	};
}

function identification(
	websiteId: string,
	input: { id: string; anonymousId: string; occurredAt: string; receivedAt: string },
) {
	return {
		id: input.id,
		website_id: websiteId,
		name: '$identify',
		source: EventSource.Browser,
		occurred_at: new Date(input.occurredAt),
		received_at: new Date(input.receivedAt),
		path: '/',
		anonymous_id: input.anonymousId,
		session_id: null,
		distinct_id: 'linked-product',
		properties: null,
	};
}
