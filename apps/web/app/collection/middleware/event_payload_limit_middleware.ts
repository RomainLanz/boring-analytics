import { browserEventProtocol } from '#collection/browser_event_protocol';
import type { HttpContext } from '@adonisjs/core/http';
import type { NextFn } from '@adonisjs/core/types/http';

export default class EventPayloadLimitMiddleware {
	handle({ request, response }: HttpContext, next: NextFn) {
		const body: unknown = request.body();
		const isBatch = typeof body === 'object' && body !== null && 'events' in body && Array.isArray(body.events);
		const maxPayloadBytes = isBatch ? browserEventProtocol.maxBatchPayloadBytes : browserEventProtocol.maxPayloadBytes;

		if (Buffer.byteLength(request.raw() ?? '', 'utf8') > maxPayloadBytes) {
			return response.status(413).send(null);
		}

		return next();
	}
}
