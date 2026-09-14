import { inject } from '@adonisjs/core';
import WebsiteEventsTransformer from '#app/websites/transformers/website_events_transformer';
import { parseWebsiteEventsFilter } from '#app/websites/website_events_filter';
import { WebsiteEventsQuery } from '#websites/queries/website_events_query';
import { parseWebsiteReportPeriodPreset } from '#websites/queries/website_report_period';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteEventsController {
	constructor(private readonly websiteEvents: WebsiteEventsQuery) {}

	async render({ auth, inertia, params, request, response }: HttpContext) {
		const eventInput: unknown = request.input('event');
		const selectedName = typeof eventInput === 'string' ? eventInput : undefined;
		const periodInput: unknown = request.input('period');
		const periodPreset = parseWebsiteReportPeriodPreset(typeof periodInput === 'string' ? periodInput : undefined);
		const sourceInput: unknown = request.input('source');
		const propertyInput: unknown = request.input('property');
		const valueInput: unknown = request.input('value');
		const hasFilterInput = sourceInput !== undefined || propertyInput !== undefined || valueInput !== undefined;
		const filter = parseWebsiteEventsFilter({ source: sourceInput, property: propertyInput, value: valueInput });
		const report = await this.websiteEvents.execute(params.id, auth.getUserOrFail().id, {
			selectedName,
			periodPreset,
			filter: filter ?? undefined,
		});

		if (!report) {
			return response.notFound();
		}
		const selectedEventChanged = selectedName !== undefined && selectedName !== report.selectedEvent?.name;
		const filterChanged = hasFilterInput && (filter === null || !sameFilter(filter, report.activeFilter));
		const invalidPeriod = periodInput !== undefined && periodInput !== String(periodPreset);

		if (selectedEventChanged || filterChanged || invalidPeriod || (hasFilterInput && selectedName === undefined)) {
			const canonical = canonicalReportLocation(params.id, report);
			return response.redirect().withQs(false).withQs(canonical.query).toPath(canonical.path);
		}

		return inertia.render('websites/events', {
			report: WebsiteEventsTransformer.transform(report),
		});
	}
}

function sameFilter(
	left: ReturnType<typeof parseWebsiteEventsFilter>,
	right: ReturnType<typeof parseWebsiteEventsFilter>,
) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalReportLocation(
	websiteId: string,
	report: NonNullable<Awaited<ReturnType<WebsiteEventsQuery['execute']>>>,
) {
	const query: Record<string, string> = { period: String(report.period.preset) };

	if (report.selectedEvent) {
		query.event = report.selectedEvent.name;
	}

	if (report.activeFilter?.kind === 'source') {
		query.source = report.activeFilter.value;
	} else if (report.activeFilter?.kind === 'property') {
		query.property = report.activeFilter.key;
		query.value = JSON.stringify(report.activeFilter.value);
	}

	return { path: `/websites/${websiteId}/events`, query };
}
