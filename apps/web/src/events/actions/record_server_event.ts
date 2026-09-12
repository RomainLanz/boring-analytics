import { inject } from '@adonisjs/core';
import { validateEventIdentity, type EventIdentityError } from '#collection/event_identity';
import { isAcceptableEventTime } from '#collection/event_time';
import { EventRepository } from '#collection/repositories/event_repository';
import { err, ok, type Result } from '#core/result';
import type { EventProperties } from '#collection/browser_event_protocol';
import type { WebsiteIdentityMode } from '#websites/website_identity_mode';

export interface RecordServerEventParams {
	websiteId: string;
	name: string;
	occurredAt: Date;
	path: string;
	properties: EventProperties;
	identityMode: WebsiteIdentityMode;
	distinctId?: string;
	eventId?: string;
	batchPosition?: number;
}

export type RecordServerEventError = { type: 'invalid_occurred_at' } | EventIdentityError;

@inject()
export class RecordServerEvent {
	constructor(private readonly events: EventRepository) {}

	async execute(params: RecordServerEventParams): Promise<Result<void, RecordServerEventError>> {
		if (!isAcceptableEventTime(params.occurredAt, new Date())) {
			return err({ type: 'invalid_occurred_at' });
		}

		const identity = validateEventIdentity(params.identityMode, params.distinctId);

		if (!identity.ok) {
			return identity;
		}

		await this.events.appendServerEvent(params.websiteId, {
			...params,
			anonymousId: null,
			sessionId: null,
			distinctId: identity.value,
		});
		return ok(undefined);
	}
}
