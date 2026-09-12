import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { WebsiteRepository } from '#websites/repositories/website_repository';
import type { WebsiteIdentityMode } from '#websites/website_identity_mode';

interface UpdateWebsiteIdentityModeParams {
	ownerUserId: string;
	websiteId: string;
	identityMode: WebsiteIdentityMode;
}

interface WebsiteNotFoundError {
	type: 'website_not_found';
}

@inject()
export class UpdateWebsiteIdentityMode {
	constructor(private readonly websites: WebsiteRepository) {}

	async execute(params: UpdateWebsiteIdentityModeParams): Promise<Result<void, WebsiteNotFoundError>> {
		const updated = await this.websites.updateIdentityModeForOwner(
			params.ownerUserId,
			params.websiteId,
			params.identityMode,
		);

		return updated ? ok(undefined) : err({ type: 'website_not_found' });
	}
}
