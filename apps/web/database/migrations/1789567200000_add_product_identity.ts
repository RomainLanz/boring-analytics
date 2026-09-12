import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.alterTable('websites')
		.addColumn('identity_mode', 'text', (column) => column.notNull().defaultTo('anonymous'))
		.execute();
	await sql`
		alter table websites
		add constraint websites_identity_mode_check check (identity_mode in ('anonymous', 'product'))
	`.execute(db);

	await db.schema.alterTable('events').addColumn('distinct_id', 'text').execute();
	await sql`
		alter table events
		add constraint events_distinct_id_check check (distinct_id is null or length(distinct_id) between 1 and 255)
	`.execute(db);

	await db.schema.alterTable('funnels').dropConstraint('funnels_conversion_window_check').execute();
	await db.schema
		.alterTable('funnels')
		.addColumn('identity_kind', 'text', (column) => column.notNull().defaultTo('session_id'))
		.execute();
	await sql`
		alter table funnels
		add constraint funnels_identity_kind_check check (identity_kind in ('session_id', 'distinct_id')),
		add constraint funnels_conversion_window_check check (
			(
				identity_kind = 'session_id' and conversion_window_seconds between 1 and 1800
			) or (
				identity_kind = 'distinct_id' and conversion_window_seconds between 1 and 2592000
			)
		)
	`.execute(db);

	await db.schema
		.createIndex('events_website_name_distinct_id_occurred_at_index')
		.on('events')
		.columns(['website_id', 'name', 'distinct_id', 'occurred_at', 'received_at', 'id'])
		.where('distinct_id', 'is not', null)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropIndex('events_website_name_distinct_id_occurred_at_index').execute();
	await db.schema.alterTable('funnels').dropConstraint('funnels_conversion_window_check').execute();
	await db.schema.alterTable('funnels').dropConstraint('funnels_identity_kind_check').execute();
	await sql`update funnels set conversion_window_seconds = least(conversion_window_seconds, 1800)`.execute(db);
	await db.schema.alterTable('funnels').dropColumn('identity_kind').execute();
	await sql`
		alter table funnels
		add constraint funnels_conversion_window_check check (conversion_window_seconds between 1 and 1800)
	`.execute(db);
	await db.schema.alterTable('events').dropColumn('distinct_id').execute();
	await db.schema.alterTable('websites').dropColumn('identity_mode').execute();
}
