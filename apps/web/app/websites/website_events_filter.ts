import { isValidEventPropertyString, type EventPropertyValue } from '#collection/browser_event_protocol';
import type { WebsiteEventsFilter } from '#websites/queries/website_events_query';

interface WebsiteEventsFilterInput {
	source?: unknown;
	property?: unknown;
	value?: unknown;
}

export function parseWebsiteEventsFilter(input: WebsiteEventsFilterInput): WebsiteEventsFilter | null {
	const hasSource = input.source !== undefined;
	const hasProperty = input.property !== undefined || input.value !== undefined;

	if (hasSource) {
		return !hasProperty && (input.source === 'browser' || input.source === 'server')
			? { kind: 'source', value: input.source }
			: null;
	}

	if (
		typeof input.property !== 'string' ||
		!isValidEventPropertyString(input.property) ||
		typeof input.value !== 'string'
	) {
		return null;
	}

	try {
		const value: unknown = JSON.parse(input.value);

		return isPrimitivePropertyValue(value) && (typeof value !== 'string' || isValidEventPropertyString(value))
			? { kind: 'property', key: input.property, value }
			: null;
	} catch {
		return null;
	}
}

function isPrimitivePropertyValue(value: unknown): value is EventPropertyValue {
	return (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}
