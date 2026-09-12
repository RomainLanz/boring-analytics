import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { RecordServerEvent } from '#collection/actions/record_server_event';
import {
	browserEventPathPattern,
	browserEventProtocol,
	customEventNamePattern,
	isValidEventProperties,
} from '#collection/browser_event_protocol';
import { ServerKeyAuthenticator } from '#collection/services/server_key_authenticator';
import {
	serverAuthenticationFailures,
	serverEventRateLimitKey,
	serverEventsPerKey,
	serverKeyVerifications,
} from '#start/limiter';
import type { HttpContext } from '@adonisjs/core/http';

const isoTimestampWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const fields = {
	name: vine.string().minLength(1).maxLength(browserEventProtocol.maxNameLength).regex(customEventNamePattern),
	occurredAt: vine.string().maxLength(64).regex(isoTimestampWithZone),
	path: vine.string().minLength(1).maxLength(browserEventProtocol.maxPathLength).regex(browserEventPathPattern),
	properties: vine.record(
		vine.unionOfTypes([vine.string(), vine.boolean({ strict: true }), vine.number({ strict: true }), vine.null()]),
	),
};
const expectedFields = Object.keys(fields).sort();

@inject()
export default class RecordServerEventController {
	static readonly validator = vine.create(fields);

	constructor(
		private readonly authenticateServerKey: ServerKeyAuthenticator,
		private readonly recordServerEvent: RecordServerEvent,
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
		await serverEventsPerKey.consume(serverEventRateLimitKey(secret));

		if (!(await this.authenticateServerKey.verify(key, secret))) {
			await serverAuthenticationFailures.consume(request.ip());
			return response.unauthorized({ error: 'invalid_server_key' });
		}

		const body: unknown = JSON.parse(request.raw() ?? 'null');

		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			return response.unprocessableEntity({ errors: [{ message: 'The event payload must be an object' }] });
		}

		const record = body as Record<string, unknown>;
		const submittedFields = Object.keys(record).sort();

		if (
			submittedFields.length !== expectedFields.length ||
			!submittedFields.every((field, index) => field === expectedFields[index]) ||
			!isValidEventProperties(record.properties)
		) {
			return response.unprocessableEntity({
				errors: [{ message: `The event payload must contain only ${expectedFields.join(', ')}` }],
			});
		}

		const event = await request.validateUsing(RecordServerEventController.validator, { data: body });
		const occurredAt = DateTime.fromISO(event.occurredAt, { setZone: true });

		if (!occurredAt.isValid) {
			return response.unprocessableEntity({ error: 'invalid_occurred_at' });
		}

		const result = await this.recordServerEvent.execute({
			websiteId: key.websiteId,
			name: event.name,
			occurredAt: occurredAt.toJSDate(),
			path: event.path,
			properties: event.properties,
		});

		if (!result.ok) {
			return response.unprocessableEntity({ error: result.error.type });
		}

		return response.status(202).send(null);
	}
}
