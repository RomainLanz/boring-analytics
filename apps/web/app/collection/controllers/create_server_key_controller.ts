import { inject } from '@adonisjs/core';
import { CreateServerKey } from '#collection/actions/create_server_key';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class CreateServerKeyController {
	constructor(private readonly createServerKey: CreateServerKey) {}

	async execute({ auth, params, response, session }: HttpContext) {
		const result = await this.createServerKey.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
		});

		if (!result.ok) {
			if (result.error.type === 'website_not_found') {
				return response.notFound();
			}

			session.flash('error', 'This Website already has an active server key.');
			return response.redirect().back();
		}

		session.flash('serverKeySecret', result.value.secret);
		session.flash('success', 'Server key created.');
		return response.redirect().back();
	}
}
