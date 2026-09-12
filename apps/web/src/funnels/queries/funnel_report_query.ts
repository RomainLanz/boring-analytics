import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { parseFunnelFilter, type FunnelFilter } from '#funnels/domain/funnel_definition';
import { TransactionManager } from '#shared/services/transaction_manager';
import { websiteReportPeriod } from '#websites/queries/website_report_period';
import type { JsonValue } from '#types/db';

export interface FunnelReport {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
	};
	period: { startDate: string; endDate: string };
	funnel: {
		id: string;
		name: string;
		conversionWindowSeconds: number;
	};
	summary: {
		entrants: number;
		converted: number;
		conversionRate: number;
		totalDropoffs: number;
	};
	steps: Array<{
		position: number;
		eventName: string;
		filter: FunnelFilter | null;
		entrants: number;
		stepRate: number;
		dropoffs: number | null;
		medianTimeFromPreviousSeconds: number | null;
	}>;
}

interface StepAggregate {
	position: number;
	entrants: number;
	median_time_from_previous_seconds: number | null;
}

interface PersistedStep {
	position: number;
	event_name: string;
	filter: JsonValue | null;
}

@inject()
export class FunnelReportQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(
		funnelId: string,
		websiteId: string,
		ownerUserId: string,
		now = new Date(),
	): Promise<FunnelReport | null> {
		const database = this.transactions.currentDatabase();
		const funnel = await database
			.selectFrom('funnels')
			.innerJoin('websites', 'websites.id', 'funnels.website_id')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select([
				'funnels.id',
				'funnels.name as funnel_name',
				'funnels.conversion_window_seconds',
				'websites.id as website_id',
				'websites.name as website_name',
				'websites.allowed_domain',
				'websites.timezone',
				sql<PersistedStep[]>`(
					select coalesce(
						jsonb_agg(
							jsonb_build_object(
								'position', funnel_steps.position,
								'event_name', funnel_steps.event_name,
								'filter', funnel_steps.filter
							)
							order by funnel_steps.position
						),
						'[]'::jsonb
					)
					from funnel_steps
					where funnel_steps.funnel_id = funnels.id
				)`.as('persisted_steps'),
			])
			.where('funnels.id', '=', funnelId)
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!funnel) {
			return null;
		}

		const persistedSteps = funnel.persisted_steps;
		const { startDate, endDate, periodStart, periodEnd } = websiteReportPeriod(funnel.website_id, funnel.timezone, now);
		const matureBefore = new Date(periodEnd.getTime() - funnel.conversion_window_seconds * 1_000);
		const capturedSteps = sql.join(
			persistedSteps.map((step) => {
				const filter = step.filter === null ? sql`null::jsonb` : sql`${step.filter}::jsonb`;
				return sql`(${step.position}::smallint, ${step.event_name}::text, ${filter})`;
			}),
		);
		const aggregates = await sql<StepAggregate>`
			with recursive steps(position, event_name, filter) as (
				values ${capturedSteps}
			), seed_candidates as (
				select
					events.session_id,
					events.id,
					events.occurred_at,
					events.received_at,
					row_number() over (
						partition by events.session_id
						order by events.occurred_at, events.received_at, events.id
					) as candidate_number
				from events
				inner join steps on steps.position = 1 and steps.event_name = events.name
				where events.website_id = ${funnel.website_id}
					and events.session_id is not null
					and events.occurred_at >= ${periodStart}
					and events.occurred_at < ${periodEnd}
					and events.occurred_at <= ${matureBefore}
					and ${this.#matchesFilter(sql.ref('steps.filter'), sql.ref('events'))}
			), chain as (
				select
					seed.session_id,
					1::smallint as position,
					seed.id,
					seed.occurred_at,
					seed.received_at,
					seed.occurred_at as first_step_at,
					null::timestamptz as previous_step_at
				from seed_candidates as seed
				where seed.candidate_number = 1

				union all

				select
					chain.session_id,
					next_step.position,
					next_event.id,
					next_event.occurred_at,
					next_event.received_at,
					chain.first_step_at,
					chain.occurred_at as previous_step_at
				from chain
				inner join steps as next_step on next_step.position = chain.position + 1
				inner join lateral (
					select events.id, events.occurred_at, events.received_at
					from events
					where events.website_id = ${funnel.website_id}
						and events.session_id = chain.session_id
						and events.name = next_step.event_name
						and (events.occurred_at, events.received_at, events.id) >
							(chain.occurred_at, chain.received_at, chain.id)
						and events.occurred_at <= chain.first_step_at + make_interval(secs => ${funnel.conversion_window_seconds})
						and ${this.#matchesFilter(sql.ref('next_step.filter'), sql.ref('events'))}
					order by events.occurred_at, events.received_at, events.id
					limit 1
				) as next_event on true
			)
			select
				steps.position::integer as position,
				count(chain.session_id)::integer as entrants,
				percentile_cont(0.5) within group (
					order by extract(epoch from chain.occurred_at - chain.previous_step_at)
				)::double precision as median_time_from_previous_seconds
			from steps
			left join chain on chain.position = steps.position
			group by steps.position
			order by steps.position
		`.execute(database);
		const steps = persistedSteps.map((step, index) => {
			const aggregate = aggregates.rows[index];
			const entrants = aggregate?.entrants ?? 0;
			const previousEntrants = aggregates.rows[index - 1]?.entrants;
			const nextEntrants = aggregates.rows[index + 1]?.entrants;

			return {
				position: step.position,
				eventName: step.event_name,
				filter: parseFunnelFilter(step.filter),
				entrants,
				stepRate: index === 0 ? (entrants ? 1 : 0) : previousEntrants ? entrants / previousEntrants : 0,
				dropoffs: nextEntrants === undefined ? null : entrants - nextEntrants,
				medianTimeFromPreviousSeconds: aggregate?.median_time_from_previous_seconds ?? null,
			};
		});
		const entrants = steps[0]?.entrants ?? 0;
		const converted = steps.at(-1)?.entrants ?? 0;

		return {
			website: {
				id: funnel.website_id,
				name: funnel.website_name,
				allowedDomain: funnel.allowed_domain,
				timezone: funnel.timezone,
			},
			period: { startDate, endDate },
			funnel: {
				id: funnel.id,
				name: funnel.funnel_name,
				conversionWindowSeconds: funnel.conversion_window_seconds,
			},
			summary: {
				entrants,
				converted,
				conversionRate: entrants ? converted / entrants : 0,
				totalDropoffs: entrants - converted,
			},
			steps,
		};
	}

	#matchesFilter(filter: ReturnType<typeof sql.ref>, events: ReturnType<typeof sql.ref>) {
		return sql`(
			${filter} is null
			or (${filter}->>'field' = 'path' and to_jsonb(${events}.path) = ${filter}->'value')
			or (
				${filter}->>'field' = 'property'
				and ${events}.properties ? (${filter}->>'key')
				and ${events}.properties->(${filter}->>'key') = ${filter}->'value'
			)
		)`;
	}
}
