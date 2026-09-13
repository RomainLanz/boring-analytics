import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import { ReportDataUnavailable } from '~/components/report-data-unavailable';
import { TrendChart } from '~/components/trend-chart';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ overview: Data.Websites.WebsiteOverview; trackerUrl: string }>;
type AcquisitionDimension = 'Referrers' | 'UTM sources' | 'UTM media' | 'UTM campaigns';

interface RankedVisitors {
	name: string;
	visitors: number;
}

export default function ShowWebsite({ overview, trackerUrl }: PageProps) {
	const [acquisitionDimension, setAcquisitionDimension] = useState<AcquisitionDimension>('Referrers');
	const integrationSnippet = `<script
  defer
  data-website-id="${overview.website.trackingId}"
  src="${trackerUrl}"
></script>`;
	const acquisition: Record<AcquisitionDimension, RankedVisitors[]> = {
		'Referrers': overview.referrers,
		'UTM sources': overview.utmSources,
		'UTM media': overview.utmMediums,
		'UTM campaigns': overview.utmCampaigns,
	};
	const acquisitionLabels: Record<AcquisitionDimension, string> = {
		'Referrers': 'Referrers',
		'UTM sources': 'Source',
		'UTM media': 'Medium',
		'UTM campaigns': 'Campaign',
	};

	return (
		<>
			<Head title={overview.website.name} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={overview.website} period={overview.period} activeReport="traffic">
					<Button asChild intent="secondary" size="small">
						<Link href="/websites/new">Add website</Link>
					</Button>
				</WebsiteReportHeader>

				{overview.dataAvailability.status === 'unavailable' ? (
					<ReportDataUnavailable
						availableFrom={overview.dataAvailability.availableFrom}
						websiteId={overview.website.id}
					/>
				) : (
					<AvailableTrafficReport
						overview={overview}
						acquisition={acquisition}
						acquisitionDimension={acquisitionDimension}
						acquisitionLabels={acquisitionLabels}
						setAcquisitionDimension={setAcquisitionDimension}
					/>
				)}

				<details className="border-border mt-8 border-t py-5">
					<summary className="text-ink cursor-pointer text-sm font-semibold">Install the tracker</summary>
					<p className="text-muted mt-3 text-sm">
						Add this tag inside your site's <code>&lt;head&gt;</code>. It records page loads and SPA navigation without
						cookies.
					</p>
					<pre className="bg-surface text-ink rounded-control border-border mt-4 max-w-2xl overflow-x-auto border px-4 py-3 text-sm whitespace-pre-wrap">
						<code>{integrationSnippet}</code>
					</pre>
				</details>
			</main>
		</>
	);
}

function AvailableTrafficReport({
	overview,
	acquisition,
	acquisitionDimension,
	acquisitionLabels,
	setAcquisitionDimension,
}: {
	overview: Data.Websites.WebsiteOverview;
	acquisition: Record<AcquisitionDimension, RankedVisitors[]>;
	acquisitionDimension: AcquisitionDimension;
	acquisitionLabels: Record<AcquisitionDimension, string>;
	setAcquisitionDimension: (dimension: AcquisitionDimension) => void;
}) {
	return (
		<>
			<Card padding="none" className="overflow-hidden">
				<section className="border-border grid border-b sm:grid-cols-2 lg:grid-cols-5" aria-label="Visit summary">
					<Metric className="border-b sm:border-r lg:border-b-0" label="Pageviews" value={overview.metrics.pageviews} />
					<Metric className="border-b lg:border-r lg:border-b-0" label="Visitors" value={overview.metrics.visitors} />
					<Metric
						className="border-b sm:border-r lg:border-b-0"
						label="Sessions"
						value={overview.sessionMetrics.status === 'available' ? overview.sessionMetrics.sessions : 'Unavailable'}
					/>
					<Metric
						className="border-b lg:border-r lg:border-b-0"
						label="Bounce rate"
						value={
							overview.sessionMetrics.status === 'available' && overview.sessionMetrics.bounceRate !== null
								? `${overview.sessionMetrics.bounceRate.toFixed(1)}%`
								: overview.sessionMetrics.status === 'available'
									? '—'
									: 'Unavailable'
						}
					/>
					<Metric
						className="sm:col-span-2 lg:col-span-1"
						label="Median session duration"
						value={
							overview.sessionMetrics.status === 'available' && overview.sessionMetrics.medianDurationSeconds !== null
								? formatDuration(overview.sessionMetrics.medianDurationSeconds)
								: overview.sessionMetrics.status === 'available'
									? '—'
									: 'Unavailable'
						}
					/>
				</section>
				{overview.sessionMetrics.status === 'unavailable' ? (
					<p className="border-border bg-surface-muted text-muted border-b px-5 py-3 text-xs">
						{overview.sessionMetrics.reason === 'product_mode'
							? 'Session metrics are available for Websites in Anonymous Mode.'
							: overview.sessionMetrics.reason === 'legacy_data'
								? 'Session metrics will appear once this period contains only inactivity-based sessions.'
								: 'Session metrics are unavailable because the required event history has expired.'}
					</p>
				) : overview.sessionMetrics.bounceRate === null ? (
					<p className="border-border bg-surface-muted text-muted border-b px-5 py-3 text-xs">
						Bounce rate and median duration appear after a session has been inactive for 30 minutes.
					</p>
				) : null}

				<TrendChart
					id="traffic-heading"
					title="Traffic"
					dailyLabel="Daily pageviews"
					valueLabel="Pageviews"
					tableCaption="Daily pageviews data"
					trend={overview.trend.map((day) => ({ date: day.date, value: day.pageviews }))}
				/>
			</Card>

			<div className="mt-8 grid gap-5 lg:grid-cols-2">
				<Report title="Top pages">
					{overview.topPages.length ? (
						<table className="w-full table-fixed text-sm">
							<caption className="sr-only">Top pages</caption>
							<thead className="bg-surface-muted text-muted text-[10px] font-medium uppercase sm:text-xs">
								<tr>
									<th scope="col" className="w-auto px-4 py-2 text-left">
										Page
									</th>
									<th scope="col" className="w-16 px-1 py-2 text-right sm:w-24 sm:px-2">
										Visitors
									</th>
									<th scope="col" className="w-16 px-2 py-2 text-right sm:w-24 sm:px-4">
										<span className="sm:hidden">Views</span>
										<span className="hidden sm:inline">Pageviews</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{overview.topPages.map((page) => (
									<tr key={page.name} className="border-border border-t">
										<th scope="row" className="text-ink p-0 text-left font-normal">
											<div className="relative flex min-h-11 items-center px-4">
												<RowBar value={page.pageviews} maximum={overview.topPages[0].pageviews} />
												<span className="relative truncate">{page.name}</span>
											</div>
										</th>
										<td className="text-muted px-1 text-right text-xs tabular-nums sm:px-2 sm:text-sm">
											{formatNumber(page.visitors)}
										</td>
										<td className="text-ink px-2 text-right text-xs tabular-nums sm:px-4 sm:text-sm">
											{formatNumber(page.pageviews)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<EmptyReport message="No pages recorded in this period." />
					)}
				</Report>

				<Report
					title="Acquisition"
					actions={
						<div className="flex flex-wrap justify-end gap-x-4 gap-y-1" aria-label="Acquisition dimension">
							{(['Referrers', 'UTM sources', 'UTM media', 'UTM campaigns'] as const).map((dimension) => (
								<button
									type="button"
									key={dimension}
									aria-label={dimension}
									aria-pressed={acquisitionDimension === dimension}
									className={`${acquisitionDimension === dimension ? 'border-ink text-ink' : 'text-muted border-transparent'} hover:text-ink -mb-3 cursor-pointer border-b-2 pb-3 text-xs font-medium transition-colors`}
									onClick={() => setAcquisitionDimension(dimension)}
								>
									{acquisitionLabels[dimension]}
								</button>
							))}
						</div>
					}
				>
					<RankedList items={acquisition[acquisitionDimension]} label={acquisitionDimension} />
				</Report>
			</div>
		</>
	);
}

function Metric({ className, label, value }: { className?: string; label: string; value: number | string }) {
	return (
		<div className={`border-border px-5 py-4 ${className ?? ''}`}>
			<p className="text-muted text-xs font-medium uppercase">{label}</p>
			<p className="text-ink mt-1 text-2xl font-bold tracking-tight tabular-nums">
				{typeof value === 'number' ? formatNumber(value) : value}
			</p>
		</div>
	);
}

function Report({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
	return (
		<section className="rounded-card border-border bg-surface shadow-card overflow-hidden border">
			<header className="border-border flex min-h-12 flex-col items-stretch justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
				<h2 className="text-ink shrink-0 text-sm font-semibold">{title}</h2>
				{actions}
			</header>
			{children}
		</section>
	);
}

function RankedList({ items, label }: { items: RankedVisitors[]; label: string }) {
	if (!items.length) {
		const emptyLabel = label.startsWith('UTM') ? label : label.toLowerCase();

		return <EmptyReport message={`No ${emptyLabel} recorded in this period.`} />;
	}

	return (
		<table className="w-full table-fixed text-sm">
			<caption className="sr-only">{label} by visitors</caption>
			<thead className="bg-surface-muted text-muted text-xs font-medium uppercase">
				<tr>
					<th scope="col" className="px-4 py-2 text-left">
						{label}
					</th>
					<th scope="col" className="w-24 px-4 py-2 text-right">
						Visitors
					</th>
				</tr>
			</thead>
			<tbody>
				{items.map((item) => (
					<tr key={item.name} className="border-border border-t">
						<th scope="row" className="text-ink p-0 text-left font-normal">
							<div className="relative flex min-h-11 items-center px-4">
								<RowBar value={item.visitors} maximum={items[0].visitors} />
								<span className="relative truncate">{item.name}</span>
							</div>
						</th>
						<td className="text-ink px-4 text-right tabular-nums">{formatNumber(item.visitors)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function RowBar({ value, maximum }: { value: number; maximum: number }) {
	return (
		<span
			aria-hidden="true"
			className="bg-accent-soft absolute inset-y-1 left-0 rounded-r-sm"
			style={{ width: `${maximum ? (value / maximum) * 100 : 0}%` }}
		/>
	);
}

function EmptyReport({ message }: { message: string }) {
	return <p className="text-muted px-4 py-10 text-center text-sm">{message}</p>;
}

const numberFormatter = new Intl.NumberFormat('en');

function formatNumber(value: number) {
	return numberFormatter.format(value);
}

function formatDuration(value: number) {
	const totalSeconds = Math.round(value);
	const hours = Math.floor(totalSeconds / 3_600);
	const minutes = Math.floor((totalSeconds % 3_600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}

	return `${seconds}s`;
}
