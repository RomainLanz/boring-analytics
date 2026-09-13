/// <reference lib="dom" />

import {
	browserEventProtocol,
	customEventNamePattern,
	isValidDistinctId,
	isValidEventId,
	isValidEventProperties,
	isValidSessionId,
	normalizeBrowserEventPath,
} from '#collection/browser_event_protocol';
import { sessionForActivity, type BrowserSessionState } from '#collection/browser_session';
import type { EventProperties } from '#collection/browser_event_protocol';

declare global {
	interface Window {
		boringAnalytics?: {
			track(name: string, properties?: EventProperties, options?: { eventId?: string }): boolean;
			trackBatch(events: { name: string; properties?: EventProperties; eventId?: string }[]): boolean;
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
	const sessionStorageKey = `boringAnalytics:${trackingId}:session`;
	let browserSession = readBrowserSession() ?? null;
	let sessionStorageWritable = true;

	function readBrowserSession(): BrowserSessionState | null | undefined {
		try {
			const stored: unknown = JSON.parse(sessionStorage.getItem(sessionStorageKey) ?? 'null');

			if (
				typeof stored === 'object' &&
				stored !== null &&
				'id' in stored &&
				isValidSessionId(stored.id) &&
				'lastActivityAt' in stored &&
				typeof stored.lastActivityAt === 'number' &&
				Number.isFinite(stored.lastActivityAt)
			) {
				return { id: stored.id, lastActivityAt: stored.lastActivityAt };
			}
		} catch {
			// Browsers may disable sessionStorage. The in-memory session still works for this document.
			return undefined;
		}

		return null;
	}

	function createSessionId() {
		if (typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}

		const bytes = crypto.getRandomValues(new Uint8Array(16));
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
		return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
	}

	function sessionIdForActivity(activityAt: number) {
		const storedSession = sessionStorageWritable ? readBrowserSession() : undefined;

		if (storedSession !== undefined) {
			browserSession = storedSession;
		}

		browserSession = sessionForActivity(browserSession, activityAt, createSessionId);

		try {
			sessionStorage.setItem(sessionStorageKey, JSON.stringify(browserSession));
		} catch {
			// Keep the session in memory when browser storage is unavailable.
			sessionStorageWritable = false;
		}

		return browserSession.id;
	}

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

	function send(event: object, maxPayloadBytes = browserEventProtocol.maxPayloadBytes) {
		const body = JSON.stringify(event);
		const payload = new Blob([body], { type: 'application/json' });

		if (payload.size > maxPayloadBytes) {
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

	function customEvent(name: string, properties: EventProperties, eventId?: string) {
		const path = currentPath();

		if (
			doNotTrack ||
			path === null ||
			typeof name !== 'string' ||
			name.length > browserEventProtocol.maxNameLength ||
			!customEventNamePattern.test(name) ||
			!isValidEventProperties(properties) ||
			(eventId !== undefined && !isValidEventId(eventId))
		) {
			return null;
		}

		const occurredAt = new Date();

		return {
			distinctId,
			eventId,
			name,
			occurredAt: occurredAt.toISOString(),
			path,
			properties: { ...properties },
			sessionId: sessionIdForActivity(occurredAt.getTime()),
		};
	}

	function collectCustomEvent(name: string, properties: EventProperties = {}, options: { eventId?: string } = {}) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			return false;
		}

		const event = customEvent(name, properties, options.eventId);
		return event !== null && send({ trackingId, ...event });
	}

	function collectCustomEventBatch(events: { name: string; properties?: EventProperties; eventId?: string }[]) {
		if (!Array.isArray(events) || events.length < 1 || events.length > browserEventProtocol.maxBatchEvents) {
			return false;
		}

		const payload = [];

		for (let index = 0; index < events.length; index++) {
			const submittedEvent: unknown = events[index];

			if (typeof submittedEvent !== 'object' || submittedEvent === null) {
				return false;
			}

			const { name, properties = {}, eventId } = submittedEvent as (typeof events)[number];
			payload.push(customEvent(name, properties, eventId));
		}

		if (payload.some((event) => event === null)) {
			return false;
		}

		return send({ trackingId, events: payload }, browserEventProtocol.maxBatchPayloadBytes);
	}

	function collectPageview() {
		const url = new URL(window.location.href);
		const path = currentPath();

		if (doNotTrack || path === null) {
			referrer = withoutQueryOrFragment(url.href);
			return;
		}

		const occurredAt = new Date();
		const event = {
			trackingId,
			distinctId,
			name: '$pageview',
			occurredAt: occurredAt.toISOString(),
			path,
			referrer,
			sessionId: sessionIdForActivity(occurredAt.getTime()),
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
	window.boringAnalytics = { track: collectCustomEvent, trackBatch: collectCustomEventBatch, setDistinctId, identify };
	collectPageview();
}
