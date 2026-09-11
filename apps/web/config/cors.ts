import { defineConfig } from '@adonisjs/cors';

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
	/**
	 * Only the public collection endpoint is called cross-origin.
	 */
	enabled: ({ request }) => request.url() === '/api/events',

	/**
	 * Collection requests may come from any configured Website. The endpoint
	 * enforces each Website's domain allowlist before accepting an event.
	 */
	origin: true,

	/**
	 * HTTP methods accepted for cross-origin requests.
	 */
	methods: ['POST'],

	/**
	 * JSON is the only request content accepted by the collection endpoint.
	 */
	headers: ['Content-Type'],

	/**
	 * Response headers exposed to the browser.
	 */
	exposeHeaders: [],

	/**
	 * Allow cookies/authorization headers on cross-origin requests.
	 */
	credentials: false,

	/**
	 * Cache CORS preflight response for N seconds.
	 */
	maxAge: 90,
});

export default corsConfig;
