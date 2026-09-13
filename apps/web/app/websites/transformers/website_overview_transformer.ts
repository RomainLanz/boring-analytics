import { BaseTransformer } from '@adonisjs/core/transformers';
import type { WebsiteOverview } from '#websites/queries/website_overview_query';

export default class WebsiteOverviewTransformer extends BaseTransformer<WebsiteOverview> {
	toObject() {
		return this.pick(this.resource, [
			'website',
			'period',
			'dataAvailability',
			'metrics',
			'trend',
			'topPages',
			'referrers',
			'utmSources',
			'utmMediums',
			'utmCampaigns',
		]);
	}
}
