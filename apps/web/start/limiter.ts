import limiter from '@adonisjs/limiter/services/main';

const trackingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const collectionLimits = {
	perSource: 500,
	perWebsiteAndSource: 100,
} as const;

export const limitCollectionSource = limiter.define('collection_source', ({ request }) => {
	return limiter.allowRequests(collectionLimits.perSource).every('1 minute').usingKey(request.ip());
});

export const limitCollectionWebsite = limiter.define('collection_website', ({ request }) => {
	const body: unknown = request.body();
	const trackingId =
		typeof body === 'object' &&
		body !== null &&
		'trackingId' in body &&
		typeof body.trackingId === 'string' &&
		trackingIdPattern.test(body.trackingId)
			? body.trackingId.toLowerCase()
			: 'invalid';

	return limiter
		.allowRequests(collectionLimits.perWebsiteAndSource)
		.every('1 minute')
		.usingKey(`${request.ip()}:${trackingId}`);
});
