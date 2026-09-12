import { randomBytes } from 'node:crypto';
import { inject } from '@adonisjs/core';
import hash from '@adonisjs/core/services/hash';
import { ServerKeyRepository, type ServerKeyMetadata } from '#collection/repositories/server_key_repository';
import { err, ok, type Result } from '#core/result';

type CreateServerKeyError = { type: 'website_not_found' } | { type: 'active_server_key_exists' };

export interface CreatedServerKey extends ServerKeyMetadata {
	secret: string;
}

@inject()
export class CreateServerKey {
	constructor(private readonly serverKeys: ServerKeyRepository) {}

	async execute(params: {
		ownerUserId: string;
		websiteId: string;
	}): Promise<Result<CreatedServerKey, CreateServerKeyError>> {
		if (!(await this.serverKeys.ownerHasWebsite(params.ownerUserId, params.websiteId))) {
			return err({ type: 'website_not_found' });
		}

		if (await this.serverKeys.findActiveForWebsite(params.websiteId)) {
			return err({ type: 'active_server_key_exists' });
		}

		const prefix = `ba_sk_${randomBytes(9).toString('base64url')}`;
		const secret = `${prefix}_${randomBytes(32).toString('base64url')}`;
		const metadata = await this.serverKeys.create(params.websiteId, prefix, await hash.make(secret));

		if (!metadata) {
			return err({ type: 'active_server_key_exists' });
		}

		return ok({ ...metadata, secret });
	}
}
