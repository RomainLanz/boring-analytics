import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { TransactionManager } from '#shared/services/transaction_manager';
import {
	CollectionAccessRepository,
	type CollectionKeyMetadata,
} from '#websites/repositories/collection_access_repository';

export const MAX_ACTIVE_COLLECTION_KEYS = 2;

type CreateCollectionKeyError = { type: 'website_not_found' } | { type: 'active_collection_key_limit_reached' };

@inject()
export class CreateCollectionKey {
	constructor(
		private readonly access: CollectionAccessRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(params: {
		ownerUserId: string;
		websiteId: string;
	}): Promise<Result<CollectionKeyMetadata, CreateCollectionKeyError>> {
		return this.transactions.run(async () => {
			if (!(await this.access.lockOwnedWebsite(params.ownerUserId, params.websiteId))) {
				return err({ type: 'website_not_found' });
			}

			if ((await this.access.countActiveCollectionKeys(params.websiteId)) >= MAX_ACTIVE_COLLECTION_KEYS) {
				return err({ type: 'active_collection_key_limit_reached' });
			}

			return ok(await this.access.createCollectionKey(params.websiteId));
		});
	}
}
