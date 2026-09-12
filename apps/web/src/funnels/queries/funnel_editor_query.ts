import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import {
	funnelIdentityKindForWebsiteMode,
	parseFunnelFilter,
	parseFunnelIdentityKind,
	type FunnelIdentityKind,
} from '#funnels/domain/funnel_definition';
import { TransactionManager } from '#shared/services/transaction_manager';
import { websiteReportPeriod } from '#websites/queries/website_report_period';
import { parseWebsiteIdentityMode, type WebsiteIdentityMode } from '#websites/website_identity_mode';
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
		identityMode: WebsiteIdentityMode;
	};
	period: { startDate: string; endDate: string };
	eventNames: string[];
	funnel: {
		id: string;
		name: string;
		conversionWindowSeconds: number;
		identityKind: FunnelIdentityKind;
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
			.select([
				'websites.id',
				'websites.name',
				'websites.allowed_domain',
				'websites.timezone',
				'websites.identity_mode',
			])
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
						'identity_kind',
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

		const identityMode = parseWebsiteIdentityMode(website.identity_mode);
		const identityKind = funnel
			? parseFunnelIdentityKind(funnel.identity_kind)
			: funnelIdentityKindForWebsiteMode(identityMode);
		let eventNamesQuery = database.selectFrom('events').select('name').distinct().where('website_id', '=', website.id);
		eventNamesQuery =
			identityKind === 'distinct_id'
				? eventNamesQuery.where('distinct_id', 'is not', null)
				: eventNamesQuery.where('session_id', 'is not', null);
		const eventRows = await eventNamesQuery.orderBy('name').execute();
		const { startDate, endDate } = websiteReportPeriod(website.id, website.timezone, now);

		return {
			website: {
				id: website.id,
				name: website.name,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
				identityMode,
			},
			period: { startDate, endDate },
			eventNames: Array.from(new Set(['$pageview', ...eventRows.map((event) => event.name)])),
			funnel: funnel
				? {
						id: funnel.id,
						name: funnel.name,
						conversionWindowSeconds: funnel.conversion_window_seconds,
						identityKind,
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
