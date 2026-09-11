import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { RecordPageview } from '#collection/actions/record_pageview';
import type { HttpContext } from '@adonisjs/core/http';

const expectedFields = ['name', 'path', 'trackingId'];

@inject()
export default class RecordPageviewController {
	static readonly validator = vine.create({
		trackingId: vine.string().uuid({ version: [4] }),
		name: vine.literal('pageview'),
		path: vine
			.string()
			.minLength(1)
			.maxLength(2048)
			.regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[A-Fa-f0-9]{2})*(?![\s\S])/u),
	});

	constructor(private readonly recordPageview: RecordPageview) {}

	async execute({ request, response }: HttpContext) {
		const body = request.body();

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
				errors: [{ message: 'The event payload must contain only trackingId, name, and path' }],
			});
		}

		const event = await request.validateUsing(RecordPageviewController.validator, { data: body });
		const result = await this.recordPageview.execute({
			trackingId: event.trackingId,
			path: event.path,
			origin: request.header('origin') ?? '',
		});

		if (!result.ok) {
			return response.forbidden({ error: 'collection_forbidden' });
		}

		return response.status(202).send(null);
	}
}
