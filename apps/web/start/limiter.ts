import { createHash } from 'node:crypto';
import limiter from '@adonisjs/limiter/services/main';
import type { HttpContext } from '@adonisjs/core/http';
import type { NextFn } from '@adonisjs/core/types/http';

const trackingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const collectionLimits = {
	perSource: 500,
	perWebsiteAndSource: 100,
} as const;

export const serverEventLimits = {
	failedAuthenticationPerSource: 20,
	perKey: 300,
	verificationsPerKey: 320,
} as const;

export const serverAuthenticationFailures = limiter.use({
	requests: serverEventLimits.failedAuthenticationPerSource,
	duration: '1 minute',
});

export const serverEventsPerKey = limiter.use({ requests: serverEventLimits.perKey, duration: '1 minute' });

export const serverKeyVerifications = limiter.use({
	requests: serverEventLimits.verificationsPerKey,
	duration: '1 minute',
});

const collectionSources = limiter.use({ requests: collectionLimits.perSource, duration: '1 minute' });
const collectionWebsites = limiter.use({
	requests: collectionLimits.perWebsiteAndSource,
	duration: '1 minute',
});

export function serverEventRateLimitKey(secret: string) {
	return createHash('sha256').update(secret).digest('base64url');
}

function collectionEventCost(body: unknown) {
	if (typeof body !== 'object' || body === null || !('events' in body) || !Array.isArray(body.events)) {
		return 1;
	}

	return Math.max(1, Math.min(body.events.length, 20));
}

export async function limitCollectionSource({ request }: HttpContext, next: NextFn) {
	await collectionSources.consume(request.ip());
	return next();
}

export function consumeAdditionalCollectionSourceEvents(source: string, eventCount: number) {
	return eventCount > 1 ? collectionSources.consume(source, eventCount - 1) : undefined;
}

export async function limitCollectionWebsite({ request }: HttpContext, next: NextFn) {
	const body: unknown = request.body();
	const trackingId =
		typeof body === 'object' &&
		body !== null &&
		'trackingId' in body &&
		typeof body.trackingId === 'string' &&
		trackingIdPattern.test(body.trackingId)
			? body.trackingId.toLowerCase()
			: 'invalid';

	await collectionWebsites.consume(`${request.ip()}:${trackingId}`, collectionEventCost(body));
	return next();
}
