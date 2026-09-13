import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { UpdateWebsiteRetention } from '#websites/actions/update_website_retention';
import type { EventRetentionDays } from '#websites/event_retention';
import type { HttpContext } from '@adonisjs/core/http';

const retentionValues = ['60', '90', '180', '365', 'forever'] as const;

@inject()
export default class UpdateWebsiteRetentionController {
	static readonly validator = vine.create({ retentionDays: vine.enum(retentionValues) });

	constructor(private readonly updateRetention: UpdateWebsiteRetention) {}

	async execute({ auth, params, request, response, session }: HttpContext) {
		const input = await request.validateUsing(UpdateWebsiteRetentionController.validator);
		const retentionDays: EventRetentionDays =
			input.retentionDays === 'forever' ? null : (Number(input.retentionDays) as EventRetentionDays);
		const updated = await this.updateRetention.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
			retentionDays,
		});

		if (!updated) {
			return response.notFound();
		}

		session.flash('success', 'Event retention updated.');
		return response.redirect().back();
	}
}
