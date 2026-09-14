import { test } from '@japa/runner';
import { parseWebsiteReportPeriodPreset, websiteReportPeriod } from '#websites/queries/website_report_period';

test.group('Website report period', () => {
	test('accepts 7, 30, and 90 day presets and defaults invalid input to 30 days', ({ assert }) => {
		assert.equal(parseWebsiteReportPeriodPreset('7'), 7);
		assert.equal(parseWebsiteReportPeriodPreset('30'), 30);
		assert.equal(parseWebsiteReportPeriodPreset('90'), 90);
		assert.equal(parseWebsiteReportPeriodPreset(undefined), 30);
		assert.equal(parseWebsiteReportPeriodPreset('14'), 30);
		assert.equal(parseWebsiteReportPeriodPreset('30days'), 30);

		const now = new Date('2026-04-06T10:00:00.000Z');
		assert.lengthOf(websiteReportPeriod('website-id', 'UTC', now, 7).dates, 7);
		assert.lengthOf(websiteReportPeriod('website-id', 'UTC', now, 30).dates, 30);
		assert.lengthOf(websiteReportPeriod('website-id', 'UTC', now, 90).dates, 90);
	});

	test('builds adjacent half-open current and previous periods from Website-local dates', ({ assert }) => {
		const period = websiteReportPeriod('website-id', 'Europe/Zurich', new Date('2026-04-06T10:00:00.000Z'), 7);

		assert.deepEqual(period.dates, [
			'2026-03-31',
			'2026-04-01',
			'2026-04-02',
			'2026-04-03',
			'2026-04-04',
			'2026-04-05',
			'2026-04-06',
		]);
		assert.equal(period.periodStart.toISOString(), '2026-03-30T22:00:00.000Z');
		assert.equal(period.periodEnd.toISOString(), '2026-04-06T10:00:00.000Z');
		assert.deepEqual(period.previous.dates, [
			'2026-03-24',
			'2026-03-25',
			'2026-03-26',
			'2026-03-27',
			'2026-03-28',
			'2026-03-29',
			'2026-03-30',
		]);
		assert.equal(period.previous.periodStart.toISOString(), '2026-03-23T23:00:00.000Z');
		assert.equal(period.previous.periodEnd.toISOString(), period.periodStart.toISOString());
	});

	test('uses 23-hour and 25-hour local days without creating gaps or overlaps', ({ assert }) => {
		const spring = websiteReportPeriod('spring-website', 'Europe/Zurich', new Date('2026-03-30T12:00:00.000Z'), 7);
		const autumn = websiteReportPeriod('autumn-website', 'Europe/Zurich', new Date('2026-10-26T12:00:00.000Z'), 7);

		assert.equal(spring.periodStart.toISOString(), '2026-03-23T23:00:00.000Z');
		assert.equal(spring.previous.periodStart.toISOString(), '2026-03-16T23:00:00.000Z');
		assert.equal(spring.previous.periodEnd.toISOString(), spring.periodStart.toISOString());
		assert.equal(autumn.periodStart.toISOString(), '2026-10-19T22:00:00.000Z');
		assert.equal(autumn.previous.periodStart.toISOString(), '2026-10-12T22:00:00.000Z');
		assert.equal(autumn.previous.periodEnd.toISOString(), autumn.periodStart.toISOString());
	});
});
