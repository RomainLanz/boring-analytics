import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import { websiteReportPeriod } from '#websites/queries/website_report_period';
import { parseWebsiteIdentityMode, type WebsiteIdentityMode } from '#websites/website_identity_mode';
import type { ServerKeyMetadata } from '#collection/repositories/server_key_repository';

export interface ServerEventSettings {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
		identityMode: WebsiteIdentityMode;
	};
	period: { startDate: string; endDate: string };
	serverKey: ServerKeyMetadata | null;
}

@inject()
export class ServerEventSettingsQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string, now = new Date()): Promise<ServerEventSettings | null> {
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

		const key = await database
			.selectFrom('website_server_keys')
			.select(['id', 'prefix', 'created_at', 'revoked_at'])
			.where('website_id', '=', website.id)
			.where('revoked_at', 'is', null)
			.executeTakeFirst();
		const { startDate, endDate } = websiteReportPeriod(website.id, website.timezone, now);

		return {
			website: {
				id: website.id,
				name: website.name,
				allowedDomain: website.allowed_domain,
				timezone: website.timezone,
				identityMode: parseWebsiteIdentityMode(website.identity_mode),
			},
			period: { startDate, endDate },
			serverKey: key ? { id: key.id, prefix: key.prefix, createdAt: key.created_at, revokedAt: key.revoked_at } : null,
		};
	}
}
