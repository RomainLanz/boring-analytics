import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import { AllowedDomain } from '#websites/domain/allowed_domain';
import { parseWebsiteIdentityMode, type WebsiteIdentityMode } from '#websites/website_identity_mode';
import type { EventRetentionDays } from '#websites/event_retention';

export interface CreatedWebsite {
	id: string;
	name: string;
	trackingId: string;
	allowedDomain: string;
}

@inject()
export class WebsiteRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async createForOwner(ownerUserId: string, name: string, allowedDomain: AllowedDomain): Promise<CreatedWebsite> {
		const workspace = await this.transactions
			.currentDatabase()
			.selectFrom('workspaces')
			.select('id')
			.where('owner_user_id', '=', ownerUserId)
			.executeTakeFirstOrThrow();
		const website = await this.transactions
			.currentDatabase()
			.insertInto('websites')
			.values({
				id: randomUUID(),
				workspace_id: workspace.id,
				name,
				tracking_id: randomUUID(),
				allowed_domain: allowedDomain.toString(),
			})
			.returning(['id', 'name', 'tracking_id', 'allowed_domain'])
			.executeTakeFirstOrThrow();

		return {
			id: website.id,
			name: website.name,
			trackingId: website.tracking_id,
			allowedDomain: website.allowed_domain,
		};
	}

	async findCollectionTarget(trackingId: string) {
		const database = this.transactions.currentDatabase();
		const keyCandidate = await database
			.selectFrom('website_collection_keys')
			.select('website_id')
			.where('key', '=', trackingId)
			.where('revoked_at', 'is', null)
			.executeTakeFirst();

		if (!keyCandidate) {
			return null;
		}

		const website = await database
			.selectFrom('websites')
			.select(['id', 'identity_mode'])
			.where('id', '=', keyCandidate.website_id)
			.forShare()
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const collectionKey = await database
			.selectFrom('website_collection_keys')
			.select('id')
			.where('key', '=', trackingId)
			.where('website_id', '=', website.id)
			.where('revoked_at', 'is', null)
			.forUpdate()
			.executeTakeFirst();

		if (!collectionKey) {
			return null;
		}

		const persistedDomains = await database
			.selectFrom('website_allowed_domains')
			.select('hostname')
			.where('website_id', '=', website.id)
			.execute();
		const allowedDomains = persistedDomains.map(({ hostname }) => AllowedDomain.create(hostname));

		if (allowedDomains.some((domain) => !domain.ok)) {
			throw new Error(`Invalid allowed domain persisted for website ${website.id}`);
		}

		return {
			id: website.id,
			collectionKeyId: collectionKey.id,
			allowedDomains: allowedDomains.map((domain) => {
				if (!domain.ok) {
					throw new Error('The persisted domain was validated above');
				}
				return domain.value;
			}),
			identityMode: parseWebsiteIdentityMode(website.identity_mode),
		};
	}

	async markCollectionKeyUsed(collectionKeyId: string, usedAt: Date) {
		await this.transactions
			.currentDatabase()
			.updateTable('website_collection_keys')
			.set({ last_used_at: usedAt })
			.where('id', '=', collectionKeyId)
			.where('revoked_at', 'is', null)
			.execute();
	}

	async updateIdentityModeForOwner(ownerUserId: string, websiteId: string, identityMode: WebsiteIdentityMode) {
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('websites.id')
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!website) {
			return false;
		}

		await this.transactions
			.currentDatabase()
			.updateTable('websites')
			.set({ identity_mode: identityMode })
			.where('id', '=', website.id)
			.execute();
		return true;
	}

	async updateRetentionForOwner(ownerUserId: string, websiteId: string, retentionDays: EventRetentionDays) {
		const result = await this.transactions
			.currentDatabase()
			.updateTable('websites')
			.set({ retention_days: retentionDays })
			.where('id', '=', websiteId)
			.where(
				'workspace_id',
				'in',
				this.transactions
					.currentDatabase()
					.selectFrom('workspaces')
					.select('id')
					.where('owner_user_id', '=', ownerUserId),
			)
			.executeTakeFirst();

		return result.numUpdatedRows === 1n;
	}
}
