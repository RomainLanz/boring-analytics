import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { TransactionManager } from '#shared/services/transaction_manager';
import { CollectionAccessRepository } from '#websites/repositories/collection_access_repository';

type RevokeCollectionKeyError =
	| { type: 'website_not_found' }
	| { type: 'collection_key_not_found' }
	| { type: 'last_active_collection_key' };

@inject()
export class RevokeCollectionKey {
	constructor(
		private readonly access: CollectionAccessRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(params: {
		ownerUserId: string;
		websiteId: string;
		collectionKeyId: string;
	}): Promise<Result<void, RevokeCollectionKeyError>> {
		return this.transactions.run(async () => {
			if (!(await this.access.lockOwnedWebsite(params.ownerUserId, params.websiteId))) {
				return err({ type: 'website_not_found' });
			}

			if (!(await this.access.activeCollectionKeyExists(params.websiteId, params.collectionKeyId))) {
				return err({ type: 'collection_key_not_found' });
			}

			if ((await this.access.countActiveCollectionKeys(params.websiteId)) <= 1) {
				return err({ type: 'last_active_collection_key' });
			}

			await this.access.revokeCollectionKey(params.websiteId, params.collectionKeyId);
			await this.access.syncLegacyTrackingId(params.websiteId);
			return ok(undefined);
		});
	}
}
