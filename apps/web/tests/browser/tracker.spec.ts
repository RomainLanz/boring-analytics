import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from '@japa/runner';
import { chromium } from 'playwright';
import { pageviewProtocol } from '#collection/pageview_protocol';
import { db } from '#shared/services/db';

const trackerUrl = 'http://localhost:3333/tracker.js';
let fixtureOrigin = '';
let backForwardCacheRestorations = 0;

const fixtureServer = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://fixture');
	const trackingId = url.searchParams.get('website');

	if (url.pathname === '/back-forward-cache-restored') {
		backForwardCacheRestorations++;
		response.writeHead(204).end();
		return;
	}

	response.writeHead(200, {
		'content-type': 'text/html',
		'referrer-policy': url.searchParams.get('policy') ?? 'no-referrer',
	});

	if (url.pathname.startsWith('/referrer/')) {
		response.end('<!doctype html><title>Referrer page</title>');
		return;
	}

	response.end(
		`<!doctype html><title>Tracked page</title><a id="navigate">Navigate</a><script data-website-id="${trackingId}" src="${trackerUrl}"></script>`,
	);
});

async function createWebsite() {
	const userId = randomUUID();
	const workspaceId = randomUUID();
	const websiteId = randomUUID();
	const trackingId = randomUUID();

	await db
		.insertInto('users')
		.values({
			id: userId,
			email: `${userId}@example.com`,
			password: '[REDACTED:password]',
			name: null,
			updated_at: null,
		})
		.execute();
	await db.insertInto('workspaces').values({ id: workspaceId, owner_user_id: userId }).execute();
	await db
		.insertInto('websites')
		.values({
			id: websiteId,
			workspace_id: workspaceId,
			name: 'Tracked Website',
			tracking_id: trackingId,
			allowed_domain: '127.0.0.1',
		})
		.execute();

	return trackingId;
}

async function waitForEvents(count: number) {
	for (let attempt = 0; attempt < 50; attempt++) {
		const result = await db
			.selectFrom('events')
			.select(({ fn }) => fn.countAll<number>().as('count'))
			.executeTakeFirstOrThrow();

		if (Number(result.count) === count) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 20));
	}

	throw new Error(`Expected ${count} persisted tracker events`);
}

async function waitForBackForwardCacheRestoration() {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (backForwardCacheRestorations === 1) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 20));
	}

	throw new Error('Expected one back-forward cache restoration');
}

function trackedPageUrl(trackingId: string, path: string, referrerPolicy: string) {
	const url = new URL(path, fixtureOrigin);
	url.searchParams.set('website', trackingId);
	url.searchParams.set('policy', referrerPolicy);
	return url;
}

test.group('Browser tracker', (group) => {
	group.setup(async () => {
		await new Promise<void>((resolve, reject) => {
			fixtureServer.once('error', reject);
			fixtureServer.listen(0, '127.0.0.1', resolve);
		});
		const address = fixtureServer.address();

		if (!address || typeof address === 'string') {
			throw new Error('Unable to start the cross-origin browser fixture');
		}

		fixtureOrigin = `http://127.0.0.1:${address.port}`;
	});

	group.teardown(async () => {
		await new Promise<void>((resolve, reject) => fixtureServer.close((error) => (error ? reject(error) : resolve())));
	});

	group.each.setup(async () => {
		backForwardCacheRestorations = 0;
		await db.deleteFrom('users').execute();
	});

	test('uses sendBeacon cross-origin for the first load and SPA navigation', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		await browserContext.addInitScript(`
			window.__beaconCalls = 0;
			window.__beaconContentType = null;
			const sendBeacon = navigator.sendBeacon.bind(navigator);
			navigator.sendBeacon = (...args) => {
				window.__beaconCalls += 1;
				window.__beaconContentType = args[1]?.type;
				return sendBeacon(...args);
			};
		`);
		const page = await browserContext.newPage();

		const trackedPage = trackedPageUrl(trackingId, '/tracked-page', 'no-referrer');
		trackedPage.searchParams.set('utm_source', 'docs');
		trackedPage.searchParams.set('utm_medium', 'referral');
		trackedPage.searchParams.set('utm_campaign', 'launch');
		trackedPage.hash = 'intro';
		await page.goto(trackedPage.href);
		await waitForEvents(1);
		await page.evaluate("history.pushState({}, '', '/tracked-pricing?secret=pro#plans')");
		await waitForEvents(2);

		const events = await db
			.selectFrom('events')
			.select(['path', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'anonymous_id', 'session_id'])
			.orderBy('received_at')
			.execute();
		assert.equal(await page.evaluate('window.__beaconCalls'), 2);
		assert.equal(await page.evaluate('window.__beaconContentType'), 'application/json');
		assert.deepEqual(
			events.map(({ path }) => path),
			['/tracked-page', '/tracked-pricing'],
		);
		assert.deepInclude(events[0], { utm_source: 'docs', utm_medium: 'referral', utm_campaign: 'launch' });
		assert.equal(events[1]?.referrer, `${fixtureOrigin}/tracked-page`);
		assert.equal(events[0]?.anonymous_id, events[1]?.anonymous_id);
		assert.equal(events[0]?.session_id, events[1]?.session_id);
	});

	test('collects a page restored from the back-forward cache exactly once', async ({ assert }) => {
		const trackingId = await createWebsite();
		const browser = await chromium.launch({
			channel: 'chromium',
			ignoreDefaultArgs: ['--disable-back-forward-cache'],
		});
		const browserContext = await browser.newContext();
		await browserContext.addInitScript((restorationUrl) => {
			window.addEventListener('pageshow', (event) => {
				if (event.persisted) {
					navigator.sendBeacon(restorationUrl);
				}
			});
		}, `${fixtureOrigin}/back-forward-cache-restored`);
		const page = await browserContext.newPage();
		const firstPage = trackedPageUrl(trackingId, '/tracked-first', 'no-referrer');
		const secondPage = trackedPageUrl(trackingId, '/tracked-second', 'no-referrer');

		try {
			await page.goto(firstPage.href);
			await waitForEvents(1);
			await page.locator('#navigate').evaluate((link, href) => link.setAttribute('href', href), secondPage.href);
			await page.locator('#navigate').click();
			await page.waitForURL(secondPage.href);
			await waitForEvents(2);
			await page.evaluate('history.back()');
			await waitForBackForwardCacheRestoration();
			await waitForEvents(3);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const events = await db.selectFrom('events').select('path').orderBy('received_at').execute();
			assert.deepEqual(
				events.map(({ path }) => path),
				['/tracked-first', '/tracked-second', '/tracked-first'],
			);
		} finally {
			await browser.close();
		}
	});

	test('falls back to keepalive fetch when sendBeacon declines the event', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		await browserContext.addInitScript(`
			navigator.sendBeacon = () => false;
			const fetch = window.fetch.bind(window);
			window.__fetchKeepalive = false;
			window.__fetchContentType = null;
			window.fetch = (input, init) => {
				window.__fetchKeepalive = init?.keepalive === true;
				window.__fetchContentType = init?.headers?.['content-type'];
				return fetch(input, init);
			};
		`);
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/tracked-page-fallback', 'same-origin').href);
		await waitForEvents(1);

		assert.isTrue(await page.evaluate('window.__fetchKeepalive'));
		assert.equal(await page.evaluate('window.__fetchContentType'), 'application/json');
	});

	test('keeps long browser events within the collection payload limit', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		await browserContext.addInitScript(`
			window.__payloadBytes = null;
			const sendBeacon = navigator.sendBeacon.bind(navigator);
			navigator.sendBeacon = (url, data) => {
				window.__payloadBytes = data?.size;
				return sendBeacon(url, data);
			};
		`);
		const page = await browserContext.newPage();
		const targetPath = `/tracked-${'p'.repeat(1890)}`;
		const target = trackedPageUrl(trackingId, targetPath, 'no-referrer');
		target.searchParams.set('utm_source', 's'.repeat(pageviewProtocol.maxUtmLength));
		target.searchParams.set('utm_medium', 'm'.repeat(pageviewProtocol.maxUtmLength));
		target.searchParams.set('utm_campaign', 'c'.repeat(pageviewProtocol.maxUtmLength));
		const referrerPage = new URL(`/referrer/${'r'.repeat(1890)}`, fixtureOrigin);
		referrerPage.searchParams.set('policy', 'unsafe-url');
		const unprunedBody = JSON.stringify({
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path: targetPath,
			referrer: `${referrerPage.origin}${referrerPage.pathname}`,
			utmSource: 's'.repeat(pageviewProtocol.maxUtmLength),
			utmMedium: 'm'.repeat(pageviewProtocol.maxUtmLength),
			utmCampaign: 'c'.repeat(pageviewProtocol.maxUtmLength),
		});
		assert.isAbove(Buffer.byteLength(unprunedBody), pageviewProtocol.maxPayloadBytes);

		await page.goto(referrerPage.href);
		await page.evaluate((url) => {
			window.location.href = url;
		}, target.href);
		await waitForEvents(1);
		assert.equal(await page.evaluate(() => document.referrer), referrerPage.href);

		const event = await db
			.selectFrom('events')
			.select(['path', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign'])
			.executeTakeFirstOrThrow();
		const payloadBytes = await page.evaluate(() => (window as unknown as { __payloadBytes: number }).__payloadBytes);
		assert.isAtMost(payloadBytes, pageviewProtocol.maxPayloadBytes);
		assert.equal(event.path, targetPath);
		assert.isNull(event.referrer);
		assert.equal(event.utm_source, 's'.repeat(pageviewProtocol.maxUtmLength));
		assert.equal(event.utm_medium, 'm'.repeat(pageviewProtocol.maxUtmLength));
		assert.equal(event.utm_campaign, 'c'.repeat(pageviewProtocol.maxUtmLength));
	});

	test('discards invalid UTM values without discarding the pageview', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();
		const trackedPage = trackedPageUrl(trackingId, '/tracked-invalid-utm', 'no-referrer');
		trackedPage.searchParams.set('utm_source', 'campaign\u0000invalid');

		await page.goto(trackedPage.href);
		await waitForEvents(1);

		const event = await db.selectFrom('events').select(['path', 'utm_source']).executeTakeFirstOrThrow();
		assert.equal(event.path, '/tracked-invalid-utm');
		assert.isNull(event.utm_source);
	});

	test('normalizes browser pathnames to the collection grammar', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/docs/[slug]|50%-off/%5Bkept%5D', 'no-referrer').href);
		await waitForEvents(1);

		const event = await db.selectFrom('events').select('path').executeTakeFirstOrThrow();
		assert.equal(event.path, '/docs/%5Bslug%5D%7C50%25-off/%5Bkept%5D');
	});

	test('does not collect when Do Not Track is enabled', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		await browserContext.addInitScript(
			"Object.defineProperty(Navigator.prototype, 'doNotTrack', { configurable: true, get: () => '1' })",
		);
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/tracked-page-private', 'no-referrer').href);
		await page.waitForTimeout(200);

		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});
});
