export const websiteIdentityModes = ['anonymous', 'product'] as const;

export type WebsiteIdentityMode = (typeof websiteIdentityModes)[number];

export function parseWebsiteIdentityMode(value: string): WebsiteIdentityMode {
	if (websiteIdentityModes.includes(value as WebsiteIdentityMode)) {
		return value as WebsiteIdentityMode;
	}

	throw new Error(`Invalid Website identity mode persisted: ${value}`);
}
