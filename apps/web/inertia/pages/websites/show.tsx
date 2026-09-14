import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import { metricChange, percentagePointChange, type TrafficMetricChange } from '#websites/traffic_metric_change';
import { ReportDataUnavailable } from '~/components/report-data-unavailable';
import { TrendChart } from '~/components/trend-chart';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ overview: Data.Websites.WebsiteOverview; trackerUrl: string }>;
type AcquisitionDimension = 'Referrers' | 'UTM sources' | 'UTM media' | 'UTM campaigns';
type TechnicalDimension = 'Browser' | 'Operating system' | 'Device';

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
					<nav className="flex items-center gap-1" aria-label="Traffic period">
						{([7, 30, 90] as const).map((days) => (
							<Button
								key={days}
								asChild
								intent={overview.period.preset === days ? 'primary' : 'secondary'}
								size="small"
							>
								<Link
									href={`/websites/${overview.website.id}?period=${days}`}
									aria-current={overview.period.preset === days ? 'page' : undefined}
								>
									{days} days
								</Link>
							</Button>
						))}
					</nav>
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
				<VisitSummary overview={overview} />
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
					comparisonTrend={
						overview.comparison.status === 'available'
							? overview.comparison.trend.map((day) => ({ date: day.date, value: day.pageviews }))
							: undefined
					}
				/>
			</Card>

			<div className="mt-8">
				<TechnicalBreakdowns breakdowns={overview.technicalBreakdowns} />
			</div>

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

function TechnicalBreakdowns({ breakdowns }: { breakdowns: Data.Websites.WebsiteOverview['technicalBreakdowns'] }) {
	const [activeDimension, setActiveDimension] = useState<TechnicalDimension>('Browser');
	const dimensions = [
		{ label: 'Browser', plural: 'Browsers', items: breakdowns.browsers },
		{ label: 'Operating system', plural: 'Operating systems', items: breakdowns.operatingSystems },
		{ label: 'Device', plural: 'Devices', items: breakdowns.devices },
	] as const;

	return (
		<Report
			title="Technology"
			description="Pageviews in this period"
			actions={
				<div className="flex items-center gap-4 sm:hidden" aria-label="Technology dimension">
					{dimensions.map(({ label }) => (
						<button
							type="button"
							key={label}
							aria-pressed={activeDimension === label}
							className={`${activeDimension === label ? 'border-ink text-ink' : 'text-muted border-transparent'} hover:text-ink -mb-3 cursor-pointer border-b-2 pb-3 text-xs font-medium transition-colors`}
							onClick={() => setActiveDimension(label)}
						>
							{label}
						</button>
					))}
				</div>
			}
		>
			<div className="sm:grid sm:grid-cols-3">
				{dimensions.map(({ label, plural, items }, index) => (
					<div
						key={label}
						className={`${activeDimension === label ? 'block' : 'hidden'} border-border sm:block ${index < dimensions.length - 1 ? 'sm:border-r' : ''}`}
					>
						<TechnicalBreakdown title={label} plural={plural} items={items} />
					</div>
				))}
			</div>
		</Report>
	);
}

function TechnicalBreakdown({
	title,
	plural,
	items,
}: {
	title: string;
	plural: string;
	items: Array<{ name: string; pageviews: number }>;
}) {
	if (!items.length) {
		return (
			<>
				<h3 className="bg-surface-muted text-muted border-border border-b px-4 py-2 text-xs font-medium uppercase">
					{title}
				</h3>
				<EmptyReport message={`No ${plural.toLowerCase()} recorded in this period.`} />
			</>
		);
	}

	return (
		<table className="w-full table-fixed text-sm">
			<caption className="sr-only">{plural} by pageviews</caption>
			<thead className="bg-surface-muted text-muted text-xs font-medium uppercase">
				<tr>
					<th scope="col" className="px-4 py-2 text-left">
						{title}
					</th>
					<th scope="col" className="w-24 px-4 py-2 text-right">
						Pageviews
					</th>
				</tr>
			</thead>
			<tbody>
				{items.map((item) => (
					<tr key={item.name} className="border-border border-t">
						<th scope="row" className="text-ink p-0 text-left font-normal">
							<div className="relative flex min-h-11 items-center px-4">
								<RowBar value={item.pageviews} maximum={items[0].pageviews} />
								<span className="relative truncate">{item.name}</span>
							</div>
						</th>
						<td className="text-ink px-4 text-right tabular-nums">{formatNumber(item.pageviews)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function VisitSummary({ overview }: { overview: Data.Websites.WebsiteOverview }) {
	const previousPeriodUnavailable = overview.comparison.status === 'unavailable';
	const previousMetrics = overview.comparison.status === 'available' ? overview.comparison.metrics : null;

	return (
		<section className="border-border grid border-b sm:grid-cols-2 lg:grid-cols-5" aria-label="Visit summary">
			<Metric
				className="border-b sm:border-r lg:border-b-0"
				label="Pageviews"
				value={overview.metrics.pageviews}
				change={metricChange(overview.metrics.pageviews, previousMetrics?.pageviews ?? null)}
				periodDays={overview.period.preset}
				previousPeriodUnavailable={previousPeriodUnavailable}
			/>
			<Metric
				className="border-b lg:border-r lg:border-b-0"
				label="Visitors"
				value={overview.metrics.visitors}
				change={metricChange(overview.metrics.visitors, previousMetrics?.visitors ?? null)}
				periodDays={overview.period.preset}
				previousPeriodUnavailable={previousPeriodUnavailable}
			/>
			<SessionMetricSummary overview={overview} previousPeriodUnavailable={previousPeriodUnavailable} />
		</section>
	);
}

function SessionMetricSummary({
	overview,
	previousPeriodUnavailable,
}: {
	overview: Data.Websites.WebsiteOverview;
	previousPeriodUnavailable: boolean;
}) {
	const previousSessionMetrics =
		overview.comparison.status === 'available' && overview.comparison.sessionMetrics.status === 'available'
			? overview.comparison.sessionMetrics
			: null;
	const currentSessionMetrics = overview.sessionMetrics.status === 'available' ? overview.sessionMetrics : null;
	const currentBounceRate = currentSessionMetrics?.bounceRate ?? null;
	const previousBounceRate = previousSessionMetrics?.bounceRate ?? null;
	const currentMedianDuration = currentSessionMetrics?.medianDurationSeconds ?? null;
	const previousMedianDuration = previousSessionMetrics?.medianDurationSeconds ?? null;

	return (
		<>
			<Metric
				className="border-b sm:border-r lg:border-b-0"
				label="Sessions"
				value={currentSessionMetrics?.sessions ?? 'Unavailable'}
				change={metricChange(currentSessionMetrics?.sessions ?? null, previousSessionMetrics?.sessions ?? null)}
				periodDays={overview.period.preset}
				previousPeriodUnavailable={previousPeriodUnavailable}
			/>
			<Metric
				className="border-b lg:border-r lg:border-b-0"
				label="Bounce rate"
				value={formatBounceRate(currentSessionMetrics)}
				change={percentagePointChange(currentBounceRate, previousBounceRate)}
				changeUnit="points"
				periodDays={overview.period.preset}
				previousPeriodUnavailable={previousPeriodUnavailable}
			/>
			<Metric
				className="sm:col-span-2 lg:col-span-1"
				label="Median session duration"
				value={formatMedianDuration(currentSessionMetrics)}
				change={metricChange(currentMedianDuration, previousMedianDuration)}
				periodDays={overview.period.preset}
				previousPeriodUnavailable={previousPeriodUnavailable}
			/>
		</>
	);
}

function formatBounceRate(metrics: { bounceRate: number | null } | null) {
	if (!metrics) {
		return 'Unavailable';
	}

	return metrics.bounceRate === null ? '—' : `${metrics.bounceRate.toFixed(1)}%`;
}

function formatMedianDuration(metrics: { medianDurationSeconds: number | null } | null) {
	if (!metrics) {
		return 'Unavailable';
	}

	return metrics.medianDurationSeconds === null ? '—' : formatDuration(metrics.medianDurationSeconds);
}

function Metric({
	className,
	label,
	value,
	change,
	changeUnit = 'percent',
	periodDays,
	previousPeriodUnavailable,
}: {
	className?: string;
	label: string;
	value: number | string;
	change: TrafficMetricChange;
	changeUnit?: 'percent' | 'points';
	periodDays: number;
	previousPeriodUnavailable: boolean;
}) {
	return (
		<div className={`border-border px-5 py-4 ${className ?? ''}`}>
			<p className="text-muted text-xs font-medium uppercase">{label}</p>
			<p className="text-ink mt-1 text-2xl font-bold tracking-tight tabular-nums">
				{typeof value === 'number' ? formatNumber(value) : value}
			</p>
			<p className="text-muted mt-1 min-h-8 text-xs leading-4">
				{formatMetricChange(change, changeUnit, periodDays, previousPeriodUnavailable)}
			</p>
		</div>
	);
}

function formatMetricChange(
	change: TrafficMetricChange,
	unit: 'percent' | 'points',
	periodDays: number,
	previousPeriodUnavailable: boolean,
) {
	if (previousPeriodUnavailable) {
		return 'Previous period unavailable';
	}

	if (change.status === 'unavailable') {
		return 'Comparison unavailable';
	}

	if (change.status === 'unchanged') {
		return `No change vs previous ${periodDays} days`;
	}

	if (change.status === 'new') {
		return `New vs previous ${periodDays} days`;
	}

	const arrow = change.status === 'increase' ? '↑' : '↓';
	const amount = changeAmountFormatter.format(change.amount);
	const suffix = unit === 'points' ? ` ${change.amount === 1 ? 'point' : 'points'}` : '%';
	return `${arrow} ${amount}${suffix} vs previous ${periodDays} days`;
}

function Report({
	title,
	description,
	actions,
	children,
}: {
	title: string;
	description?: string;
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-card border-border bg-surface shadow-card overflow-hidden border">
			<header className="border-border flex min-h-12 flex-col items-stretch justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
				<div className="shrink-0">
					<h2 className="text-ink text-sm font-semibold">{title}</h2>
					{description ? <p className="text-muted mt-0.5 text-xs">{description}</p> : null}
				</div>
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
const changeAmountFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

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
