import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { parseFunnelFilter } from '#funnels/domain/funnel_definition';
import { TransactionManager } from '#shared/services/transaction_manager';
import { websiteReportPeriod } from '#websites/queries/website_report_period';
import type { JsonValue } from '#types/db';

interface PersistedStep {
	position: number;
	event_name: string;
	filter: JsonValue | null;
}

export interface FunnelEditor {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
	};
	period: { startDate: string; endDate: string };
	eventNames: string[];
	funnel: {
		id: string;
		name: string;
		conversionWindowSeconds: number;
		steps: Array<{
			position: number;
			eventName: string;
			filter: ReturnType<typeof parseFunnelFilter>;
		}>;
	} | null;
}

@inject()
export class FunnelEditorQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(
		websiteId: string,
		ownerUserId: string,
		funnelId?: string,
		now = new Date(),
	): Promise<FunnelEditor | null> {
		const database = this.transactions.currentDatabase();
		const website = await database
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select(['websites.id', 'websites.name', 'websites.allowed_domain', 'websites.timezone'])
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const funnel = funnelId
			? await database
					.selectFrom('funnels')
					.select([
						'id',
						'name',
						'conversion_window_seconds',
						sql<PersistedStep[]>`(
							select coalesce(
								jsonb_agg(
									jsonb_build_object(
										'position', funnel_steps.position,
										'event_name', funnel_steps.event_name,
										'filter', funnel_steps.filter
									)
									order by funnel_steps.position
								),
								'[]'::jsonb
							)
							from funnel_steps
							where funnel_steps.funnel_id = funnels.id
						)`.as('persisted_steps'),
					])
					.where('id', '=', funnelId)
					.where('website_id', '=', website.id)
					.executeTakeFirst()
			: null;

		if (funnelId && !funnel) {
			return null;
		}

		const eventRows = await database
			.selectFrom('events')
			.select('name')
			.distinct()
			.where('website_id', '=', website.id)
			.where('session_id', 'is not', null)
			.orderBy('name')
			.execute();
		const { startDate, endDate } = websiteReportPeriod(website.id, website.timezone, now);

		return {
			website: {
				id: website.id,
				name: website.name,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
			},
			period: { startDate, endDate },
			eventNames: Array.from(new Set(['$pageview', ...eventRows.map((event) => event.name)])),
			funnel: funnel
				? {
						id: funnel.id,
						name: funnel.name,
						conversionWindowSeconds: funnel.conversion_window_seconds,
						steps: funnel.persisted_steps.map((step) => ({
							position: step.position,
							eventName: step.event_name,
							filter: parseFunnelFilter(step.filter),
						})),
					}
				: null,
		};
	}
}
