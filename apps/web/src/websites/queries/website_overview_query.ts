import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { DateTime } from 'luxon';
import { TransactionManager } from '#shared/services/transaction_manager';

interface RankedVisitors {
	name: string;
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
		startDate: string;
		endDate: string;
	};
	metrics: {
		pageviews: number;
		visitors: number;
		sessions: number;
	};
	trend: Array<{ date: string; pageviews: number }>;
	topPages: Array<RankedVisitors & { pageviews: number }>;
	referrers: RankedVisitors[];
	utmSources: RankedVisitors[];
	utmMediums: RankedVisitors[];
	utmCampaigns: RankedVisitors[];
}

@inject()
export class WebsiteOverviewQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string, now = new Date()): Promise<WebsiteOverview | null> {
		const database = this.transactions.currentDatabase();
		const website = await database
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select(['websites.id', 'websites.name', 'websites.tracking_id', 'websites.allowed_domain', 'websites.timezone'])
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const currentTime = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(website.timezone);

		if (!currentTime.isValid) {
			throw new Error(`Invalid timezone persisted for website ${website.id}`);
		}

		const endDate = currentTime.toISODate();

		if (!endDate) {
			throw new Error(`Invalid overview period for website ${website.id}`);
		}

		const firstCalendarDate = DateTime.fromISO(endDate, { zone: 'utc' }).minus({ days: 29 });
		const startDate = firstCalendarDate.toISODate();

		if (!startDate) {
			throw new Error(`Invalid overview period for website ${website.id}`);
		}

		const firstDate = DateTime.fromISO(startDate, { zone: website.timezone }).startOf('day');
		const firstInstant = firstDate
			.getPossibleOffsets()
			.reduce((earliest, candidate) => (candidate.toMillis() < earliest.toMillis() ? candidate : earliest));
		const periodStart = firstInstant.toUTC().toJSDate();
		const periodEnd = DateTime.fromJSDate(now, { zone: 'utc' }).toJSDate();
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

		const [metrics, dailyPageviews, topPages, referrers, utmSources, utmMediums, utmCampaigns] = await Promise.all([
			pageviews
				.select([
					sql<number>`count(*)::integer`.as('pageviews'),
					sql<number>`count(distinct events.anonymous_id)::integer`.as('visitors'),
					sql<number>`count(distinct events.session_id)::integer`.as('sessions'),
				])
				.executeTakeFirstOrThrow(),
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
		const trend = Array.from({ length: 30 }, (_, index) => {
			const date = firstCalendarDate.plus({ days: index }).toISODate();

			if (!date) {
				throw new Error(`Invalid overview period for website ${website.id}`);
			}

			return { date, pageviews: dailyCounts.get(date) ?? 0 };
		});

		return {
			website: {
				id: website.id,
				name: website.name,
				trackingId: website.tracking_id,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
			},
			period: { startDate, endDate },
			metrics,
			trend,
			topPages,
			referrers,
			utmSources,
			utmMediums,
			utmCampaigns,
		};
	}
}
