import { BaseTransformer } from '@adonisjs/core/transformers';
import type { FunnelIndex } from '#funnels/queries/funnel_index_query';

export default class FunnelIndexTransformer extends BaseTransformer<FunnelIndex> {
	toObject() {
		return this.pick(this.resource, ['website', 'period', 'funnels']);
	}
}
