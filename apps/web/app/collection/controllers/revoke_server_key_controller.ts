import { inject } from '@adonisjs/core';
import { RevokeServerKey } from '#collection/actions/revoke_server_key';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class RevokeServerKeyController {
	constructor(private readonly revokeServerKey: RevokeServerKey) {}

	async execute({ auth, params, response, session }: HttpContext) {
		const result = await this.revokeServerKey.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
		});

		if (!result.ok) {
			return response.notFound();
		}

		session.flash('success', 'Server key revoked.');
		return response.redirect().back();
	}
}
