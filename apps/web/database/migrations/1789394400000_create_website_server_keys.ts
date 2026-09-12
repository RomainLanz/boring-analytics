import { sql, type Kysely, type SqlBool } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.createTable('website_server_keys')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('website_id', 'uuid', (column) => column.notNull().references('websites.id').onDelete('cascade'))
		.addColumn('prefix', 'text', (column) => column.notNull().unique())
		.addColumn('secret_hash', 'text', (column) => column.notNull())
		.addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addColumn('revoked_at', 'timestamptz')
		.execute();

	await db.schema
		.createIndex('website_server_keys_one_active_per_website')
		.unique()
		.on('website_server_keys')
		.column('website_id')
		.where(sql<SqlBool>`revoked_at is null`)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropTable('website_server_keys').execute();
}
