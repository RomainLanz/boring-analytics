import { inject } from '@adonisjs/core';
import WebsiteSettingsTransformer from '#app/websites/transformers/website_settings_transformer';
import { ServerEventSettingsQuery } from '#collection/queries/server_event_settings_query';
import { appUrl } from '#config/app';
import { WebsiteSettingsQuery } from '#websites/queries/website_settings_query';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteSettingsController {
	constructor(
		private readonly websiteSettings: WebsiteSettingsQuery,
		private readonly serverEventSettings: ServerEventSettingsQuery,
	) {}

	async render({ auth, inertia, params, response }: HttpContext) {
		const ownerUserId = auth.getUserOrFail().id;
		const [settings, serverEvents] = await Promise.all([
			this.websiteSettings.execute(params.id, ownerUserId),
			this.serverEventSettings.execute(params.id, ownerUserId),
		]);

		if (!settings || !serverEvents) {
			return response.notFound();
		}

		return inertia.render('websites/settings', {
			settings: WebsiteSettingsTransformer.transform({ ...settings, ...serverEvents }),
			serverEventsUrl: new URL('/api/server/events', appUrl).href,
			trackerUrl: new URL('/tracker.js', appUrl).href,
		});
	}
}
