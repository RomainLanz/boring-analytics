import { inject } from '@adonisjs/core';
import FunnelReportTransformer from '#app/funnels/transformers/funnel_report_transformer';
import { FunnelReportQuery } from '#funnels/queries/funnel_report_query';
import { parseWebsiteReportPeriodPreset } from '#websites/queries/website_report_period';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class FunnelReportController {
	constructor(private readonly funnelReport: FunnelReportQuery) {}

	async render({ auth, inertia, params, request, response }: HttpContext) {
		const periodInput: unknown = request.input('period');
		const periodPreset = parseWebsiteReportPeriodPreset(typeof periodInput === 'string' ? periodInput : undefined);
		const report = await this.funnelReport.execute(
			params.funnelId,
			params.id,
			auth.getUserOrFail().id,
			new Date(),
			periodPreset,
		);

		if (!report) {
			return response.notFound();
		}

		return inertia.render('funnels/show', { report: FunnelReportTransformer.transform(report) });
	}
}
