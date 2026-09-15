import { createHash, randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { EventSource } from '#collection/event_source';
import { TransactionManager } from '#shared/services/transaction_manager';
import type { EventProperties } from '#collection/browser_event_protocol';
import type { TechnicalDimensions } from '#collection/technical_dimensions';

interface EventIdentity {
	anonymousId: string | null;
	sessionId: string | null;
	distinctId: string | null;
}

interface IdentifiedEvent {
	eventId?: string;
	batchPosition?: number;
}

export interface BrowserEvent extends EventIdentity, IdentifiedEvent, TechnicalDimensions {
	name: string;
	occurredAt: Date;
	path: string;
	referrer: string | null;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	properties: EventProperties | null;
	country: string | null;
}

export interface ServerEvent extends EventIdentity, IdentifiedEvent {
	name: string;
	occurredAt: Date;
	path: string;
	properties: EventProperties;
}

interface BrowserIdentification extends IdentifiedEvent, TechnicalDimensions {
	occurredAt: Date;
	path: string;
	anonymousId: string;
	distinctId: string;
	country: string | null;
}

function receivedAt(batchPosition: number | undefined) {
	return batchPosition === undefined
		? undefined
		: sql<Date>`transaction_timestamp() + (${batchPosition} * interval '1 microsecond')`;
}

@inject()
export class EventRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async lockEventIds(eventIds: (string | undefined)[]) {
		const keys = eventIds
			.filter((eventId) => eventId !== undefined)
			.map((eventId) => {
				const digest = createHash('sha256').update(`event-id:${eventId}`).digest();
				return [digest.readInt32BE(0), digest.readInt32BE(4)] as const;
			});
		const uniqueKeys = [...new Map(keys.map((key) => [`${key[0]}:${key[1]}`, key])).values()].sort(
			(first, second) => first[0] - second[0] || first[1] - second[1],
		);

		for (const [first, second] of uniqueKeys) {
			await sql`select pg_advisory_xact_lock(${first}, ${second})`.execute(this.transactions.currentDatabase());
		}
	}

	async appendBrowserEvent(websiteId: string, event: BrowserEvent) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				event_id: event.eventId,
				received_at: receivedAt(event.batchPosition),
				name: event.name,
				source: EventSource.Browser,
				occurred_at: event.occurredAt,
				path: event.path,
				referrer: event.referrer,
				utm_source: event.utmSource,
				utm_medium: event.utmMedium,
				utm_campaign: event.utmCampaign,
				properties: event.properties,
				browser: event.browser,
				operating_system: event.operatingSystem,
				device: event.device,
				country: event.country,
				anonymous_id: event.anonymousId,
				session_id: event.sessionId,
				distinct_id: event.distinctId,
			})
			.onConflict((conflict) => conflict.doNothing())
			.execute();
	}

	async appendBrowserIdentification(websiteId: string, identification: BrowserIdentification) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				event_id: identification.eventId,
				received_at: receivedAt(identification.batchPosition),
				name: '$identify',
				source: EventSource.Browser,
				occurred_at: identification.occurredAt,
				path: identification.path,
				anonymous_id: identification.anonymousId,
				session_id: null,
				distinct_id: identification.distinctId,
				referrer: null,
				utm_source: null,
				utm_medium: null,
				utm_campaign: null,
				properties: null,
				browser: identification.browser,
				operating_system: identification.operatingSystem,
				device: identification.device,
				country: identification.country,
			})
			.onConflict((conflict) => conflict.doNothing())
			.execute();
	}

	async appendServerEvent(websiteId: string, event: ServerEvent) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				event_id: event.eventId,
				received_at: receivedAt(event.batchPosition),
				name: event.name,
				source: EventSource.Server,
				occurred_at: event.occurredAt,
				path: event.path,
				properties: event.properties,
				browser: null,
				operating_system: null,
				device: null,
				country: null,
				anonymous_id: event.anonymousId,
				session_id: event.sessionId,
				distinct_id: event.distinctId,
				referrer: null,
				utm_source: null,
				utm_medium: null,
				utm_campaign: null,
			})
			.onConflict((conflict) => conflict.doNothing())
			.execute();
	}
}
