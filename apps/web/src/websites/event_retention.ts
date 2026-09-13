export const finiteEventRetentionDays = [60, 90, 180, 365] as const;

export type EventRetentionDays = (typeof finiteEventRetentionDays)[number] | null;

export function parseEventRetentionDays(value: number | null): EventRetentionDays {
	if (value === null || finiteEventRetentionDays.includes(value as Exclude<EventRetentionDays, null>)) {
		return value as EventRetentionDays;
	}

	throw new Error(`Invalid Website event retention persisted: ${value}`);
}
