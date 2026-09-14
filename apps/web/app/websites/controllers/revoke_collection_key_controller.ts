import { inject } from '@adonisjs/core';
import { RevokeCollectionKey } from '#websites/actions/revoke_collection_key';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class RevokeCollectionKeyController {
	constructor(private readonly revokeCollectionKey: RevokeCollectionKey) {}

	async execute({ auth, params, response, session }: HttpContext) {
		const result = await this.revokeCollectionKey.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
			collectionKeyId: params.keyId,
		});

		if (!result.ok) {
			if (result.error.type !== 'last_active_collection_key') {
				return response.notFound();
			}
			session.flash('error', 'Create another collection key before revoking the last active key.');
			return response.redirect().back();
		}

		session.flash('success', 'Public collection key revoked immediately.');
		return response.redirect().back();
	}
}
