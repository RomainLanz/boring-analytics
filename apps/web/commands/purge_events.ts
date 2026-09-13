import { BaseCommand, flags } from '@adonisjs/core/ace';
import { PurgeExpiredEvents } from '#collection/actions/purge_expired_events';
import type { CommandOptions } from '@adonisjs/core/types/ace';

export default class PurgeEvents extends BaseCommand {
	static commandName = 'events:purge';
	static description = 'Purge expired raw events in bounded PostgreSQL batches';
	static options: CommandOptions = { startApp: true };

	@flags.number({ description: 'Maximum events deleted per batch', default: 1_000 })
	declare batchSize: number;

	@flags.number({ description: 'Maximum batches processed per run', default: 100 })
	declare maxBatches: number;

	async run() {
		if (!Number.isInteger(this.maxBatches) || this.maxBatches < 1 || this.maxBatches > 10_000) {
			this.logger.error('Max batches must be an integer between 1 and 10000');
			this.exitCode = 1;
			return;
		}

		const purge = await this.app.container.make(PurgeExpiredEvents);
		let deleted = 0;

		for (let batch = 0; batch < this.maxBatches; batch += 1) {
			const batchDeleted = await purge.execute({ batchSize: this.batchSize });
			deleted += batchDeleted;

			if (batchDeleted === 0) {
				break;
			}
		}

		this.logger.info(`Purged ${deleted} expired event${deleted === 1 ? '' : 's'}`);
	}
}
