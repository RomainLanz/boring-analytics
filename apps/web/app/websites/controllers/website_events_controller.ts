import { inject } from '@adonisjs/core';
import WebsiteEventsTransformer from '#app/websites/transformers/website_events_transformer';
import { WebsiteEventsQuery } from '#websites/queries/website_events_query';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteEventsController {
	constructor(private readonly websiteEvents: WebsiteEventsQuery) {}

	async render({ auth, inertia, params, request, response }: HttpContext) {
		const eventInput: unknown = request.input('event');
		const selectedName = typeof eventInput === 'string' ? eventInput : undefined;
		const report = await this.websiteEvents.execute(params.id, auth.getUserOrFail().id, selectedName);

		if (!report) {
			return response.notFound();
		}

		return inertia.render('websites/events', {
			report: WebsiteEventsTransformer.transform(report),
		});
	}
}
