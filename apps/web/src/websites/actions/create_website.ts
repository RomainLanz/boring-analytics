import { inject } from '@adonisjs/core';
import { err, ok, type Result } from '#core/result';
import { AllowedDomain, type InvalidAllowedDomainError } from '#websites/domain/allowed_domain';
import { WebsiteRepository, type CreatedWebsite } from '#websites/repositories/website_repository';

export interface CreateWebsiteParams {
	ownerUserId: string;
	name: string;
	allowedDomain: string;
}

interface InvalidWebsiteNameError {
	type: 'invalid_website_name';
}

type CreateWebsiteError = InvalidAllowedDomainError | InvalidWebsiteNameError;

@inject()
export class CreateWebsite {
	constructor(private readonly websites: WebsiteRepository) {}

	async execute(params: CreateWebsiteParams): Promise<Result<CreatedWebsite, CreateWebsiteError>> {
		const name = params.name.trim();
		const allowedDomain = AllowedDomain.create(params.allowedDomain);

		if (!name || name.length > 100) {
			return err({ type: 'invalid_website_name' });
		}

		if (!allowedDomain.ok) {
			return err(allowedDomain.error);
		}

		return ok(await this.websites.createForOwner(params.ownerUserId, name, allowedDomain.value));
	}
}
