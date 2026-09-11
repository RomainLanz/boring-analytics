import { inject } from '@adonisjs/core';
import { EventRepository } from '#collection/repositories/event_repository';
import { err, ok, type Result } from '#core/result';
import { WebsiteRepository } from '#websites/repositories/website_repository';

export interface RecordPageviewParams {
	trackingId: string;
	origin: string;
	path: string;
}

interface CollectionForbiddenError {
	type: 'collection_forbidden';
}

@inject()
export class RecordPageview {
	constructor(
		private readonly websites: WebsiteRepository,
		private readonly events: EventRepository,
	) {}

	async execute(params: RecordPageviewParams): Promise<Result<void, CollectionForbiddenError>> {
		const target = await this.websites.findCollectionTarget(params.trackingId);

		if (!target || !target.allowedDomain.matchesOrigin(params.origin)) {
			return err({ type: 'collection_forbidden' });
		}

		await this.events.appendPageview(target.id, params.path);
		return ok(undefined);
	}
}
