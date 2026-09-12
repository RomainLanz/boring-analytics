import { Form } from '@adonisjs/inertia/react';
import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{
	settings: Data.Collection.ServerEventSettings;
	serverEventsUrl: string;
}>;

export default function WebsiteSettings({ settings, serverEventsUrl }: PageProps) {
	const { flash } = usePage();
	const [copiedSecret, setCopiedSecret] = useState<string>();
	const curl = `curl -X POST "${serverEventsUrl}" \\
  -H "Authorization: Bearer $BORING_ANALYTICS_SERVER_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<JSON
  {
    "name": "invoice.paid",
    "occurredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "path": "/billing",
    "properties": { "amount": 49 }
  }
JSON`;

	async function copySecret() {
		if (!flash.serverKeySecret) {
			return;
		}

		await navigator.clipboard.writeText(flash.serverKeySecret);
		setCopiedSecret(flash.serverKeySecret);
	}

	return (
		<>
			<Head title={`${settings.website.name} settings`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={settings.website} period={settings.period} activeReport="settings" />

				<div className="max-w-3xl">
					<header className="mb-5">
						<h2 className="text-ink text-xl font-bold tracking-tight">Server events</h2>
						<p className="text-muted mt-1 text-sm">
							Send custom events from your backend with one secret key scoped to this Website.
						</p>
					</header>

					{flash.serverKeySecret ? (
						<section className="border-mint bg-mint-soft rounded-card mb-5 border p-5" aria-labelledby="new-key-title">
							<h3 id="new-key-title" className="text-ink text-sm font-semibold">
								Your server key has been generated
							</h3>
							<p className="text-muted mt-1 text-sm">Copy this secret now. You won’t be able to see it again.</p>
							<div className="mt-4 flex flex-col gap-2 sm:flex-row">
								<code className="border-border bg-surface text-ink rounded-control min-w-0 flex-1 overflow-x-auto border px-3 py-2.5 text-sm whitespace-nowrap">
									{flash.serverKeySecret}
								</code>
								<Button type="button" size="small" onClick={copySecret}>
									{copiedSecret === flash.serverKeySecret ? 'Copied' : 'Copy secret'}
								</Button>
							</div>
						</section>
					) : null}

					<Card padding="none" className="overflow-hidden">
						<header className="border-border border-b px-5 py-4">
							<h3 className="text-ink text-sm font-semibold">Active server key</h3>
						</header>
						{settings.serverKey ? (
							<div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between">
								<dl className="grid flex-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
									<div>
										<dt className="text-muted text-xs">Key prefix</dt>
										<dd className="text-ink mt-1 font-mono">{settings.serverKey.prefix}</dd>
									</div>
									<div>
										<dt className="text-muted text-xs">Created</dt>
										<dd className="text-ink mt-1">{formatDate(settings.serverKey.createdAt)}</dd>
									</div>
								</dl>
								<Form route="website_server_keys.destroy" routeParams={{ id: settings.website.id }}>
									{({ processing }) => (
										<Button
											type="submit"
											intent="secondary"
											size="small"
											loading={processing}
											className="border-rose text-rose hover:bg-rose-soft"
											onClick={(event) => {
												if (!window.confirm('Revoke this server key? Requests using it will stop immediately.')) {
													event.preventDefault();
												}
											}}
										>
											{processing ? 'Revoking…' : 'Revoke key'}
										</Button>
									)}
								</Form>
							</div>
						) : (
							<div className="p-5">
								<p className="text-muted text-sm">Create a key to authenticate events sent by your backend.</p>
								<Form route="website_server_keys.store" routeParams={{ id: settings.website.id }}>
									{({ processing }) => (
										<Button type="submit" size="small" loading={processing} className="mt-4">
											{processing ? 'Creating…' : 'Create server key'}
										</Button>
									)}
								</Form>
							</div>
						)}
					</Card>

					<Card padding="none" className="mt-5 overflow-hidden">
						<header className="border-border border-b px-5 py-4">
							<h3 className="text-ink text-sm font-semibold">Example request</h3>
						</header>
						<pre className="bg-surface-muted text-ink overflow-x-auto p-5 text-sm whitespace-pre-wrap">
							<code>{curl}</code>
						</pre>
					</Card>

					<p className="border-accent bg-accent-soft text-muted rounded-control mt-5 border px-4 py-3 text-sm">
						Server events use the same name, path, property, and timestamp rules as browser custom events.
					</p>
				</div>
			</main>
		</>
	);
}

const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

function formatDate(value: string) {
	return dateFormatter.format(new Date(value));
}
