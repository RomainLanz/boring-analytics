import { inject } from '@adonisjs/core';
import { validateBrowserEventIdentity, type EventIdentityError } from '#collection/event_identity';
import { isAcceptableEventTime } from '#collection/event_time';
import { EventRepository } from '#collection/repositories/event_repository';
import { AnonymousIdentity } from '#collection/services/anonymous_identity';
import { technicalDimensionsFromUserAgent } from '#collection/technical_dimensions';
import { err, ok, type Result } from '#core/result';
import { TransactionManager } from '#shared/services/transaction_manager';
import { WebsiteRepository } from '#websites/repositories/website_repository';
import type { EventProperties } from '#collection/browser_event_protocol';

interface BrowserEventContext {
	trackingId: string;
	origin: string;
	path: string;
	occurredAt: Date;
	ip: string;
	userAgent: string;
	country: string | null;
	distinctId?: string;
	eventId?: string;
	sessionId?: string;
	batchPosition?: number;
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
		| { type: 'identify'; distinctId: string }
	);

export type RecordBrowserEventError =
	| { type: 'collection_forbidden' }
	| { type: 'invalid_occurred_at' }
	| { type: 'invalid_referrer' }
	| EventIdentityError;

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
		private readonly transactions: TransactionManager,
	) {}

	async execute(params: RecordBrowserEventParams): Promise<Result<void, RecordBrowserEventError>> {
		return this.transactions.run(async () => {
			await this.events.lockEventIds([params.eventId]);
			return this.#execute(params);
		});
	}

	async #execute(params: RecordBrowserEventParams): Promise<Result<void, RecordBrowserEventError>> {
		const target = await this.websites.findCollectionTarget(params.trackingId);

		if (!target || !target.allowedDomains.some((domain) => domain.matchesOrigin(params.origin))) {
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

		const identity = validateBrowserEventIdentity(target.identityMode, params.distinctId);

		if (!identity.ok) {
			return identity;
		}

		const technicalDimensions = technicalDimensionsFromUserAgent(params.userAgent);

		if (params.type === 'identify') {
			const currentIdentity = this.anonymousIdentity.derive({
				websiteId: target.id,
				ip: params.ip,
				userAgent: params.userAgent,
				receivedAt,
			});
			await this.events.appendBrowserIdentification(target.id, {
				eventId: params.eventId,
				batchPosition: params.batchPosition,
				occurredAt: params.occurredAt,
				path: params.path,
				anonymousId: currentIdentity.anonymousId,
				distinctId: params.distinctId,
				country: params.country,
				...technicalDimensions,
			});
			await this.websites.markCollectionKeyUsed(target.collectionKeyId, receivedAt);
			return ok(undefined);
		}

		const anonymousIdentity =
			identity.value === null
				? this.anonymousIdentity.derive({
						websiteId: target.id,
						ip: params.ip,
						userAgent: params.userAgent,
						receivedAt,
					})
				: null;

		await this.events.appendBrowserEvent(target.id, {
			eventId: params.eventId,
			batchPosition: params.batchPosition,
			name: params.type === 'pageview' ? '$pageview' : params.name,
			occurredAt: params.occurredAt,
			path: params.path,
			referrer,
			utmSource: params.type === 'pageview' ? params.utmSource : null,
			utmMedium: params.type === 'pageview' ? params.utmMedium : null,
			utmCampaign: params.type === 'pageview' ? params.utmCampaign : null,
			properties: params.type === 'pageview' ? null : params.properties,
			anonymousId: anonymousIdentity?.anonymousId ?? null,
			sessionId: anonymousIdentity === null ? null : (params.sessionId ?? anonymousIdentity.sessionId),
			distinctId: identity.value,
			country: params.country,
			...technicalDimensions,
		});
		await this.websites.markCollectionKeyUsed(target.collectionKeyId, receivedAt);
		return ok(undefined);
	}
}
