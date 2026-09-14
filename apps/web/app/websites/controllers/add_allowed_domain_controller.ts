import { inject } from '@adonisjs/core';
import vine from '@vinejs/vine';
import { AddAllowedDomain } from '#websites/actions/add_allowed_domain';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class AddAllowedDomainController {
	static readonly validator = vine.create({ hostname: vine.string().trim().minLength(1).maxLength(253) });

	constructor(private readonly addAllowedDomain: AddAllowedDomain) {}

	async execute({ auth, params, request, response, session }: HttpContext) {
		const input = await request.validateUsing(AddAllowedDomainController.validator);
		const result = await this.addAllowedDomain.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
			hostname: input.hostname,
		});

		if (!result.ok) {
			if (result.error.type === 'website_not_found') {
				return response.notFound();
			}
			const messages = {
				invalid_allowed_domain: 'Enter a hostname without a protocol, port, path, or wildcard.',
				allowed_domain_exists: 'This domain is already allowed.',
				allowed_domain_limit_reached: 'This Website already has the maximum of 5 allowed domains.',
			};
			session.flash('error', messages[result.error.type]);
			return response.redirect().back();
		}

		session.flash('success', 'Allowed domain added.');
		return response.redirect().back();
	}
}
