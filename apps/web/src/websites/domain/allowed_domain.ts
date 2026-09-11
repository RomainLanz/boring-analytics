import { ValueObject } from '#core/domain/value_object';
import { err, ok, type Result } from '#core/result';

interface AllowedDomainProperties {
	value: string;
}

export interface InvalidAllowedDomainError {
	type: 'invalid_allowed_domain';
}

const DOMAIN_PATTERN =
	/^(?:localhost|(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/u;

export class AllowedDomain extends ValueObject<AllowedDomainProperties> {
	static create(value: string): Result<AllowedDomain, InvalidAllowedDomainError> {
		const normalizedValue = value.trim().toLowerCase().replace(/\.$/u, '');

		if (!DOMAIN_PATTERN.test(normalizedValue)) {
			return err({ type: 'invalid_allowed_domain' });
		}

		return ok(new AllowedDomain({ value: normalizedValue }));
	}

	matchesOrigin(origin: string) {
		try {
			const url = new URL(origin);
			return (
				(url.protocol === 'http:' || url.protocol === 'https:') &&
				origin === url.origin &&
				!url.username &&
				!url.password &&
				url.hostname.toLowerCase() === this.props.value
			);
		} catch {
			return false;
		}
	}

	toString() {
		return this.props.value;
	}
}
