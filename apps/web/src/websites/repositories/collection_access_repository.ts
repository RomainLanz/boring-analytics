import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import type { AllowedDomain } from '#websites/domain/allowed_domain';

export interface CollectionKeyMetadata {
	id: string;
	key: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
}

@inject()
export class CollectionAccessRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async lockOwnedWebsite(ownerUserId: string, websiteId: string) {
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('websites.id')
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.forUpdate('websites')
			.executeTakeFirst();

		return website !== undefined;
	}

	async countAllowedDomains(websiteId: string) {
		const result = await this.transactions
			.currentDatabase()
			.selectFrom('website_allowed_domains')
			.select(({ fn }) => fn.countAll<number>().as('count'))
			.where('website_id', '=', websiteId)
			.executeTakeFirstOrThrow();

		return Number(result.count);
	}

	async addAllowedDomain(websiteId: string, domain: AllowedDomain) {
		const inserted = await this.transactions
			.currentDatabase()
			.insertInto('website_allowed_domains')
			.values({ id: randomUUID(), website_id: websiteId, hostname: domain.toString() })
			.onConflict((conflict) => conflict.columns(['website_id', 'hostname']).doNothing())
			.returning('id')
			.executeTakeFirst();

		return inserted !== undefined;
	}

	async removeAllowedDomain(websiteId: string, domainId: string) {
		const removed = await this.transactions
			.currentDatabase()
			.deleteFrom('website_allowed_domains')
			.where('website_id', '=', websiteId)
			.where('id', '=', domainId)
			.returning('id')
			.executeTakeFirst();

		return removed !== undefined;
	}

	async syncLegacyAllowedDomain(websiteId: string) {
		const remaining = await this.transactions
			.currentDatabase()
			.selectFrom('website_allowed_domains')
			.select('hostname')
			.where('website_id', '=', websiteId)
			.orderBy('created_at')
			.orderBy('id')
			.executeTakeFirstOrThrow();

		await this.transactions
			.currentDatabase()
			.updateTable('websites')
			.set({ allowed_domain: remaining.hostname })
			.where('id', '=', websiteId)
			.execute();
	}

	async countActiveCollectionKeys(websiteId: string) {
		const result = await this.transactions
			.currentDatabase()
			.selectFrom('website_collection_keys')
			.select(({ fn }) => fn.countAll<number>().as('count'))
			.where('website_id', '=', websiteId)
			.where('revoked_at', 'is', null)
			.executeTakeFirstOrThrow();

		return Number(result.count);
	}

	async createCollectionKey(websiteId: string): Promise<CollectionKeyMetadata> {
		const key = await this.transactions
			.currentDatabase()
			.insertInto('website_collection_keys')
			.values({ id: randomUUID(), website_id: websiteId, key: randomUUID() })
			.returning(['id', 'key', 'created_at', 'last_used_at', 'revoked_at'])
			.executeTakeFirstOrThrow();

		return {
			id: key.id,
			key: key.key,
			createdAt: key.created_at,
			lastUsedAt: key.last_used_at,
			revokedAt: key.revoked_at,
		};
	}

	async activeCollectionKeyExists(websiteId: string, collectionKeyId: string) {
		const key = await this.transactions
			.currentDatabase()
			.selectFrom('website_collection_keys')
			.select('id')
			.where('website_id', '=', websiteId)
			.where('id', '=', collectionKeyId)
			.where('revoked_at', 'is', null)
			.executeTakeFirst();

		return key !== undefined;
	}

	async revokeCollectionKey(websiteId: string, collectionKeyId: string) {
		const key = await this.transactions
			.currentDatabase()
			.updateTable('website_collection_keys')
			.set({ revoked_at: new Date() })
			.where('website_id', '=', websiteId)
			.where('id', '=', collectionKeyId)
			.where('revoked_at', 'is', null)
			.returning('id')
			.executeTakeFirst();

		return key !== undefined;
	}

	async syncLegacyTrackingId(websiteId: string) {
		const active = await this.transactions
			.currentDatabase()
			.selectFrom('website_collection_keys')
			.select('key')
			.where('website_id', '=', websiteId)
			.where('revoked_at', 'is', null)
			.orderBy('created_at', 'desc')
			.orderBy('id', 'desc')
			.executeTakeFirstOrThrow();

		await this.transactions
			.currentDatabase()
			.updateTable('websites')
			.set({ tracking_id: active.key })
			.where('id', '=', websiteId)
			.execute();
	}
}
