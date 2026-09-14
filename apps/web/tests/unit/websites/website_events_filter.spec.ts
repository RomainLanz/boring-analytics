import { test } from '@japa/runner';
import { parseWebsiteEventsFilter } from '#app/websites/website_events_filter';

test.group('Website events filter', () => {
	test('parses Browser and Server as exclusive source filters', ({ assert }) => {
		assert.deepEqual(parseWebsiteEventsFilter({ source: 'browser' }), { kind: 'source', value: 'browser' });
		assert.deepEqual(parseWebsiteEventsFilter({ source: 'server' }), { kind: 'source', value: 'server' });
		assert.isNull(parseWebsiteEventsFilter({ source: 'mobile' }));
		assert.isNull(parseWebsiteEventsFilter({ source: 'browser', property: 'plan', value: '"pro"' }));
	});

	test('preserves the exact primitive JSON type in property filters', ({ assert }) => {
		assert.deepEqual(parseWebsiteEventsFilter({ property: 'plan tier 日本語', value: '3' }), {
			kind: 'property',
			key: 'plan tier 日本語',
			value: 3,
		});
		assert.deepEqual(parseWebsiteEventsFilter({ property: 'plan tier 日本語', value: '"3"' }), {
			kind: 'property',
			key: 'plan tier 日本語',
			value: '3',
		});
		assert.deepEqual(parseWebsiteEventsFilter({ property: 'active', value: 'false' }), {
			kind: 'property',
			key: 'active',
			value: false,
		});
		assert.deepEqual(parseWebsiteEventsFilter({ property: 'coupon', value: 'null' }), {
			kind: 'property',
			key: 'coupon',
			value: null,
		});
		assert.deepEqual(parseWebsiteEventsFilter({ property: '__proto__', value: '""' }), {
			kind: 'property',
			key: '__proto__',
			value: '',
		});
	});

	test('rejects missing, malformed, and non-primitive property values', ({ assert }) => {
		assert.isNull(parseWebsiteEventsFilter({}));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan' }));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan', value: 'undefined' }));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan', value: '{"tier":"pro"}' }));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan', value: '[3]' }));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan\u0000', value: '"pro"' }));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan', value: '"\\u0000"' }));
		assert.isNull(parseWebsiteEventsFilter({ property: 'plan', value: '"\\ud800"' }));
	});
});
