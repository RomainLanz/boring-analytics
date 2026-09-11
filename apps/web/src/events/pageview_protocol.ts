export const pageviewProtocol = {
	maxPayloadBytes: 4 * 1024,
	maxPathLength: 2048,
	maxReferrerLength: 2048,
	maxUtmLength: 255,
} as const;

export const pageviewPathPattern = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[A-Fa-f0-9]{2})*(?![\s\S])/u;

export function normalizePageviewPath(pathname: string) {
	return pathname.replace(/%(?![A-Fa-f0-9]{2})|[^A-Za-z0-9._~!$&'()*+,;=:@/%-]/gu, (character) =>
		encodeURIComponent(character),
	);
}
