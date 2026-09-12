import { inject } from '@adonisjs/core';
import FunnelIndexTransformer from '#app/funnels/transformers/funnel_index_transformer';
import { FunnelIndexQuery } from '#funnels/queries/funnel_index_query';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class WebsiteFunnelsController {
	constructor(private readonly funnelIndex: FunnelIndexQuery) {}

	async render({ auth, inertia, params, response }: HttpContext) {
		const index = await this.funnelIndex.execute(params.id, auth.getUserOrFail().id);

		if (!index) {
			return response.notFound();
		}

		return inertia.render('funnels/index', { index: FunnelIndexTransformer.transform(index) });
	}
}
