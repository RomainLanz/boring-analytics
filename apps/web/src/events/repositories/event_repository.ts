import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { EventSource } from '#collection/event_source';
import { TransactionManager } from '#shared/services/transaction_manager';

export interface PageviewEvent {
	occurredAt: Date;
	path: string;
	referrer: string | null;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	anonymousId: string;
	sessionId: string;
}

@inject()
export class EventRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async appendPageview(websiteId: string, event: PageviewEvent) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({
				id: randomUUID(),
				website_id: websiteId,
				name: '$pageview',
				source: EventSource.Browser,
				occurred_at: event.occurredAt,
				path: event.path,
				referrer: event.referrer,
				utm_source: event.utmSource,
				utm_medium: event.utmMedium,
				utm_campaign: event.utmCampaign,
				anonymous_id: event.anonymousId,
				session_id: event.sessionId,
			})
			.execute();
	}
}
