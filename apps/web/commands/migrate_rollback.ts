import { BaseCommand } from '@adonisjs/core/ace';
import { createMigrator } from '#shared/migrator';
import type { CommandOptions } from '@adonisjs/core/types/ace';

export default class MigrateRollback extends BaseCommand {
	static commandName = 'migrate:rollback';
	static description = 'Rollback the latest Kysely migration';
	static options: CommandOptions = { startApp: true };

	async run() {
		const migrator = createMigrator(this.app.migrationsPath());
		const { error, results } = await migrator.migrateDown();
		results?.forEach((result) => this.logger.info(`${result.migrationName}: ${result.status}`));

		if (error) {
			this.error = error;
			this.exitCode = 1;
		}
	}
}
