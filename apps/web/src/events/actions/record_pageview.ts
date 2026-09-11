import { inject } from '@adonisjs/core';
import { EventRepository } from '#collection/repositories/event_repository';
import { AnonymousIdentity } from '#collection/services/anonymous_identity';
import { err, ok, type Result } from '#core/result';
import env from '#start/env';
import { WebsiteRepository } from '#websites/repositories/website_repository';

export interface RecordPageviewParams {
	trackingId: string;
	origin: string;
	path: string;
	occurredAt: Date;
	referrer: string | null;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	ip: string;
	userAgent: string;
}

type RecordPageviewError =
	| { type: 'collection_forbidden' }
	| { type: 'invalid_occurred_at' }
	| { type: 'invalid_referrer' };

const EVENT_TIME_TOLERANCE_MS = env.get('EVENT_TIME_TOLERANCE_HOURS') * 60 * 60 * 1000;

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
export class RecordPageview {
	constructor(
		private readonly websites: WebsiteRepository,
		private readonly events: EventRepository,
		private readonly anonymousIdentity: AnonymousIdentity,
	) {}

	async execute(params: RecordPageviewParams): Promise<Result<void, RecordPageviewError>> {
		const target = await this.websites.findCollectionTarget(params.trackingId);

		if (!target || !target.allowedDomain.matchesOrigin(params.origin)) {
			return err({ type: 'collection_forbidden' });
		}

		const receivedAt = new Date();

		if (
			!Number.isFinite(params.occurredAt.getTime()) ||
			Math.abs(receivedAt.getTime() - params.occurredAt.getTime()) > EVENT_TIME_TOLERANCE_MS
		) {
			return err({ type: 'invalid_occurred_at' });
		}

		const referrer = sanitizeReferrer(params.referrer);

		if (referrer === undefined) {
			return err({ type: 'invalid_referrer' });
		}

		const identity = this.anonymousIdentity.derive({
			websiteId: target.id,
			ip: params.ip,
			userAgent: params.userAgent,
			receivedAt,
		});

		await this.events.appendPageview(target.id, {
			occurredAt: params.occurredAt,
			path: params.path,
			referrer,
			utmSource: params.utmSource,
			utmMedium: params.utmMedium,
			utmCampaign: params.utmCampaign,
			anonymousId: identity.anonymousId,
			sessionId: identity.sessionId,
		});
		return ok(undefined);
	}
}
