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

		assert.deepInclude(overview, {
			website: {
				id: website.id,
				name: 'Boring Money',
				trackingId: website.trackingId,
				allowedDomain: 'boring.money',
				timezone: 'Europe/Zurich',
			},
			period: {
				preset: 30,
				startDate: '2026-03-01',
				endDate: '2026-03-30',
				previous: { startDate: '2026-01-30', endDate: '2026-02-28' },
			},
			dataAvailability: { status: 'available' },
			metrics: { pageviews: 3, visitors: 2 },
			sessionMetrics: { status: 'unavailable', reason: 'legacy_data' },
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

	test('reports bounded technical breakdowns by pageviews with Unknown distinct from aggregated Other', async ({
		assert,
	}) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const otherWebsite = await createWebsite(owner.id, 'Documentation', 'docs.boring.money');
		const dimensions = [
			...technicalPageviews(website.id, 'Chrome', 'Windows', 'Desktop', 5),
			...technicalPageviews(website.id, 'Edge', 'Windows', 'Desktop', 4),
			...technicalPageviews(website.id, 'Firefox', 'Linux', 'Desktop', 3),
			...technicalPageviews(website.id, 'Safari', 'macOS', 'Desktop', 2),
			...technicalPageviews(website.id, 'Bot', 'Unknown', 'Bot', 1),
			...technicalPageviews(website.id, 'Other', 'Other', 'Other', 2),
			...technicalPageviews(website.id, null, null, null, 2),
			...technicalPageviews(website.id, 'Unknown', 'Unknown', 'Unknown', 2),
			...technicalPageviews(otherWebsite.id, 'Chrome', 'Android', 'Mobile', 10),
		];
		await db.insertInto('events').values(dimensions).execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(overview?.technicalBreakdowns, {
			metric: 'pageviews',
			countries: [{ name: 'Unknown', pageviews: 21 }],
			browsers: [
				{ name: 'Chrome', pageviews: 5 },
				{ name: 'Edge', pageviews: 4 },
				{ name: 'Unknown', pageviews: 4 },
				{ name: 'Firefox', pageviews: 3 },
				{ name: 'Other', pageviews: 3 },
				{ name: 'Safari', pageviews: 2 },
			],
			operatingSystems: [
				{ name: 'Windows', pageviews: 9 },
				{ name: 'Unknown', pageviews: 5 },
				{ name: 'Linux', pageviews: 3 },
				{ name: 'Other', pageviews: 2 },
				{ name: 'macOS', pageviews: 2 },
			],
			devices: [
				{ name: 'Desktop', pageviews: 14 },
				{ name: 'Unknown', pageviews: 4 },
				{ name: 'Other', pageviews: 2 },
				{ name: 'Bot', pageviews: 1 },
			],
		});
		for (const breakdown of [
			overview!.technicalBreakdowns.countries,
			overview!.technicalBreakdowns.browsers,
			overview!.technicalBreakdowns.operatingSystems,
			overview!.technicalBreakdowns.devices,
		]) {
			assert.equal(
				breakdown.reduce((total, row) => total + row.pageviews, 0),
				overview!.metrics.pageviews,
			);
		}
	});

	test('reports bounded Countries by pageviews with Unknown distinct from aggregated Other', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const otherWebsite = await createWebsite(owner.id, 'Documentation', 'docs.boring.money');
		await db
			.insertInto('events')
			.values([
				...countryPageviews(website.id, 'CH', 5),
				...countryPageviews(website.id, 'US', 4),
				...countryPageviews(website.id, 'DE', 3),
				...countryPageviews(website.id, 'FR', 2),
				...countryPageviews(website.id, 'GB', 1),
				...countryPageviews(website.id, 'JP', 1),
				...countryPageviews(website.id, null, 2),
				...countryPageviews(otherWebsite.id, 'CH', 10),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(overview?.technicalBreakdowns.countries, [
			{ name: 'CH', pageviews: 5 },
			{ name: 'US', pageviews: 4 },
			{ name: 'DE', pageviews: 3 },
			{ name: 'FR', pageviews: 2 },
			{ name: 'Other', pageviews: 2 },
			{ name: 'Unknown', pageviews: 2 },
		]);
		assert.equal(
			overview!.technicalBreakdowns.countries.reduce((total, row) => total + row.pageviews, 0),
			overview!.metrics.pageviews,
		);
	});

	test('uses the selected 7, 30, or 90 day period for technical breakdowns', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.insertInto('events')
			.values([
				pageview(website.id, '2026-03-28T12:00:00.000Z', {
					anonymousId: 'recent',
					sessionId: randomUUID(),
					browser: 'Chrome',
					operatingSystem: 'Windows',
					device: 'Desktop',
					country: 'CH',
				}),
				pageview(website.id, '2026-03-15T12:00:00.000Z', {
					anonymousId: 'monthly',
					sessionId: randomUUID(),
					browser: 'Safari',
					operatingSystem: 'macOS',
					device: 'Desktop',
					country: 'US',
				}),
				pageview(website.id, '2026-01-20T12:00:00.000Z', {
					anonymousId: 'quarterly',
					sessionId: randomUUID(),
					browser: 'Firefox',
					operatingSystem: 'Linux',
					device: 'Desktop',
					country: 'JP',
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const now = new Date('2026-03-30T12:00:00.000Z');

		assert.deepEqual((await overviewQuery.execute(website.id, owner.id, now, 7))?.technicalBreakdowns.browsers, [
			{ name: 'Chrome', pageviews: 1 },
		]);
		assert.deepEqual((await overviewQuery.execute(website.id, owner.id, now, 7))?.technicalBreakdowns.countries, [
			{ name: 'CH', pageviews: 1 },
		]);
		assert.deepEqual((await overviewQuery.execute(website.id, owner.id, now, 30))?.technicalBreakdowns.browsers, [
			{ name: 'Chrome', pageviews: 1 },
			{ name: 'Safari', pageviews: 1 },
		]);
		assert.deepEqual((await overviewQuery.execute(website.id, owner.id, now, 30))?.technicalBreakdowns.countries, [
			{ name: 'CH', pageviews: 1 },
			{ name: 'US', pageviews: 1 },
		]);
		assert.deepEqual((await overviewQuery.execute(website.id, owner.id, now, 90))?.technicalBreakdowns.browsers, [
			{ name: 'Chrome', pageviews: 1 },
			{ name: 'Firefox', pageviews: 1 },
			{ name: 'Safari', pageviews: 1 },
		]);
		assert.deepEqual((await overviewQuery.execute(website.id, owner.id, now, 90))?.technicalBreakdowns.countries, [
			{ name: 'CH', pageviews: 1 },
			{ name: 'JP', pageviews: 1 },
			{ name: 'US', pageviews: 1 },
		]);
	});

	test('compares a selected 7-day period with the preceding 7 Website-local dates', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const previousLong = randomUUID();
		const previousBounce = randomUUID();
		const currentShort = randomUUID();
		const currentLong = randomUUID();

		await db.updateTable('websites').set({ timezone: 'Europe/Zurich' }).where('id', '=', website.id).execute();
		await db
			.insertInto('events')
			.values([
				pageview(website.id, '2026-03-26T10:00:00.000Z', {
					anonymousId: 'previous-a',
					sessionId: previousLong,
				}),
				pageview(website.id, '2026-03-26T10:00:10.000Z', {
					anonymousId: 'previous-a',
					sessionId: previousLong,
				}),
				pageview(website.id, '2026-03-27T10:00:00.000Z', {
					anonymousId: 'previous-b',
					sessionId: previousBounce,
				}),
				pageview(website.id, '2026-04-02T10:00:00.000Z', {
					anonymousId: 'current-a',
					sessionId: currentShort,
				}),
				pageview(website.id, '2026-04-02T10:00:20.000Z', {
					anonymousId: 'current-a',
					sessionId: currentShort,
				}),
				pageview(website.id, '2026-04-03T10:00:00.000Z', {
					anonymousId: 'current-a',
					sessionId: currentLong,
				}),
				pageview(website.id, '2026-04-03T10:01:40.000Z', {
					anonymousId: 'current-a',
					sessionId: currentLong,
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-04-08T12:00:00.000Z'), 7);

		assert.deepInclude(overview?.period, {
			preset: 7,
			startDate: '2026-04-02',
			endDate: '2026-04-08',
			previous: { startDate: '2026-03-26', endDate: '2026-04-01' },
		});
		assert.deepEqual(overview?.metrics, { pageviews: 4, visitors: 1 });
		assert.deepEqual(overview?.sessionMetrics, {
			status: 'available',
			sessions: 2,
			bounceRate: 0,
			medianDurationSeconds: 60,
		});
		assert.deepInclude(overview?.comparison, {
			status: 'available',
			metrics: { pageviews: 3, visitors: 2 },
			sessionMetrics: {
				status: 'available',
				sessions: 2,
				bounceRate: 50,
				medianDurationSeconds: 5,
			},
		});
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
			assert.deepEqual(overview?.metrics, { pageviews: 1, visitors: 1 });
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

	test('reports pageview-based bounce rate and median completed-session duration', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const otherWebsite = await createWebsite(owner.id, 'Documentation', 'docs.boring.money');
		const crossingBucket = randomUUID();
		const twoPageviews = randomUUID();
		const singleEvent = randomUUID();
		const crossingAnonymousRotation = randomUUID();

		await db
			.insertInto('events')
			.values([
				pageview(website.id, '2026-03-20T12:29:55.000Z', {
					anonymousId: 'bucket-visitor',
					sessionId: crossingBucket,
				}),
				{
					...pageview(website.id, '2026-03-20T12:30:05.000Z', {
						anonymousId: 'bucket-visitor',
						sessionId: crossingBucket,
					}),
					name: 'signup',
				},
				pageview(website.id, '2026-03-21T12:10:00.000Z', {
					anonymousId: 'returning-visitor',
					sessionId: twoPageviews,
				}),
				pageview(website.id, '2026-03-21T12:00:00.000Z', {
					anonymousId: 'returning-visitor',
					sessionId: twoPageviews,
				}),
				pageview(website.id, '2026-03-22T12:00:00.000Z', {
					anonymousId: 'single-event-visitor',
					sessionId: singleEvent,
				}),
				pageview(website.id, '2026-03-23T23:50:00.000Z', {
					anonymousId: 'anonymous-day-one',
					sessionId: crossingAnonymousRotation,
				}),
				{
					...pageview(website.id, '2026-03-24T00:10:00.000Z', {
						anonymousId: 'anonymous-day-two',
						sessionId: crossingAnonymousRotation,
					}),
					name: 'checkout',
				},
				pageview(otherWebsite.id, '2026-03-20T12:45:00.000Z', {
					anonymousId: 'isolated-visitor',
					sessionId: crossingBucket,
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(overview?.sessionMetrics, {
			status: 'available',
			sessions: 4,
			bounceRate: 75,
			medianDurationSeconds: 305,
		});
	});

	test('does not present legacy or retention-truncated session metrics as complete', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const legacyWebsite = await createWebsite(owner.id, 'Legacy', 'legacy.example.com');
		const truncatedWebsite = await createWebsite(owner.id, 'Truncated', 'truncated.example.com');
		const productWebsite = await createWebsite(owner.id, 'Product', 'product.example.com');
		await db
			.updateTable('websites')
			.set({ retention_days: null, events_available_from: new Date('2026-02-28T23:45:00.000Z') })
			.where('id', '=', truncatedWebsite.id)
			.execute();
		await db.updateTable('websites').set({ identity_mode: 'product' }).where('id', '=', productWebsite.id).execute();
		await db
			.insertInto('events')
			.values([
				pageview(legacyWebsite.id, '2026-03-20T12:00:00.000Z', {
					anonymousId: 'legacy-visitor',
					sessionId: 'legacy-fixed-bucket-session',
				}),
				{
					...pageview(truncatedWebsite.id, '2026-02-28T23:50:00.000Z', {
						anonymousId: 'new-visitor',
						sessionId: '238122e5-7c38-4894-914f-3db1408ebcab',
					}),
					name: 'signup',
				},
				pageview(truncatedWebsite.id, '2026-03-01T00:10:00.000Z', {
					anonymousId: 'new-visitor',
					sessionId: '238122e5-7c38-4894-914f-3db1408ebcab',
				}),
				pageview(productWebsite.id, '2026-03-20T12:00:00.000Z', {
					anonymousId: 'pre-identification-visitor',
					sessionId: randomUUID(),
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const now = new Date('2026-03-30T12:00:00.000Z');
		const legacy = await overviewQuery.execute(legacyWebsite.id, owner.id, now);
		const truncated = await overviewQuery.execute(truncatedWebsite.id, owner.id, now);
		const product = await overviewQuery.execute(productWebsite.id, owner.id, now);

		assert.deepEqual(legacy?.dataAvailability, { status: 'available' });
		assert.deepEqual(legacy?.sessionMetrics, { status: 'unavailable', reason: 'legacy_data' });
		assert.deepEqual(truncated?.dataAvailability, { status: 'available' });
		assert.equal(truncated?.metrics.pageviews, 1);
		assert.deepEqual(truncated?.sessionMetrics, { status: 'unavailable', reason: 'retention' });
		assert.deepEqual(product?.sessionMetrics, { status: 'unavailable', reason: 'product_mode' });
	});

	test('keeps the current period when only the previous period has expired', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.updateTable('websites')
			.set({ retention_days: 60, events_available_from: null })
			.where('id', '=', website.id)
			.execute();
		await db
			.insertInto('events')
			.values(
				pageview(website.id, '2026-03-20T12:00:00.000Z', {
					anonymousId: 'current-visitor',
					sessionId: randomUUID(),
				}),
			)
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-04-01T12:00:00.000Z'));

		assert.deepEqual(overview?.dataAvailability, { status: 'available' });
		assert.deepEqual(overview?.metrics, { pageviews: 1, visitors: 1 });
		assert.deepEqual(overview?.comparison, {
			status: 'unavailable',
			availableFrom: '2026-02-01T12:00:00.000Z',
		});
	});

	test('evaluates session retention with an extra inactivity window for each period', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.updateTable('websites')
			.set({ retention_days: null, events_available_from: new Date('2026-01-31T23:45:00.000Z') })
			.where('id', '=', website.id)
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-04-01T12:00:00.000Z'));

		assert.deepEqual(overview?.dataAvailability, { status: 'available' });
		assert.equal(overview?.comparison.status, 'available');

		if (overview?.comparison.status === 'available') {
			assert.deepEqual(overview.comparison.sessionMetrics, { status: 'unavailable', reason: 'retention' });
		}
	});

	test('does not expose partial current-period data as an available zero', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		await db
			.updateTable('websites')
			.set({ retention_days: null, events_available_from: new Date('2026-03-10T00:00:00.000Z') })
			.where('id', '=', website.id)
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-04-01T12:00:00.000Z'));

		assert.deepEqual(overview?.dataAvailability, {
			status: 'unavailable',
			availableFrom: '2026-03-10T00:00:00.000Z',
		});
	});

	test('excludes active sessions from bounce and duration while still counting them', async ({ assert }) => {
		const owner = await createUser('Ada', 'ada@example.com');
		const website = await createWebsite(owner.id, 'Boring Money', 'boring.money');
		const completed = randomUUID();
		const active = randomUUID();
		const previousCompleted = randomUUID();
		const previousActive = randomUUID();
		await db
			.insertInto('events')
			.values([
				pageview(website.id, '2026-02-28T23:30:00.000Z', {
					anonymousId: 'previous-completed-visitor',
					sessionId: previousCompleted,
				}),
				pageview(website.id, '2026-02-28T23:20:00.000Z', {
					anonymousId: 'previous-active-visitor',
					sessionId: previousActive,
				}),
				pageview(website.id, '2026-02-28T23:30:01.000Z', {
					anonymousId: 'previous-active-visitor',
					sessionId: previousActive,
				}),
				pageview(website.id, '2026-03-30T11:30:00.000Z', {
					anonymousId: 'completed-visitor',
					sessionId: completed,
				}),
				pageview(website.id, '2026-03-30T11:20:00.000Z', {
					anonymousId: 'active-visitor',
					sessionId: active,
				}),
				pageview(website.id, '2026-03-30T11:30:01.000Z', {
					anonymousId: 'active-visitor',
					sessionId: active,
				}),
			])
			.execute();

		const overviewQuery = await app.container.make(WebsiteOverviewQuery);
		const overview = await overviewQuery.execute(website.id, owner.id, new Date('2026-03-30T12:00:00.000Z'));

		assert.deepEqual(overview?.sessionMetrics, {
			status: 'available',
			sessions: 2,
			bounceRate: 100,
			medianDurationSeconds: 0,
		});
		assert.equal(overview?.comparison.status, 'available');

		if (overview?.comparison.status === 'available') {
			assert.deepEqual(overview.comparison.sessionMetrics, {
				status: 'available',
				sessions: 2,
				bounceRate: 100,
				medianDurationSeconds: 0,
			});
		}
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
		browser?: string | null;
		operatingSystem?: string | null;
		device?: string | null;
		country?: string | null;
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
		browser: options.browser,
		operating_system: options.operatingSystem,
		device: options.device,
		country: options.country,
	};
}

function technicalPageviews(
	websiteId: string,
	browser: string | null,
	operatingSystem: string | null,
	device: string | null,
	count: number,
) {
	return Array.from({ length: count }, (_, index) =>
		pageview(websiteId, `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`, {
			anonymousId: `${browser ?? 'unknown'}-${index}`,
			sessionId: randomUUID(),
			browser,
			operatingSystem,
			device,
		}),
	);
}

function countryPageviews(websiteId: string, country: string | null, count: number) {
	return Array.from({ length: count }, (_, index) =>
		pageview(websiteId, `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`, {
			anonymousId: `${country ?? 'unknown'}-${index}`,
			sessionId: randomUUID(),
			country,
		}),
	);
}
