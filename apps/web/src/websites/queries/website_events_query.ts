import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { EventSource } from '#collection/event_source';
import { TransactionManager } from '#shared/services/transaction_manager';
import { EventDataAvailabilityQuery, type EventDataAvailability } from '#websites/queries/event_data_availability';
import { websiteReportPeriod, type WebsiteReportPeriodPreset } from '#websites/queries/website_report_period';
import type { EventPropertyValue } from '#collection/browser_event_protocol';

interface PropertyValueRow {
	key: string;
	value: EventPropertyValue;
	count: number;
}

export type WebsiteEventsFilter =
	| { kind: 'source'; value: 'browser' | 'server' }
	| { kind: 'property'; key: string; value: EventPropertyValue };

export interface WebsiteEventsReport {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
	};
	period: {
		preset: WebsiteReportPeriodPreset;
		startDate: string;
		endDate: string;
	};
	dataAvailability: EventDataAvailability;
	activeFilter: WebsiteEventsFilter | null;
	events: Array<{ name: string; volume: number }>;
	selectedEvent: {
		name: string;
		volume: number;
		sources: { browser: number; server: number };
		trend: Array<{ date: string; volume: number }>;
		properties: Array<{
			key: string;
			values: Array<{ value: EventPropertyValue; count: number }>;
		}>;
	} | null;
}

interface WebsiteEventsQueryOptions {
	selectedName?: string;
	now?: Date;
	periodPreset?: WebsiteReportPeriodPreset;
	filter?: WebsiteEventsFilter;
}

@inject()
export class WebsiteEventsQuery {
	constructor(
		private readonly transactions: TransactionManager,
		private readonly eventDataAvailability: EventDataAvailabilityQuery,
	) {}

	async execute(
		websiteId: string,
		ownerUserId: string,
		options: WebsiteEventsQueryOptions = {},
	): Promise<WebsiteEventsReport | null> {
		const { selectedName, now = new Date(), periodPreset, filter } = options;
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
			periodPreset,
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
			const dataAvailability = await this.eventDataAvailability.execute(website.id, ownerUserId, periodStart, now);

			return {
				website: {
					id: website.id,
					name: website.name,
					allowedDomain: website.allowed_domain,
					timezone: website.timezone,
				},
				period: { preset: periodPreset ?? 30, startDate, endDate },
				dataAvailability,
				activeFilter: null,
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
		const activeFilter = await this.#compatibleFilter(filter, website.id, selected.name, periodStart, periodEnd);
		let filteredEvents = selectedEvents;

		if (activeFilter?.kind === 'source') {
			filteredEvents = filteredEvents.where(
				'events.source',
				'=',
				activeFilter.value === 'browser' ? EventSource.Browser : EventSource.Server,
			);
		} else if (activeFilter?.kind === 'property') {
			filteredEvents = filteredEvents.where(propertyFilterExpression(activeFilter));
		}
		const dailyEventsQuery = filteredEvents
			.select([
				sql<string>`to_char(events.occurred_at at time zone ${website.timezone}, 'YYYY-MM-DD')`.as('date'),
				sql<number>`count(*)::integer`.as('volume'),
			])
			.groupBy(sql.ref('date'))
			.orderBy('date');
		const [dailyEvents, sourceCounts, propertyValuesResult] = await Promise.all([
			dailyEventsQuery.execute(),
			filteredEvents
				.select(['events.source', sql<number>`count(*)::integer`.as('volume')])
				.groupBy('events.source')
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
						and jsonb_typeof(property.value) in ('string', 'number', 'boolean', 'null')
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
		const sources = { browser: 0, server: 0 };

		for (const source of sourceCounts) {
			sources[source.source === EventSource.Browser ? 'browser' : 'server'] = source.volume;
		}
		const properties = new Map<string, Array<{ value: EventPropertyValue; count: number }>>();

		for (const row of propertyValuesResult.rows) {
			const values = properties.get(row.key) ?? [];
			values.push({ value: row.value, count: row.count });
			properties.set(row.key, values);
		}
		const dataAvailability = await this.eventDataAvailability.execute(website.id, ownerUserId, periodStart, now);

		return {
			website: {
				id: website.id,
				name: website.name,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
			},
			period: { preset: periodPreset ?? 30, startDate, endDate },
			dataAvailability,
			activeFilter,
			events,
			selectedEvent: {
				name: selected.name,
				volume: trend.reduce((total, day) => total + day.volume, 0),
				sources,
				trend,
				properties: Array.from(properties, ([key, values]) => ({ key, values })),
			},
		};
	}

	async #compatibleFilter(
		filter: WebsiteEventsFilter | undefined,
		websiteId: string,
		eventName: string,
		periodStart: Date,
		periodEnd: Date,
	) {
		if (!filter || filter.kind === 'source') {
			return filter ?? null;
		}

		const matchingEvent = await this.transactions
			.currentDatabase()
			.selectFrom('events')
			.select(sql<number>`1`.as('exists'))
			.where('events.website_id', '=', websiteId)
			.where('events.name', '=', eventName)
			.where('events.occurred_at', '>=', periodStart)
			.where('events.occurred_at', '<', periodEnd)
			.where(propertyFilterExpression(filter))
			.executeTakeFirst();

		return matchingEvent ? filter : null;
	}
}

function propertyFilterExpression(filter: Extract<WebsiteEventsFilter, { kind: 'property' }>) {
	return sql<boolean>`events.properties ? ${filter.key} and (events.properties -> ${filter.key}) = ${JSON.stringify(filter.value)}::text::jsonb`;
}
