import { inject } from '@adonisjs/core';
import WebsiteOverviewTransformer from '#app/websites/transformers/website_overview_transformer';
import { appUrl } from '#config/app';
import { WebsiteOverviewQuery } from '#websites/queries/website_overview_query';
import { parseWebsiteReportPeriodPreset } from '#websites/queries/website_report_period';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteController {
	constructor(private readonly websiteOverview: WebsiteOverviewQuery) {}

	async render({ auth, inertia, params, request, response }: HttpContext) {
		const periodInput: unknown = request.input('period');
		const periodPreset = parseWebsiteReportPeriodPreset(typeof periodInput === 'string' ? periodInput : undefined);
		const overview = await this.websiteOverview.execute(params.id, auth.getUserOrFail().id, new Date(), periodPreset);

		if (!overview) {
			return response.notFound();
		}

		return inertia.render('websites/show', {
			overview: WebsiteOverviewTransformer.transform(overview),
			trackerUrl: new URL('/tracker.js', appUrl).href,
		});
	}
}
