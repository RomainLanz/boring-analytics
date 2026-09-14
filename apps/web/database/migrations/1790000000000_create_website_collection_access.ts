import { sql, type Kysely } from 'kysely';

export async function up<TDatabase>(db: Kysely<TDatabase>) {
	// Close the gap between backfill and trigger creation for old application instances still inserting Websites.
	await sql`lock table websites in share row exclusive mode`.execute(db);

	await db.schema
		.createTable('website_allowed_domains')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('website_id', 'uuid', (column) => column.notNull().references('websites.id').onDelete('cascade'))
		.addColumn('hostname', 'text', (column) => column.notNull())
		.addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addUniqueConstraint('website_allowed_domains_website_hostname_unique', ['website_id', 'hostname'])
		.execute();

	await sql`
		insert into website_allowed_domains (id, website_id, hostname, created_at)
		select gen_random_uuid(), id, regexp_replace(lower(btrim(allowed_domain)), '[.]$', ''), created_at
		from websites
	`.execute(db);

	await db.schema
		.createTable('website_collection_keys')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('website_id', 'uuid', (column) => column.notNull().references('websites.id').onDelete('cascade'))
		.addColumn('key', 'uuid', (column) => column.notNull().unique())
		.addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addColumn('last_used_at', 'timestamptz')
		.addColumn('revoked_at', 'timestamptz')
		.execute();

	await sql`
		insert into website_collection_keys (id, website_id, key, created_at)
		select gen_random_uuid(), id, tracking_id, created_at
		from websites
	`.execute(db);

	await db.schema
		.createIndex('website_collection_keys_website_active_index')
		.on('website_collection_keys')
		.column('website_id')
		.where(sql.ref('revoked_at'), 'is', null)
		.execute();

	// Keep Websites created by an older application instance safe during a rolling deployment.
	await sql`
		create function initialize_website_collection_access() returns trigger as $$
		begin
			insert into website_allowed_domains (id, website_id, hostname, created_at)
			values (gen_random_uuid(), new.id, regexp_replace(lower(btrim(new.allowed_domain)), '[.]$', ''), new.created_at);
			insert into website_collection_keys (id, website_id, key, created_at)
			values (gen_random_uuid(), new.id, new.tracking_id, new.created_at);
			return new;
		end;
		$$ language plpgsql
	`.execute(db);
	await sql`
		create trigger websites_initialize_collection_access
		after insert on websites
		for each row execute function initialize_website_collection_access()
	`.execute(db);
}

export async function down<TDatabase>(db: Kysely<TDatabase>) {
	await sql`drop trigger if exists websites_initialize_collection_access on websites`.execute(db);
	await sql`drop function if exists initialize_website_collection_access()`.execute(db);
	await db.schema.dropTable('website_collection_keys').execute();
	await db.schema.dropTable('website_allowed_domains').execute();
}
