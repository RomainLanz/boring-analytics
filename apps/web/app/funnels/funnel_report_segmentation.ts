import { isValidEventPropertyString } from '#collection/browser_event_protocol';
import type { FunnelSegmentationDimension } from '#funnels/queries/funnel_report_query';

interface FunnelReportSegmentationInput {
	segment?: unknown;
	property?: unknown;
}

export function parseFunnelReportSegmentation(
	input: FunnelReportSegmentationInput,
): FunnelSegmentationDimension | undefined {
	if (input.segment === 'property') {
		return typeof input.property === 'string' && isValidEventPropertyString(input.property)
			? { kind: 'property', key: input.property }
			: undefined;
	}

	if (input.property !== undefined) {
		return undefined;
	}

	if (
		input.segment === 'source' ||
		input.segment === 'path' ||
		input.segment === 'utm_source' ||
		input.segment === 'utm_medium' ||
		input.segment === 'utm_campaign' ||
		input.segment === 'country'
	) {
		return { kind: input.segment };
	}

	return undefined;
}
