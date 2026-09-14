import { test } from '@japa/runner';
import { parseFunnelReportSegmentation } from '#app/funnels/funnel_report_segmentation';

test.group('Funnel report segmentation', () => {
	test('parses built-in entry-event dimensions', ({ assert }) => {
		for (const kind of ['source', 'path', 'utm_source', 'utm_medium', 'utm_campaign'] as const) {
			assert.deepEqual(parseFunnelReportSegmentation({ segment: kind }), { kind });
		}
	});

	test('preserves safe property keys exactly', ({ assert }) => {
		for (const property of ['plan tier', '计划', '__proto__']) {
			assert.deepEqual(parseFunnelReportSegmentation({ segment: 'property', property }), {
				kind: 'property',
				key: property,
			});
		}
	});

	test('rejects incomplete, conflicting, and invalid dimensions', ({ assert }) => {
		assert.isUndefined(parseFunnelReportSegmentation({}));
		assert.isUndefined(parseFunnelReportSegmentation({ segment: 'device' }));
		assert.isUndefined(parseFunnelReportSegmentation({ segment: 'property' }));
		assert.isUndefined(parseFunnelReportSegmentation({ segment: 'property', property: 'plan\u0000' }));
		assert.isUndefined(parseFunnelReportSegmentation({ segment: 'source', property: 'plan' }));
	});
});
