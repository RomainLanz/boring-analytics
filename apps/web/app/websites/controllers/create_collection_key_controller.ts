import { inject } from '@adonisjs/core';
import { CreateCollectionKey } from '#websites/actions/create_collection_key';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class CreateCollectionKeyController {
	constructor(private readonly createCollectionKey: CreateCollectionKey) {}

	async execute({ auth, params, response, session }: HttpContext) {
		const result = await this.createCollectionKey.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
		});

		if (!result.ok) {
			if (result.error.type === 'website_not_found') {
				return response.notFound();
			}
			session.flash('error', 'Revoke an active collection key before creating another.');
			return response.redirect().back();
		}

		session.flash('success', 'Public collection key created. Both keys remain active until you revoke one.');
		return response.redirect().back();
	}
}
