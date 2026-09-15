import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { anonymousSessionInactivityMs } from '#collection/anonymous_identity_policy';
import { browserEventProtocol } from '#collection/browser_event_protocol';
import { TransactionManager } from '#shared/services/transaction_manager';
import { parseEventRetentionDays } from '#websites/event_retention';
import { eventDataAvailability, type EventDataAvailability } from '#websites/queries/event_data_availability';
import { websiteReportPeriod, type WebsiteReportPeriodPreset } from '#websites/queries/website_report_period';

interface RankedVisitors {
	name: string;
	visitors: number;
}

interface RankedPageviews {
	name: string;
	pageviews: number;
}

interface SessionMetricsAggregate {
	sessions: number;
	bounce_rate: number | null;
	median_duration_seconds: number | null;
	legacy_pageviews: number;
	earliest_session_activity: Date | null;
}

type SessionMetrics =
	| { status: 'available'; sessions: number; bounceRate: number | null; medianDurationSeconds: number | null }
	| { status: 'unavailable'; reason: 'product_mode' | 'legacy_data' | 'retention' };

interface TrafficMetrics {
	pageviews: number;
	visitors: number;
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
		preset: WebsiteReportPeriodPreset;
		startDate: string;
		endDate: string;
		previous: {
			startDate: string;
			endDate: string;
		};
	};
	dataAvailability: EventDataAvailability;
	metrics: TrafficMetrics;
	sessionMetrics: SessionMetrics;
	trend: Array<{ date: string; pageviews: number }>;
	comparison:
		| {
				status: 'available';
				metrics: TrafficMetrics;
				sessionMetrics: SessionMetrics;
				trend: Array<{ date: string; pageviews: number }>;
		  }
		| { status: 'unavailable'; availableFrom: string };
	topPages: Array<RankedVisitors & { pageviews: number }>;
	referrers: RankedVisitors[];
	utmSources: RankedVisitors[];
	utmMediums: RankedVisitors[];
	utmCampaigns: RankedVisitors[];
	technicalBreakdowns: {
		metric: 'pageviews';
		countries: RankedPageviews[];
		browsers: RankedPageviews[];
		operatingSystems: RankedPageviews[];
		devices: RankedPageviews[];
	};
}

@inject()
export class WebsiteOverviewQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(
		websiteId: string,
		ownerUserId: string,
		now = new Date(),
		periodPreset: WebsiteReportPeriodPreset = 30,
	): Promise<WebsiteOverview | null> {
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

		const { preset, startDate, endDate, dates, periodStart, periodEnd, previous } = websiteReportPeriod(
			website.id,
			website.timezone,
			now,
			periodPreset,
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
		const completedBefore = new Date(now.getTime() - anonymousSessionInactivityMs);
		const previousCompletedBefore = new Date(previous.periodEnd.getTime() - anonymousSessionInactivityMs);
		const previousPageviews = database
			.selectFrom('events')
			.where('events.website_id', '=', website.id)
			.where('events.name', '=', '$pageview')
			.where('events.occurred_at', '>=', previous.periodStart)
			.where('events.occurred_at', '<', previous.periodEnd);
		const sessionMetricsFor = (rangeStart: Date, rangeEnd: Date, completionCutoff: Date) =>
			sql<SessionMetricsAggregate>`
			with period_pageviews as materialized (
				select events.session_id
				from events
				where events.website_id = ${website.id}
					and events.name = '$pageview'
					and events.occurred_at >= ${rangeStart}
					and events.occurred_at < ${rangeEnd}
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
						100.0 * count(*) filter (where pageviews = 1 and ended_at <= ${completionCutoff})
						/ nullif(count(*) filter (where ended_at <= ${completionCutoff}), 0),
						1
					)
				)::double precision as bounce_rate,
				(
					percentile_cont(0.5) within group (order by extract(epoch from (ended_at - started_at)))
						filter (where ended_at <= ${completionCutoff})
				)::double precision as median_duration_seconds,
				min(started_at) as earliest_session_activity,
				(
					select count(*)::integer
					from period_pageviews
					where session_id is null or length(session_id) <> ${browserEventProtocol.maxSessionIdLength}
				) as legacy_pageviews
			from sessions
		`.execute(database);

		const [
			metrics,
			sessionMetrics,
			dailyPageviews,
			previousMetrics,
			previousSessionMetrics,
			previousDailyPageviews,
			topPages,
			referrers,
			utmSources,
			utmMediums,
			utmCampaigns,
			countries,
			browsers,
			operatingSystems,
			devices,
		] = await Promise.all([
			pageviews
				.select([
					sql<number>`count(*)::integer`.as('pageviews'),
					sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
				])
				.executeTakeFirstOrThrow(),
			sessionMetricsFor(periodStart, periodEnd, completedBefore),
			pageviews
				.select([
					sql<string>`to_char(events.occurred_at at time zone ${website.timezone}, 'YYYY-MM-DD')`.as('date'),
					sql<number>`count(*)::integer`.as('pageviews'),
				])
				.groupBy(sql.ref('date'))
				.orderBy('date')
				.execute(),
			previousPageviews
				.select([
					sql<number>`count(*)::integer`.as('pageviews'),
					sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
				])
				.executeTakeFirstOrThrow(),
			sessionMetricsFor(previous.periodStart, previous.periodEnd, previousCompletedBefore),
			previousPageviews
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
			pageviews
				.select([
					sql<string>`coalesce(events.country, 'Unknown')`.as('name'),
					sql<number>`count(*)::integer`.as('pageviews'),
				])
				.groupBy(sql`coalesce(events.country, 'Unknown')`)
				.execute(),
			pageviews
				.select([
					sql<string>`coalesce(events.browser, 'Unknown')`.as('name'),
					sql<number>`count(*)::integer`.as('pageviews'),
				])
				.groupBy(sql`coalesce(events.browser, 'Unknown')`)
				.execute(),
			pageviews
				.select([
					sql<string>`coalesce(events.operating_system, 'Unknown')`.as('name'),
					sql<number>`count(*)::integer`.as('pageviews'),
				])
				.groupBy(sql`coalesce(events.operating_system, 'Unknown')`)
				.execute(),
			pageviews
				.select([
					sql<string>`coalesce(events.device, 'Unknown')`.as('name'),
					sql<number>`count(*)::integer`.as('pageviews'),
				])
				.groupBy(sql`coalesce(events.device, 'Unknown')`)
				.execute(),
		]);

		const dailyCounts = new Map(dailyPageviews.map((day) => [day.date, day.pageviews]));
		const trend = dates.map((date) => ({ date, pageviews: dailyCounts.get(date) ?? 0 }));
		const previousDailyCounts = new Map(previousDailyPageviews.map((day) => [day.date, day.pageviews]));
		const previousTrend = previous.dates.map((date) => ({ date, pageviews: previousDailyCounts.get(date) ?? 0 }));
		const retention = await database
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select(['websites.retention_days', 'websites.events_available_from'])
			.where('websites.id', '=', website.id)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirstOrThrow();
		const retentionDays = parseEventRetentionDays(retention.retention_days);
		const availabilityFor = (requiredFrom: Date) =>
			eventDataAvailability(retentionDays, requiredFrom, now, retention.events_available_from);
		const dataAvailability = availabilityFor(periodStart);
		const previousDataAvailability = availabilityFor(previous.periodStart);
		const currentSessionAvailability = availabilityFor(new Date(periodStart.getTime() - anonymousSessionInactivityMs));
		const previousSessionAvailability = availabilityFor(
			new Date(previous.periodStart.getTime() - anonymousSessionInactivityMs),
		);
		const sessionHistoryAvailability = availabilityFor(new Date(0));
		const sessionAggregate = sessionMetrics.rows[0];
		const previousSessionAggregate = previousSessionMetrics.rows[0];
		const sessionHistoryAvailableFrom =
			sessionHistoryAvailability.status === 'unavailable'
				? new Date(sessionHistoryAvailability.availableFrom).getTime()
				: null;
		const sessionMetricsResult = toSessionMetrics(
			website.identity_mode,
			sessionAggregate,
			currentSessionAvailability,
			sessionHistoryAvailableFrom,
		);
		const previousSessionMetricsResult = toSessionMetrics(
			website.identity_mode,
			previousSessionAggregate,
			previousSessionAvailability,
			sessionHistoryAvailableFrom,
		);
		const comparison: WebsiteOverview['comparison'] =
			previousDataAvailability.status === 'unavailable'
				? previousDataAvailability
				: {
						status: 'available',
						metrics: previousMetrics,
						sessionMetrics: previousSessionMetricsResult,
						trend: previousTrend,
					};

		return {
			website: {
				id: website.id,
				name: website.name,
				trackingId: website.tracking_id,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
			},
			period: {
				preset,
				startDate,
				endDate,
				previous: { startDate: previous.startDate, endDate: previous.endDate },
			},
			dataAvailability,
			metrics,
			trend,
			comparison,
			topPages,
			referrers,
			utmSources,
			utmMediums,
			utmCampaigns,
			technicalBreakdowns: {
				metric: 'pageviews',
				countries: boundedTechnicalBreakdown(countries),
				browsers: boundedTechnicalBreakdown(browsers),
				operatingSystems: boundedTechnicalBreakdown(operatingSystems),
				devices: boundedTechnicalBreakdown(devices),
			},
			sessionMetrics: sessionMetricsResult,
		};
	}
}

const maximumTechnicalBreakdownRows = 6;

function boundedTechnicalBreakdown(rows: RankedPageviews[]) {
	const unknown = rows.find(({ name }) => name === 'Unknown');
	const explicitOther = rows.find(({ name }) => name === 'Other')?.pageviews ?? 0;
	const named = rows.filter(({ name }) => name !== 'Unknown' && name !== 'Other').sort(compareRankedPageviews);
	const availableNamedRows = maximumTechnicalBreakdownRows - (unknown ? 1 : 0);
	const needsAggregate = named.length + (explicitOther > 0 ? 1 : 0) > availableNamedRows;
	const kept = needsAggregate ? named.slice(0, Math.max(availableNamedRows - 1, 0)) : named;
	const aggregatedOther = explicitOther + named.slice(kept.length).reduce((total, row) => total + row.pageviews, 0);
	const result = [
		...kept,
		...(aggregatedOther > 0 ? [{ name: 'Other', pageviews: aggregatedOther }] : []),
		...(unknown ? [unknown] : []),
	];

	return result.sort(compareRankedPageviews);
}

function compareRankedPageviews(first: RankedPageviews, second: RankedPageviews) {
	return second.pageviews - first.pageviews || (first.name < second.name ? -1 : first.name > second.name ? 1 : 0);
}

function toSessionMetrics(
	identityMode: string,
	aggregate: SessionMetricsAggregate | undefined,
	availability: EventDataAvailability,
	historyAvailableFrom: number | null,
): SessionMetrics {
	const earliestActivity = aggregate?.earliest_session_activity?.getTime() ?? null;
	const historyMayBeTruncated =
		historyAvailableFrom !== null &&
		earliestActivity !== null &&
		earliestActivity < historyAvailableFrom + anonymousSessionInactivityMs;

	if (identityMode === 'product') {
		return { status: 'unavailable', reason: 'product_mode' };
	}

	if (availability.status === 'unavailable' || historyMayBeTruncated) {
		return { status: 'unavailable', reason: 'retention' };
	}

	if (aggregate?.legacy_pageviews !== 0) {
		return { status: 'unavailable', reason: 'legacy_data' };
	}

	return {
		status: 'available',
		sessions: aggregate?.sessions ?? 0,
		bounceRate: aggregate?.bounce_rate ?? null,
		medianDurationSeconds: aggregate?.median_duration_seconds ?? null,
	};
}
