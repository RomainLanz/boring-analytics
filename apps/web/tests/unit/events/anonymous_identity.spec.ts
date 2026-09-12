import { test } from '@japa/runner';
import { anonymousIdentityRotation } from '#collection/anonymous_identity_policy';
import { deriveAnonymousIdentity } from '#collection/services/anonymous_identity';

const input = {
	websiteId: '0199425d-3208-7000-8000-000000000001',
	ip: '203.0.113.42',
	userAgent: 'Test Browser',
};

test.group('Anonymous identity', () => {
	test('is stable inside its windows and separates Websites', ({ assert }) => {
		const receivedAt = new Date('2026-09-11T12:01:00.000Z');
		const identity = deriveAnonymousIdentity('test-secret', { ...input, receivedAt });
		const repeated = deriveAnonymousIdentity('test-secret', {
			...input,
			receivedAt: new Date(receivedAt.getTime() + 10 * 60 * 1000),
		});
		const otherWebsite = deriveAnonymousIdentity('test-secret', {
			...input,
			websiteId: '0199425d-3208-7000-8000-000000000002',
			receivedAt,
		});

		assert.equal(identity.anonymousId, repeated.anonymousId);
		assert.equal(identity.sessionId, repeated.sessionId);
		assert.notEqual(identity.anonymousId, otherWebsite.anonymousId);
		assert.notEqual(identity.sessionId, otherWebsite.sessionId);
	});

	test('rotates the anonymous and session identifiers at their documented boundaries', ({ assert }) => {
		const boundary = new Date('2026-09-12T00:00:00.000Z');
		const beforeBoundary = new Date(boundary.getTime() - 1);
		const before = deriveAnonymousIdentity('test-secret', { ...input, receivedAt: beforeBoundary });
		const after = deriveAnonymousIdentity('test-secret', { ...input, receivedAt: boundary });
		const nextSession = deriveAnonymousIdentity('test-secret', {
			...input,
			receivedAt: new Date(boundary.getTime() + anonymousIdentityRotation.sessionIdMs),
		});

		assert.notEqual(before.anonymousId, after.anonymousId);
		assert.notEqual(before.sessionId, after.sessionId);
		assert.equal(after.anonymousId, nextSession.anonymousId);
		assert.notEqual(after.sessionId, nextSession.sessionId);
	});
});
