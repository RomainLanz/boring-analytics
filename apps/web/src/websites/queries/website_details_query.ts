import { inject } from '@adonisjs/core';
import { sql } from 'kysely';
import { TransactionManager } from '#shared/services/transaction_manager';

export interface WebsiteDetails {
	id: string;
	name: string;
	trackingId: string;
	allowedDomain: string;
	pageviews: number;
}

@inject()
export class WebsiteDetailsQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string): Promise<WebsiteDetails | null> {
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.leftJoin('events', 'events.website_id', 'websites.id')
			.select([
				'websites.id',
				'websites.name',
				'websites.tracking_id',
				'websites.allowed_domain',
				sql<number>`count(events.id)::integer`.as('pageviews'),
			])
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.groupBy('websites.id')
			.executeTakeFirst();

		return website
			? {
					id: website.id,
					name: website.name,
					trackingId: website.tracking_id,
					allowedDomain: website.allowed_domain,
					pageviews: website.pageviews,
				}
			: null;
	}
}
