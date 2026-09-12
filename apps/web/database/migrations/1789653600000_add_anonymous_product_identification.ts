import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await sql`
		alter table events
		add constraint events_identification_identity_check check (
			name <> '$identify' or (
				source = 1
				and anonymous_id is not null
				and session_id is null
				and distinct_id is not null
				and properties is null
			)
		)
	`.execute(db);
	await db.schema
		.createIndex('events_website_anonymous_identification_unique')
		.unique()
		.on('events')
		.columns(['website_id', 'anonymous_id'])
		.where(sql<boolean>`name = '$identify'`)
		.execute();
	await db.schema
		.createIndex('events_website_distinct_identification_index')
		.on('events')
		.columns(['website_id', 'distinct_id', 'anonymous_id', 'occurred_at'])
		.where(sql<boolean>`name = '$identify'`)
		.execute();
	await db.schema
		.createIndex('events_website_name_anonymous_id_occurred_at_index')
		.on('events')
		.columns(['website_id', 'name', 'anonymous_id', 'occurred_at', 'received_at', 'id'])
		.where(sql<boolean>`anonymous_id is not null and distinct_id is null`)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await sql`drop index if exists events_website_name_anonymous_id_occurred_at_index`.execute(db);
	await sql`drop index if exists events_website_distinct_identification_index`.execute(db);
	await sql`drop index if exists events_website_anonymous_identification_unique`.execute(db);
	await db.schema.alterTable('events').dropConstraint('events_identification_identity_check').execute();
}
