import { randomUUID } from 'node:crypto';
import { copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from '@japa/runner';
import { GeoIpCountryResolver } from '#collection/services/geoip_country_resolver';

const fixturePath = new URL('../../fixtures/GeoIP2-Country-Test.mmdb', import.meta.url);

test.group('GeoIP country resolver', () => {
	test('resolves public IPv4 and IPv6 addresses to bounded ISO country codes', async ({ assert }) => {
		const resolver = await GeoIpCountryResolver.open(fixturePath);

		assert.equal(resolver.resolve('81.2.69.142'), 'GB');
		assert.equal(resolver.resolve('2001:218::'), 'JP');
		assert.isNull(resolver.resolve('1.1.1.1'));
	});

	test('does not geolocate private, link-local, loopback, or malformed addresses', async ({ assert }) => {
		const resolver = await GeoIpCountryResolver.open(fixturePath);

		for (const address of ['127.0.0.1', '10.2.3.4', '169.254.10.20', '::1', 'fc00::1', 'fe80::1', 'not-an-ip']) {
			assert.isNull(resolver.resolve(address), address);
		}
	});

	test('stays available when the configured database is absent or corrupt', async ({ assert, cleanup }) => {
		const corruptPath = join(tmpdir(), `boring-analytics-geoip-${randomUUID()}.mmdb`);
		await writeFile(corruptPath, 'not an MMDB database');
		cleanup(() => import('node:fs/promises').then(({ rm }) => rm(corruptPath, { force: true })));

		const absent = await GeoIpCountryResolver.open(`${corruptPath}.absent`);
		const corrupt = await GeoIpCountryResolver.open(corruptPath);

		assert.isNull(absent.resolve('81.2.69.142'));
		assert.isNull(corrupt.resolve('81.2.69.142'));

		await copyFile(fixturePath, corruptPath);
		const restarted = await GeoIpCountryResolver.open(corruptPath);
		assert.equal(restarted.resolve('81.2.69.142'), 'GB');
	});
});
