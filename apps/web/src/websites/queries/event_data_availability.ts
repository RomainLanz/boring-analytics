import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';
import env from '#start/env';
import { parseEventRetentionDays, type EventRetentionDays } from '#websites/event_retention';

export type EventDataAvailability = { status: 'available' } | { status: 'unavailable'; availableFrom: string };

@inject()
export class EventDataAvailabilityQuery {
	constructor(private readonly transactions: TransactionManager) {}

	async execute(websiteId: string, ownerUserId: string, requiredFrom: Date, now: Date) {
		const website = await this.transactions
			.currentDatabase()
			.selectFrom('websites')
			.innerJoin('workspaces', 'workspaces.id', 'websites.workspace_id')
			.select(['websites.retention_days', 'websites.events_available_from'])
			.where('websites.id', '=', websiteId)
			.where('workspaces.owner_user_id', '=', ownerUserId)
			.executeTakeFirstOrThrow();

		return eventDataAvailability(
			parseEventRetentionDays(website.retention_days),
			requiredFrom,
			now,
			website.events_available_from,
		);
	}
}

export function eventDataAvailability(
	retentionDays: EventRetentionDays,
	requiredFrom: Date,
	now: Date,
	historicalAvailableFrom: Date | null,
	eventTimeToleranceHours = env.get('EVENT_TIME_TOLERANCE_HOURS'),
): EventDataAvailability {
	if (retentionDays === null && historicalAvailableFrom === null) {
		return { status: 'available' };
	}

	const policyAvailableFrom =
		retentionDays === null
			? null
			: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000 + eventTimeToleranceHours * 60 * 60 * 1_000);
	const availableFrom =
		policyAvailableFrom === null || (historicalAvailableFrom !== null && historicalAvailableFrom > policyAvailableFrom)
			? historicalAvailableFrom
			: policyAvailableFrom;

	if (availableFrom === null) {
		return { status: 'available' };
	}

	return requiredFrom >= availableFrom
		? { status: 'available' }
		: { status: 'unavailable', availableFrom: availableFrom.toISOString() };
}
