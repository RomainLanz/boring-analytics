import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
	await db.schema
		.alterTable('events')
		.addColumn('browser', 'varchar(16)')
		.addColumn('operating_system', 'varchar(16)')
		.addColumn('device', 'varchar(16)')
		.execute();
	await sql`
		alter table events
		add constraint events_browser_check
			check (browser is null or browser in ('Edge', 'Chrome', 'Safari', 'Firefox', 'Bot', 'Other', 'Unknown')),
		add constraint events_operating_system_check
			check (operating_system is null or operating_system in ('Windows', 'macOS', 'iOS', 'Android', 'Linux', 'Other', 'Unknown')),
		add constraint events_device_check
			check (device is null or device in ('Desktop', 'Mobile', 'Tablet', 'Bot', 'Other', 'Unknown')),
		add constraint events_technical_dimensions_completeness_check
			check (
				(browser is null and operating_system is null and device is null)
				or (browser is not null and operating_system is not null and device is not null)
			)
	`.execute(db);
}

export async function down(db: Kysely<unknown>) {
	await sql`
		alter table events
		drop constraint if exists events_technical_dimensions_completeness_check,
		drop constraint events_device_check,
		drop constraint events_operating_system_check,
		drop constraint events_browser_check,
		drop column device,
		drop column operating_system,
		drop column browser
	`.execute(db);
}
