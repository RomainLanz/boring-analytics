import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.createTable('funnels')
		.addColumn('id', 'uuid', (column) => column.primaryKey())
		.addColumn('website_id', 'uuid', (column) => column.notNull().references('websites.id').onDelete('cascade'))
		.addColumn('name', 'text', (column) => column.notNull())
		.addColumn('conversion_window_seconds', 'integer', (column) => column.notNull())
		.addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
		.addCheckConstraint('funnels_name_check', sql`length(trim(name)) between 1 and 100`)
		.addCheckConstraint('funnels_conversion_window_check', sql`conversion_window_seconds between 1 and 1800`)
		.execute();

	await db.schema
		.createTable('funnel_steps')
		.addColumn('funnel_id', 'uuid', (column) => column.notNull().references('funnels.id').onDelete('cascade'))
		.addColumn('position', 'smallint', (column) => column.notNull())
		.addColumn('event_name', 'text', (column) => column.notNull())
		.addColumn('filter', 'jsonb')
		.addPrimaryKeyConstraint('funnel_steps_primary', ['funnel_id', 'position'])
		.addCheckConstraint('funnel_steps_position_check', sql`position > 0`)
		.addCheckConstraint('funnel_steps_event_name_check', sql`length(event_name) between 1 and 64`)
		.addCheckConstraint(
			'funnel_steps_filter_check',
			sql`filter is null or (
				jsonb_typeof(filter) = 'object'
				and (
					(
						filter->>'field' = 'path'
						and jsonb_typeof(filter->'value') = 'string'
						and length(filter->>'value') <= 2048
					)
					or (
						filter->>'field' = 'property'
						and jsonb_typeof(filter->'key') = 'string'
						and length(filter->>'key') between 1 and 64
						and jsonb_typeof(filter->'value') in ('string', 'number', 'boolean', 'null')
						and (jsonb_typeof(filter->'value') <> 'string' or length(filter->>'value') <= 255)
					)
				)
			) is true`,
		)
		.execute();

	await db.schema
		.createIndex('events_website_name_session_occurred_at_index')
		.on('events')
		.columns(['website_id', 'name', 'session_id', 'occurred_at', 'received_at', 'id'])
		.where('session_id', 'is not', null)
		.execute();
}

export async function down(db: Kysely<unknown>) {
	await db.schema.dropIndex('events_website_name_session_occurred_at_index').execute();
	await db.schema.dropTable('funnel_steps').execute();
	await db.schema.dropTable('funnels').execute();
}
