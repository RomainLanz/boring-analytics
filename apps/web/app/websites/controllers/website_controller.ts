import { inject } from '@adonisjs/core';
import WebsiteDetailsTransformer from '#app/websites/transformers/website_details_transformer';
import { WebsiteDetailsQuery } from '#websites/queries/website_details_query';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteController {
	constructor(private readonly websiteDetails: WebsiteDetailsQuery) {}

	async render({ auth, inertia, params, response }: HttpContext) {
		const website = await this.websiteDetails.execute(params.id, auth.getUserOrFail().id);

		if (!website) {
			return response.notFound();
		}

		return inertia.render('websites/show', {
			website: WebsiteDetailsTransformer.transform(website),
		});
	}
}
