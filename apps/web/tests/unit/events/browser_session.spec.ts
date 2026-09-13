import { test } from '@japa/runner';
import { sessionForActivity } from '#collection/browser_session';

test.group('Browser session', () => {
	test('continues below 30 minutes and starts a new session at or above the inactivity boundary', ({ assert }) => {
		const ids = [
			'01994610-d000-4000-8000-000000000001',
			'01994610-d000-4000-8000-000000000002',
			'01994610-d000-4000-8000-000000000003',
		];
		const createId = () => ids.shift()!;
		const startedAt = Date.parse('2026-09-13T12:00:00.000Z');

		const started = sessionForActivity(null, startedAt, createId);
		const belowBoundary = sessionForActivity(started, startedAt + 29 * 60 * 1_000 + 59 * 1_000, createId);
		const atBoundary = sessionForActivity(belowBoundary, belowBoundary.lastActivityAt + 30 * 60 * 1_000, createId);
		const aboveBoundary = sessionForActivity(atBoundary, atBoundary.lastActivityAt + 30 * 60 * 1_000 + 1_000, createId);

		assert.equal(belowBoundary.id, started.id);
		assert.notEqual(atBoundary.id, belowBoundary.id);
		assert.notEqual(aboveBoundary.id, atBoundary.id);
		assert.lengthOf(ids, 0);
	});

	test('does not split active sessions at an old fixed bucket or UTC rotation boundary', ({ assert }) => {
		const ids = ['01994610-d000-4000-8000-000000000001', '01994610-d000-4000-8000-000000000002'];
		const createId = () => ids.shift()!;
		const beforeBucket = sessionForActivity(null, Date.parse('2026-09-13T12:29:59.000Z'), createId);
		const afterBucket = sessionForActivity(beforeBucket, Date.parse('2026-09-13T12:30:01.000Z'), createId);
		const beforeUtcRotation = sessionForActivity(null, Date.parse('2026-09-13T23:59:59.000Z'), createId);
		const afterUtcRotation = sessionForActivity(beforeUtcRotation, Date.parse('2026-09-14T00:00:01.000Z'), createId);

		assert.equal(afterBucket.id, '01994610-d000-4000-8000-000000000001');
		assert.equal(afterUtcRotation.id, '01994610-d000-4000-8000-000000000002');
		assert.lengthOf(ids, 0);
	});
});
