import { inject } from '@adonisjs/core';
import WebsiteOverviewTransformer from '#app/websites/transformers/website_overview_transformer';
import { appUrl } from '#config/app';
import { WebsiteOverviewQuery } from '#websites/queries/website_overview_query';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteController {
	constructor(private readonly websiteOverview: WebsiteOverviewQuery) {}

	async render({ auth, inertia, params, response }: HttpContext) {
		const overview = await this.websiteOverview.execute(params.id, auth.getUserOrFail().id);

		if (!overview) {
			return response.notFound();
		}

		return inertia.render('websites/show', {
			overview: WebsiteOverviewTransformer.transform(overview),
			trackerUrl: new URL('/tracker.js', appUrl).href,
		});
	}
}
