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
	 * Both sendBeacon and the fetch fallback submit the strict JSON contract.
	 */
	headers: ['Content-Type'],

	/**
	 * Response headers exposed to the browser.
	 */
	exposeHeaders: [],

	/**
	 * sendBeacon always uses the browser's credentials mode "include". The
	 * collection route does not read sessions, cookies, or authorization.
	 */
	credentials: true,

	/**
	 * Cache CORS preflight response for N seconds.
	 */
	maxAge: 90,
});

export default corsConfig;
