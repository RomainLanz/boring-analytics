export type EventPropertyValue = string | number | boolean | null;
export type EventProperties = Record<string, EventPropertyValue>;

export const browserEventProtocol = {
	maxPayloadBytes: 4 * 1024,
	maxBatchPayloadBytes: 64 * 1024,
	maxBatchEvents: 20,
	maxPathLength: 2048,
	maxReferrerLength: 2048,
	maxUtmLength: 255,
	maxNameLength: 64,
	maxDistinctIdLength: 255,
	maxEventIdLength: 255,
	maxSessionIdLength: 36,
	maxProperties: 20,
	maxPropertyKeyLength: 64,
	maxPropertyStringLength: 255,
} as const;

export const browserEventPathPattern = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[A-Fa-f0-9]{2})*(?![\s\S])/u;
export const customEventNamePattern = /^(?!\$)(?!\s*$)[^\p{Cc}\p{Cs}]+$/u;
export const propertyKeyPattern = /^(?!\s*$)[^\p{Cc}]+$/u;

export function isValidEventPropertyString(value: string) {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);

		if (code === 0 || (code >= 0xdc00 && code <= 0xdfff)) {
			return false;
		}

		if (code >= 0xd800 && code <= 0xdbff) {
			const next = value.charCodeAt(index + 1);

			if (!(next >= 0xdc00 && next <= 0xdfff)) {
				return false;
			}

			index++;
		}
	}

	return true;
}

export function isValidEventProperties(properties: unknown): properties is EventProperties {
	if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(properties);

	if (prototype !== Object.prototype && prototype !== null) {
		return false;
	}

	const entries = Object.entries(properties);
	return (
		entries.length <= browserEventProtocol.maxProperties &&
		entries.every(([key, value]) => {
			return (
				key !== '__proto__' &&
				key.length <= browserEventProtocol.maxPropertyKeyLength &&
				propertyKeyPattern.test(key) &&
				isValidEventPropertyString(key) &&
				(value === null ||
					typeof value === 'boolean' ||
					(typeof value === 'number' && Number.isFinite(value)) ||
					(typeof value === 'string' &&
						value.length <= browserEventProtocol.maxPropertyStringLength &&
						isValidEventPropertyString(value)))
			);
		})
	);
}

export function isValidDistinctId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length >= 1 &&
		value.length <= browserEventProtocol.maxDistinctIdLength &&
		isValidEventPropertyString(value)
	);
}

export function isValidEventId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length >= 1 &&
		value.length <= browserEventProtocol.maxEventIdLength &&
		!/[\p{Cc}\p{Cs}\s]/u.test(value) &&
		isValidEventPropertyString(value)
	);
}

export function isValidSessionId(value: unknown): value is string {
	return (
		typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
	);
}

export function normalizeBrowserEventPath(pathname: string) {
	return pathname.replace(/%(?![A-Fa-f0-9]{2})|[^A-Za-z0-9._~!$&'()*+,;=:@/%-]/gu, (character) =>
		encodeURIComponent(character),
	);
}
