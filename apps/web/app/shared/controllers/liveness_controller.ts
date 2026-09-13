import type { HttpContext } from '@adonisjs/core/http';

export default class LivenessController {
	execute({ response }: HttpContext) {
		return response.ok({ status: 'alive' });
	}
}
