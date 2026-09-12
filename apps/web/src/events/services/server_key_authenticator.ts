import { inject } from '@adonisjs/core';
import hash from '@adonisjs/core/services/hash';
import {
	ServerKeyRepository,
	type ServerKeyAuthenticationTarget,
} from '#collection/repositories/server_key_repository';

const serverKeyPattern = /^(ba_sk_[A-Za-z0-9_-]{12})_[A-Za-z0-9_-]{43}$/u;

@inject()
export class ServerKeyAuthenticator {
	constructor(private readonly serverKeys: ServerKeyRepository) {}

	async findActiveTarget(secret: string): Promise<ServerKeyAuthenticationTarget | null> {
		const prefix = serverKeyPattern.exec(secret)?.[1];

		if (!prefix) {
			return null;
		}

		return this.serverKeys.findAuthenticationTarget(prefix);
	}

	verify(target: ServerKeyAuthenticationTarget, secret: string) {
		return hash.verify(target.secretHash, secret);
	}
}
