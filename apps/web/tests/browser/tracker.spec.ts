import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from '@japa/runner';
import { chromium } from 'playwright';
import { browserEventProtocol } from '#collection/browser_event_protocol';
import { db } from '#shared/services/db';

const trackerUrl = 'http://localhost:3333/tracker.js';
let fixtureOrigin = '';
let backForwardCacheRestorations = 0;

const fixtureServer = createServer((request, response) => {
	const url = new URL(request.url ?? '/', 'http://fixture');
	const trackingId = url.searchParams.get('website');
	const distinctId = url.searchParams.get('distinct_id');

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
		`<!doctype html><title>Tracked page</title><a id="navigate">Navigate</a><script data-website-id="${trackingId}"${distinctId ? ` data-distinct-id="${distinctId}"` : ''} src="${trackerUrl}"></script>`,
	);
});

async function createWebsite(identityMode: 'anonymous' | 'product' = 'anonymous') {
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
			identity_mode: identityMode,
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

	test('keeps an ephemeral anonymous session across a same-tab reload', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();
		const url = trackedPageUrl(trackingId, '/tracked-page', 'no-referrer').href;

		await page.goto(url);
		await waitForEvents(1);
		const storedSession = await page.evaluate(
			(key) => sessionStorage.getItem(key),
			`boringAnalytics:${trackingId}:session`,
		);
		await page.reload();
		await waitForEvents(2);

		assert.match(storedSession ?? '', /"id":"[0-9a-f-]{36}"/u);
		const events = await db.selectFrom('events').select('session_id').orderBy('received_at').execute();
		assert.equal(events[0]?.session_id, JSON.parse(storedSession!).id);
		assert.equal(events[1]?.session_id, events[0]?.session_id);
	});

	test('generates valid sessions when randomUUID is unavailable', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		await browserContext.addInitScript(() => {
			Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined });
		});
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/http-compatible', 'no-referrer').href);
		await waitForEvents(1);
		await page.evaluate(() => window.boringAnalytics?.track('signup'));
		await waitForEvents(2);

		const events = await db.selectFrom('events').select('session_id').orderBy('received_at').execute();
		assert.match(events[0]?.session_id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
		assert.equal(events[1]?.session_id, events[0]?.session_id);
	});

	test('keeps an in-memory session when sessionStorage writes fail', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		await browserContext.addInitScript(() => {
			Storage.prototype.setItem = () => {
				throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
			};
		});
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/storage-disabled', 'no-referrer').href);
		await waitForEvents(1);
		await page.evaluate(() => window.boringAnalytics?.track('signup'));
		await waitForEvents(2);

		const events = await db.selectFrom('events').select('session_id').orderBy('received_at').execute();
		assert.equal(events[1]?.session_id, events[0]?.session_id);
	});

	test('exposes a framework-independent custom event API with primitive properties', async ({
		assert,
		browserContext,
	}) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/pricing?private=secret', 'no-referrer').href);
		await waitForEvents(1);
		const accepted = await page.evaluate(() =>
			window.boringAnalytics?.track('signup😀', { plan: 'pro', seats: 3, trial: true, coupon: null }),
		);
		await waitForEvents(2);

		assert.isTrue(accepted);
		const events = await db
			.selectFrom('events')
			.select(['name', 'path', 'properties', 'anonymous_id', 'session_id'])
			.orderBy('received_at')
			.execute();
		assert.deepInclude(events[1], {
			name: 'signup😀',
			path: '/pricing',
			properties: { plan: 'pro', seats: 3, trial: true, coupon: null },
		});
		assert.equal(events[0]?.anonymous_id, events[1]?.anonymous_id);
		assert.equal(events[0]?.session_id, events[1]?.session_id);
	});

	test('accepts a stable optional event_id without changing the existing track signature', async ({
		assert,
		browserContext,
	}) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/pricing', 'no-referrer').href);
		await waitForEvents(1);
		const results = await page.evaluate(() => [
			window.boringAnalytics?.track('signup'),
			window.boringAnalytics?.track('checkout', { plan: 'pro' }, { eventId: 'checkout-stable-1' }),
			window.boringAnalytics?.track('checkout', { plan: 'pro' }, { eventId: 'checkout-stable-1' }),
			window.boringAnalytics?.track('invalid-options', {}, null as never),
		]);
		await waitForEvents(3);

		assert.deepEqual(results, [true, true, true, false]);
		const events = await db.selectFrom('events').select('name').orderBy('received_at').execute();
		assert.deepEqual(
			events.map(({ name }) => name),
			['$pageview', 'signup', 'checkout'],
		);
	});

	test('sends bounded custom-event batches through the framework-independent API', async ({
		assert,
		browserContext,
	}) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/pricing', 'no-referrer').href);
		await waitForEvents(1);
		const results = await page.evaluate(
			(maxBatchEvents) => [
				window.boringAnalytics?.trackBatch([
					{ name: 'signup', properties: { plan: 'pro' }, eventId: 'signup-1' },
					{ name: 'checkout', eventId: 'checkout-1' },
				]),
				window.boringAnalytics?.trackBatch([]),
				window.boringAnalytics?.trackBatch(Array.from({ length: maxBatchEvents + 1 }, () => ({ name: 'too-many' }))),
				window.boringAnalytics?.trackBatch([null] as never),
				window.boringAnalytics?.trackBatch([undefined] as never),
				window.boringAnalytics?.trackBatch(new Array(1) as never),
			],
			browserEventProtocol.maxBatchEvents,
		);
		await waitForEvents(3);

		assert.deepEqual(results, [true, false, false, false, false, false]);
		const events = await db.selectFrom('events').select('name').orderBy('received_at').execute();
		assert.deepEqual(
			events.map(({ name }) => name),
			['$pageview', 'signup', 'checkout'],
		);
	});

	test('sends Product identity from the script and updates it for future events only', async ({
		assert,
		browserContext,
	}) => {
		const trackingId = await createWebsite('product');
		const page = await browserContext.newPage();
		const url = trackedPageUrl(trackingId, '/pricing', 'no-referrer');
		url.searchParams.set('distinct_id', 'account_opaque_a');

		await page.goto(url.href);
		await waitForEvents(1);
		const updated = await page.evaluate(() => window.boringAnalytics?.setDistinctId('account_opaque_b'));
		const rejected = await page.evaluate(
			(limit) => [
				window.boringAnalytics?.setDistinctId(''),
				window.boringAnalytics?.setDistinctId('x'.repeat(limit + 1)),
				window.boringAnalytics?.setDistinctId({ id: 'opaque' } as never),
			],
			browserEventProtocol.maxDistinctIdLength,
		);
		const tracked = await page.evaluate(() => window.boringAnalytics?.track('checkout_started'));
		await waitForEvents(2);

		assert.isTrue(updated);
		assert.deepEqual(rejected, [false, false, false]);
		assert.isTrue(tracked);
		const events = await db.selectFrom('events').select(['distinct_id', 'session_id']).orderBy('received_at').execute();
		assert.deepEqual(events, [
			{ distinct_id: 'account_opaque_a', session_id: null },
			{ distinct_id: 'account_opaque_b', session_id: null },
		]);
	});

	test('identifies the current anonymous browser before using Product identity', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite('product');
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/pricing', 'no-referrer').href);
		await waitForEvents(1);
		const rejected = await page.evaluate(
			(limit) => [
				window.boringAnalytics?.identify(''),
				window.boringAnalytics?.identify('x'.repeat(limit + 1)),
				window.boringAnalytics?.identify({ id: 'opaque' } as never),
			],
			browserEventProtocol.maxDistinctIdLength,
		);
		const identified = await page.evaluate(() => window.boringAnalytics?.identify('account_opaque_a'));
		await waitForEvents(2);
		const tracked = await page.evaluate(() => window.boringAnalytics?.track('signup'));
		await waitForEvents(3);

		assert.deepEqual(rejected, [false, false, false]);
		assert.isTrue(identified);
		assert.isTrue(tracked);
		const events = await db
			.selectFrom('events')
			.select(['name', 'anonymous_id', 'session_id', 'distinct_id'])
			.orderBy('received_at')
			.execute();
		assert.match(events[0]?.anonymous_id ?? '', /^[A-Za-z0-9_-]{43}$/u);
		assert.equal(events[1]?.anonymous_id, events[0]?.anonymous_id);
		assert.deepInclude(events[1], { name: '$identify', session_id: null, distinct_id: 'account_opaque_a' });
		assert.deepInclude(events[2], {
			name: 'signup',
			anonymous_id: null,
			session_id: null,
			distinct_id: 'account_opaque_a',
		});
	});

	test('drops invalid and oversized custom events before transport', async ({ assert, browserContext }) => {
		const trackingId = await createWebsite();
		const page = await browserContext.newPage();

		await page.goto(trackedPageUrl(trackingId, '/tracked-page', 'no-referrer').href);
		await waitForEvents(1);
		const results = await page.evaluate((limits) => {
			const track = window.boringAnalytics?.track;
			return [
				track?.(null as never),
				track?.(undefined as never),
				track?.(42 as never),
				track?.('$signup'),
				track?.('signup\uD800'),
				track?.('signup\uDC00'),
				track?.('signup', { nested: { plan: 'pro' } } as never),
				track?.('signup', { value: '\u0000' }),
				track?.('signup', { value: '\uD800' }),
				track?.('signup', { ['\uD800']: true }),
				track?.('signup', { ['\uDC00']: true }),
				track?.('signup', Object.fromEntries([['__proto__', 'pro']])),
				track?.(
					'signup',
					Object.fromEntries(
						Array.from({ length: limits.maxProperties }, (_, index) => [
							`property_${index}`,
							'x'.repeat(limits.maxPropertyStringLength),
						]),
					),
				),
			];
		}, browserEventProtocol);
		await page.waitForTimeout(100);

		assert.deepEqual(results, [
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 1);
	});

	test('collects a page restored from the back-forward cache exactly once', async ({ assert }) => {
		const trackingId = await createWebsite();
		const browser = await chromium.launch({
			channel: 'chromium',
			ignoreDefaultArgs: ['--disable-back-forward-cache'],
		});
		const browserContext = await browser.newContext();
		await browserContext.addInitScript(`
			const NativeDate = Date;
			const offset = () => Number(localStorage.getItem('trackerClockOffset') ?? -1860000);
			window.Date = class extends NativeDate {
				constructor(...args) {
					super(...(args.length ? args : [NativeDate.now() + offset()]));
				}
				static now() { return NativeDate.now() + offset(); }
			};
		`);
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
			await page.evaluate(() => localStorage.setItem('trackerClockOffset', '-600000'));
			await page.locator('#navigate').evaluate((link, href) => link.setAttribute('href', href), secondPage.href);
			await page.locator('#navigate').click();
			await page.waitForURL(secondPage.href);
			await waitForEvents(2);
			await page.evaluate(() => localStorage.setItem('trackerClockOffset', '0'));
			await page.evaluate('history.back()');
			await waitForBackForwardCacheRestoration();
			await waitForEvents(3);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const events = await db.selectFrom('events').select(['path', 'session_id']).orderBy('received_at').execute();
			assert.deepEqual(
				events.map(({ path }) => path),
				['/tracked-first', '/tracked-second', '/tracked-first'],
			);
			assert.equal(events[1]?.session_id, events[0]?.session_id);
			assert.equal(events[2]?.session_id, events[0]?.session_id);
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
		target.searchParams.set('utm_source', 's'.repeat(browserEventProtocol.maxUtmLength));
		target.searchParams.set('utm_medium', 'm'.repeat(browserEventProtocol.maxUtmLength));
		target.searchParams.set('utm_campaign', 'c'.repeat(browserEventProtocol.maxUtmLength));
		const referrerPage = new URL(`/referrer/${'r'.repeat(1890)}`, fixtureOrigin);
		referrerPage.searchParams.set('policy', 'unsafe-url');
		const unprunedBody = JSON.stringify({
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path: targetPath,
			referrer: `${referrerPage.origin}${referrerPage.pathname}`,
			utmSource: 's'.repeat(browserEventProtocol.maxUtmLength),
			utmMedium: 'm'.repeat(browserEventProtocol.maxUtmLength),
			utmCampaign: 'c'.repeat(browserEventProtocol.maxUtmLength),
		});
		assert.isAbove(Buffer.byteLength(unprunedBody), browserEventProtocol.maxPayloadBytes);

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
		assert.isAtMost(payloadBytes, browserEventProtocol.maxPayloadBytes);
		assert.equal(event.path, targetPath);
		assert.isNull(event.referrer);
		assert.equal(event.utm_source, 's'.repeat(browserEventProtocol.maxUtmLength));
		assert.equal(event.utm_medium, 'm'.repeat(browserEventProtocol.maxUtmLength));
		assert.equal(event.utm_campaign, 'c'.repeat(browserEventProtocol.maxUtmLength));
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
		const tracked = await page.evaluate(() => window.boringAnalytics?.track('signup'));
		await page.waitForTimeout(200);

		assert.isFalse(tracked);
		assert.lengthOf(await db.selectFrom('events').select('id').execute(), 0);
	});
});
