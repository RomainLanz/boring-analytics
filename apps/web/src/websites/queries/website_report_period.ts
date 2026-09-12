import { DateTime } from 'luxon';

export function websiteReportPeriod(websiteId: string, timezone: string, now: Date) {
	const currentTime = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone);

	if (!currentTime.isValid) {
		throw new Error(`Invalid timezone persisted for website ${websiteId}`);
	}

	const endDate = currentTime.toISODate();

	if (!endDate) {
		throw new Error(`Invalid report period for website ${websiteId}`);
	}

	const firstCalendarDate = DateTime.fromISO(endDate, { zone: 'utc' }).minus({ days: 29 });
	const startDate = firstCalendarDate.toISODate();

	if (!startDate) {
		throw new Error(`Invalid report period for website ${websiteId}`);
	}

	const firstDate = DateTime.fromISO(startDate, { zone: timezone }).startOf('day');
	const firstInstant = firstDate
		.getPossibleOffsets()
		.reduce((earliest, candidate) => (candidate.toMillis() < earliest.toMillis() ? candidate : earliest));
	const dates = Array.from({ length: 30 }, (_, index) => {
		const date = firstCalendarDate.plus({ days: index }).toISODate();

		if (!date) {
			throw new Error(`Invalid report period for website ${websiteId}`);
		}

		return date;
	});

	return {
		startDate,
		endDate,
		dates,
		periodStart: firstInstant.toUTC().toJSDate(),
		periodEnd: DateTime.fromJSDate(now, { zone: 'utc' }).toJSDate(),
	};
}
