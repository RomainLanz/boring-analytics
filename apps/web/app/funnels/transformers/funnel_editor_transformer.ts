import { BaseTransformer } from '@adonisjs/core/transformers';
import type { FunnelEditor } from '#funnels/queries/funnel_editor_query';

export default class FunnelEditorTransformer extends BaseTransformer<FunnelEditor> {
	toObject() {
		return this.pick(this.resource, ['website', 'period', 'eventNames', 'funnel']);
	}
}
