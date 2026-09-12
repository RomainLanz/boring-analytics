import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ report: Data.Funnels.FunnelReport }>;

export default function FunnelReport({ report }: PageProps) {
	const maximum = report.steps[0]?.entrants ?? 0;

	return (
		<>
			<Head title={`${report.funnel.name} · ${report.website.name}`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={report.website} period={report.period} activeReport="funnels">
					<Button asChild intent="secondary" size="small">
						<Link href={`/websites/${report.website.id}/funnels/${report.funnel.id}/edit`}>Edit Funnel</Link>
					</Button>
				</WebsiteReportHeader>
				<Card padding="none" className="overflow-hidden">
					<header className="border-border flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-ink text-base font-bold">{report.funnel.name}</h2>
							<p className="text-muted mt-0.5 text-xs">
								Anonymous sessions · {formatWindow(report.funnel.conversionWindowSeconds)}
							</p>
						</div>
						<span className="bg-accent-soft text-accent w-fit rounded-full px-2.5 py-1 text-xs font-semibold">
							Mature cohorts only
						</span>
					</header>
					<section className="border-border grid grid-cols-2 border-b lg:grid-cols-4" aria-label="Funnel summary">
						<Metric label="Entrants" value={formatNumber(report.summary.entrants)} detail="Sessions" />
						<Metric label="Converted" value={formatNumber(report.summary.converted)} detail="Sessions" />
						<Metric label="Conversion" value={formatPercent(report.summary.conversionRate)} detail="Overall" />
						<Metric label="Drop-offs" value={formatNumber(report.summary.totalDropoffs)} detail="Sessions" />
					</section>
					{maximum === 0 ? (
						<p className="border-border bg-surface-muted text-muted border-b px-5 py-4 text-sm">
							No mature sessions entered this Funnel during this period.
						</p>
					) : null}
					<div className="p-4 sm:p-6">
						<div className="text-muted hidden grid-cols-[minmax(9rem,1fr)_minmax(10rem,2fr)_6rem_6rem_6rem_7rem] gap-4 pb-2 text-[10px] font-semibold tracking-wide uppercase lg:grid">
							<span>Step</span>
							<span>Share of entrants</span>
							<span className="text-right">Entered</span>
							<span className="text-right">Step rate</span>
							<span className="text-right">Drop-offs</span>
							<span className="text-right">Median time</span>
						</div>
						<ol>
							{report.steps.map((step) => (
								<li
									key={step.position}
									className="border-border grid gap-3 border-t py-4 lg:grid-cols-[minmax(9rem,1fr)_minmax(10rem,2fr)_6rem_6rem_6rem_7rem] lg:items-center lg:gap-4"
								>
									<div className="min-w-0">
										<strong className="text-ink block truncate text-sm">
											{step.position}. {step.eventName}
										</strong>
										<span className="text-muted mt-1 block truncate text-xs">{formatFilter(step.filter)}</span>
									</div>
									<div className="bg-surface-muted h-7 overflow-hidden rounded-md">
										<span
											className="bg-accent flex h-full min-w-0 items-center rounded-md px-2 text-xs font-semibold text-white"
											style={{
												width: `${maximum ? Math.max((step.entrants / maximum) * 100, step.entrants ? 3 : 0) : 0}%`,
											}}
										>
											{step.entrants ? formatPercent(step.entrants / maximum) : ''}
										</span>
									</div>
									<Stat label="Entered" value={formatNumber(step.entrants)} />
									<Stat label="Step rate" value={formatPercent(step.stepRate)} />
									<Stat label="Drop-offs" value={step.dropoffs === null ? '—' : formatNumber(step.dropoffs)} />
									<Stat label="Median time" value={formatDuration(step.medianTimeFromPreviousSeconds)} />
								</li>
							))}
						</ol>
					</div>
				</Card>
			</main>
		</>
	);
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="border-border border-r px-4 py-4 even:border-r-0 lg:last:border-r-0 lg:even:border-r">
			<p className="text-muted text-xs font-medium uppercase">{label}</p>
			<p className="text-ink mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
			<p className="text-muted text-xs">{detail}</p>
		</div>
	);
}
function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm lg:block lg:text-right">
			<span className="text-muted text-xs lg:hidden">{label}</span>
			<strong className="text-ink font-semibold tabular-nums">{value}</strong>
		</div>
	);
}
const numberFormatter = new Intl.NumberFormat('en');
function formatNumber(value: number) {
	return numberFormatter.format(value);
}
function formatPercent(value: number) {
	return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(value);
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
		return 'Start';
	}

	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remaining = Math.round(seconds % 60);
	return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
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
