export const anonymousIdentityRotation = {
	anonymousIdMs: 24 * 60 * 60 * 1000,
} as const;

export const anonymousSessionInactivityMs = 30 * 60 * 1_000;
export const anonymousSessionDurationSeconds = anonymousSessionInactivityMs / 1_000;

/** Compatibility bucket for events sent by cached tracker versions without an ephemeral session ID. */
export const legacyAnonymousSessionBucketMs = anonymousSessionInactivityMs;
