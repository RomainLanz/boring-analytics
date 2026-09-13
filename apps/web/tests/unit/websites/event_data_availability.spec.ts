import { test } from '@japa/runner';
import { eventDataAvailability } from '#websites/queries/event_data_availability';

test.group('Event data availability', () => {
	test('uses the received-at retention cutoff plus the accepted event-time tolerance', ({ assert }) => {
		const now = new Date('2026-04-01T00:00:00.000Z');
		const firstGuaranteedEventTime = new Date('2026-02-01T00:00:00.000Z');

		assert.deepEqual(eventDataAvailability(60, new Date('2026-01-31T23:59:59.999Z'), now, null, 24), {
			status: 'unavailable',
			availableFrom: firstGuaranteedEventTime.toISOString(),
		});
		assert.deepEqual(eventDataAvailability(60, firstGuaranteedEventTime, now, null, 24), { status: 'available' });
		assert.deepEqual(eventDataAvailability(null, new Date('1900-01-01T00:00:00.000Z'), now, null, 24), {
			status: 'available',
		});
	});

	test('keeps a previous purge boundary after retention is lengthened or disabled', ({ assert }) => {
		const historicalAvailableFrom = new Date('2026-02-01T00:00:00.000Z');
		const requiredFrom = new Date('2026-01-31T23:59:59.999Z');
		const now = new Date('2026-04-01T00:00:00.000Z');

		assert.deepEqual(eventDataAvailability(365, requiredFrom, now, historicalAvailableFrom, 24), {
			status: 'unavailable',
			availableFrom: historicalAvailableFrom.toISOString(),
		});
		assert.deepEqual(eventDataAvailability(null, requiredFrom, now, historicalAvailableFrom, 24), {
			status: 'unavailable',
			availableFrom: historicalAvailableFrom.toISOString(),
		});
	});
});
