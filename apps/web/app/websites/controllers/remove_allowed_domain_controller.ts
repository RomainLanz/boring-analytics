import { inject } from '@adonisjs/core';
import { RemoveAllowedDomain } from '#websites/actions/remove_allowed_domain';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class RemoveAllowedDomainController {
	constructor(private readonly removeAllowedDomain: RemoveAllowedDomain) {}

	async execute({ auth, params, response, session }: HttpContext) {
		const result = await this.removeAllowedDomain.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
			domainId: params.domainId,
		});

		if (!result.ok) {
			if (result.error.type !== 'last_allowed_domain') {
				return response.notFound();
			}
			session.flash('error', 'Add another domain before removing the last allowed domain.');
			return response.redirect().back();
		}

		session.flash('success', 'Allowed domain removed.');
		return response.redirect().back();
	}
}
