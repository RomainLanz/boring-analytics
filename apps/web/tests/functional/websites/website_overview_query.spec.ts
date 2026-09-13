import { randomUUID } from 'node:crypto';
import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { EventSource } from '#collection/event_source';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';
import { CreateWebsite } from '#websites/actions/create_website';
import { WebsiteOverviewQuery } from '#websites/queries/website_overview_query';

test.group('Website overview query', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('reports the last 30 Website-local dates from isolated pageviews', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const outsider = await createUser('Grace', 'grace@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const otherWebsite = await createWebsite(owner.id, 'Documentation', 'docs.boring.money');

		await db.updateTable('websites').set({ timezone: 'Europe/Zurich' }).where('id', '=', website.id).execute();

		await db
			.insertInto('events')
			.values([
				pageview(website.id, '2026-02-28T22:59:59.999Z', {
					anonymousId: 'before-period',
					sessionId: 'before-period',
				}),
				pageview(website.id, '2026-02-28T23:00:00.000Z', {
					anonymousId: 'visitor-a',
					sessionId: 'session-a',
					path: '/pricing',
					referrer: 'https://Google.com/search?q=analytics',
					utmSource: 'google',
					utmMedium: 'organic',
				}),
				pageview(website.id, '2026-03-29T01:30:00.000Z', {
					anonymousId: 'visitor-a',
					sessionId: 'session-b',
					path: '/',
				}),
				pageview(website.id, '2026-03-30T11:59:59.999Z', {
					anonymousId: 'visitor-b',
					sessionId: 'session-c',
					path: '/pricing',
					utmSource: 'newsletter',
					utmMedium: 'email',
					utmCampaign: 'spring-launch',
				}),
				pageview(website.id, '2026-03-30T12:00:00.000Z', {
					anonymousId: 'at-end',
					sessionId: 'at-end',
				}),
				{
					...pageview(website.id, '2026-03-15T12:00:00.000Z', {
						anonymousId: 'custom-event-visitor',
						sessionId: 'custom-event-session',
					}),
					name: 'signup',
				},
				pageview(otherWebsite.id, '2026-03-20T12:00:00.000Z', {
					anonymousId: 'visitor-a',
					sessionId: 'session-a',
					path: '/other-website',
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(overview, {
			website: {
				id: website.id,
				name: 'Boring Money',
				trackingId: website.trackingId,
				allowedDomain: 'boring.money',
				timezone: 'Europe/Zurich',
			},
			period: {
				startDate: '2026-03-01',
				endDate: '2026-03-30',
			},
			dataAvailability: { status: 'available' },
			metrics: { pageviews: 3, visitors: 2, sessions: 3 },
			trend: Array.from({ length: 30 }, (_, index) => ({
				date: `2026-03-${String(index + 1).padStart(2, '0')}`,
				pageviews: index === 0 || index === 28 || index === 29 ? 1 : 0,
			})),
			topPages: [
				{ name: '/pricing', visitors: 2, pageviews: 2 },
				{ name: '/', visitors: 1, pageviews: 1 },
			],
			referrers: [
				{ name: 'Direct / none', visitors: 2 },
				{ name: 'google.com', visitors: 1 },
			],
			utmSources: [
				{ name: 'google', visitors: 1 },
				{ name: 'newsletter', visitors: 1 },
			],
			utmMediums: [
				{ name: 'email', visitors: 1 },
				{ name: 'organic', visitors: 1 },
			],
			utmCampaigns: [{ name: 'spring-launch', visitors: 1 }],
		});
		assert.isNull(await overviewQuery.execute(website.id, outsider.id, new Date('2026-03-30T12:00:00.000Z')));
	});

	test('starts the period at the first instant of its Website-local date', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const scenarios = [
			{
				timezone: 'America/Santiago',
				now: '2026-09-06T12:00:00.000Z',
				startDate: '2026-08-08',
				endDate: '2026-09-06',
				firstInstantEvent: '2026-08-08T04:30:00.000Z',
			},
			{
				timezone: 'America/Havana',
				now: '2026-11-30T12:00:00.000Z',
				startDate: '2026-11-01',
				endDate: '2026-11-30',
				firstInstantEvent: '2026-11-01T04:30:00.000Z',
			},
			{
				timezone: 'America/Nuuk',
				now: '2026-04-27T00:30:00.000Z',
				startDate: '2026-03-28',
				endDate: '2026-04-26',
				firstInstantEvent: '2026-03-28T02:00:00.000Z',
			},
		] as const;

		for (const [index, scenario] of scenarios.entries()) {
			const website = await createWebsite(owner.id, scenario.timezone, `timezone-${index}.example.com`);
			await db.updateTable('websites').set({ timezone: scenario.timezone }).where('id', '=', website.id).execute();
			await db
				.insertInto('events')
				.values(
					pageview(website.id, scenario.firstInstantEvent, {
						anonymousId: `visitor-${index}`,
						sessionId: `session-${index}`,
					}),
				)
				.execute();

			const overview = await overviewQuery.execute(website.id, owner.id, new Date(scenario.now));

			assert.equal(overview?.period.startDate, scenario.startDate);
			assert.equal(overview?.period.endDate, scenario.endDate);
			assert.deepEqual(overview?.metrics, { pageviews: 1, visitors: 1, sessions: 1 });
			assert.deepEqual(overview?.trend[0], { date: scenario.startDate, pageviews: 1 });
			assert.equal(overview?.trend.at(-1)?.date, scenario.endDate);
		}
	});

	test('groups referrers by hostname before counting visitors', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values([
				pageview(website.id, '2026-03-20T12:00:00.000Z', {
					anonymousId: 'visitor-a',
					sessionId: 'session-a',
					referrer: 'https://example.com/article',
				}),
				pageview(website.id, '2026-03-21T12:00:00.000Z', {
					anonymousId: 'visitor-a',
					sessionId: 'session-b',
					referrer: 'https://example.com:8443/other',
				}),
				pageview(website.id, '2026-03-22T12:00:00.000Z', {
					anonymousId: 'visitor-b',
					sessionId: 'session-c',
					referrer: 'https://[2001:db8::1]/article',
				}),
				pageview(website.id, '2026-03-23T12:00:00.000Z', {
					anonymousId: 'visitor-b',
					sessionId: 'session-d',
					referrer: 'https://[2001:db8::1]:8443/other',
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(overview?.referrers, [
			{ name: '[2001:db8::1]', visitors: 1 },
			{ name: 'example.com', visitors: 1 },
		]);
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

function pageview(
	websiteId: string,
	occurredAt: string,
	options: {
		anonymousId: string;
		sessionId: string;
		path?: string;
		referrer?: string;
		utmSource?: string;
		utmMedium?: string;
		utmCampaign?: string;
	},
) {
	return {
		id: randomUUID(),
		website_id: websiteId,
		name: '$pageview',
		source: EventSource.Browser,
		occurred_at: new Date(occurredAt),
		path: options.path ?? '/',
		anonymous_id: options.anonymousId,
		session_id: options.sessionId,
		referrer: options.referrer,
		utm_source: options.utmSource,
		utm_medium: options.utmMedium,
		utm_campaign: options.utmCampaign,
	};
}
