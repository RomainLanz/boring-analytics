import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.createTable('workspaces')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('owner_user_id', 'uuid', (column) => column.notNull().references('users.id').onDelete('cascade'))
		.addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addUniqueConstraint('workspaces_owner_user_id_unique', ['owner_user_id'])
		.execute();

	await db.schema
		.createTable('websites')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('workspace_id', 'uuid', (column) => column.notNull().references('workspaces.id').onDelete('cascade'))
		.addColumn('name', 'text', (column) => column.notNull())
		.addColumn('tracking_id', 'uuid', (column) => column.notNull().unique())
		.addColumn('allowed_domain', 'text', (column) => column.notNull())
		.addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.execute();

	await db.schema
		.createTable('events')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('website_id', 'uuid', (column) => column.notNull().references('websites.id').onDelete('cascade'))
		.addColumn('name', 'text', (column) => column.notNull())
		.addColumn('source', 'smallint', (column) => column.notNull())
		.addColumn('occurred_at', 'timestamptz', (column) => column.notNull())
		.addColumn('path', 'text', (column) => column.notNull())
		.addColumn('anonymous_id', 'text')
		.addColumn('session_id', 'text')
		.addColumn('referrer', 'text')
		.addColumn('utm_source', 'text')
		.addColumn('utm_medium', 'text')
		.addColumn('utm_campaign', 'text')
		.addColumn('received_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addCheckConstraint('events_source_check', sql`source in (1, 2)`)
		.execute();

	await db.schema
		.createIndex('events_website_received_at_index')
		.on('events')
		.columns(['website_id', 'received_at'])
		.execute();

	await db.schema
		.createIndex('events_website_session_id_index')
		.on('events')
		.columns(['website_id', 'session_id'])
		.where('session_id', 'is not', null)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropTable('events').execute();
	await db.schema.dropTable('websites').execute();
	await db.schema.dropTable('workspaces').execute();
}
