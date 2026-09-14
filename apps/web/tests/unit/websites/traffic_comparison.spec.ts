import { test } from '@japa/runner';
import { metricChange, percentagePointChange } from '#websites/traffic_metric_change';

test.group('Traffic metric comparison', () => {
	test('defines relative changes around zero without infinity', ({ assert }) => {
		assert.deepEqual(metricChange(0, 0), { status: 'unchanged' });
		assert.deepEqual(metricChange(12, 0), { status: 'new' });
		assert.deepEqual(metricChange(0, 12), { status: 'decrease', amount: 100 });
		assert.deepEqual(metricChange(15, 12), { status: 'increase', amount: 25 });
	});

	test('does not compare an unavailable metric', ({ assert }) => {
		assert.deepEqual(metricChange(null, 12), { status: 'unavailable' });
		assert.deepEqual(metricChange(12, null), { status: 'unavailable' });
		assert.deepEqual(metricChange(null, null), { status: 'unavailable' });
	});

	test('reports bounce-rate changes in percentage points', ({ assert }) => {
		assert.deepEqual(percentagePointChange(42.3, 45.4), { status: 'decrease', amount: 3.1 });
		assert.deepEqual(percentagePointChange(0, 0), { status: 'unchanged' });
		assert.deepEqual(percentagePointChange(null, 45.4), { status: 'unavailable' });
	});
});
