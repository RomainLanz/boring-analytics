import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import { parseWebsiteIdentityMode, type WebsiteIdentityMode } from '#websites/website_identity_mode';

export interface ServerKeyMetadata {
	id: string;
	prefix: string;
	createdAt: Date;
	revokedAt: Date | null;
}

export interface ServerKeyAuthenticationTarget {
	id: string;
	websiteId: string;
	secretHash: string;
	identityMode: WebsiteIdentityMode;
}

@inject()
export class ServerKeyRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async ownerHasWebsite(ownerUserId: string, websiteId: string) {
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('websites.id')
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		return website !== undefined;
	}

	async findActiveForWebsite(websiteId: string): Promise<ServerKeyMetadata | null> {
		const key = await this.transactions
			.currentDatabase()
			.selectFrom('website_server_keys')
			.select(['id', 'prefix', 'created_at', 'revoked_at'])
			.where('website_id', '=', websiteId)
			.where('revoked_at', 'is', null)
			.executeTakeFirst();

		return key ? { id: key.id, prefix: key.prefix, createdAt: key.created_at, revokedAt: key.revoked_at } : null;
	}

	async findAuthenticationTarget(prefix: string): Promise<ServerKeyAuthenticationTarget | null> {
		const key = await this.transactions
			.currentDatabase()
			.selectFrom('website_server_keys')
			.innerJoin('websites', 'websites.id', 'website_server_keys.website_id')
			.select([
				'website_server_keys.id',
				'website_server_keys.website_id',
				'website_server_keys.secret_hash',
				'websites.identity_mode',
			])
			.where('prefix', '=', prefix)
			.where('revoked_at', 'is', null)
			.executeTakeFirst();

		return key
			? {
					id: key.id,
					websiteId: key.website_id,
					secretHash: key.secret_hash,
					identityMode: parseWebsiteIdentityMode(key.identity_mode),
				}
			: null;
	}

	async create(websiteId: string, prefix: string, secretHash: string): Promise<ServerKeyMetadata | null> {
		const key = await this.transactions
			.currentDatabase()
			.insertInto('website_server_keys')
			.values({ id: randomUUID(), website_id: websiteId, prefix, secret_hash: secretHash })
			.onConflict((conflict) => conflict.doNothing())
			.returning(['id', 'prefix', 'created_at', 'revoked_at'])
			.executeTakeFirst();

		return key ? { id: key.id, prefix: key.prefix, createdAt: key.created_at, revokedAt: key.revoked_at } : null;
	}

	async revokeActiveForWebsite(websiteId: string) {
		const key = await this.transactions
			.currentDatabase()
			.updateTable('website_server_keys')
			.set({ revoked_at: new Date() })
			.where('website_id', '=', websiteId)
			.where('revoked_at', 'is', null)
			.returning('id')
			.executeTakeFirst();

		return key !== undefined;
	}
}
