import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema.alterTable('events').addColumn('event_id', 'varchar(255)').execute();
	await sql`
		alter table events
		add constraint events_event_id_check check (
			event_id is null or (
				char_length(event_id) between 1 and 255
				and event_id !~ '[[:cntrl:][:space:]]'
			)
		)
	`.execute(db);
	await db.schema
		.createIndex('events_website_event_id_unique')
		.unique()
		.on('events')
		.columns(['website_id', 'event_id'])
		.where(sql<boolean>`event_id is not null`)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await sql`drop index if exists events_website_event_id_unique`.execute(db);
	await db.schema.alterTable('events').dropConstraint('events_event_id_check').execute();
	await db.schema.alterTable('events').dropColumn('event_id').execute();
}
