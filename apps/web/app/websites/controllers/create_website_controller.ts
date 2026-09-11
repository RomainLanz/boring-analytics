import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { CreateWebsite } from '#websites/actions/create_website';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class CreateWebsiteController {
	static readonly validator = vine.create({
		name: vine.string().trim().minLength(1).maxLength(100),
		allowedDomain: vine.string().trim().minLength(1).maxLength(253),
	});

	constructor(private readonly createWebsite: CreateWebsite) {}

	render({ inertia }: HttpContext) {
		return inertia.render('websites/create', {});
	}

	async execute({ auth, request, response, session }: HttpContext) {
		const params = await request.validateUsing(CreateWebsiteController.validator);
		const result = await this.createWebsite.execute({ ownerUserId: auth.getUserOrFail().id, ...params });

		if (!result.ok) {
			session.flash(
				'error',
				result.error.type === 'invalid_allowed_domain'
					? 'Enter a hostname such as example.com'
					: 'Enter a website name',
			);
			return response.redirect().back();
		}

		return response.redirect().toRoute('websites.show', { id: result.value.id });
	}
}
