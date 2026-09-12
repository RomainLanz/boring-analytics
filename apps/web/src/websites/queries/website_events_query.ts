import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { TransactionManager } from '#shared/services/transaction_manager';
import { websiteReportPeriod } from '#websites/queries/website_report_period';
import type { EventPropertyValue } from '#collection/browser_event_protocol';

interface PropertyValueRow {
	key: string;
	value: EventPropertyValue;
	count: number;
}

export interface WebsiteEventsReport {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
	};
	period: {
		startDate: string;
		endDate: string;
	};
	events: Array<{ name: string; volume: number }>;
	selectedEvent: {
		name: string;
		volume: number;
		trend: Array<{ date: string; volume: number }>;
		properties: Array<{
			key: string;
			values: Array<{ value: EventPropertyValue; count: number }>;
		}>;
	} | null;
}

@inject()
export class WebsiteEventsQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(
		websiteId: string,
		ownerUserId: string,
		selectedName?: string,
		now = new Date(),
	): Promise<WebsiteEventsReport | null> {
		const database = this.transactions.currentDatabase();
		const website = await database
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select(['websites.id', 'websites.name', 'websites.allowed_domain', 'websites.timezone'])
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
		const events = await database
			.selectFrom('events')
			.select([
				'events.name',
				sql<number>`(
					count(*) filter (
						where events.occurred_at >= ${periodStart} and events.occurred_at < ${periodEnd}
					)
				)::integer`.as('volume'),
			])
			.where('events.website_id', '=', website.id)
			.where('events.name', 'not like', '$%')
			.groupBy('events.name')
			.orderBy('volume', 'desc')
			.orderBy('events.name')
			.execute();
		const selected = events.find((event) => event.name === selectedName) ?? events[0];

		if (!selected) {
			return {
				website: {
					id: website.id,
					name: website.name,
					allowedDomain: website.allowed_domain,
					timezone: website.timezone,
				},
				period: { startDate, endDate },
				events,
				selectedEvent: null,
			};
		}

		const selectedEvents = database
			.selectFrom('events')
			.where('events.website_id', '=', website.id)
			.where('events.name', '=', selected.name)
			.where('events.occurred_at', '>=', periodStart)
			.where('events.occurred_at', '<', periodEnd);
		const [dailyEvents, propertyValuesResult] = await Promise.all([
			selectedEvents
				.select([
					sql<string>`to_char(events.occurred_at at time zone ${website.timezone}, 'YYYY-MM-DD')`.as('date'),
					sql<number>`count(*)::integer`.as('volume'),
				])
				.groupBy(sql.ref('date'))
				.orderBy('date')
				.execute(),
			sql<PropertyValueRow>`
				with property_counts as (
					select property.key, property.value, count(*)::integer as count
					from events
					cross join lateral jsonb_each(coalesce(events.properties, '{}'::jsonb)) as property(key, value)
					where events.website_id = ${website.id}
						and events.name = ${selected.name}
						and events.occurred_at >= ${periodStart}
						and events.occurred_at < ${periodEnd}
					group by property.key, property.value
				), ranked_values as (
					select key, value, count,
						row_number() over (partition by key order by count desc, value::text) as rank
					from property_counts
				)
				select key, value, count
				from ranked_values
				where rank <= 5
				order by key, rank
			`.execute(database),
		]);
		const dailyCounts = new Map(dailyEvents.map((day) => [day.date, day.volume]));
		const trend = dates.map((date) => ({ date, volume: dailyCounts.get(date) ?? 0 }));
		const properties = new Map<string, Array<{ value: EventPropertyValue; count: number }>>();

		for (const row of propertyValuesResult.rows) {
			const values = properties.get(row.key) ?? [];
			values.push({ value: row.value, count: row.count });
			properties.set(row.key, values);
		}

		return {
			website: {
				id: website.id,
				name: website.name,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
			},
			period: { startDate, endDate },
			events,
			selectedEvent: {
				name: selected.name,
				volume: selected.volume,
				trend,
				properties: Array.from(properties, ([key, values]) => ({ key, values })),
			},
		};
	}
}
