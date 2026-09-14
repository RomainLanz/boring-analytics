import app from '@adonisjs/core/services/app';
import { test } from '@japa/runner';
import { RegisterUser } from '#identity/actions/register_user';
import { db } from '#shared/services/db';

test.group('Owner data export download', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('downloads the authenticated owner export with stable private headers', async ({
		assert,
		browserContext,
		visit,
	}) => {
		const registerUser = await app.container.make(RegisterUser);
		const owner = await registerUser.execute({
			name: 'Ada',
			email: 'ada@example.com',
			password: 'a-secure-password',
		});

		if (!owner.ok) {
			throw new Error('The test owner must be created');
		}

		await browserContext.loginAs(owner.value);
		const page = await visit('/account');
		const download = await page.evaluate(async () => {
			const response = await fetch('/account/export');

			return {
				status: response.status,
				contentType: response.headers.get('content-type'),
				contentDisposition: response.headers.get('content-disposition'),
				cacheControl: response.headers.get('cache-control'),
				body: await response.text(),
			};
		});

		assert.equal(download.status, 200);
		assert.equal(download.contentType, 'application/x-ndjson; charset=utf-8');
		assert.match(
			download.contentDisposition ?? '',
			/^attachment; filename="boring-analytics-export-v3-\d{4}-\d{2}-\d{2}\.jsonl"$/u,
		);
		assert.equal(download.cacheControl, 'private, no-store');
		const schemaVersion = (JSON.parse(download.body.trim()) as { schemaVersion: number }).schemaVersion;
		assert.equal(schemaVersion, 3);
		assert.include(download.contentDisposition ?? '', `export-v${schemaVersion}-`);
	});
});
