import app from '@adonisjs/core/services/app';
import { createMigrator } from '#shared/migrator';
import type { HttpContext } from '@adonisjs/core/http';

export default class ReadinessController {
	async execute({ response }: HttpContext) {
		try {
			const migrations = await createMigrator(app.migrationsPath()).getMigrations();

			if (migrations.some((migration) => !migration.executedAt)) {
				return response.serviceUnavailable({ status: 'not_ready' });
			}

			return response.ok({ status: 'ready' });
		} catch {
			return response.serviceUnavailable({ status: 'not_ready' });
		}
	}
}
