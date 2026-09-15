import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import maxmind, { type CountryResponse, type Reader } from 'maxmind';
import proxyaddr from 'proxy-addr';

const isNonPublicAddress = proxyaddr.compile(['loopback', 'linklocal', 'uniquelocal']);
const countryCodePattern = /^[A-Z]{2}$/u;

export class GeoIpCountryResolver {
	static async open(path: string | URL | undefined) {
		if (path === undefined) {
			return new GeoIpCountryResolver();
		}

		try {
			const reader = await maxmind.open<CountryResponse>(path instanceof URL ? fileURLToPath(path) : path);
			return new GeoIpCountryResolver(reader);
		} catch {
			return new GeoIpCountryResolver();
		}
	}

	constructor(private readonly reader?: Reader<CountryResponse>) {}

	resolve(ip: string) {
		if (!this.reader || !isIP(ip) || isNonPublicAddress(ip, 0)) {
			return null;
		}

		try {
			const countryCode = this.reader.get(ip)?.country?.iso_code?.toUpperCase();
			return countryCode && countryCodePattern.test(countryCode) ? countryCode : null;
		} catch {
			return null;
		}
	}
}
