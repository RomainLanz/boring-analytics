import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { UpdateWebsiteIdentityMode } from '#websites/actions/update_website_identity_mode';
import { websiteIdentityModes } from '#websites/website_identity_mode';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class UpdateWebsiteIdentityModeController {
	static readonly validator = vine.create({
		identityMode: vine.enum(websiteIdentityModes),
	});

	constructor(private readonly updateIdentityMode: UpdateWebsiteIdentityMode) {}

	async execute({ auth, params, request, response, session }: HttpContext) {
		const input = await request.validateUsing(UpdateWebsiteIdentityModeController.validator);
		const result = await this.updateIdentityMode.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
			identityMode: input.identityMode,
		});

		if (!result.ok) {
			return response.notFound();
		}

		session.flash('success', 'Identity mode updated.');
		return response.redirect().back();
	}
}
