import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ website: Data.Websites.WebsiteDetails; trackerUrl: string }>;

export default function ShowWebsite({ website, trackerUrl }: PageProps) {
	const integrationSnippet = `<script
  defer
  data-website-id="${website.trackingId}"
  src="${trackerUrl}"
></script>`;

	return (
		<>
			<Head title={website.name} />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
				<header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-accent text-sm font-semibold tracking-wide uppercase">Website</p>
						<h1 className="text-ink mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{website.name}</h1>
						<p className="text-muted mt-3">Pageviews accepted from {website.allowedDomain}</p>
					</div>
					<Button asChild intent="secondary">
						<Link href="/websites/new">Add another website</Link>
					</Button>
				</header>

				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<p className="text-muted text-sm font-medium">Pageviews</p>
						<p className="text-ink mt-3 text-4xl font-bold tabular-nums">{website.pageviews}</p>
					</Card>
					<Card>
						<p className="text-muted text-sm font-medium">Allowed domain</p>
						<p className="text-ink mt-3 text-lg font-semibold break-all">{website.allowedDomain}</p>
					</Card>
				</div>

				<Card className="mt-4">
					<h2 className="text-ink text-lg font-semibold">Install the tracker</h2>
					<p className="text-muted mt-1 text-sm">
						Add this tag inside your site's <code>&lt;head&gt;</code>. It records page loads and SPA navigation without
						cookies.
					</p>
					<pre className="bg-surface-muted text-ink rounded-control mt-4 px-4 py-3 text-sm break-all whitespace-pre-wrap">
						<code>{integrationSnippet}</code>
					</pre>
				</Card>
			</main>
		</>
	);
}
