import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { RecordServerEvent, type RecordServerEventParams } from '#collection/actions/record_server_event';
import { RecordServerEventBatch } from '#collection/actions/record_server_event_batch';
import {
	browserEventPathPattern,
	browserEventProtocol,
	customEventNamePattern,
	isValidDistinctId,
	isValidEventId,
	isValidEventProperties,
} from '#collection/browser_event_protocol';
import { ServerKeyAuthenticator } from '#collection/services/server_key_authenticator';
import {
	serverAuthenticationFailures,
	serverEventRateLimitKey,
	serverEventsPerKey,
	serverKeyVerifications,
} from '#start/limiter';
import type { ServerKeyAuthenticationTarget } from '#collection/repositories/server_key_repository';
import type { HttpContext } from '@adonisjs/core/http';

const isoTimestampWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const fields = {
	name: vine.string().minLength(1).maxLength(browserEventProtocol.maxNameLength).regex(customEventNamePattern),
	occurredAt: vine.string().maxLength(64).regex(isoTimestampWithZone),
	path: vine.string().minLength(1).maxLength(browserEventProtocol.maxPathLength).regex(browserEventPathPattern),
	properties: vine.record(
		vine.unionOfTypes([vine.string(), vine.boolean({ strict: true }), vine.number({ strict: true }), vine.null()]),
	),
	distinctId: vine.string().minLength(1).maxLength(browserEventProtocol.maxDistinctIdLength).optional(),
	eventId: vine.string().minLength(1).maxLength(browserEventProtocol.maxEventIdLength).optional(),
};
const optionalFields = ['distinctId', 'eventId'];
const expectedFields = Object.keys(fields).filter((field) => !optionalFields.includes(field));
const validator = vine.create(fields);

type DeliveryError = { error: string } | { errors: { message: string }[] };
type Prepared<T> = { ok: true; value: T } | { ok: false; error: DeliveryError };

function prepareSubmission(body: unknown): Prepared<{ batch: boolean; records: unknown[] }> {
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
		Object.keys(submitted).length !== 1 ||
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

	return { ok: true, value: { batch, records } };
}

async function prepareEvents(
	request: HttpContext['request'],
	records: unknown[],
	key: ServerKeyAuthenticationTarget,
): Promise<Prepared<RecordServerEventParams[]>> {
	const events: RecordServerEventParams[] = [];

	for (const submittedEvent of records) {
		if (typeof submittedEvent !== 'object' || submittedEvent === null || Array.isArray(submittedEvent)) {
			return { ok: false, error: { errors: [{ message: 'Each event must be an object' }] } };
		}

		const record = submittedEvent as Record<string, unknown>;
		const submittedFields = Object.keys(record);

		if (
			!expectedFields.every((field) => submittedFields.includes(field)) ||
			!submittedFields.every((field) => expectedFields.includes(field) || optionalFields.includes(field)) ||
			(record.distinctId !== undefined && !isValidDistinctId(record.distinctId)) ||
			(record.eventId !== undefined && !isValidEventId(record.eventId)) ||
			!isValidEventProperties(record.properties)
		) {
			return {
				ok: false,
				error: { errors: [{ message: `The event payload must contain only ${expectedFields.join(', ')}` }] },
			};
		}

		const event = await request.validateUsing(validator, { data: record });
		const occurredAt = DateTime.fromISO(event.occurredAt, { setZone: true });

		if (!occurredAt.isValid) {
			return { ok: false, error: { error: 'invalid_occurred_at' } };
		}

		events.push({
			websiteId: key.websiteId,
			identityMode: key.identityMode,
			distinctId: event.distinctId,
			eventId: event.eventId,
			name: event.name,
			occurredAt: occurredAt.toJSDate(),
			path: event.path,
			properties: event.properties,
		});
	}

	return { ok: true, value: events };
}

@inject()
export default class RecordServerEventController {
	constructor(
		private readonly authenticateServerKey: ServerKeyAuthenticator,
		private readonly recordServerEvent: RecordServerEvent,
		private readonly recordServerEventBatch: RecordServerEventBatch,
	) {}

	async execute({ request, response }: HttpContext) {
		const authorization = request.header('authorization') ?? '';
		const secret = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
		const failureLimit = await serverAuthenticationFailures.get(request.ip());

		if (failureLimit?.remaining === 0) {
			await serverAuthenticationFailures.consume(request.ip());
		}

		const key = await this.authenticateServerKey.findActiveTarget(secret);

		if (!key) {
			await serverAuthenticationFailures.consume(request.ip());
			return response.unauthorized({ error: 'invalid_server_key' });
		}

		await serverKeyVerifications.consume(key.id);

		if (!(await this.authenticateServerKey.verify(key, secret))) {
			await serverAuthenticationFailures.consume(request.ip());
			return response.unauthorized({ error: 'invalid_server_key' });
		}

		const body: unknown = JSON.parse(request.raw() ?? 'null');
		const submission = prepareSubmission(body);

		if (!submission.ok) {
			return response.unprocessableEntity(submission.error);
		}

		await serverEventsPerKey.consume(serverEventRateLimitKey(secret), submission.value.records.length);
		const events = await prepareEvents(request, submission.value.records, key);

		if (!events.ok) {
			return response.unprocessableEntity(events.error);
		}

		const result = submission.value.batch
			? await this.recordServerEventBatch.execute(events.value)
			: await this.recordServerEvent.execute(events.value[0]!);

		if (!result.ok) {
			const error = 'error' in result.error ? result.error.error : result.error;
			return response.unprocessableEntity({
				error: error.type,
				...('index' in result.error ? { index: result.error.index } : {}),
			});
		}

		return response.status(202).send(null);
	}
}
