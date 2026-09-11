import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import { AllowedDomain } from '#websites/domain/allowed_domain';

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
			.select(['id', 'allowed_domain'])
			.where('tracking_id', '=', trackingId)
			.executeTakeFirst();

		if (!website) {
			return null;
		}

		const allowedDomain = AllowedDomain.create(website.allowed_domain);

		if (!allowedDomain.ok) {
			throw new Error(`Invalid allowed domain persisted for website ${website.id}`);
		}

		return { id: website.id, allowedDomain: allowedDomain.value };
	}
}
