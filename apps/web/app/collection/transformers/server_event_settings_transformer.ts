import { BaseTransformer } from '@adonisjs/core/transformers';
import type { ServerEventSettings } from '#collection/queries/server_event_settings_query';

export default class ServerEventSettingsTransformer extends BaseTransformer<ServerEventSettings> {
	toObject() {
		return this.pick(this.resource, ['website', 'period', 'serverKey']);
	}
}
