import { sql } from 'kysely';
import { EventSource } from '#collection/event_source';
import { db } from '#shared/services/db';
import { parseEventRetentionDays } from '#websites/event_retention';

export const OWNER_DATA_EXPORT_SCHEMA_VERSION = 1;
const DATABASE_STREAM_CHUNK_SIZE = 100;

export class OwnerDataExport {
	async *stream(ownerUserId: string, exportedAt = new Date()): AsyncGenerator<string> {
		const database = await db.startTransaction().setIsolationLevel('repeatable read').execute();
		let committed = false;

		try {
			// PostgreSQL fixes the repeatable-read snapshot at the first statement, before the response starts streaming.
			await sql`select 1`.execute(database);
			yield line({
				type: 'boring-analytics-export',
				schemaVersion: OWNER_DATA_EXPORT_SCHEMA_VERSION,
				exportedAt: exportedAt.toISOString(),
			});

			const websites = database
				.selectFrom('websites')
				.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
				.select([
					'websites.id',
					'websites.name',
					'websites.tracking_id',
					'websites.allowed_domain',
					'websites.timezone',
					'websites.identity_mode',
					'websites.retention_days',
					portableTimestamp('websites.events_available_from').as('events_available_from'),
					portableTimestamp('websites.created_at').as('created_at'),
				])
				.where('workspaces.owner_user_id', '=', ownerUserId)
				.orderBy('websites.id');

			for await (const website of websites.stream(DATABASE_STREAM_CHUNK_SIZE)) {
				yield line({
					type: 'website',
					id: website.id,
					name: website.name,
					trackingId: website.tracking_id,
					allowedDomain: website.allowed_domain,
					timezone: website.timezone,
					identityMode: website.identity_mode,
					retentionDays: parseEventRetentionDays(website.retention_days),
					eventsAvailableFrom: website.events_available_from,
					createdAt: website.created_at,
				});
			}

			const events = database
				.selectFrom('events')
				.innerJoin('websites', 'websites.id', 'events.website_id')
				.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
				.select([
					'events.id',
					'events.website_id',
					'events.name',
					'events.source',
					portableTimestamp('events.occurred_at').as('occurred_at'),
					portableTimestamp('events.received_at').as('received_at'),
					'events.path',
					'events.anonymous_id',
					'events.session_id',
					'events.distinct_id',
					'events.event_id',
					'events.referrer',
					'events.utm_source',
					'events.utm_medium',
					'events.utm_campaign',
					'events.properties',
				])
				.where('workspaces.owner_user_id', '=', ownerUserId)
				.orderBy('events.website_id')
				.orderBy('events.received_at')
				.orderBy('events.id');

			for await (const event of events.stream(DATABASE_STREAM_CHUNK_SIZE)) {
				yield line({
					type: 'event',
					id: event.id,
					websiteId: event.website_id,
					name: event.name,
					source: event.source === EventSource.Browser ? 'browser' : 'server',
					occurredAt: event.occurred_at,
					receivedAt: event.received_at,
					path: event.path,
					anonymousId: event.anonymous_id,
					sessionId: event.session_id,
					distinctId: event.distinct_id,
					eventId: event.event_id,
					referrer: event.referrer,
					utmSource: event.utm_source,
					utmMedium: event.utm_medium,
					utmCampaign: event.utm_campaign,
					properties: event.properties,
				});
			}

			const funnels = database
				.selectFrom('funnels')
				.innerJoin('websites', 'websites.id', 'funnels.website_id')
				.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
				.select([
					'funnels.id',
					'funnels.website_id',
					'funnels.name',
					'funnels.identity_kind',
					'funnels.conversion_window_seconds',
					portableTimestamp('funnels.created_at').as('created_at'),
					portableTimestamp('funnels.updated_at').as('updated_at'),
				])
				.where('workspaces.owner_user_id', '=', ownerUserId)
				.orderBy('funnels.id');

			for await (const funnel of funnels.stream(DATABASE_STREAM_CHUNK_SIZE)) {
				yield line({
					type: 'funnel',
					id: funnel.id,
					websiteId: funnel.website_id,
					name: funnel.name,
					identityKind: funnel.identity_kind,
					conversionWindowSeconds: funnel.conversion_window_seconds,
					createdAt: funnel.created_at,
					updatedAt: funnel.updated_at,
				});
			}

			const steps = database
				.selectFrom('funnel_steps')
				.innerJoin('funnels', 'funnels.id', 'funnel_steps.funnel_id')
				.innerJoin('websites', 'websites.id', 'funnels.website_id')
				.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
				.select(['funnel_steps.funnel_id', 'funnel_steps.position', 'funnel_steps.event_name', 'funnel_steps.filter'])
				.where('workspaces.owner_user_id', '=', ownerUserId)
				.orderBy('funnel_steps.funnel_id')
				.orderBy('funnel_steps.position');

			for await (const step of steps.stream(DATABASE_STREAM_CHUNK_SIZE)) {
				yield line({
					type: 'funnel-step',
					funnelId: step.funnel_id,
					position: step.position,
					eventName: step.event_name,
					filter: step.filter,
				});
			}

			await database.commit().execute();
			committed = true;
		} finally {
			if (!committed) {
				await database.rollback().execute();
			}
		}
	}
}

function line(record: Record<string, unknown>) {
	return `${JSON.stringify(record)}\n`;
}

function portableTimestamp(column: string) {
	return sql<string | null>`to_char(${sql.ref(column)} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}
