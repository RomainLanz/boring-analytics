import { sql, type Kysely, type SqlBool } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema.alterTable('events').addColumn('properties', 'jsonb').execute();

	await db.schema
		.alterTable('events')
		.addCheckConstraint(
			'events_properties_object_check',
			sql`properties is null or jsonb_typeof(properties) = 'object'`,
		)
		.execute();

	await db.schema
		.createIndex('events_website_custom_name_occurred_at_index')
		.on('events')
		.columns(['website_id', 'name', 'occurred_at'])
		.where(sql<SqlBool>`name not like '$%'`)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropIndex('events_website_custom_name_occurred_at_index').execute();
	await db.schema.alterTable('events').dropColumn('properties').execute();
}
