import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { TransactionManager } from '#shared/services/transaction_manager';
import { AllowedDomain, type InvalidAllowedDomainError } from '#websites/domain/allowed_domain';
import { CollectionAccessRepository } from '#websites/repositories/collection_access_repository';

export const MAX_ALLOWED_DOMAINS = 5;

type AddAllowedDomainError =
	| InvalidAllowedDomainError
	| { type: 'website_not_found' }
	| { type: 'allowed_domain_exists' }
	| { type: 'allowed_domain_limit_reached' };

@inject()
export class AddAllowedDomain {
	constructor(
		private readonly access: CollectionAccessRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(params: {
		ownerUserId: string;
		websiteId: string;
		hostname: string;
	}): Promise<Result<void, AddAllowedDomainError>> {
		const domain = AllowedDomain.create(params.hostname);

		if (!domain.ok) {
			return err(domain.error);
		}

		return this.transactions.run(async () => {
			if (!(await this.access.lockOwnedWebsite(params.ownerUserId, params.websiteId))) {
				return err({ type: 'website_not_found' });
			}

			if ((await this.access.countAllowedDomains(params.websiteId)) >= MAX_ALLOWED_DOMAINS) {
				return err({ type: 'allowed_domain_limit_reached' });
			}

			if (!(await this.access.addAllowedDomain(params.websiteId, domain.value))) {
				return err({ type: 'allowed_domain_exists' });
			}

			return ok(undefined);
		});
	}
}
