/// <reference lib="dom" />

import { normalizePageviewPath, pageviewProtocol } from '#collection/pageview_protocol';

const script = document.currentScript as HTMLScriptElement | null;
const trackingId = script?.dataset.websiteId;
const windowDoNotTrack = (window as Window & { doNotTrack?: string }).doNotTrack;
const microsoftDoNotTrack = (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack;
const doNotTrack = [navigator.doNotTrack, windowDoNotTrack, microsoftDoNotTrack].some((value) =>
	['1', 'yes'].includes(value ?? ''),
);

if (script && trackingId && !doNotTrack) {
	const endpoint = new URL('/api/events', script.src).href;
	let previousUrl = window.location.href;
	let referrer = withoutQueryOrFragment(document.referrer);

	function withoutQueryOrFragment(value: string) {
		if (!value) {
			return null;
		}

		try {
			const url = new URL(value);
			const referrerUrl = `${url.origin}${url.pathname}`;
			return referrerUrl.length <= pageviewProtocol.maxReferrerLength ? referrerUrl : null;
		} catch {
			return null;
		}
	}

	function utmParameter(value: string | null) {
		const parameter = value?.slice(0, pageviewProtocol.maxUtmLength);
		return parameter && !/\p{Cc}/u.test(parameter) ? parameter : null;
	}

	function collectPageview() {
		const url = new URL(window.location.href);
		const path = normalizePageviewPath(url.pathname);

		if (path.length > pageviewProtocol.maxPathLength) {
			referrer = withoutQueryOrFragment(url.href);
			return;
		}

		const event = {
			trackingId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path,
			referrer,
			utmSource: utmParameter(url.searchParams.get('utm_source')),
			utmMedium: utmParameter(url.searchParams.get('utm_medium')),
			utmCampaign: utmParameter(url.searchParams.get('utm_campaign')),
		};
		let body = JSON.stringify(event);
		let payload = new Blob([body], { type: 'application/json' });

		for (const field of ['referrer', 'utmCampaign', 'utmMedium', 'utmSource'] as const) {
			if (payload.size <= pageviewProtocol.maxPayloadBytes) {
				break;
			}

			event[field] = null;
			body = JSON.stringify(event);
			payload = new Blob([body], { type: 'application/json' });
		}

		const sent = payload.size <= pageviewProtocol.maxPayloadBytes && navigator.sendBeacon?.(endpoint, payload);

		if (payload.size <= pageviewProtocol.maxPayloadBytes && !sent) {
			void fetch(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				keepalive: true,
				credentials: 'omit',
			}).catch(() => undefined);
		}

		referrer = withoutQueryOrFragment(url.href);
	}

	function collectNavigation() {
		if (window.location.href === previousUrl) {
			return;
		}

		previousUrl = window.location.href;
		collectPageview();
	}

	for (const method of ['pushState', 'replaceState'] as const) {
		const original = history[method];
		history[method] = function (...args) {
			original.apply(this, args);
			queueMicrotask(collectNavigation);
		};
	}

	window.addEventListener('popstate', collectNavigation);
	window.addEventListener('pageshow', (event) => {
		if (event.persisted) {
			previousUrl = window.location.href;
			collectPageview();
		}
	});
	collectPageview();
}
