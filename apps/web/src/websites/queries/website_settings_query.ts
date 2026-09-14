import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import { parseEventRetentionDays, type EventRetentionDays } from '#websites/event_retention';
import { websiteReportPeriod } from '#websites/queries/website_report_period';
import { parseWebsiteIdentityMode, type WebsiteIdentityMode } from '#websites/website_identity_mode';

export interface WebsiteSettings {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
		identityMode: WebsiteIdentityMode;
		retentionDays: EventRetentionDays;
	};
	period: { startDate: string; endDate: string };
	allowedDomains: Array<{ id: string; hostname: string; createdAt: Date }>;
	collectionKeys: Array<{
		id: string;
		key: string;
		createdAt: Date;
		lastUsedAt: Date | null;
		status: 'active';
	}>;
}

@inject()
export class WebsiteSettingsQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string, now = new Date()): Promise<WebsiteSettings | null> {
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
				'websites.retention_days',
			])
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const allowedDomains = await database
			.selectFrom('website_allowed_domains')
			.select(['id', 'hostname', 'created_at'])
			.where('website_id', '=', website.id)
			.orderBy('created_at')
			.orderBy('id')
			.execute();
		const collectionKeys = await database
			.selectFrom('website_collection_keys')
			.select(['id', 'key', 'created_at', 'last_used_at'])
			.where('website_id', '=', website.id)
			.where('revoked_at', 'is', null)
			.orderBy('created_at', 'desc')
			.orderBy('id', 'desc')
			.execute();
		const { startDate, endDate } = websiteReportPeriod(website.id, website.timezone, now);

		return {
			website: {
				id: website.id,
				name: website.name,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
				identityMode: parseWebsiteIdentityMode(website.identity_mode),
				retentionDays: parseEventRetentionDays(website.retention_days),
			},
			period: { startDate, endDate },
			allowedDomains: allowedDomains.map((domain) => ({
				id: domain.id,
				hostname: domain.hostname,
				createdAt: domain.created_at,
			})),
			collectionKeys: collectionKeys.map((collectionKey) => ({
				id: collectionKey.id,
				key: collectionKey.key,
				createdAt: collectionKey.created_at,
				lastUsedAt: collectionKey.last_used_at,
				status: 'active',
			})),
		};
	}
}
