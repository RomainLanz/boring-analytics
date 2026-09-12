import { browserEventProtocol } from '#collection/browser_event_protocol';
import type { HttpContext } from '@adonisjs/core/http';
import type { NextFn } from '@adonisjs/core/types/http';

export default class EventPayloadLimitMiddleware {
	handle({ request, response }: HttpContext, next: NextFn) {
		if (Buffer.byteLength(request.raw() ?? '', 'utf8') > browserEventProtocol.maxPayloadBytes) {
			return response.status(413).send(null);
		}

		return next();
	}
}
