import { inject } from '@adonisjs/core';
import { isAcceptableEventTime } from '#collection/event_time';
import { EventRepository } from '#collection/repositories/event_repository';
import { AnonymousIdentity } from '#collection/services/anonymous_identity';
import { err, ok, type Result } from '#core/result';
import { WebsiteRepository } from '#websites/repositories/website_repository';
import type { EventProperties } from '#collection/browser_event_protocol';

interface BrowserEventContext {
	trackingId: string;
	origin: string;
	path: string;
	occurredAt: Date;
	ip: string;
	userAgent: string;
}

export type RecordBrowserEventParams = BrowserEventContext &
	(
		| {
				type: 'pageview';
				referrer: string | null;
				utmSource: string | null;
				utmMedium: string | null;
				utmCampaign: string | null;
		  }
		| { type: 'custom'; name: string; properties: EventProperties }
	);

type RecordBrowserEventError =
	| { type: 'collection_forbidden' }
	| { type: 'invalid_occurred_at' }
	| { type: 'invalid_referrer' };

function sanitizeReferrer(value: string | null): string | null | undefined {
	if (value === null) {
		return null;
	}

	try {
		const url = new URL(value);

		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
			return undefined;
		}

		return `${url.origin}${url.pathname}`;
	} catch {
		return undefined;
	}
}

@inject()
export class RecordBrowserEvent {
	constructor(
		private readonly websites: WebsiteRepository,
		private readonly events: EventRepository,
		private readonly anonymousIdentity: AnonymousIdentity,
	) {}

	async execute(params: RecordBrowserEventParams): Promise<Result<void, RecordBrowserEventError>> {
		const target = await this.websites.findCollectionTarget(params.trackingId);

		if (!target || !target.allowedDomain.matchesOrigin(params.origin)) {
			return err({ type: 'collection_forbidden' });
		}

		const receivedAt = new Date();

		if (!isAcceptableEventTime(params.occurredAt, receivedAt)) {
			return err({ type: 'invalid_occurred_at' });
		}

		const referrer = params.type === 'pageview' ? sanitizeReferrer(params.referrer) : null;

		if (referrer === undefined) {
			return err({ type: 'invalid_referrer' });
		}

		const identity = this.anonymousIdentity.derive({
			websiteId: target.id,
			ip: params.ip,
			userAgent: params.userAgent,
			receivedAt,
		});

		await this.events.appendBrowserEvent(target.id, {
			name: params.type === 'pageview' ? '$pageview' : params.name,
			occurredAt: params.occurredAt,
			path: params.path,
			referrer,
			utmSource: params.type === 'pageview' ? params.utmSource : null,
			utmMedium: params.type === 'pageview' ? params.utmMedium : null,
			utmCampaign: params.type === 'pageview' ? params.utmCampaign : null,
			properties: params.type === 'pageview' ? null : params.properties,
			anonymousId: identity.anonymousId,
			sessionId: identity.sessionId,
		});
		return ok(undefined);
	}
}
