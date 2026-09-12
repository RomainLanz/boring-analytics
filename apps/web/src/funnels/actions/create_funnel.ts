import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { createFunnelDefinition, type FunnelDefinitionValue } from '#funnels/domain/funnel_definition';
import { FunnelRepository } from '#funnels/repositories/funnel_repository';
import { TransactionManager } from '#shared/services/transaction_manager';

type CreateFunnelError = { type: 'website_not_found' } | { type: 'invalid_funnel_definition' };

@inject()
export class CreateFunnel {
	constructor(
		private readonly funnels: FunnelRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(
		params: FunnelDefinitionValue & { ownerUserId: string; websiteId: string },
	): Promise<Result<{ id: string }, CreateFunnelError>> {
		return this.transactions.run(async () => {
			const identityKind = await this.funnels.findIdentityKindForNewFunnel(params.ownerUserId, params.websiteId);

			if (!identityKind) {
				return err({ type: 'website_not_found' });
			}

			const definition = createFunnelDefinition(params, identityKind);

			if (!definition.ok) {
				return definition;
			}

			const funnel = await this.funnels.createForOwner(
				params.ownerUserId,
				params.websiteId,
				definition.value,
				identityKind,
			);
			return funnel ? ok(funnel) : err({ type: 'website_not_found' });
		});
	}
}
