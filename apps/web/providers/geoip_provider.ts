import { GeoIpCountryResolver } from '#collection/services/geoip_country_resolver';
import env from '#start/env';
import type { ApplicationService } from '@adonisjs/core/types';

export default class GeoIpProvider {
	constructor(protected app: ApplicationService) {}

	register() {
		this.app.container.singleton(GeoIpCountryResolver, () => GeoIpCountryResolver.open(env.get('GEOIP_DATABASE_PATH')));
	}
}
