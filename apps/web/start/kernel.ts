/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router';
import server from '@adonisjs/core/services/server';

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
server.errorHandler(() => import('#app/exceptions/handler'));

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
	() => import('#app/middleware/container_bindings_middleware'),
	() => import('@adonisjs/static/static_middleware'),
	() => import('@adonisjs/cors/cors_middleware'),
	() => import('@adonisjs/vite/vite_middleware'),
	() => import('#app/middleware/inertia_middleware'),
]);

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
	bodyparser: () => import('@adonisjs/core/bodyparser_middleware'),
	session: () => import('@adonisjs/session/session_middleware'),
	shield: () => import('@adonisjs/shield/shield_middleware'),
	initializeAuth: () => import('@adonisjs/auth/initialize_auth_middleware'),
	silentAuth: () => import('#app/middleware/silent_auth_middleware'),
	requireJson: () => import('#app/collection/middleware/require_json_middleware'),
	guest: () => import('#app/middleware/guest_middleware'),
	auth: () => import('#app/middleware/auth_middleware'),
});

export const webMiddleware = [
	middleware.bodyparser(),
	middleware.session(),
	middleware.shield(),
	middleware.initializeAuth(),
	middleware.silentAuth(),
];
