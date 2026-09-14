import { test } from '@japa/runner';
import { technicalDimensionsFromUserAgent } from '#collection/technical_dimensions';

test.group('Technical dimensions', () => {
	test('classifies overlapping browser user agents into a short stable taxonomy', ({ assert }) => {
		const scenarios = [
			{
				name: 'Chrome on Windows desktop',
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
				expected: { browser: 'Chrome', operatingSystem: 'Windows', device: 'Desktop' },
			},
			{
				name: 'Edge before Chrome',
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
				expected: { browser: 'Edge', operatingSystem: 'Windows', device: 'Desktop' },
			},
			{
				name: 'unsupported Opera before Chrome',
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/121.0.0.0',
				expected: { browser: 'Other', operatingSystem: 'Windows', device: 'Desktop' },
			},
			{
				name: 'unsupported Samsung Internet before Chrome',
				userAgent:
					'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
				expected: { browser: 'Other', operatingSystem: 'Android', device: 'Mobile' },
			},
			{
				name: 'unsupported Vivaldi before Chrome',
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Vivaldi/7.5.3735.58',
				expected: { browser: 'Other', operatingSystem: 'Windows', device: 'Desktop' },
			},
			{
				name: 'unsupported Yandex Browser before Chrome',
				userAgent:
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 YaBrowser/25.8.0.0 Safari/537.36',
				expected: { browser: 'Other', operatingSystem: 'Windows', device: 'Desktop' },
			},
			{
				name: 'Safari on macOS',
				userAgent:
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
				expected: { browser: 'Safari', operatingSystem: 'macOS', device: 'Desktop' },
			},
			{
				name: 'Firefox on Linux',
				userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
				expected: { browser: 'Firefox', operatingSystem: 'Linux', device: 'Desktop' },
			},
			{
				name: 'CriOS on iPhone',
				userAgent:
					'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
				expected: { browser: 'Chrome', operatingSystem: 'iOS', device: 'Mobile' },
			},
			{
				name: 'FxiOS on iPhone',
				userAgent:
					'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/142.0 Mobile/15E148 Safari/605.1.15',
				expected: { browser: 'Firefox', operatingSystem: 'iOS', device: 'Mobile' },
			},
			{
				name: 'Chrome on Android phone',
				userAgent:
					'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
				expected: { browser: 'Chrome', operatingSystem: 'Android', device: 'Mobile' },
			},
			{
				name: 'Safari on iPad',
				userAgent:
					'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
				expected: { browser: 'Safari', operatingSystem: 'iOS', device: 'Tablet' },
			},
			{
				name: 'headless browser before Chrome',
				userAgent:
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
				expected: { browser: 'Bot', operatingSystem: 'Unknown', device: 'Bot' },
			},
			{
				name: 'crawler',
				userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
				expected: { browser: 'Bot', operatingSystem: 'Unknown', device: 'Bot' },
			},
			{
				name: 'unrecognized non-empty agent',
				userAgent: 'custom-client/1.0',
				expected: { browser: 'Other', operatingSystem: 'Other', device: 'Other' },
			},
			{
				name: 'missing agent',
				userAgent: '',
				expected: { browser: 'Unknown', operatingSystem: 'Unknown', device: 'Unknown' },
			},
		] as const;

		for (const scenario of scenarios) {
			assert.deepEqual(technicalDimensionsFromUserAgent(scenario.userAgent), scenario.expected, scenario.name);
		}
	});
});
