import { anonymousSessionInactivityMs } from '#collection/anonymous_identity_policy';

export interface BrowserSessionState {
	id: string;
	lastActivityAt: number;
}

export function sessionForActivity(
	current: BrowserSessionState | null,
	activityAt: number,
	createId: () => string,
): BrowserSessionState {
	if (
		current === null ||
		!Number.isFinite(current.lastActivityAt) ||
		activityAt < current.lastActivityAt ||
		activityAt - current.lastActivityAt >= anonymousSessionInactivityMs
	) {
		return { id: createId(), lastActivityAt: activityAt };
	}

	return { id: current.id, lastActivityAt: activityAt };
}
