import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { browserEventProtocol } from '#collection/browser_event_protocol';
import { TransactionManager } from '#shared/services/transaction_manager';
import { EventDataAvailabilityQuery, type EventDataAvailability } from '#websites/queries/event_data_availability';
import { websiteReportPeriod } from '#websites/queries/website_report_period';

interface RankedVisitors {
	name: string;
	visitors: number;
}

interface SessionMetricsAggregate {
	sessions: number;
	bounce_rate: number | null;
	median_duration_seconds: number | null;
	legacy_pageviews: number;
	earliest_session_activity: Date | null;
}

export interface WebsiteOverview {
	website: {
		id: string;
		name: string;
		trackingId: string;
		allowedDomain: string;
		timezone: string;
	};
	period: {
		startDate: string;
		endDate: string;
	};
	dataAvailability: EventDataAvailability;
	metrics: {
		pageviews: number;
		visitors: number;
	};
	sessionMetrics:
		| { status: 'available'; sessions: number; bounceRate: number | null; medianDurationSeconds: number | null }
		| { status: 'unavailable'; reason: 'product_mode' | 'legacy_data' | 'retention' };
	trend: Array<{ date: string; pageviews: number }>;
	topPages: Array<RankedVisitors & { pageviews: number }>;
	referrers: RankedVisitors[];
	utmSources: RankedVisitors[];
	utmMediums: RankedVisitors[];
	utmCampaigns: RankedVisitors[];
}

@inject()
export class WebsiteOverviewQuery {
	constructor(
		private readonly transactions: TransactionManager,
		private readonly eventDataAvailability: EventDataAvailabilityQuery,
	) {}

	async execute(websiteId: string, ownerUserId: string, now = new Date()): Promise<WebsiteOverview | null> {
		const database = this.transactions.currentDatabase();
		const website = await database
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select([
				'websites.id',
				'websites.name',
				'websites.tracking_id',
				'websites.allowed_domain',
				'websites.timezone',
				'websites.identity_mode',
			])
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const { startDate, endDate, dates, periodStart, periodEnd } = websiteReportPeriod(
			website.id,
			website.timezone,
			now,
		);
		const pageviews = database
			.selectFrom('events')
			.where('events.website_id', '=', website.id)
			.where('events.name', '=', '$pageview')
			.where('events.occurred_at', '>=', periodStart)
			.where('events.occurred_at', '<', periodEnd);
		const referrerName = sql<string>`case
			when events.referrer is null then 'Direct / none'
			when lower(events.referrer) like 'http://[%' or lower(events.referrer) like 'https://[%'
				then '[' || split_part(split_part(lower(events.referrer), '[', 2), ']', 1) || ']'
			when lower(events.referrer) like 'http://%' or lower(events.referrer) like 'https://%'
				then split_part(split_part(split_part(lower(events.referrer), '://', 2), '/', 1), ':', 1)
			else lower(events.referrer)
		end`;
		const completedBefore = new Date(now.getTime() - 30 * 60 * 1_000);

		const [metrics, sessionMetrics, dailyPageviews, topPages, referrers, utmSources, utmMediums, utmCampaigns] =
			await Promise.all([
				pageviews
					.select([
						sql<number>`count(*)::integer`.as('pageviews'),
						sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
					])
					.executeTakeFirstOrThrow(),
				sql<SessionMetricsAggregate>`
				with period_pageviews as materialized (
					select events.session_id
					from events
					where events.website_id = ${website.id}
						and events.name = '$pageview'
						and events.occurred_at >= ${periodStart}
						and events.occurred_at < ${periodEnd}
				), period_sessions as (
					select distinct session_id
					from period_pageviews
					where length(session_id) = ${browserEventProtocol.maxSessionIdLength}
				), sessions as (
					select
						events.session_id,
						count(*) filter (where events.name = '$pageview')::integer as pageviews,
						min(events.occurred_at) as started_at,
						max(events.occurred_at) as ended_at
					from events
					inner join period_sessions on period_sessions.session_id = events.session_id
					where events.website_id = ${website.id}
					group by events.session_id
				)
				select
					count(*)::integer as sessions,
					(
						round(
							100.0 * count(*) filter (where pageviews = 1 and ended_at <= ${completedBefore})
							/ nullif(count(*) filter (where ended_at <= ${completedBefore}), 0),
							1
						)
					)::double precision as bounce_rate,
					(
						percentile_cont(0.5) within group (order by extract(epoch from (ended_at - started_at)))
							filter (where ended_at <= ${completedBefore})
					)::double precision as median_duration_seconds,
					min(started_at) as earliest_session_activity,
					(
						select count(*)::integer
						from period_pageviews
						where session_id is null or length(session_id) <> ${browserEventProtocol.maxSessionIdLength}
					) as legacy_pageviews
				from sessions
			`.execute(database),
				pageviews
					.select([
						sql<string>`to_char(events.occurred_at at time zone ${website.timezone}, 'YYYY-MM-DD')`.as('date'),
						sql<number>`count(*)::integer`.as('pageviews'),
					])
					.groupBy(sql.ref('date'))
					.orderBy('date')
					.execute(),
				pageviews
					.select([
						'events.path as name',
						sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
						sql<number>`count(*)::integer`.as('pageviews'),
					])
					.groupBy('events.path')
					.orderBy('pageviews', 'desc')
					.orderBy('events.path')
					.limit(6)
					.execute(),
				pageviews
					.select([referrerName.as('name'), sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors')])
					.groupBy(referrerName)
					.having(sql`count(distinct events.anonymous_id)`, '>', 0)
					.orderBy('visitors', 'desc')
					.orderBy('name')
					.limit(6)
					.execute(),
				pageviews
					.select([
						sql<string>`events.utm_source`.as('name'),
						sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
					])
					.where('events.utm_source', 'is not', null)
					.groupBy('events.utm_source')
					.orderBy('visitors', 'desc')
					.orderBy('events.utm_source')
					.limit(6)
					.execute(),
				pageviews
					.select([
						sql<string>`events.utm_medium`.as('name'),
						sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
					])
					.where('events.utm_medium', 'is not', null)
					.groupBy('events.utm_medium')
					.orderBy('visitors', 'desc')
					.orderBy('events.utm_medium')
					.limit(6)
					.execute(),
				pageviews
					.select([
						sql<string>`events.utm_campaign`.as('name'),
						sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
					])
					.where('events.utm_campaign', 'is not', null)
					.groupBy('events.utm_campaign')
					.orderBy('visitors', 'desc')
					.orderBy('events.utm_campaign')
					.limit(6)
					.execute(),
			]);

		const dailyCounts = new Map(dailyPageviews.map((day) => [day.date, day.pageviews]));
		const trend = dates.map((date) => ({ date, pageviews: dailyCounts.get(date) ?? 0 }));
		const [dataAvailability, sessionHistoryAvailability] = await Promise.all([
			this.eventDataAvailability.execute(website.id, ownerUserId, periodStart, now),
			this.eventDataAvailability.execute(website.id, ownerUserId, new Date(0), now),
		]);
		const sessionAggregate = sessionMetrics.rows[0];
		const sessionHistoryAvailableFrom =
			sessionHistoryAvailability.status === 'unavailable'
				? new Date(sessionHistoryAvailability.availableFrom).getTime()
				: null;
		const earliestSessionActivity = sessionAggregate?.earliest_session_activity?.getTime() ?? null;
		const sessionHistoryMayBeTruncated =
			sessionHistoryAvailableFrom !== null &&
			earliestSessionActivity !== null &&
			earliestSessionActivity < sessionHistoryAvailableFrom + 30 * 60 * 1_000;
		let sessionMetricsResult: WebsiteOverview['sessionMetrics'];

		if (website.identity_mode === 'product') {
			sessionMetricsResult = { status: 'unavailable', reason: 'product_mode' };
		} else if (dataAvailability.status === 'unavailable' || sessionHistoryMayBeTruncated) {
			sessionMetricsResult = { status: 'unavailable', reason: 'retention' };
		} else if (sessionAggregate?.legacy_pageviews !== 0) {
			sessionMetricsResult = { status: 'unavailable', reason: 'legacy_data' };
		} else {
			sessionMetricsResult = {
				status: 'available',
				sessions: sessionAggregate?.sessions ?? 0,
				bounceRate: sessionAggregate?.bounce_rate ?? null,
				medianDurationSeconds: sessionAggregate?.median_duration_seconds ?? null,
			};
		}

		return {
			website: {
				id: website.id,
				name: website.name,
				trackingId: website.tracking_id,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
			},
			period: { startDate, endDate },
			dataAvailability,
			metrics,
			trend,
			topPages,
			referrers,
			utmSources,
			utmMediums,
			utmCampaigns,
			sessionMetrics: sessionMetricsResult,
		};
	}
}
