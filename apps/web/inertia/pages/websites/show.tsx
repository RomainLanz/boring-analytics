import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
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
				<header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-accent text-xs font-semibold tracking-widest uppercase">Website overview</p>
						<h1 className="text-ink mt-1 text-2xl font-bold tracking-tight">{overview.website.name}</h1>
						<p className="text-muted mt-1 text-sm">
							{overview.website.allowedDomain} · {overview.website.timezone}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<span className="border-border bg-surface text-ink rounded-control border px-3 py-2 text-sm font-medium">
							{formatPeriod(overview.period.startDate, overview.period.endDate)}
						</span>
						<Button asChild intent="secondary" size="small">
							<Link href="/websites/new">Add website</Link>
						</Button>
					</div>
				</header>

				<Card padding="none" className="overflow-hidden">
					<section className="border-border grid border-b sm:grid-cols-3" aria-label="Visit summary">
						<Metric label="Pageviews" value={overview.metrics.pageviews} />
						<Metric label="Visitors" value={overview.metrics.visitors} />
						<Metric label="Sessions" value={overview.metrics.sessions} />
					</section>

					<TrafficChart trend={overview.trend} />
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

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="border-border px-5 py-4 sm:border-r sm:last:border-r-0">
			<p className="text-muted text-xs font-medium uppercase">{label}</p>
			<p className="text-ink mt-1 text-2xl font-bold tracking-tight tabular-nums">{formatNumber(value)}</p>
		</div>
	);
}

function TrafficChart({ trend }: { trend: Array<{ date: string; pageviews: number }> }) {
	const width = 1_000;
	const height = 220;
	const maximum = Math.max(...trend.map((day) => day.pageviews), 0);
	const scaleMaximum = maximum <= 1 ? 1 : Math.ceil(maximum / 2) * 2;
	const points = trend.map((day, index) => {
		const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * width;
		const y = height - 12 - (day.pageviews / scaleMaximum) * (height - 30);
		return `${x},${y}`;
	});
	const area = points.length ? `M${points.join(' L')} L${width},${height} L0,${height} Z` : '';
	const labels = trend
		.map((day, index) => ({ day, index }))
		.filter(({ index }) => (index % 7 === 0 && index < trend.length - 2) || index === trend.length - 1);
	const scaleTicks = maximum === 0 ? [0] : scaleMaximum === 1 ? [1, 0] : [scaleMaximum, scaleMaximum / 2, 0];

	return (
		<section className="p-5" aria-labelledby="traffic-heading">
			<div className="mb-3 flex items-center justify-between">
				<h2 id="traffic-heading" className="text-ink text-sm font-semibold">
					Traffic
				</h2>
				<span className="text-muted text-xs">Daily pageviews</span>
			</div>
			<div className="border-border relative h-56 border-b bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_54px,var(--color-border)_55px)]">
				<svg
					className="text-accent size-full overflow-visible"
					viewBox={`0 0 ${width} ${height}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<defs>
						<linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="currentColor" stopOpacity="0.25" />
							<stop offset="1" stopColor="currentColor" stopOpacity="0" />
						</linearGradient>
					</defs>
					<path d={area} fill="url(#traffic-fill)" />
					<polyline
						points={points.join(' ')}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<div
					data-chart-scale
					aria-hidden="true"
					className="text-muted pointer-events-none absolute inset-0 text-[10px] tabular-nums"
				>
					{scaleTicks.map((tick) => (
						<span
							key={tick}
							className="bg-surface absolute left-0 -translate-y-1/2 pr-1"
							style={{ top: `${((height - 12 - (tick / scaleMaximum) * (height - 30)) / height) * 100}%` }}
						>
							{formatNumber(tick)}
						</span>
					))}
				</div>
			</div>
			<div className="text-muted relative mt-2 h-5 text-xs">
				{labels.map(({ day, index }) => (
					<span
						key={day.date}
						className="absolute whitespace-nowrap"
						style={{
							left: `${trend.length === 1 ? 0 : (index / (trend.length - 1)) * 100}%`,
							transform:
								index === 0 ? undefined : index === trend.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
						}}
					>
						{formatDate(day.date)}
					</span>
				))}
			</div>
			<table className="sr-only">
				<caption>Daily pageviews data</caption>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">Pageviews</th>
					</tr>
				</thead>
				<tbody>
					{trend.map((day) => (
						<tr key={day.date}>
							<td>
								<time dateTime={day.date}>{formatDate(day.date)}</time>
							</td>
							<td>{day.pageviews}</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
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
const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function formatNumber(value: number) {
	return numberFormatter.format(value);
}

function formatDate(date: string) {
	return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function formatPeriod(startDate: string, endDate: string) {
	return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
