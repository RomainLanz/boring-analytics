import fs from 'node:fs/promises';
import path from 'node:path';
import { Migrator } from 'kysely/migration';
import { FileMigrationProvider } from '#shared/file_migration_provider';
import { db } from '#shared/services/db';

export function createMigrator(migrationFolder: string) {
	return new Migrator({
		db,
		provider: new FileMigrationProvider({ fs, path, migrationFolder }),
	});
}
