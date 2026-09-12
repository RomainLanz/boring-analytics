import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { TransactionManager } from '#shared/services/transaction_manager';
import { websiteReportPeriod } from '#websites/queries/website_report_period';

export interface FunnelIndex {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
	};
	period: { startDate: string; endDate: string };
	funnels: Array<{
		id: string;
		name: string;
		conversionWindowSeconds: number;
		stepCount: number;
	}>;
}

@inject()
export class FunnelIndexQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string, now = new Date()): Promise<FunnelIndex | null> {
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

		const funnels = await database
			.selectFrom('funnels')
			.leftJoin('funnel_steps', 'funnel_steps.funnel_id', 'funnels.id')
			.select([
				'funnels.id',
				'funnels.name',
				'funnels.conversion_window_seconds',
				sql<number>`count(funnel_steps.position)::integer`.as('step_count'),
			])
			.where('funnels.website_id', '=', website.id)
			.groupBy('funnels.id')
			.orderBy('funnels.created_at', 'desc')
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
			funnels: funnels.map((funnel) => ({
				id: funnel.id,
				name: funnel.name,
				conversionWindowSeconds: funnel.conversion_window_seconds,
				stepCount: funnel.step_count,
			})),
		};
	}
}
