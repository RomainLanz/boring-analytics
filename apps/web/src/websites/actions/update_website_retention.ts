import { inject } from '@adonisjs/core';
import { WebsiteRepository } from '#websites/repositories/website_repository';
import type { EventRetentionDays } from '#websites/event_retention';

export interface UpdateWebsiteRetentionParams {
	ownerUserId: string;
	websiteId: string;
	retentionDays: EventRetentionDays;
}

@inject()
export class UpdateWebsiteRetention {
	constructor(private readonly websites: WebsiteRepository) {}

	execute(params: UpdateWebsiteRetentionParams) {
		return this.websites.updateRetentionForOwner(params.ownerUserId, params.websiteId, params.retentionDays);
	}
}
