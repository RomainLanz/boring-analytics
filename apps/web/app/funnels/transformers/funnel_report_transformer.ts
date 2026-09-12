import { BaseTransformer } from '@adonisjs/core/transformers';
import type { FunnelReport } from '#funnels/queries/funnel_report_query';

export default class FunnelReportTransformer extends BaseTransformer<FunnelReport> {
	toObject() {
		return this.pick(this.resource, ['website', 'period', 'funnel', 'summary', 'steps']);
	}
}
