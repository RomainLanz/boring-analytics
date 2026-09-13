import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { RecordBrowserEvent, type RecordBrowserEventParams } from '#collection/actions/record_browser_event';
import { RecordBrowserEventBatch } from '#collection/actions/record_browser_event_batch';
import {
	browserEventPathPattern,
	browserEventProtocol,
	customEventNamePattern,
	isValidDistinctId,
	isValidEventId,
	isValidEventProperties,
	isValidSessionId,
} from '#collection/browser_event_protocol';
import { consumeAdditionalCollectionSourceEvents } from '#start/limiter';
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
	eventId: vine.string().minLength(1).maxLength(browserEventProtocol.maxEventIdLength).optional(),
	sessionId: vine
		.string()
		.uuid({ version: [4] })
		.optional(),
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
const identifyFields = {
	...commonFields,
	name: vine.literal('$identify'),
	distinctId: vine.string().minLength(1).maxLength(browserEventProtocol.maxDistinctIdLength),
};
const optionalFields = ['distinctId', 'eventId', 'sessionId'];
const pageviewExpectedFields = Object.keys(pageviewFields).filter((field) => !optionalFields.includes(field));
const customEventExpectedFields = Object.keys(customEventFields).filter((field) => !optionalFields.includes(field));
const identifyExpectedFields = Object.keys(identifyFields).filter((field) => !['eventId', 'sessionId'].includes(field));
type BrowserEventKind = 'pageview' | 'identify' | 'custom';
const expectedFieldsByKind: Record<BrowserEventKind, string[]> = {
	pageview: pageviewExpectedFields,
	identify: identifyExpectedFields,
	custom: customEventExpectedFields,
};

function browserEventKind(name: unknown): BrowserEventKind {
	if (name === '$pageview') {
		return 'pageview';
	}

	return name === '$identify' ? 'identify' : 'custom';
}

function hasExactFields(body: Record<string, unknown>, expectedFields: string[]) {
	const fields = Object.keys(body);
	return (
		expectedFields.every((field) => fields.includes(field)) &&
		fields.every((field) => expectedFields.includes(field) || optionalFields.includes(field))
	);
}

function isValidPayload(record: Record<string, unknown>, custom: boolean, expectedFields: string[]) {
	return (
		hasExactFields(record, expectedFields) &&
		(record.distinctId === undefined || isValidDistinctId(record.distinctId)) &&
		(record.eventId === undefined || isValidEventId(record.eventId)) &&
		(record.sessionId === undefined || isValidSessionId(record.sessionId)) &&
		(!custom || isValidEventProperties(record.properties))
	);
}

const pageviewValidator = vine.create(pageviewFields);
const customEventValidator = vine.create(customEventFields);
const identifyValidator = vine.create(identifyFields);

type DeliveryError = { error: string } | { errors: { message: string }[] };
type Prepared<T> = { ok: true; value: T } | { ok: false; error: DeliveryError };

interface BrowserSubmission {
	batch: boolean;
	records: unknown[];
	trackingId?: unknown;
}

function prepareSubmission(body: unknown): Prepared<BrowserSubmission> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return { ok: false, error: { errors: [{ message: 'The event payload must be an object' }] } };
	}

	const submitted = body as Record<string, unknown>;
	const batch = 'events' in submitted;
	const records = batch ? submitted.events : [submitted];

	if (!batch) {
		return { ok: true, value: { batch, records: records as unknown[] } };
	}

	if (
		Object.keys(submitted).length !== 2 ||
		!Object.hasOwn(submitted, 'trackingId') ||
		!Array.isArray(records) ||
		records.length < 1 ||
		records.length > browserEventProtocol.maxBatchEvents
	) {
		return {
			ok: false,
			error: {
				errors: [{ message: `A batch must contain between 1 and ${browserEventProtocol.maxBatchEvents} events` }],
			},
		};
	}

	return { ok: true, value: { batch, records, trackingId: submitted.trackingId } };
}

async function prepareEvent(
	request: HttpContext['request'],
	submittedEvent: unknown,
	trackingId?: unknown,
): Promise<Prepared<RecordBrowserEventParams>> {
	if (typeof submittedEvent !== 'object' || submittedEvent === null || Array.isArray(submittedEvent)) {
		return { ok: false, error: { errors: [{ message: 'Each event must be an object' }] } };
	}

	const record: Record<string, unknown> = {
		...(submittedEvent as Record<string, unknown>),
		...(trackingId === undefined ? {} : { trackingId }),
	};
	const eventKind = browserEventKind(record.name);
	const expectedFields = expectedFieldsByKind[eventKind];

	if (!isValidPayload(record, eventKind === 'custom', expectedFields)) {
		return {
			ok: false,
			error: { errors: [{ message: `The event payload must contain only ${expectedFields.join(', ')}` }] },
		};
	}

	const event =
		eventKind === 'pageview'
			? await request.validateUsing(pageviewValidator, {
					data: {
						...record,
						referrer: record.referrer === '' ? null : record.referrer,
						utmSource: record.utmSource === '' ? null : record.utmSource,
						utmMedium: record.utmMedium === '' ? null : record.utmMedium,
						utmCampaign: record.utmCampaign === '' ? null : record.utmCampaign,
					},
				})
			: eventKind === 'identify'
				? await request.validateUsing(identifyValidator, { data: record })
				: await request.validateUsing(customEventValidator, { data: record });
	const occurredAt = DateTime.fromISO(event.occurredAt, { setZone: true });

	if (!occurredAt.isValid) {
		return { ok: false, error: { error: 'invalid_occurred_at' } };
	}

	const context = {
		trackingId: event.trackingId,
		path: event.path,
		origin: request.header('origin') ?? '',
		occurredAt: occurredAt.toJSDate(),
		ip: request.ip(),
		userAgent: request.header('user-agent') ?? '',
		distinctId: event.distinctId,
		eventId: event.eventId,
		sessionId: event.sessionId,
	};
	const value: RecordBrowserEventParams =
		'properties' in event
			? { ...context, type: 'custom', name: event.name, properties: event.properties }
			: event.name === '$identify'
				? { ...context, type: 'identify', distinctId: event.distinctId }
				: {
						...context,
						type: 'pageview',
						referrer: event.referrer,
						utmSource: event.utmSource,
						utmMedium: event.utmMedium,
						utmCampaign: event.utmCampaign,
					};

	return { ok: true, value };
}

@inject()
export default class RecordBrowserEventController {
	constructor(
		private readonly recordBrowserEvent: RecordBrowserEvent,
		private readonly recordBrowserEventBatch: RecordBrowserEventBatch,
	) {}

	async execute({ request, response }: HttpContext) {
		const body: unknown = JSON.parse(request.raw() ?? 'null');
		const submission = prepareSubmission(body);

		if (!submission.ok) {
			return response.unprocessableEntity(submission.error);
		}

		await consumeAdditionalCollectionSourceEvents(request.ip(), submission.value.records.length);

		const events: RecordBrowserEventParams[] = [];

		for (const submittedEvent of submission.value.records) {
			const event = await prepareEvent(request, submittedEvent, submission.value.trackingId);

			if (!event.ok) {
				return response.unprocessableEntity(event.error);
			}

			events.push(event.value);
		}

		const result = submission.value.batch
			? await this.recordBrowserEventBatch.execute(events)
			: await this.recordBrowserEvent.execute(events[0]!);

		if (!result.ok) {
			const error = 'error' in result.error ? result.error.error : result.error;
			const payload = {
				error: error.type,
				...('index' in result.error ? { index: result.error.index } : {}),
			};
			return error.type === 'collection_forbidden'
				? response.forbidden(payload)
				: response.unprocessableEntity(payload);
		}

		return response.status(202).send(null);
	}
}
