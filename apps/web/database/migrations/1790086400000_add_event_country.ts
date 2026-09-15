import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema.alterTable('events').addColumn('country', 'varchar(2)').execute();
	await sql`
		alter table events
		add constraint events_country_check
			check (country is null or (source = 1 and country ~ '^[A-Z]{2}$'))
	`.execute(db);
}

export async function down(db: Kysely<unknown>) {
	await sql`
		alter table events
		drop constraint events_country_check,
		drop column country
	`.execute(db);
}
