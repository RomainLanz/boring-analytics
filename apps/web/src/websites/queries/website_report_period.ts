import { DateTime } from 'luxon';

export const websiteReportPeriodPresets = [7, 30, 90] as const;
export type WebsiteReportPeriodPreset = (typeof websiteReportPeriodPresets)[number];

const defaultWebsiteReportPeriodPreset: WebsiteReportPeriodPreset = 30;

export function parseWebsiteReportPeriodPreset(value: string | undefined): WebsiteReportPeriodPreset {
	const preset = Number(value);

	return websiteReportPeriodPresets.includes(preset as WebsiteReportPeriodPreset)
		? (preset as WebsiteReportPeriodPreset)
		: defaultWebsiteReportPeriodPreset;
}

export function websiteReportPeriod(
	websiteId: string,
	timezone: string,
	now: Date,
	days: WebsiteReportPeriodPreset = defaultWebsiteReportPeriodPreset,
) {
	const currentTime = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone);

	if (!currentTime.isValid) {
		throw new Error(`Invalid timezone persisted for website ${websiteId}`);
	}

	const endDate = currentTime.toISODate();

	if (!endDate) {
		throw new Error(`Invalid report period for website ${websiteId}`);
	}

	const lastCalendarDate = DateTime.fromISO(endDate, { zone: 'utc' });
	const current = buildCalendarPeriod(websiteId, timezone, lastCalendarDate.minus({ days: days - 1 }), days);
	const previous = buildCalendarPeriod(websiteId, timezone, lastCalendarDate.minus({ days: days * 2 - 1 }), days);

	return {
		preset: days,
		startDate: current.startDate,
		endDate: current.endDate,
		dates: current.dates,
		periodStart: current.periodStart,
		periodEnd: DateTime.fromJSDate(now, { zone: 'utc' }).toJSDate(),
		previous: {
			...previous,
			periodEnd: current.periodStart,
		},
	};
}

function buildCalendarPeriod(websiteId: string, timezone: string, firstCalendarDate: DateTime, days: number) {
	const startDate = requiredDate(firstCalendarDate, websiteId);
	const endDate = requiredDate(firstCalendarDate.plus({ days: days - 1 }), websiteId);
	const firstDate = DateTime.fromISO(startDate, { zone: timezone }).startOf('day');
	const periodStart = firstDate
		.getPossibleOffsets()
		.reduce((earliest, candidate) => (candidate.toMillis() < earliest.toMillis() ? candidate : earliest))
		.toUTC()
		.toJSDate();
	const dates = Array.from({ length: days }, (_, index) =>
		requiredDate(firstCalendarDate.plus({ days: index }), websiteId),
	);

	return { startDate, endDate, dates, periodStart };
}

function requiredDate(dateTime: DateTime, websiteId: string) {
	const date = dateTime.toISODate();

	if (!date) {
		throw new Error(`Invalid report period for website ${websiteId}`);
	}

	return date;
}
