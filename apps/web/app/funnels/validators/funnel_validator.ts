import vine from '@vinejs/vine';
import { anonymousSessionDurationSeconds } from '#collection/anonymous_identity_policy';
import type { FunnelDefinitionValue, FunnelFilter } from '#funnels/domain/funnel_definition';

export const funnelValidator = vine.create({
	name: vine.string().trim().minLength(1).maxLength(100),
	conversionWindowSeconds: vine.number().min(1).max(anonymousSessionDurationSeconds),
	steps: vine
		.array(
			vine.object({
				eventName: vine.string().minLength(1).maxLength(64),
				filterField: vine.enum(['none', 'path', 'property']),
				filterKey: vine.string().maxLength(64).optional(),
				filterType: vine.enum(['string', 'number', 'boolean', 'null']).optional(),
				filterValue: vine.string().maxLength(2048).nullable().optional(),
			}),
		)
		.minLength(2)
		.maxLength(20),
});

type FunnelInput = Awaited<ReturnType<typeof funnelValidator.validate>>;

export function toFunnelDefinition(input: FunnelInput): FunnelDefinitionValue {
	return {
		name: input.name,
		conversionWindowSeconds: input.conversionWindowSeconds,
		steps: input.steps.map((step) => ({
			eventName: step.eventName,
			filter: toFilter(step),
		})),
	};
}

function toFilter(step: FunnelInput['steps'][number]): FunnelFilter | null {
	if (step.filterField === 'none') {
		return null;
	}

	if (step.filterField === 'path') {
		return { field: 'path', value: step.filterValue ?? '' };
	}

	return {
		field: 'property',
		key: step.filterKey ?? '',
		value: parsePropertyValue(step.filterType ?? 'string', step.filterValue ?? ''),
	};
}

function parsePropertyValue(type: 'string' | 'number' | 'boolean' | 'null', value: string | null) {
	switch (type) {
		case 'number':
			return value?.trim() ? Number(value) : Number.NaN;
		case 'boolean':
			return value === 'true' ? true : value === 'false' ? false : Number.NaN;
		case 'null':
			return null;
		default:
			return value ?? '';
	}
}
