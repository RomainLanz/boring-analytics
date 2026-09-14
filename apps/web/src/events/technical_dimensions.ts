export const browserFamilies = ['Edge', 'Chrome', 'Safari', 'Firefox', 'Bot', 'Other', 'Unknown'] as const;
export type BrowserFamily = (typeof browserFamilies)[number];

export const operatingSystemFamilies = ['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'Other', 'Unknown'] as const;
export type OperatingSystemFamily = (typeof operatingSystemFamilies)[number];

export const deviceClasses = ['Desktop', 'Mobile', 'Tablet', 'Bot', 'Other', 'Unknown'] as const;
export type DeviceClass = (typeof deviceClasses)[number];

export interface TechnicalDimensions {
	browser: BrowserFamily;
	operatingSystem: OperatingSystemFamily;
	device: DeviceClass;
}

const botPattern = /bot\b|crawler|spider|slurp|headless|bingpreview|facebookexternalhit/u;

/**
 * Reduces a transient User-Agent to coarse dimensions. Match order is deliberate because Chromium and iOS agents
 * contain tokens for the browsers and operating systems they emulate.
 */
export function technicalDimensionsFromUserAgent(userAgent: string): TechnicalDimensions {
	if (!userAgent.trim()) {
		return { browser: 'Unknown', operatingSystem: 'Unknown', device: 'Unknown' };
	}

	const normalized = userAgent.toLowerCase();

	if (botPattern.test(normalized)) {
		return { browser: 'Bot', operatingSystem: 'Unknown', device: 'Bot' };
	}

	return {
		browser: browserFromUserAgent(normalized),
		operatingSystem: operatingSystemFromUserAgent(normalized),
		device: deviceFromUserAgent(normalized),
	};
}

function browserFromUserAgent(userAgent: string): BrowserFamily {
	if (/edg(?:a|ios)?\//u.test(userAgent)) {
		return 'Edge';
	}

	if (/opr\/|opera\/|samsungbrowser\/|vivaldi\/|yabrowser\//u.test(userAgent)) {
		return 'Other';
	}

	if (/crios\/|chrome\/|chromium\//u.test(userAgent)) {
		return 'Chrome';
	}

	if (/fxios\/|firefox\//u.test(userAgent)) {
		return 'Firefox';
	}

	if (/safari\//u.test(userAgent)) {
		return 'Safari';
	}

	return 'Other';
}

function operatingSystemFromUserAgent(userAgent: string): OperatingSystemFamily {
	if (/ipad|iphone|ipod/u.test(userAgent)) {
		return 'iOS';
	}

	if (/android/u.test(userAgent)) {
		return 'Android';
	}

	if (/windows/u.test(userAgent)) {
		return 'Windows';
	}

	if (/macintosh|mac os x/u.test(userAgent)) {
		return 'macOS';
	}

	if (/linux|x11/u.test(userAgent)) {
		return 'Linux';
	}

	return 'Other';
}

function deviceFromUserAgent(userAgent: string): DeviceClass {
	if (/ipad|tablet/u.test(userAgent) || (/android/u.test(userAgent) && !/mobile/u.test(userAgent))) {
		return 'Tablet';
	}

	if (/iphone|ipod|mobile|android/u.test(userAgent)) {
		return 'Mobile';
	}

	if (/windows|macintosh|mac os x|linux|x11/u.test(userAgent)) {
		return 'Desktop';
	}

	return 'Other';
}
