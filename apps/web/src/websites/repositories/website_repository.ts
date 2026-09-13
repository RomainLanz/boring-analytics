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
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.select(['id', 'allowed_domain', 'identity_mode'])
			.where('tracking_id', '=', trackingId)
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const allowedDomain = AllowedDomain.create(website.allowed_domain);

		if (!allowedDomain.ok) {
			throw new Error(`Invalid allowed domain persisted for website ${website.id}`);
		}

		return {
			id: website.id,
			allowedDomain: allowedDomain.value,
			identityMode: parseWebsiteIdentityMode(website.identity_mode),
		};
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
