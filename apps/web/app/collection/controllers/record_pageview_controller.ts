import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { DateTime } from 'luxon';
import { RecordPageview } from '#collection/actions/record_pageview';
import { pageviewPathPattern, pageviewProtocol } from '#collection/pageview_protocol';
import type { HttpContext } from '@adonisjs/core/http';

const isoTimestampWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

function utmParameter() {
	return vine
		.string()
		.minLength(1)
		.maxLength(pageviewProtocol.maxUtmLength)
		.regex(/^[^\p{Cc}]+$/u)
		.nullable();
}

const pageviewFields = {
	trackingId: vine.string().uuid({ version: [4] }),
	name: vine.literal('$pageview'),
	occurredAt: vine.string().maxLength(64).regex(isoTimestampWithZone),
	path: vine.string().minLength(1).maxLength(pageviewProtocol.maxPathLength).regex(pageviewPathPattern),
	referrer: vine.string().maxLength(pageviewProtocol.maxReferrerLength).nullable(),
	utmSource: utmParameter(),
	utmMedium: utmParameter(),
	utmCampaign: utmParameter(),
};
const expectedFields = Object.keys(pageviewFields).sort();

@inject()
export default class RecordPageviewController {
	static readonly validator = vine.create(pageviewFields);

	constructor(private readonly recordPageview: RecordPageview) {}

	async execute({ request, response }: HttpContext) {
		const body: unknown = request.body();

		if (
			typeof body !== 'object' ||
			body === null ||
			Array.isArray(body) ||
			Object.keys(body)
				.sort()
				.some((field, index) => field !== expectedFields[index]) ||
			Object.keys(body).length !== expectedFields.length
		) {
			return response.unprocessableEntity({
				errors: [{ message: `The event payload must contain only ${expectedFields.join(', ')}` }],
			});
		}

		const event = await request.validateUsing(RecordPageviewController.validator, { data: body });
		const occurredAt = DateTime.fromISO(event.occurredAt, { setZone: true });

		if (!occurredAt.isValid) {
			return response.unprocessableEntity({ error: 'invalid_occurred_at' });
		}

		const result = await this.recordPageview.execute({
			trackingId: event.trackingId,
			path: event.path,
			origin: request.header('origin') ?? '',
			occurredAt: occurredAt.toJSDate(),
			referrer: event.referrer,
			utmSource: event.utmSource,
			utmMedium: event.utmMedium,
			utmCampaign: event.utmCampaign,
			ip: request.ip(),
			userAgent: request.header('user-agent') ?? '',
		});

		if (!result.ok) {
			return result.error.type === 'collection_forbidden'
				? response.forbidden({ error: result.error.type })
				: response.unprocessableEntity({ error: result.error.type });
		}

		return response.status(202).send(null);
	}
}
