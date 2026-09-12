import env from '#start/env';

const EVENT_TIME_TOLERANCE_MS = env.get('EVENT_TIME_TOLERANCE_HOURS') * 60 * 60 * 1000;

export function isAcceptableEventTime(occurredAt: Date, receivedAt: Date) {
	return (
		Number.isFinite(occurredAt.getTime()) &&
		Math.abs(receivedAt.getTime() - occurredAt.getTime()) <= EVENT_TIME_TOLERANCE_MS
	);
}
