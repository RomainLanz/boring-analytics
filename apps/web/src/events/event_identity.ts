import { isValidDistinctId } from '#collection/browser_event_protocol';
import { err, ok, type Result } from '#core/result';
import type { WebsiteIdentityMode } from '#websites/website_identity_mode';

export type EventIdentityError =
	| { type: 'invalid_distinct_id' }
	| { type: 'distinct_id_required' }
	| { type: 'distinct_id_not_allowed' };

export function validateBrowserEventIdentity(
	identityMode: WebsiteIdentityMode,
	distinctId: unknown,
): Result<string | null, EventIdentityError> {
	if (distinctId !== undefined && !isValidDistinctId(distinctId)) {
		return err({ type: 'invalid_distinct_id' });
	}

	if (identityMode === 'anonymous' && distinctId !== undefined) {
		return err({ type: 'distinct_id_not_allowed' });
	}

	return ok(distinctId ?? null);
}

export function validateEventIdentity(
	identityMode: WebsiteIdentityMode,
	distinctId: unknown,
): Result<string | null, EventIdentityError> {
	if (distinctId !== undefined && !isValidDistinctId(distinctId)) {
		return err({ type: 'invalid_distinct_id' });
	}

	if (identityMode === 'product' && distinctId === undefined) {
		return err({ type: 'distinct_id_required' });
	}

	if (identityMode === 'anonymous' && distinctId !== undefined) {
		return err({ type: 'distinct_id_not_allowed' });
	}

	return ok(distinctId ?? null);
}
