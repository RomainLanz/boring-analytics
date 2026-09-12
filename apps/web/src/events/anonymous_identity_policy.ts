export const anonymousIdentityRotation = {
	anonymousIdMs: 24 * 60 * 60 * 1000,
	sessionIdMs: 30 * 60 * 1000,
} as const;

export const anonymousSessionDurationSeconds = anonymousIdentityRotation.sessionIdMs / 1_000;
