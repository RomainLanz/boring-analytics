import { inject } from '@adonisjs/core';
import ServerEventSettingsTransformer from '#app/collection/transformers/server_event_settings_transformer';
import { ServerEventSettingsQuery } from '#collection/queries/server_event_settings_query';
import { appUrl } from '#config/app';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class ServerEventSettingsController {
	constructor(private readonly serverEventSettings: ServerEventSettingsQuery) {}

	async render({ auth, inertia, params, response }: HttpContext) {
		const settings = await this.serverEventSettings.execute(params.id, auth.getUserOrFail().id);

		if (!settings) {
			return response.notFound();
		}

		return inertia.render('websites/settings', {
			settings: ServerEventSettingsTransformer.transform(settings),
			serverEventsUrl: new URL('/api/server/events', appUrl).href,
		});
	}
}
