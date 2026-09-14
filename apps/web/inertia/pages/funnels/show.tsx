import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link, router } from '@inertiajs/react';
import { Fragment } from 'react';
import { metricChange, percentagePointChange, type TrafficMetricChange } from '#websites/traffic_metric_change';
import { ReportDataUnavailable } from '~/components/report-data-unavailable';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ report: Data.Funnels.FunnelReport }>;
type Report = PageProps['report'];
type AvailableReport = Report & { summary: NonNullable<Report['summary']> };
type SegmentationDimension = Exclude<Report['segmentation'], { status: 'inactive' }>['dimension'];

export default function FunnelReport({ report }: PageProps) {
	const identityLabel = report.funnel.identityKind === 'distinct_id' ? 'Product users' : 'Anonymous sessions';
	const identityUnit = report.funnel.identityKind === 'distinct_id' ? 'Users' : 'Sessions';
	const content =
		report.dataAvailability.status === 'unavailable' ? (
			<ReportDataUnavailable availableFrom={report.dataAvailability.availableFrom} websiteId={report.website.id} />
		) : (
			<AvailableFunnelReport
				report={report as AvailableReport}
				identityLabel={identityLabel}
				identityUnit={identityUnit}
			/>
		);

	return (
		<>
			<Head title={`${report.funnel.name} · ${report.website.name}`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={report.website} period={report.period} activeReport="funnels">
					<nav className="flex items-center gap-1" aria-label="Funnel period">
						{([7, 30, 90] as const).map((days) => (
							<Button key={days} asChild intent={report.period.preset === days ? 'primary' : 'secondary'} size="small">
								<Link
									href={funnelReportUrl(report, days)}
									aria-current={report.period.preset === days ? 'page' : undefined}
								>
									{days} days
								</Link>
							</Button>
						))}
					</nav>
					<Button asChild intent="secondary" size="small">
						<Link href={`/websites/${report.website.id}/funnels/${report.funnel.id}/edit`}>Edit Funnel</Link>
					</Button>
				</WebsiteReportHeader>
				{content}
			</main>
		</>
	);
}

function AvailableFunnelReport({
	report,
	identityLabel,
	identityUnit,
}: {
	report: AvailableReport;
	identityLabel: string;
	identityUnit: string;
}) {
	const previous = report.comparison.status === 'available' ? report.comparison : null;
	const previousSummary = previous?.summary ?? null;
	const maximum = report.summary.entrants;
	const previousMaximum = previousSummary?.entrants ?? 0;
	const comparisonUnavailable = report.comparison.status === 'unavailable';
	const comparisonDetail = comparisonUnavailable ? `Previous ${report.period.preset} days unavailable` : undefined;

	return (
		<>
			<Card padding="none" className="overflow-hidden">
				<header className="border-border flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-ink text-base font-bold">{report.funnel.name}</h2>
						<p className="text-muted mt-0.5 text-xs">
							{identityLabel} · {formatWindow(report.funnel.conversionWindowSeconds)}
						</p>
					</div>
					<span className="bg-accent-soft text-accent w-fit rounded-full px-2.5 py-1 text-xs font-semibold">
						Mature cohorts only
					</span>
				</header>
				<section className="border-border grid grid-cols-2 border-b lg:grid-cols-4" aria-label="Funnel summary">
					<Metric
						label="Entrants"
						value={formatNumber(report.summary.entrants)}
						unit={identityUnit}
						detail={
							comparisonDetail ??
							formatMetricChange(
								metricChange(report.summary.entrants, previousSummary?.entrants ?? null),
								report.period.preset,
							)
						}
					/>
					<Metric
						label="Converted"
						value={formatNumber(report.summary.converted)}
						unit={identityUnit}
						detail={
							comparisonDetail ??
							formatMetricChange(
								metricChange(report.summary.converted, previousSummary?.converted ?? null),
								report.period.preset,
							)
						}
					/>
					<Metric
						label="Conversion"
						value={formatPercent(report.summary.conversionRate)}
						unit="Overall"
						detail={
							comparisonDetail ??
							formatMetricChange(
								percentagePointChange(
									report.summary.conversionRate * 100,
									previousSummary === null ? null : previousSummary.conversionRate * 100,
								),
								report.period.preset,
								'percentage_points',
							)
						}
					/>
					<Metric
						label="Drop-offs"
						value={formatNumber(report.summary.totalDropoffs)}
						unit={identityUnit}
						detail={
							comparisonDetail ??
							formatMetricChange(
								metricChange(report.summary.totalDropoffs, previousSummary?.totalDropoffs ?? null),
								report.period.preset,
							)
						}
					/>
				</section>
				{maximum === 0 ? (
					<p className="border-border bg-surface-muted text-muted border-b px-5 py-4 text-sm">
						No mature {identityLabel.toLowerCase()} entered this Funnel during this period.
					</p>
				) : null}
				<div className="p-4 sm:p-6">
					<div className="text-muted mb-3 flex items-center gap-4 text-[10px] font-semibold tracking-wide uppercase">
						<span className="flex items-center gap-1.5">
							<span className="bg-accent size-2 rounded-full" /> Current
						</span>
						<span className="flex items-center gap-1.5">
							<span className="bg-muted size-2 rounded-full" /> Previous
						</span>
					</div>
					<div className="text-muted hidden grid-cols-[minmax(9rem,1fr)_minmax(10rem,2fr)_repeat(4,minmax(6.5rem,1fr))] gap-4 pb-2 text-[10px] font-semibold tracking-wide uppercase lg:grid">
						<span>Step</span>
						<span>Cohort progression</span>
						<span className="text-right">Entered</span>
						<span className="text-right">Step rate</span>
						<span className="text-right">Drop-offs</span>
						<span className="text-right">Median time</span>
					</div>
					<ol>
						{report.steps.map((step, index) => (
							<FunnelStepRow
								key={step.position}
								step={step}
								previousStep={previous?.steps[index] ?? null}
								maximum={maximum}
								previousMaximum={previousMaximum}
								periodDays={report.period.preset}
							/>
						))}
					</ol>
				</div>
			</Card>
			<FunnelSegmentation report={report} />
		</>
	);
}

function FunnelSegmentation({ report }: { report: AvailableReport }) {
	const segmentation = report.segmentation;
	const activeDimension = segmentation.status === 'inactive' ? null : segmentation.dimension;
	const selectedValue = activeDimension
		? activeDimension.kind === 'property'
			? `property:${activeDimension.key}`
			: activeDimension.kind
		: '';
	const knownPropertyKeys: readonly string[] = segmentation.propertyKeys;
	const propertyKeys =
		activeDimension?.kind === 'property' && !knownPropertyKeys.includes(activeDimension.key)
			? [...knownPropertyKeys, activeDimension.key]
			: knownPropertyKeys;

	return (
		<section className="mt-5" aria-label="Funnel segments">
			<Card padding="none" className="overflow-hidden">
				<header className="border-border flex min-h-16 flex-col items-stretch justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-end">
					<div className="min-w-0">
						<h2 className="text-ink text-sm font-semibold">Segments</h2>
						<p className="text-muted mt-0.5 max-w-2xl text-xs break-words">
							Each identity keeps the segment from its first matching {report.steps[0]?.eventName} event. Later events
							cannot change it.
						</p>
					</div>
					<label className="w-full sm:w-64">
						<span className="text-muted block text-xs">Segment by</span>
						<select
							value={selectedValue}
							onChange={(event) => {
								const value = event.target.value;
								const dimension: SegmentationDimension | null = value.startsWith('property:')
									? { kind: 'property', key: value.slice('property:'.length) }
									: value
										? { kind: value as Exclude<SegmentationDimension['kind'], 'property'> }
										: null;
								router.visit(funnelReportUrl(report, report.period.preset, dimension));
							}}
							className="border-border bg-surface text-ink rounded-control mt-1 w-full border px-3 py-2 text-sm font-semibold"
						>
							<option value="">No segmentation</option>
							<option value="source">Ingestion source</option>
							<option value="path">Landing path</option>
							<option value="utm_source">UTM source</option>
							<option value="utm_medium">UTM medium</option>
							<option value="utm_campaign">UTM campaign</option>
							{propertyKeys.map((key) => (
								<option key={key} value={`property:${key}`}>
									Property · {key}
								</option>
							))}
						</select>
					</label>
				</header>

				{segmentation.status === 'inactive' ? (
					<p className="text-muted px-5 py-8 text-center text-sm">
						Choose an entry-event dimension to compare Funnel performance by segment.
					</p>
				) : segmentation.status === 'unavailable' ? (
					<div className="px-5 py-8 text-center">
						<h3 className="text-ink text-sm font-semibold">Segmentation unavailable for this period</h3>
						<p className="text-muted mx-auto mt-1 max-w-xl text-xs">
							Entry-event details are only available from {segmentation.availableFrom}.
						</p>
					</div>
				) : (
					<SegmentMatrix report={report} segmentation={segmentation} />
				)}
			</Card>
		</section>
	);
}

function SegmentMatrix({
	report,
	segmentation,
}: {
	report: AvailableReport;
	segmentation: Extract<Report['segmentation'], { status: 'available' }>;
}) {
	const dimensionLabel = formatDimension(segmentation.dimension);

	return (
		<>
			<div className="hidden md:block">
				<table className="w-full table-fixed text-sm">
					<caption className="sr-only">{dimensionLabel} Funnel segments for current and previous periods</caption>
					<thead className="bg-surface-muted text-muted text-xs font-medium uppercase">
						<tr>
							<th scope="col" className="w-[28%] px-4 py-2 text-left break-words">
								{dimensionLabel}
							</th>
							<th scope="col" className="w-24 px-4 py-2 text-left">
								Period
							</th>
							<th scope="col" className="px-4 py-2 text-right">
								Entrants
							</th>
							<th scope="col" className="px-4 py-2 text-right">
								Converted
							</th>
							<th scope="col" className="px-4 py-2 text-right">
								Conversion
							</th>
							<th scope="col" className="px-4 py-2 text-right">
								Drop-offs
							</th>
						</tr>
					</thead>
					{segmentation.segments.map((segment) => (
						<tbody key={segmentValueKey(segment.value)} className="border-border border-t">
							<tr>
								<th rowSpan={2} scope="rowgroup" className="px-4 py-3 text-left align-top font-normal">
									<SegmentValue dimension={segmentation.dimension} value={segment.value} />
								</th>
								<th scope="row" className="text-accent-hover px-4 py-3 text-left text-xs font-semibold">
									Current
								</th>
								<SegmentMetric
									value={formatNumber(segment.current.entrants)}
									change={metricChange(segment.current.entrants, segment.previous?.entrants ?? null)}
									periodDays={report.period.preset}
								/>
								<SegmentMetric value={formatNumber(segment.current.converted)} />
								<SegmentMetric
									value={formatPercent(segment.current.conversionRate)}
									change={percentagePointChange(
										segment.current.conversionRate * 100,
										segment.previous === null ? null : segment.previous.conversionRate * 100,
									)}
									periodDays={report.period.preset}
									changeUnit="percentage_points"
								/>
								<SegmentMetric value={formatNumber(segment.current.totalDropoffs)} />
							</tr>
							<tr className="text-muted">
								<th scope="row" className="px-4 py-3 text-left text-xs font-medium">
									Previous
								</th>
								{segment.previous ? (
									<>
										<SegmentMetric value={formatNumber(segment.previous.entrants)} muted />
										<SegmentMetric value={formatNumber(segment.previous.converted)} muted />
										<SegmentMetric value={formatPercent(segment.previous.conversionRate)} muted />
										<SegmentMetric value={formatNumber(segment.previous.totalDropoffs)} muted />
									</>
								) : (
									<td colSpan={4} className="px-4 py-3 text-right text-xs">
										Previous period unavailable
									</td>
								)}
							</tr>
						</tbody>
					))}
				</table>
			</div>

			<div className="divide-border divide-y md:hidden">
				{segmentation.segments.map((segment) => (
					<div key={segmentValueKey(segment.value)} className="p-4">
						<SegmentValue dimension={segmentation.dimension} value={segment.value} />
						<div className="mt-3 grid grid-cols-2 gap-3">
							<MobileSegmentPeriod label="Current" metrics={segment.current} />
							{segment.previous ? (
								<MobileSegmentPeriod label="Previous" metrics={segment.previous} muted />
							) : (
								<div className="border-border border-l pl-3">
									<p className="text-muted text-xs font-semibold">Previous</p>
									<p className="text-muted mt-2 text-xs">Unavailable</p>
								</div>
							)}
						</div>
						<p className="text-muted mt-3 text-[10px]">
							{formatMetricChange(
								metricChange(segment.current.entrants, segment.previous?.entrants ?? null),
								report.period.preset,
								'relative_percent',
								true,
							)}
						</p>
					</div>
				))}
			</div>
		</>
	);
}

function SegmentMetric({
	value,
	change,
	periodDays,
	changeUnit,
	muted = false,
}: {
	value: string;
	change?: TrafficMetricChange;
	periodDays?: number;
	changeUnit?: 'relative_percent' | 'percentage_points';
	muted?: boolean;
}) {
	return (
		<td className={`px-4 py-3 text-right tabular-nums ${muted ? 'text-muted' : 'text-ink'}`}>
			<strong className="font-semibold">{value}</strong>
			{change && periodDays ? (
				<span className="text-muted block text-[10px]">{formatMetricChange(change, periodDays, changeUnit, true)}</span>
			) : null}
		</td>
	);
}

function MobileSegmentPeriod({
	label,
	metrics,
	muted = false,
}: {
	label: string;
	metrics: AvailableReport['summary'];
	muted?: boolean;
}) {
	return (
		<div className={muted ? 'border-border border-l pl-3' : ''}>
			<p className={`text-xs font-semibold ${muted ? 'text-muted' : 'text-ink'}`}>{label}</p>
			<dl className="mt-2 grid gap-1 text-xs">
				<div className="flex justify-between gap-2">
					<dt className="text-muted">Entrants</dt>
					<dd className="tabular-nums">{formatNumber(metrics.entrants)}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted">Converted</dt>
					<dd className="tabular-nums">{formatNumber(metrics.converted)}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted">Conversion</dt>
					<dd className="tabular-nums">{formatPercent(metrics.conversionRate)}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted">Drop-offs</dt>
					<dd className="tabular-nums">{formatNumber(metrics.totalDropoffs)}</dd>
				</div>
			</dl>
		</div>
	);
}

function SegmentValue({
	dimension,
	value,
}: {
	dimension: SegmentationDimension;
	value: Extract<Report['segmentation'], { status: 'available' }>['segments'][number]['value'];
}) {
	return (
		<div className="min-w-0">
			<span className="text-accent-hover block font-mono text-[10px]">{value.type}</span>
			<strong className="text-ink block text-sm font-semibold break-words">
				{formatSegmentValue(dimension, value)}
			</strong>
		</div>
	);
}

function formatDimension(dimension: SegmentationDimension) {
	const labels = {
		source: 'Ingestion source',
		path: 'Landing path',
		utm_source: 'UTM source',
		utm_medium: 'UTM medium',
		utm_campaign: 'UTM campaign',
	};
	return dimension.kind === 'property' ? `Property · ${dimension.key}` : labels[dimension.kind];
}

function formatSegmentValue(
	dimension: SegmentationDimension,
	value: Extract<Report['segmentation'], { status: 'available' }>['segments'][number]['value'],
) {
	if (value.type === 'unspecified') {
		return 'Unspecified';
	}

	if (value.type === 'other') {
		return `Other · ${value.valueCount} values`;
	}

	if (value.type === 'null') {
		return 'null';
	}

	if (dimension.kind === 'source' && typeof value.value === 'string') {
		return capitalize(value.value);
	}

	if (dimension.kind !== 'property' && typeof value.value === 'string') {
		return value.value;
	}

	return typeof value.value === 'string' ? JSON.stringify(value.value) : String(value.value);
}

function segmentValueKey(value: Extract<Report['segmentation'], { status: 'available' }>['segments'][number]['value']) {
	if (value.type === 'other') {
		return `other:${value.valueCount}`;
	}

	if (value.type === 'unspecified' || value.type === 'null') {
		return value.type;
	}

	return `${value.type}:${JSON.stringify(value.value)}`;
}

function FunnelStepRow({
	step,
	previousStep,
	maximum,
	previousMaximum,
	periodDays,
}: {
	step: AvailableReport['steps'][number];
	previousStep: AvailableReport['steps'][number] | null;
	maximum: number;
	previousMaximum: number;
	periodDays: number;
}) {
	return (
		<li className="border-border grid gap-3 border-t py-4 lg:grid-cols-[minmax(9rem,1fr)_minmax(10rem,2fr)_repeat(4,minmax(6.5rem,1fr))] lg:items-center lg:gap-4">
			<div className="min-w-0">
				<strong className="text-ink block text-sm break-words">
					{step.position}.{' '}
					{step.eventName.split('_').map((part, index, parts) => (
						<Fragment key={index}>
							{part}
							{index < parts.length - 1 ? (
								<>
									_<wbr />
								</>
							) : null}
						</Fragment>
					))}
				</strong>
				<span className="text-muted mt-1 block truncate text-xs">{formatFilter(step.filter)}</span>
			</div>
			<div className="grid gap-1.5">
				<CohortBar label="Current" entrants={step.entrants} maximum={maximum} />
				<CohortBar label="Previous" entrants={previousStep?.entrants ?? null} maximum={previousMaximum} previous />
			</div>
			<PairedStat
				label="Entered"
				current={formatNumber(step.entrants)}
				previous={previousStep === null ? null : formatNumber(previousStep.entrants)}
				change={metricChange(step.entrants, previousStep?.entrants ?? null)}
				periodDays={periodDays}
			/>
			<PairedStat
				label="Step rate"
				current={formatPercent(step.stepRate)}
				previous={previousStep === null ? null : formatPercent(previousStep.stepRate)}
				change={percentagePointChange(step.stepRate * 100, previousStep === null ? null : previousStep.stepRate * 100)}
				periodDays={periodDays}
				changeUnit="percentage_points"
			/>
			<PairedStat
				label="Drop-offs"
				current={step.dropoffs === null ? '—' : formatNumber(step.dropoffs)}
				previous={
					previousStep === null ? null : previousStep.dropoffs === null ? '—' : formatNumber(previousStep.dropoffs)
				}
				change={step.dropoffs === null ? null : metricChange(step.dropoffs, previousStep?.dropoffs ?? null)}
				periodDays={periodDays}
			/>
			<PairedStat
				label="Median time"
				current={step.position === 1 ? 'Start' : formatDuration(step.medianTimeFromPreviousSeconds)}
				previous={
					previousStep === null
						? null
						: previousStep.position === 1
							? 'Start'
							: formatDuration(previousStep.medianTimeFromPreviousSeconds)
				}
				change={
					step.medianTimeFromPreviousSeconds === null
						? null
						: metricChange(step.medianTimeFromPreviousSeconds, previousStep?.medianTimeFromPreviousSeconds ?? null)
				}
				periodDays={periodDays}
			/>
		</li>
	);
}

function Metric({ label, value, unit, detail }: { label: string; value: string; unit: string; detail: string }) {
	return (
		<div className="border-border border-r px-4 py-4 even:border-r-0 lg:last:border-r-0 lg:even:border-r">
			<p className="text-muted text-xs font-medium uppercase">{label}</p>
			<p className="text-ink mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
			<p className="text-muted text-xs">{unit}</p>
			<p className="text-muted text-xs">{detail}</p>
		</div>
	);
}

function CohortBar({
	label,
	entrants,
	maximum,
	previous = false,
}: {
	label: string;
	entrants: number | null;
	maximum: number;
	previous?: boolean;
}) {
	const share = entrants === null || maximum === 0 ? 0 : entrants / maximum;

	return (
		<div className="flex items-center gap-2">
			<span className="text-muted w-12 shrink-0 text-[10px] lg:sr-only">{label}</span>
			<div className="bg-surface-muted h-3 flex-1 overflow-hidden rounded-sm">
				<span
					className={`block h-full rounded-sm ${previous ? 'bg-muted/55' : 'bg-accent'}`}
					style={{ width: `${Math.max(share * 100, entrants ? 3 : 0)}%` }}
				/>
			</div>
			<span className="text-muted w-10 text-right text-[10px] tabular-nums">
				{entrants === null ? '—' : formatPercent(share)}
			</span>
		</div>
	);
}

function PairedStat({
	label,
	current,
	previous,
	change,
	periodDays,
	changeUnit = 'relative_percent',
}: {
	label: string;
	current: string;
	previous: string | null;
	change: TrafficMetricChange | null;
	periodDays: number;
	changeUnit?: 'relative_percent' | 'percentage_points';
}) {
	return (
		<div className="border-border/70 grid grid-cols-[1fr_auto] gap-x-3 border-t pt-2 text-xs lg:block lg:border-0 lg:pt-0 lg:text-right">
			<span className="text-muted row-span-2 self-center lg:hidden">{label}</span>
			<p>
				<span className="text-muted mr-1 text-[10px] lg:sr-only">Current</span>
				<strong className="text-ink font-semibold tabular-nums">{current}</strong>
			</p>
			<p className="text-muted tabular-nums">
				<span className="mr-1 text-[10px] lg:sr-only">Previous</span>
				{previous ?? 'Unavailable'}
			</p>
			{change ? (
				<p className="text-muted col-span-2 mt-1 text-[10px] lg:col-auto">
					{formatMetricChange(change, periodDays, changeUnit, true)}
				</p>
			) : null}
		</div>
	);
}

function formatMetricChange(
	change: TrafficMetricChange,
	periodDays: number,
	unit: 'relative_percent' | 'percentage_points' = 'relative_percent',
	compact = false,
) {
	const comparison = compact ? 'vs previous' : `vs previous ${periodDays} days`;

	if (change.status === 'unavailable') {
		return compact ? 'Comparison unavailable' : `Previous ${periodDays} days unavailable`;
	}

	if (change.status === 'unchanged') {
		return `No change ${comparison}`;
	}

	if (change.status === 'new') {
		return `New ${comparison}`;
	}

	const arrow = change.status === 'increase' ? '↑' : '↓';
	const suffix = unit === 'percentage_points' ? ' pp' : '%';
	return `${arrow} ${change.amount}${suffix} ${comparison}`;
}

function funnelReportUrl(report: Report, period: 7 | 30 | 90, dimension?: SegmentationDimension | null) {
	const query = new URLSearchParams({ period: String(period) });
	const activeDimension = report.segmentation.status === 'inactive' ? null : report.segmentation.dimension;
	const nextDimension = dimension === undefined ? activeDimension : dimension;

	if (nextDimension?.kind === 'property') {
		query.set('segment', 'property');
		query.set('property', nextDimension.key);
	} else if (nextDimension) {
		query.set('segment', nextDimension.kind);
	}

	return `/websites/${report.website.id}/funnels/${report.funnel.id}?${query}`;
}

const numberFormatter = new Intl.NumberFormat('en');
function formatNumber(value: number) {
	return numberFormatter.format(value);
}
function formatPercent(value: number) {
	return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}
function capitalize(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatWindow(seconds: number) {
	if (seconds < 3_600) {
		return `${seconds / 60} minute window`;
	}

	if (seconds < 86_400) {
		return `${seconds / 3_600} hour window`;
	}

	return `${seconds / 86_400} day window`;
}

function formatDuration(seconds: number | null) {
	if (seconds === null) {
		return '—';
	}

	const rounded = Math.round(seconds);

	if (rounded < 60) {
		return `${rounded}s`;
	}

	if (rounded < 3_600) {
		const minutes = Math.floor(rounded / 60);
		const remainingSeconds = rounded % 60;
		return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	if (rounded < 86_400) {
		const hours = Math.floor(rounded / 3_600);
		const remainingMinutes = Math.floor((rounded % 3_600) / 60);
		return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}

	const days = Math.floor(rounded / 86_400);
	const remainingHours = Math.floor((rounded % 86_400) / 3_600);
	return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatFilter(filter: Data.Funnels.FunnelReport['steps'][number]['filter']) {
	if (!filter) {
		return 'Any matching event';
	}

	if (filter.field === 'path') {
		return `path = ${filter.value}`;
	}

	return `${filter.key} = ${JSON.stringify(filter.value)}`;
}
