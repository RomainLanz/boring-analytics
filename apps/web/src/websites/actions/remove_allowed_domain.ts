import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { TransactionManager } from '#shared/services/transaction_manager';
import { CollectionAccessRepository } from '#websites/repositories/collection_access_repository';

type RemoveAllowedDomainError =
	| { type: 'website_not_found' }
	| { type: 'allowed_domain_not_found' }
	| { type: 'last_allowed_domain' };

@inject()
export class RemoveAllowedDomain {
	constructor(
		private readonly access: CollectionAccessRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(params: {
		ownerUserId: string;
		websiteId: string;
		domainId: string;
	}): Promise<Result<void, RemoveAllowedDomainError>> {
		return this.transactions.run(async () => {
			if (!(await this.access.lockOwnedWebsite(params.ownerUserId, params.websiteId))) {
				return err({ type: 'website_not_found' });
			}

			if ((await this.access.countAllowedDomains(params.websiteId)) <= 1) {
				return err({ type: 'last_allowed_domain' });
			}

			if (!(await this.access.removeAllowedDomain(params.websiteId, params.domainId))) {
				return err({ type: 'allowed_domain_not_found' });
			}

			await this.access.syncLegacyAllowedDomain(params.websiteId);
			return ok(undefined);
		});
	}
}
