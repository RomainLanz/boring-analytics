import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { TransactionManager } from '#shared/services/transaction_manager';
import env from '#start/env';

export interface PurgeExpiredEventsParams {
	now?: Date;
	batchSize: number;
	eventTimeToleranceHours?: number;
}

@inject()
export class PurgeExpiredEvents {
	constructor(private readonly transactions: TransactionManager) {}

	async execute({
		now = new Date(),
		batchSize,
		eventTimeToleranceHours = env.get('EVENT_TIME_TOLERANCE_HOURS'),
	}: PurgeExpiredEventsParams) {
		if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
			throw new Error('Event purge batch size must be an integer between 1 and 10000');
		}

		const result = await sql<{ deleted: number }>`
			with target_website as materialized (
				select
					websites.id,
					${now} - make_interval(days => websites.retention_days) as cutoff,
					${now} - make_interval(days => websites.retention_days)
						+ make_interval(secs => ${eventTimeToleranceHours * 3_600}) as available_from
				from websites
				where websites.retention_days is not null
					and exists (
						select 1
						from events
						where events.website_id = websites.id
							and events.received_at < ${now} - make_interval(days => websites.retention_days)
							and ${this.#isPurgeableEvent()}
					)
				order by websites.id
				limit 1
				for update of websites skip locked
			),
			expired as (
				select candidate.id
				from target_website
				cross join lateral (
					select events.id
					from events
					where events.website_id = target_website.id
						and events.received_at < target_website.cutoff
						and ${this.#isPurgeableEvent()}
					order by events.received_at, events.id
					limit ${batchSize}
					for update of events skip locked
				) as candidate
			),
			deleted as (
				delete from events
				using expired
				where events.id = expired.id
				returning events.website_id, events.occurred_at
			),
			updated_website as (
				update websites
				set events_available_from = greatest(
					websites.events_available_from,
					target_website.available_from,
					(select max(deleted.occurred_at) + interval '1 millisecond' from deleted)
				)
				from target_website
				where websites.id = target_website.id
					and exists (select 1 from deleted)
				returning websites.id
			)
			select count(*)::integer as deleted from deleted
		`.execute(this.transactions.currentDatabase());

		return result.rows[0]?.deleted ?? 0;
	}

	#isPurgeableEvent() {
		return sql<boolean>`(
			events.name <> '$identify'
			or not exists (
				select 1
				from events as linked_event
				where linked_event.website_id = events.website_id
					and linked_event.name <> '$identify'
					and linked_event.anonymous_id = events.anonymous_id
					and linked_event.distinct_id is null
					and linked_event.occurred_at <= events.occurred_at
			)
		)`;
	}
}
