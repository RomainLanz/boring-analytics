import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import {
	funnelIdentityKindForWebsiteMode,
	parseFunnelIdentityKind,
	type FunnelDefinitionValue,
	type FunnelIdentityKind,
} from '#funnels/domain/funnel_definition';
import { TransactionManager } from '#shared/services/transaction_manager';
import { parseWebsiteIdentityMode } from '#websites/website_identity_mode';
import type { JsonObject } from '#types/db';

@inject()
export class FunnelRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async findIdentityKindForNewFunnel(ownerUserId: string, websiteId: string) {
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('websites.identity_mode')
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		return website ? funnelIdentityKindForWebsiteMode(parseWebsiteIdentityMode(website.identity_mode)) : null;
	}

	async findIdentityKindForExistingFunnel(ownerUserId: string, websiteId: string, funnelId: string) {
		const funnel = await this.transactions
			.currentDatabase()
			.selectFrom('funnels')
			.innerJoin('websites', 'websites.id', 'funnels.website_id')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('funnels.identity_kind')
			.where('funnels.id', '=', funnelId)
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		return funnel ? parseFunnelIdentityKind(funnel.identity_kind) : null;
	}

	async createForOwner(
		ownerUserId: string,
		websiteId: string,
		definition: FunnelDefinitionValue,
		identityKind: FunnelIdentityKind,
	) {
		const website = await this.#findOwnedWebsite(ownerUserId, websiteId);

		if (!website) {
			return null;
		}

		const funnelId = randomUUID();
		await this.transactions
			.currentDatabase()
			.insertInto('funnels')
			.values({
				id: funnelId,
				website_id: website.id,
				name: definition.name,
				conversion_window_seconds: definition.conversionWindowSeconds,
				identity_kind: identityKind,
			})
			.execute();
		await this.#insertSteps(funnelId, definition);
		return { id: funnelId };
	}

	async updateForOwner(ownerUserId: string, websiteId: string, funnelId: string, definition: FunnelDefinitionValue) {
		const funnel = await this.transactions
			.currentDatabase()
			.selectFrom('funnels')
			.innerJoin('websites', 'websites.id', 'funnels.website_id')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('funnels.id')
			.where('funnels.id', '=', funnelId)
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();

		if (!funnel) {
			return false;
		}

		await this.transactions
			.currentDatabase()
			.updateTable('funnels')
			.set({
				name: definition.name,
				conversion_window_seconds: definition.conversionWindowSeconds,
				updated_at: new Date(),
			})
			.where('id', '=', funnel.id)
			.execute();
		await this.transactions.currentDatabase().deleteFrom('funnel_steps').where('funnel_id', '=', funnel.id).execute();
		await this.#insertSteps(funnel.id, definition);
		return true;
	}

	#findOwnedWebsite(ownerUserId: string, websiteId: string) {
		return this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select('websites.id')
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirst();
	}

	async #insertSteps(funnelId: string, definition: FunnelDefinitionValue) {
		await this.transactions
			.currentDatabase()
			.insertInto('funnel_steps')
			.values(
				definition.steps.map((step, index) => ({
					funnel_id: funnelId,
					position: index + 1,
					event_name: step.eventName,
					filter: step.filter as JsonObject | null,
				})),
			)
			.execute();
	}
}
