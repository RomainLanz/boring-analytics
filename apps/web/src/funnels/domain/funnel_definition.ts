import { anonymousSessionDurationSeconds } from '#collection/anonymous_identity_policy';
import {
	browserEventPathPattern,
	browserEventProtocol,
	customEventNamePattern,
	isValidEventPropertyString,
	propertyKeyPattern,
} from '#collection/browser_event_protocol';
import { err, ok, type Result } from '#core/result';
import type { JsonValue } from '#types/db';

export type FunnelFilter =
	| { field: 'path'; value: string }
	| { field: 'property'; key: string; value: string | number | boolean | null };

export interface FunnelStepDefinition {
	eventName: string;
	filter: FunnelFilter | null;
}

export interface FunnelDefinitionValue {
	name: string;
	conversionWindowSeconds: number;
	steps: FunnelStepDefinition[];
}

interface InvalidFunnelDefinitionError {
	type: 'invalid_funnel_definition';
}

const MAX_FUNNEL_STEPS = 20;

export function createFunnelDefinition(
	input: FunnelDefinitionValue,
): Result<FunnelDefinitionValue, InvalidFunnelDefinitionError> {
	const name = input.name.trim();
	const steps = input.steps.map((step) => ({ ...step }));

	if (
		!name ||
		name.length > 100 ||
		!Number.isInteger(input.conversionWindowSeconds) ||
		input.conversionWindowSeconds < 1 ||
		input.conversionWindowSeconds > anonymousSessionDurationSeconds ||
		steps.length < 2 ||
		steps.length > MAX_FUNNEL_STEPS ||
		steps.some((step) => !isValidEventName(step.eventName) || !isValidFilter(step.filter))
	) {
		return err({ type: 'invalid_funnel_definition' });
	}

	return ok({ name, conversionWindowSeconds: input.conversionWindowSeconds, steps });
}

export function parseFunnelFilter(value: JsonValue | null): FunnelFilter | null {
	if (value === null) {
		return null;
	}

	if (typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid Funnel filter persisted');
	}

	if (value.field === 'path' && typeof value.value === 'string') {
		return { field: 'path', value: value.value };
	}

	if (
		value.field === 'property' &&
		typeof value.key === 'string' &&
		(value.value === null || ['string', 'number', 'boolean'].includes(typeof value.value))
	) {
		return { field: 'property', key: value.key, value: value.value as string | number | boolean | null };
	}

	throw new Error('Invalid Funnel filter persisted');
}

function isValidEventName(value: string) {
	return (
		value.length <= browserEventProtocol.maxNameLength &&
		isValidEventPropertyString(value) &&
		(value === '$pageview' || customEventNamePattern.test(value))
	);
}

function isValidFilter(filter: FunnelFilter | null) {
	if (filter === null) {
		return true;
	}

	if (filter.field === 'path') {
		return filter.value.length <= browserEventProtocol.maxPathLength && browserEventPathPattern.test(filter.value);
	}

	return (
		filter.key !== '__proto__' &&
		filter.key.length <= browserEventProtocol.maxPropertyKeyLength &&
		propertyKeyPattern.test(filter.key) &&
		isValidEventPropertyString(filter.key) &&
		(filter.value === null ||
			typeof filter.value === 'boolean' ||
			(typeof filter.value === 'number' && Number.isFinite(filter.value)) ||
			(typeof filter.value === 'string' &&
				filter.value.length <= browserEventProtocol.maxPropertyStringLength &&
				isValidEventPropertyString(filter.value)))
	);
}
