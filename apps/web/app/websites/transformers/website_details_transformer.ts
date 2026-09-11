import { BaseTransformer } from '@adonisjs/core/transformers';
import type { WebsiteDetails } from '#websites/queries/website_details_query';

export default class WebsiteDetailsTransformer extends BaseTransformer<WebsiteDetails> {
	toObject() {
		return this.pick(this.resource, ['id', 'name', 'trackingId', 'allowedDomain', 'pageviews']);
	}
}
