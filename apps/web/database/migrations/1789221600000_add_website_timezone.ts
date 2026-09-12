import { sql, type Kysely, type SqlBool } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.alterTable('websites')
		.addColumn('timezone', 'text', (column) => column.notNull().defaultTo('UTC'))
		.execute();

	await db.schema
		.createIndex('events_website_pageview_occurred_at_index')
		.on('events')
		.columns(['website_id', 'occurred_at'])
		.where(sql<SqlBool>`name = '$pageview'`)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropIndex('events_website_pageview_occurred_at_index').execute();
	await db.schema.alterTable('websites').dropColumn('timezone').execute();
}
