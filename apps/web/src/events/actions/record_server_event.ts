import { inject } from '@adonisjs/core';
import { isAcceptableEventTime } from '#collection/event_time';
import { EventRepository } from '#collection/repositories/event_repository';
import { err, ok, type Result } from '#core/result';
import type { EventProperties } from '#collection/browser_event_protocol';

interface RecordServerEventParams {
	websiteId: string;
	name: string;
	occurredAt: Date;
	path: string;
	properties: EventProperties;
}

interface RecordServerEventError {
	type: 'invalid_occurred_at';
}

@inject()
export class RecordServerEvent {
	constructor(private readonly events: EventRepository) {}

	async execute(params: RecordServerEventParams): Promise<Result<void, RecordServerEventError>> {
		if (!isAcceptableEventTime(params.occurredAt, new Date())) {
			return err({ type: 'invalid_occurred_at' });
		}

		await this.events.appendServerEvent(params.websiteId, params);
		return ok(undefined);
	}
}
