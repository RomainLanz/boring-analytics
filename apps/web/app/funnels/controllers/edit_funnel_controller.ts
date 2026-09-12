import { inject } from '@adonisjs/core';
import FunnelEditorTransformer from '#app/funnels/transformers/funnel_editor_transformer';
import { funnelValidator, toFunnelDefinition } from '#app/funnels/validators/funnel_validator';
import { UpdateFunnel } from '#funnels/actions/update_funnel';
import { FunnelEditorQuery } from '#funnels/queries/funnel_editor_query';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class EditFunnelController {
	constructor(
		private readonly funnelEditor: FunnelEditorQuery,
		private readonly updateFunnel: UpdateFunnel,
	) {}

	async render({ auth, inertia, params, response }: HttpContext) {
		const editor = await this.funnelEditor.execute(params.id, auth.getUserOrFail().id, params.funnelId);

		if (!editor) {
			return response.notFound();
		}

		return inertia.render('funnels/edit', { editor: FunnelEditorTransformer.transform(editor) });
	}

	async execute({ auth, params, request, response, session }: HttpContext) {
		const input = await request.validateUsing(funnelValidator);
		const result = await this.updateFunnel.execute({
			ownerUserId: auth.getUserOrFail().id,
			websiteId: params.id,
			funnelId: params.funnelId,
			...toFunnelDefinition(input),
		});

		if (!result.ok) {
			if (result.error.type === 'funnel_not_found') {
				return response.notFound();
			}

			session.flash('error', 'Check the Funnel name, steps, filters, and conversion window.');
			return response.redirect().back();
		}

		return response.redirect().toRoute('funnels.show', { id: params.id, funnelId: params.funnelId });
	}
}
