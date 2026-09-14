import { BaseTransformer } from '@adonisjs/core/transformers';
import type { WebsiteEventsReport } from '#websites/queries/website_events_query';

export default class WebsiteEventsTransformer extends BaseTransformer<WebsiteEventsReport> {
	toObject() {
		return this.pick(this.resource, [
			'website',
			'period',
			'dataAvailability',
			'activeFilter',
			'events',
			'selectedEvent',
		]);
	}
}
