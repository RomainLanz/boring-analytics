import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import {
	parseFunnelFilter,
	parseFunnelIdentityKind,
	type FunnelFilter,
	type FunnelIdentityKind,
} from '#funnels/domain/funnel_definition';
import { TransactionManager } from '#shared/services/transaction_manager';
import { EventDataAvailabilityQuery, type EventDataAvailability } from '#websites/queries/event_data_availability';
import { websiteReportPeriod, type WebsiteReportPeriodPreset } from '#websites/queries/website_report_period';
import type { JsonValue } from '#types/db';

interface FunnelSummary {
	entrants: number;
	converted: number;
	conversionRate: number;
	totalDropoffs: number;
}

export type FunnelSegmentationDimension =
	| { kind: 'source' }
	| { kind: 'path' }
	| { kind: 'utm_source' }
	| { kind: 'utm_medium' }
	| { kind: 'utm_campaign' }
	| { kind: 'property'; key: string };

export type FunnelSegmentValue =
	| { type: 'string'; value: string }
	| { type: 'number'; value: number }
	| { type: 'boolean'; value: boolean }
	| { type: 'null' }
	| { type: 'unspecified' }
	| { type: 'other'; valueCount: number };

interface FunnelSegment {
	value: FunnelSegmentValue;
	current: FunnelSummary;
	previous: FunnelSummary | null;
}

type FunnelSegmentation =
	| { status: 'inactive'; propertyKeys: string[] }
	| {
			status: 'available';
			dimension: FunnelSegmentationDimension;
			propertyKeys: string[];
			segments: FunnelSegment[];
	  }
	| {
			status: 'unavailable';
			dimension: FunnelSegmentationDimension;
			propertyKeys: [];
			availableFrom: string;
	  };

interface FunnelStep {
	position: number;
	eventName: string;
	filter: FunnelFilter | null;
	entrants: number;
	stepRate: number;
	dropoffs: number | null;
	medianTimeFromPreviousSeconds: number | null;
}

interface FunnelReportBase {
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
		previous: { startDate: string; endDate: string };
	};
	funnel: {
		id: string;
		name: string;
		conversionWindowSeconds: number;
		identityKind: FunnelIdentityKind;
	};
	segmentation: FunnelSegmentation;
}

type FunnelComparison =
	| { status: 'available'; summary: FunnelSummary; steps: FunnelStep[] }
	| Extract<EventDataAvailability, { status: 'unavailable' }>;

export type FunnelReport = FunnelReportBase &
	(
		| {
				dataAvailability: Extract<EventDataAvailability, { status: 'available' }>;
				summary: FunnelSummary;
				steps: FunnelStep[];
				comparison: FunnelComparison;
		  }
		| {
				dataAvailability: Extract<EventDataAvailability, { status: 'unavailable' }>;
				summary: null;
				steps: [];
				comparison: Extract<EventDataAvailability, { status: 'unavailable' }>;
		  }
	);

interface StepAggregate {
	cohort: 'current' | 'previous';
	position: number;
	entrants: number;
	median_time_from_previous_seconds: number | null;
	property_keys: string[];
	segments: SegmentAggregate[];
}

interface SegmentAggregate {
	value: JsonValue;
	value_count: number;
	current_entrants: number;
	current_converted: number;
	previous_entrants: number;
	previous_converted: number;
}

interface PersistedStep {
	position: number;
	event_name: string;
	filter: JsonValue | null;
}

@inject()
export class FunnelReportQuery {
	constructor(
		private readonly transactions: TransactionManager,
		private readonly eventDataAvailability: EventDataAvailabilityQuery,
	) {}

	async execute(
		funnelId: string,
		websiteId: string,
		ownerUserId: string,
		now = new Date(),
		periodPreset: WebsiteReportPeriodPreset = 30,
		segmentationDimension?: FunnelSegmentationDimension,
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
				'funnels.identity_kind',
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
		const identityKind = parseFunnelIdentityKind(funnel.identity_kind);
		const conversionWindowMilliseconds = funnel.conversion_window_seconds * 1_000;
		// Anchor Website-local, half-open cohort periods at this cutoff so every entrant has had the full
		// conversion window to mature. The shared period seam keeps the previous period adjacent to the current one.
		const maturityCutoff = new Date(now.getTime() - conversionWindowMilliseconds);
		const { preset, startDate, endDate, periodStart, periodEnd, previous } = websiteReportPeriod(
			funnel.website_id,
			funnel.timezone,
			maturityCutoff,
			periodPreset,
		);
		const [dataAvailability, previousDataAvailability] = await Promise.all([
			this.eventDataAvailability.execute(funnel.website_id, ownerUserId, periodStart, now),
			this.eventDataAvailability.execute(funnel.website_id, ownerUserId, previous.periodStart, now),
		]);
		const report = {
			website: {
				id: funnel.website_id,
				name: funnel.website_name,
				allowedDomain: funnel.allowed_domain,
				timezone: funnel.timezone,
			},
			period: {
				preset,
				startDate,
				endDate,
				previous: { startDate: previous.startDate, endDate: previous.endDate },
			},
			funnel: {
				id: funnel.id,
				name: funnel.funnel_name,
				conversionWindowSeconds: funnel.conversion_window_seconds,
				identityKind,
			},
		};

		if (dataAvailability.status === 'unavailable') {
			return {
				...report,
				dataAvailability,
				summary: null,
				steps: [],
				comparison: dataAvailability,
				segmentation: segmentationDimension
					? {
							status: 'unavailable',
							dimension: segmentationDimension,
							propertyKeys: [],
							availableFrom: dataAvailability.availableFrom,
						}
					: { status: 'inactive', propertyKeys: [] },
			};
		}

		const capturedSteps = sql.join(
			persistedSteps.map((step) => {
				const filter = step.filter === null ? sql`null::jsonb` : sql`${step.filter}::jsonb`;
				return sql`(${step.position}::smallint, ${step.event_name}::text, ${filter})`;
			}),
		);
		const cohortPeriods = [sql`('current'::text, ${periodStart}::timestamptz, ${periodEnd}::timestamptz)`];

		if (previousDataAvailability.status === 'available') {
			cohortPeriods.push(
				sql`('previous'::text, ${previous.periodStart}::timestamptz, ${previous.periodEnd}::timestamptz)`,
			);
		}

		const capturedCohortPeriods = sql.join(cohortPeriods);
		const segmentValue = this.#segmentValue(segmentationDimension, sql.ref('events'));
		const seedEventCandidates =
			identityKind === 'distinct_id'
				? sql`
					select cohort_periods.cohort, events.distinct_id as identity_id, events.id, events.occurred_at,
						events.received_at, events.properties as entry_properties, ${segmentValue} as segment_value
					from events
					inner join cohort_periods
						on events.occurred_at >= cohort_periods.period_start
						and events.occurred_at < cohort_periods.period_end
					inner join steps on steps.position = 1 and steps.event_name = events.name
					where events.website_id = ${funnel.website_id}
						and events.distinct_id is not null
						and events.name <> '$identify'
						and ${this.#matchesFilter(sql.ref('steps.filter'), sql.ref('events'))}

					union all

					select cohort_periods.cohort, identification.distinct_id as identity_id, events.id, events.occurred_at,
						events.received_at, events.properties as entry_properties, ${segmentValue} as segment_value
					from events
					inner join cohort_periods
						on events.occurred_at >= cohort_periods.period_start
						and events.occurred_at < cohort_periods.period_end
					inner join events as identification
						on identification.website_id = events.website_id
						and identification.name = '$identify'
						and identification.anonymous_id = events.anonymous_id
						and events.occurred_at <= identification.occurred_at
					inner join steps on steps.position = 1 and steps.event_name = events.name
					where events.website_id = ${funnel.website_id}
						and events.distinct_id is null
						and events.anonymous_id is not null
						and ${this.#matchesFilter(sql.ref('steps.filter'), sql.ref('events'))}
				`
				: sql`
					select cohort_periods.cohort, events.session_id as identity_id, events.id, events.occurred_at,
						events.received_at, events.properties as entry_properties, ${segmentValue} as segment_value
					from events
					inner join cohort_periods
						on events.occurred_at >= cohort_periods.period_start
						and events.occurred_at < cohort_periods.period_end
					inner join steps on steps.position = 1 and steps.event_name = events.name
					where events.website_id = ${funnel.website_id}
						and events.session_id is not null
						and ${this.#matchesFilter(sql.ref('steps.filter'), sql.ref('events'))}
				`;
		const nextEventCandidates =
			identityKind === 'distinct_id'
				? sql`
					select events.id, events.occurred_at, events.received_at
					from events
					where events.website_id = ${funnel.website_id}
						and events.distinct_id = chain.identity_id
						and events.name = next_step.event_name
						and (events.occurred_at, events.received_at, events.id) >
							(chain.occurred_at, chain.received_at, chain.id)
						and events.occurred_at <= chain.first_step_at + make_interval(secs => ${funnel.conversion_window_seconds})
						and ${this.#matchesFilter(sql.ref('next_step.filter'), sql.ref('events'))}

					union all

					select events.id, events.occurred_at, events.received_at
					from events
					inner join events as identification
						on identification.website_id = events.website_id
						and identification.name = '$identify'
						and identification.anonymous_id = events.anonymous_id
						and identification.distinct_id = chain.identity_id
						and events.occurred_at <= identification.occurred_at
					where events.website_id = ${funnel.website_id}
						and events.distinct_id is null
						and events.anonymous_id is not null
						and events.name = next_step.event_name
						and (events.occurred_at, events.received_at, events.id) >
							(chain.occurred_at, chain.received_at, chain.id)
						and events.occurred_at <= chain.first_step_at + make_interval(secs => ${funnel.conversion_window_seconds})
						and ${this.#matchesFilter(sql.ref('next_step.filter'), sql.ref('events'))}
				`
				: sql`
					select events.id, events.occurred_at, events.received_at
					from events
					where events.website_id = ${funnel.website_id}
						and events.session_id = chain.identity_id
						and events.name = next_step.event_name
						and (events.occurred_at, events.received_at, events.id) >
							(chain.occurred_at, chain.received_at, chain.id)
						and events.occurred_at <= chain.first_step_at + make_interval(secs => ${funnel.conversion_window_seconds})
						and ${this.#matchesFilter(sql.ref('next_step.filter'), sql.ref('events'))}
				`;
		const aggregates = await sql<StepAggregate>`
			with recursive steps(position, event_name, filter) as (
				values ${capturedSteps}
			), cohort_periods(cohort, period_start, period_end) as (
				values ${capturedCohortPeriods}
			), seed_candidates as (
				select
					candidates.cohort,
					candidates.identity_id,
					candidates.id,
					candidates.occurred_at,
					candidates.received_at,
					candidates.entry_properties,
					candidates.segment_value,
					row_number() over (
						partition by candidates.cohort, candidates.identity_id
						order by candidates.occurred_at, candidates.received_at, candidates.id
					) as candidate_number
				from (${seedEventCandidates}) as candidates
			), chain as (
				select
					seed.cohort,
					seed.identity_id,
					1::smallint as position,
					seed.id,
					seed.occurred_at,
					seed.received_at,
					seed.occurred_at as first_step_at,
					null::timestamptz as previous_step_at,
					seed.entry_properties,
					seed.segment_value
				from seed_candidates as seed
				where seed.candidate_number = 1

				union all

				select
					chain.cohort,
					chain.identity_id,
					next_step.position,
					next_event.id,
					next_event.occurred_at,
					next_event.received_at,
					chain.first_step_at,
					chain.occurred_at as previous_step_at,
					chain.entry_properties,
					chain.segment_value
				from chain
				inner join steps as next_step on next_step.position = chain.position + 1
				inner join lateral (
					select candidates.id, candidates.occurred_at, candidates.received_at
					from (${nextEventCandidates}) as candidates
					order by candidates.occurred_at, candidates.received_at, candidates.id
					limit 1
				) as next_event on true
			), entry_property_keys as (
				select distinct property.key
				from chain
				cross join lateral jsonb_each(
					case when jsonb_typeof(chain.entry_properties) = 'object' then chain.entry_properties else '{}'::jsonb end
				) as property(key, value)
				where chain.position = 1
					and jsonb_typeof(property.value) in ('string', 'number', 'boolean', 'null')
			), segment_counts as (
				select
					chain.segment_value,
					count(*) filter (where chain.cohort = 'current' and chain.position = 1)::integer as current_entrants,
					count(*) filter (
						where chain.cohort = 'current' and chain.position = (select max(position) from steps)
					)::integer as current_converted,
					count(*) filter (where chain.cohort = 'previous' and chain.position = 1)::integer as previous_entrants,
					count(*) filter (
						where chain.cohort = 'previous' and chain.position = (select max(position) from steps)
					)::integer as previous_converted
				from chain
				group by chain.segment_value
			), ranked_segment_counts as (
				select
					segment_counts.*,
					row_number() over (
						order by segment_counts.current_entrants desc, segment_counts.segment_value::text
					) as segment_rank
				from segment_counts
				where segment_counts.segment_value <> jsonb_build_object('__boring_analytics_segment__', 'unspecified')
			), reported_segment_counts as (
				select
					case
						when segment_counts.segment_value = jsonb_build_object('__boring_analytics_segment__', 'unspecified')
							or ranked_segment_counts.segment_rank <= 8
						then segment_counts.segment_value
						else jsonb_build_object('__boring_analytics_segment__', 'other')
					end as segment_value,
					count(*)::integer as value_count,
					sum(segment_counts.current_entrants)::integer as current_entrants,
					sum(segment_counts.current_converted)::integer as current_converted,
					sum(segment_counts.previous_entrants)::integer as previous_entrants,
					sum(segment_counts.previous_converted)::integer as previous_converted
				from segment_counts
				left join ranked_segment_counts on ranked_segment_counts.segment_value = segment_counts.segment_value
				group by 1
			)
			select
				cohort_periods.cohort,
				steps.position::integer as position,
				count(chain.identity_id)::integer as entrants,
				percentile_cont(0.5) within group (
					order by extract(epoch from chain.occurred_at - chain.previous_step_at)
				)::double precision as median_time_from_previous_seconds,
				(select coalesce(array_agg(entry_property_keys.key order by entry_property_keys.key), '{}') from entry_property_keys) as property_keys,
				(
					select coalesce(
						jsonb_agg(
							jsonb_build_object(
								'value', reported_segment_counts.segment_value,
								'value_count', reported_segment_counts.value_count,
								'current_entrants', reported_segment_counts.current_entrants,
								'current_converted', reported_segment_counts.current_converted,
								'previous_entrants', reported_segment_counts.previous_entrants,
								'previous_converted', reported_segment_counts.previous_converted
							)
							order by
								reported_segment_counts.segment_value = jsonb_build_object('__boring_analytics_segment__', 'other'),
								reported_segment_counts.current_entrants desc,
								reported_segment_counts.segment_value::text
						),
						'[]'::jsonb
					)
					from reported_segment_counts
				) as segments
			from cohort_periods
			cross join steps
			left join chain on chain.cohort = cohort_periods.cohort and chain.position = steps.position
			group by cohort_periods.cohort, steps.position
			order by cohort_periods.cohort, steps.position
		`.execute(database);
		const current = this.#metricsFor('current', persistedSteps, aggregates.rows);
		const comparison =
			previousDataAvailability.status === 'unavailable'
				? previousDataAvailability
				: { status: 'available' as const, ...this.#metricsFor('previous', persistedSteps, aggregates.rows) };

		const propertyKeys = aggregates.rows[0]?.property_keys ?? [];
		const segmentation: FunnelSegmentation = segmentationDimension
			? {
					status: 'available',
					dimension: segmentationDimension,
					propertyKeys,
					segments: (aggregates.rows[0]?.segments ?? []).map((segment) => ({
						value: this.#parseSegmentValue(segment.value, segment.value_count),
						current: this.#segmentMetrics(segment.current_entrants, segment.current_converted),
						previous:
							previousDataAvailability.status === 'available'
								? this.#segmentMetrics(segment.previous_entrants, segment.previous_converted)
								: null,
					})),
				}
			: { status: 'inactive', propertyKeys };

		return { ...report, dataAvailability, ...current, comparison, segmentation };
	}

	#segmentMetrics(entrants: number, converted: number): FunnelSummary {
		return {
			entrants,
			converted,
			conversionRate: entrants ? converted / entrants : 0,
			totalDropoffs: entrants - converted,
		};
	}

	#parseSegmentValue(value: JsonValue, valueCount: number): FunnelSegmentValue {
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			const sentinel = value.__boring_analytics_segment__;

			if (sentinel === 'unspecified') {
				return { type: 'unspecified' };
			}

			if (sentinel === 'other') {
				return { type: 'other', valueCount };
			}
		}

		if (value === null) {
			return { type: 'null' };
		}

		return { type: typeof value as 'string' | 'number' | 'boolean', value } as FunnelSegmentValue;
	}

	#segmentValue(dimension: FunnelSegmentationDimension | undefined, events: ReturnType<typeof sql.ref>) {
		const unspecified = sql`jsonb_build_object('__boring_analytics_segment__', 'unspecified')`;

		if (!dimension) {
			return unspecified;
		}

		if (dimension.kind === 'source') {
			return sql`to_jsonb(case ${events}.source when 1 then 'browser'::text else 'server'::text end)`;
		}

		if (dimension.kind === 'property') {
			return sql`case when ${events}.properties ? ${dimension.key} then ${events}.properties -> ${dimension.key} else ${unspecified} end`;
		}

		if (dimension.kind === 'path') {
			return sql`coalesce(to_jsonb(nullif(${events}.path, '')), ${unspecified})`;
		}

		return sql`coalesce(to_jsonb(${sql.ref(`events.${dimension.kind}`)}), ${unspecified})`;
	}

	#metricsFor(cohort: StepAggregate['cohort'], persistedSteps: PersistedStep[], aggregates: StepAggregate[]) {
		const cohortAggregates = aggregates.filter((aggregate) => aggregate.cohort === cohort);
		const steps = persistedSteps.map((step, index) => {
			const aggregate = cohortAggregates[index];
			const entrants = aggregate?.entrants ?? 0;
			const previousEntrants = cohortAggregates[index - 1]?.entrants;
			const nextEntrants = cohortAggregates[index + 1]?.entrants;

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
