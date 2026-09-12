import { inject } from '@adonisjs/core';
import { ServerKeyRepository } from '#collection/repositories/server_key_repository';
import { err, ok, type Result } from '#core/result';

type RevokeServerKeyError = { type: 'website_not_found' } | { type: 'active_server_key_not_found' };

@inject()
export class RevokeServerKey {
	constructor(private readonly serverKeys: ServerKeyRepository) {}

	async execute(params: { ownerUserId: string; websiteId: string }): Promise<Result<void, RevokeServerKeyError>> {
		if (!(await this.serverKeys.ownerHasWebsite(params.ownerUserId, params.websiteId))) {
			return err({ type: 'website_not_found' });
		}

		if (!(await this.serverKeys.revokeActiveForWebsite(params.websiteId))) {
			return err({ type: 'active_server_key_not_found' });
		}

		return ok(undefined);
	}
}
