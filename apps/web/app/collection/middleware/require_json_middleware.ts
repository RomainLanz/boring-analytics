import type { HttpContext } from '@adonisjs/core/http';
import type { NextFn } from '@adonisjs/core/types/http';

export default class RequireJsonMiddleware {
	handle({ request, response }: HttpContext, next: NextFn) {
		const mediaType = request.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

		if (mediaType !== 'application/json') {
			return response.unsupportedMediaType({ error: 'application_json_required' });
		}

		return next();
	}
}
