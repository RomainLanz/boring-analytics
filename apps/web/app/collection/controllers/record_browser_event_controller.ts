import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { RecordBrowserEvent } from '#collection/actions/record_browser_event';
import {
	browserEventPathPattern,
	browserEventProtocol,
	customEventNamePattern,
	isValidDistinctId,
	isValidEventProperties,
} from '#collection/browser_event_protocol';
import type { HttpContext } from '@adonisjs/core/http';

const isoTimestampWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

function utmParameter() {
	return vine
		.string()
		.minLength(1)
		.maxLength(browserEventProtocol.maxUtmLength)
		.regex(/^[^\p{Cc}]+$/u)
		.nullable();
}

const commonFields = {
	trackingId: vine.string().uuid({ version: [4] }),
	occurredAt: vine.string().maxLength(64).regex(isoTimestampWithZone),
	path: vine.string().minLength(1).maxLength(browserEventProtocol.maxPathLength).regex(browserEventPathPattern),
	distinctId: vine.string().minLength(1).maxLength(browserEventProtocol.maxDistinctIdLength).optional(),
};
const pageviewFields = {
	...commonFields,
	name: vine.literal('$pageview'),
	referrer: vine.string().maxLength(browserEventProtocol.maxReferrerLength).nullable(),
	utmSource: utmParameter(),
	utmMedium: utmParameter(),
	utmCampaign: utmParameter(),
};
const customEventFields = {
	...commonFields,
	name: vine.string().minLength(1).maxLength(browserEventProtocol.maxNameLength).regex(customEventNamePattern),
	properties: vine.record(
		vine.unionOfTypes([vine.string(), vine.boolean({ strict: true }), vine.number({ strict: true }), vine.null()]),
	),
};
const pageviewExpectedFields = Object.keys(pageviewFields).filter((field) => field !== 'distinctId');
const customEventExpectedFields = Object.keys(customEventFields).filter((field) => field !== 'distinctId');

function hasExactFields(body: Record<string, unknown>, expectedFields: string[]) {
	const fields = Object.keys(body);
	return (
		expectedFields.every((field) => fields.includes(field)) &&
		fields.every((field) => expectedFields.includes(field) || field === 'distinctId')
	);
}

function isValidPayload(record: Record<string, unknown>, pageview: boolean, expectedFields: string[]) {
	return (
		hasExactFields(record, expectedFields) &&
		(record.distinctId === undefined || isValidDistinctId(record.distinctId)) &&
		(pageview || isValidEventProperties(record.properties))
	);
}

@inject()
export default class RecordBrowserEventController {
	static readonly pageviewValidator = vine.create(pageviewFields);
	static readonly customEventValidator = vine.create(customEventFields);

	constructor(private readonly recordBrowserEvent: RecordBrowserEvent) {}

	async execute({ request, response }: HttpContext) {
		const body: unknown = JSON.parse(request.raw() ?? 'null');

		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			return response.unprocessableEntity({
				errors: [{ message: 'The event payload must be an object' }],
			});
		}

		const record = body as Record<string, unknown>;
		const pageview = record.name === '$pageview';
		const expectedFields = pageview ? pageviewExpectedFields : customEventExpectedFields;

		if (!isValidPayload(record, pageview, expectedFields)) {
			return response.unprocessableEntity({
				errors: [{ message: `The event payload must contain only ${expectedFields.join(', ')}` }],
			});
		}

		const event = pageview
			? await request.validateUsing(RecordBrowserEventController.pageviewValidator, {
					data: {
						...record,
						referrer: record.referrer === '' ? null : record.referrer,
						utmSource: record.utmSource === '' ? null : record.utmSource,
						utmMedium: record.utmMedium === '' ? null : record.utmMedium,
						utmCampaign: record.utmCampaign === '' ? null : record.utmCampaign,
					},
				})
			: await request.validateUsing(RecordBrowserEventController.customEventValidator, { data: body });
		const occurredAt = DateTime.fromISO(event.occurredAt, { setZone: true });

		if (!occurredAt.isValid) {
			return response.unprocessableEntity({ error: 'invalid_occurred_at' });
		}

		const context = {
			trackingId: event.trackingId,
			path: event.path,
			origin: request.header('origin') ?? '',
			occurredAt: occurredAt.toJSDate(),
			ip: request.ip(),
			userAgent: request.header('user-agent') ?? '',
			distinctId: event.distinctId,
		};
		const result =
			'properties' in event
				? await this.recordBrowserEvent.execute({
						...context,
						type: 'custom',
						name: event.name,
						properties: event.properties,
					})
				: await this.recordBrowserEvent.execute({
						...context,
						type: 'pageview',
						referrer: event.referrer,
						utmSource: event.utmSource,
						utmMedium: event.utmMedium,
						utmCampaign: event.utmCampaign,
					});

		if (!result.ok) {
			return result.error.type === 'collection_forbidden'
				? response.forbidden({ error: result.error.type })
				: response.unprocessableEntity({ error: result.error.type });
		}

		return response.status(202).send(null);
	}
}
