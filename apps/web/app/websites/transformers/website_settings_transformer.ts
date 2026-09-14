import { BaseTransformer } from '@adonisjs/core/transformers';
import type { ServerEventSettings } from '#collection/queries/server_event_settings_query';
import type { WebsiteSettings } from '#websites/queries/website_settings_query';

export type WebsiteSettingsPage = WebsiteSettings & ServerEventSettings;

export default class WebsiteSettingsTransformer extends BaseTransformer<WebsiteSettingsPage> {
	toObject() {
		return this.pick(this.resource, ['website', 'period', 'serverKey', 'allowedDomains', 'collectionKeys']);
	}
}
