import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { createFunnelDefinition, type FunnelDefinitionValue } from '#funnels/domain/funnel_definition';
import { FunnelRepository } from '#funnels/repositories/funnel_repository';
import { TransactionManager } from '#shared/services/transaction_manager';

type UpdateFunnelError = { type: 'funnel_not_found' } | { type: 'invalid_funnel_definition' };

@inject()
export class UpdateFunnel {
	constructor(
		private readonly funnels: FunnelRepository,
		private readonly transactions: TransactionManager,
	) {}

	async execute(
		params: FunnelDefinitionValue & { ownerUserId: string; websiteId: string; funnelId: string },
	): Promise<Result<void, UpdateFunnelError>> {
		const definition = createFunnelDefinition(params);

		if (!definition.ok) {
			return definition;
		}

		return this.transactions.run(async () => {
			const updated = await this.funnels.updateForOwner(
				params.ownerUserId,
				params.websiteId,
				params.funnelId,
				definition.value,
			);
			return updated ? ok(undefined) : err({ type: 'funnel_not_found' });
		});
	}
}
