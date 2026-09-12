import { createHmac } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { anonymousIdentityRotation } from '#collection/anonymous_identity_policy';
import env from '#start/env';

interface AnonymousIdentityInput {
	websiteId: string;
	ip: string;
	userAgent: string;
	receivedAt: Date;
}

function digest(secret: string, namespace: string, bucket: number, input: AnonymousIdentityInput) {
	return createHmac('sha256', secret)
		.update(`${namespace}\0${bucket}\0${input.websiteId}\0${input.ip}\0${input.userAgent}`)
		.digest('base64url');
}

export function deriveAnonymousIdentity(secret: string, input: AnonymousIdentityInput) {
	return {
		anonymousId: digest(
			secret,
			'anonymous',
			Math.floor(input.receivedAt.getTime() / anonymousIdentityRotation.anonymousIdMs),
			input,
		),
		sessionId: digest(
			secret,
			'session',
			Math.floor(input.receivedAt.getTime() / anonymousIdentityRotation.sessionIdMs),
			input,
		),
	};
}

@inject()
export class AnonymousIdentity {
	derive(input: AnonymousIdentityInput) {
		return deriveAnonymousIdentity(env.get('ANONYMOUS_ID_SECRET').release(), input);
	}
}
