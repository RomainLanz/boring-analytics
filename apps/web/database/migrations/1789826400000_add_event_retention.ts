import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.alterTable('websites')
		.addColumn('retention_days', 'integer', (column) => column.defaultTo(90))
		.addColumn('events_available_from', 'timestamptz')
		.execute();
	await db.schema
		.alterTable('websites')
		.addCheckConstraint(
			'websites_retention_days_check',
			sql`retention_days is null or retention_days in (60, 90, 180, 365)`,
		)
		.execute();
	await db.schema.dropIndex('events_website_received_at_index').execute();
	await db.schema
		.createIndex('events_website_received_at_index')
		.on('events')
		.columns(['website_id', 'received_at', 'id'])
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropIndex('events_website_received_at_index').execute();
	await db.schema
		.createIndex('events_website_received_at_index')
		.on('events')
		.columns(['website_id', 'received_at'])
		.execute();
	await db.schema.alterTable('websites').dropConstraint('websites_retention_days_check').execute();
	await db.schema.alterTable('websites').dropColumn('retention_days').dropColumn('events_available_from').execute();
}
