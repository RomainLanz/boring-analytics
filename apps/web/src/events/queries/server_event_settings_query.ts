import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import type { ServerKeyMetadata } from '#collection/repositories/server_key_repository';

export interface ServerEventSettings {
	serverKey: ServerKeyMetadata | null;
}

@inject()
export class ServerEventSettingsQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string): Promise<ServerEventSettings | null> {
		const database = this.transactions.currentDatabase();
		const website = await database
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('websites.id')
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
		return {
			serverKey: key ? { id: key.id, prefix: key.prefix, createdAt: key.created_at, revokedAt: key.revoked_at } : null,
		};
	}
}
