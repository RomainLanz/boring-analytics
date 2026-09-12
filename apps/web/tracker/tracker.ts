/// <reference lib="dom" />

import {
	browserEventProtocol,
	customEventNamePattern,
	isValidDistinctId,
	isValidEventProperties,
	normalizeBrowserEventPath,
} from '#collection/browser_event_protocol';
import type { EventProperties } from '#collection/browser_event_protocol';

declare global {
	interface Window {
		boringAnalytics?: {
			track(name: string, properties?: EventProperties): boolean;
			setDistinctId(distinctId: string): boolean;
			identify(distinctId: string): boolean;
		};
	}
}

const script = document.currentScript as HTMLScriptElement | null;
const trackingId = script?.dataset.websiteId;
const windowDoNotTrack = (window as Window & { doNotTrack?: string }).doNotTrack;
const microsoftDoNotTrack = (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack;
const doNotTrack = [navigator.doNotTrack, windowDoNotTrack, microsoftDoNotTrack].some((value) =>
	['1', 'yes'].includes(value ?? ''),
);

if (script && trackingId) {
	const endpoint = new URL('/api/events', script.src).href;
	let previousUrl = window.location.href;
	let referrer = withoutQueryOrFragment(document.referrer);
	let distinctId = isValidDistinctId(script.dataset.distinctId) ? script.dataset.distinctId : undefined;

	function withoutQueryOrFragment(value: string) {
		if (!value) {
			return null;
		}

		try {
			const url = new URL(value);
			const referrerUrl = `${url.origin}${url.pathname}`;
			return referrerUrl.length <= browserEventProtocol.maxReferrerLength ? referrerUrl : null;
		} catch {
			return null;
		}
	}

	function utmParameter(value: string | null) {
		const parameter = value?.slice(0, browserEventProtocol.maxUtmLength);
		return parameter && !/\p{Cc}/u.test(parameter) ? parameter : null;
	}

	function send(event: object) {
		const body = JSON.stringify(event);
		const payload = new Blob([body], { type: 'application/json' });

		if (payload.size > browserEventProtocol.maxPayloadBytes) {
			return false;
		}

		const sent = navigator.sendBeacon?.(endpoint, payload);

		if (!sent) {
			void fetch(endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				keepalive: true,
				credentials: 'omit',
			}).catch(() => undefined);
		}

		return true;
	}

	function currentPath() {
		const url = new URL(window.location.href);
		const path = normalizeBrowserEventPath(url.pathname);
		return path.length <= browserEventProtocol.maxPathLength ? path : null;
	}

	function collectCustomEvent(name: string, properties: EventProperties = {}) {
		const path = currentPath();

		if (
			doNotTrack ||
			path === null ||
			typeof name !== 'string' ||
			name.length > browserEventProtocol.maxNameLength ||
			!customEventNamePattern.test(name) ||
			!isValidEventProperties(properties)
		) {
			return false;
		}

		return send({
			trackingId,
			distinctId,
			name,
			occurredAt: new Date().toISOString(),
			path,
			properties: { ...properties },
		});
	}

	function collectPageview() {
		const url = new URL(window.location.href);
		const path = currentPath();

		if (doNotTrack || path === null) {
			referrer = withoutQueryOrFragment(url.href);
			return;
		}

		const event = {
			trackingId,
			distinctId,
			name: '$pageview',
			occurredAt: new Date().toISOString(),
			path,
			referrer,
			utmSource: utmParameter(url.searchParams.get('utm_source')),
			utmMedium: utmParameter(url.searchParams.get('utm_medium')),
			utmCampaign: utmParameter(url.searchParams.get('utm_campaign')),
		};

		for (const field of ['referrer', 'utmCampaign', 'utmMedium', 'utmSource'] as const) {
			if (new Blob([JSON.stringify(event)]).size <= browserEventProtocol.maxPayloadBytes) {
				break;
			}

			event[field] = null;
		}

		send(event);
		referrer = withoutQueryOrFragment(url.href);
	}

	function collectNavigation() {
		if (window.location.href === previousUrl) {
			return;
		}

		previousUrl = window.location.href;
		collectPageview();
	}

	function setDistinctId(value: string) {
		if (!isValidDistinctId(value)) {
			return false;
		}

		distinctId = value;
		return true;
	}

	function identify(value: string) {
		const path = currentPath();

		if (doNotTrack || path === null || !isValidDistinctId(value)) {
			return false;
		}

		const sent = send({
			trackingId,
			distinctId: value,
			name: '$identify',
			occurredAt: new Date().toISOString(),
			path,
		});

		if (sent) {
			distinctId = value;
		}

		return sent;
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
	window.boringAnalytics = { track: collectCustomEvent, setDistinctId, identify };
	collectPageview();
}
