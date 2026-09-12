import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { EventSource } from '#collection/event_source';
import { TransactionManager } from '#shared/services/transaction_manager';
import type { EventProperties } from '#collection/browser_event_protocol';

interface EventIdentity {
	anonymousId: string | null;
	sessionId: string | null;
	distinctId: string | null;
}

export interface BrowserEvent extends EventIdentity {
	name: string;
	occurredAt: Date;
	path: string;
	referrer: string | null;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	properties: EventProperties | null;
}

export interface ServerEvent extends EventIdentity {
	name: string;
	occurredAt: Date;
	path: string;
	properties: EventProperties;
}

interface BrowserIdentification {
	occurredAt: Date;
	path: string;
	anonymousId: string;
	distinctId: string;
}

@inject()
export class EventRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async appendBrowserEvent(websiteId: string, event: BrowserEvent) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				name: event.name,
				source: EventSource.Browser,
				occurred_at: event.occurredAt,
				path: event.path,
				referrer: event.referrer,
				utm_source: event.utmSource,
				utm_medium: event.utmMedium,
				utm_campaign: event.utmCampaign,
				properties: event.properties,
				anonymous_id: event.anonymousId,
				session_id: event.sessionId,
				distinct_id: event.distinctId,
			})
			.execute();
	}

	async appendBrowserIdentification(websiteId: string, identification: BrowserIdentification) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
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
			})
			.onConflict((conflict) =>
				conflict.columns(['website_id', 'anonymous_id']).where('name', '=', '$identify').doNothing(),
			)
			.execute();
	}

	async appendServerEvent(websiteId: string, event: ServerEvent) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				name: event.name,
				source: EventSource.Server,
				occurred_at: event.occurredAt,
				path: event.path,
				properties: event.properties,
				anonymous_id: event.anonymousId,
				session_id: event.sessionId,
				distinct_id: event.distinctId,
				referrer: null,
				utm_source: null,
				utm_medium: null,
				utm_campaign: null,
			})
			.execute();
	}
}
