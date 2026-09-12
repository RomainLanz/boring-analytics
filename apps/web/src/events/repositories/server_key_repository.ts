import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';

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
			.select(['id', 'website_id', 'secret_hash'])
			.where('prefix', '=', prefix)
			.where('revoked_at', 'is', null)
			.executeTakeFirst();

		return key ? { id: key.id, websiteId: key.website_id, secretHash: key.secret_hash } : null;
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
