import { inject } from '@adonisjs/core';
import {
	RecordBrowserEvent,
	type RecordBrowserEventError,
	type RecordBrowserEventParams,
} from '#collection/actions/record_browser_event';
import { EventRepository } from '#collection/repositories/event_repository';
import { err, ok, type Result } from '#core/result';
import { TransactionManager } from '#shared/services/transaction_manager';

interface BatchFailure {
	index: number;
	error: RecordBrowserEventError;
}

class RollbackBatch extends Error {
	constructor(readonly failure: BatchFailure) {
		super('Browser event batch rejected');
	}
}

@inject()
export class RecordBrowserEventBatch {
	constructor(
		private readonly recordEvent: RecordBrowserEvent,
		private readonly eventRepository: EventRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(events: RecordBrowserEventParams[]): Promise<Result<void, BatchFailure>> {
		try {
			await this.transactions.run(async () => {
				await this.eventRepository.lockEventIds(events.map(({ eventId }) => eventId));

				for (const [index, event] of events.entries()) {
					const result = await this.recordEvent.execute({ ...event, batchPosition: index });

					if (!result.ok) {
						throw new RollbackBatch({ index, error: result.error });
					}
				}
			});
			return ok(undefined);
		} catch (error) {
			if (error instanceof RollbackBatch) {
				return err(error.failure);
			}

			throw error;
		}
	}
}
