import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { ReportDataUnavailable } from '~/components/report-data-unavailable';
import { TrendChart } from '~/components/trend-chart';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ report: Data.Websites.WebsiteEvents }>;
type Report = PageProps['report'];
type EventProperty = NonNullable<Report['selectedEvent']>['properties'][number];
type ActiveFilter = Report['activeFilter'];

export default function WebsiteEvents({ report }: PageProps) {
	return (
		<>
			<Head title={`${report.website.name} events`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={report.website} period={report.period} activeReport="events">
					<nav className="flex items-center gap-1" aria-label="Events period">
						{([7, 30, 90] as const).map((days) => (
							<Button key={days} asChild intent={report.period.preset === days ? 'primary' : 'secondary'} size="small">
								<Link
									href={reportUrl(report, { period: days })}
									aria-current={report.period.preset === days ? 'page' : undefined}
								>
									{days} days
								</Link>
							</Button>
						))}
					</nav>
				</WebsiteReportHeader>

				{report.dataAvailability.status === 'unavailable' ? (
					<ReportDataUnavailable availableFrom={report.dataAvailability.availableFrom} websiteId={report.website.id} />
				) : (
					<AvailableEventsReport report={report} />
				)}
			</main>
		</>
	);
}

function AvailableEventsReport({ report }: { report: Report }) {
	if (!report.selectedEvent) {
		return (
			<Card padding="none">
				<p className="text-muted px-4 py-12 text-center text-sm">No custom events recorded yet.</p>
			</Card>
		);
	}

	const selectedEvent = report.selectedEvent;

	return (
		<>
			<Card padding="none" className="overflow-hidden">
				<div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(12rem,1fr)_auto] md:items-center">
					<label className="min-w-0">
						<span className="text-muted block text-xs">Selected event</span>
						<select
							value={selectedEvent.name}
							onChange={(event) => router.visit(reportUrl(report, { event: event.target.value, filter: null }))}
							className="border-border bg-surface text-ink rounded-control mt-1 w-full max-w-sm border px-3 py-2 text-sm font-semibold"
						>
							{report.events.map((event) => (
								<option key={event.name} value={event.name}>
									{event.name}
								</option>
							))}
						</select>
					</label>
					{report.activeFilter ? <ActiveFilterChip report={report} filter={report.activeFilter} /> : null}
				</div>

				<div className="border-border grid border-t sm:grid-cols-3">
					<div className="border-border px-5 py-4 sm:border-r">
						<p className="text-muted text-xs">{report.activeFilter ? 'Filtered total' : 'Total events'}</p>
						<p className="text-ink mt-1 text-2xl font-bold tracking-tight tabular-nums">
							{formatNumber(selectedEvent.volume)}
						</p>
					</div>
					<SourceMetric report={report} source="browser" volume={selectedEvent.sources.browser} />
					<SourceMetric report={report} source="server" volume={selectedEvent.sources.server} />
				</div>
			</Card>

			<div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]">
				<Card padding="none" className="overflow-hidden">
					<TrendChart
						id="event-volume-heading"
						title={`Daily ${selectedEvent.name} volume`}
						dailyLabel="Daily events"
						valueLabel="Events"
						tableCaption={`Daily ${selectedEvent.name} event data`}
						trend={selectedEvent.trend.map((day) => ({ date: day.date, value: day.volume }))}
					/>
				</Card>

				<PropertyValues report={report} properties={selectedEvent.properties} />
			</div>

			<Card padding="none" className="mt-5 overflow-hidden">
				<header className="border-border flex min-h-12 items-center justify-between border-b px-4 py-3">
					<div>
						<h2 className="text-ink text-sm font-semibold">Other events</h2>
						<p className="text-muted text-xs">Selecting an event starts an unfiltered analysis.</p>
					</div>
				</header>
				<table className="w-full table-fixed text-sm">
					<caption className="sr-only">Known custom events</caption>
					<thead className="bg-surface-muted text-muted text-xs font-medium uppercase">
						<tr>
							<th scope="col" className="px-4 py-2 text-left">
								Event name
							</th>
							<th scope="col" className="w-28 px-4 py-2 text-right sm:w-40">
								Total events
							</th>
						</tr>
					</thead>
					<tbody>
						{report.events.map((event) => (
							<tr
								key={event.name}
								className={`border-border border-t ${event.name === selectedEvent.name ? 'bg-accent-soft' : ''}`}
							>
								<th scope="row" className="p-0 text-left font-normal">
									<Link
										href={reportUrl(report, { event: event.name, filter: null })}
										aria-current={event.name === selectedEvent.name ? 'true' : undefined}
										className="text-ink hover:text-accent block truncate px-4 py-3 font-medium"
									>
										{event.name}
									</Link>
								</th>
								<td className="text-ink px-4 text-right font-semibold tabular-nums">{formatNumber(event.volume)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Card>
		</>
	);
}

function ActiveFilterChip({ report, filter }: { report: Report; filter: NonNullable<ActiveFilter> }) {
	return (
		<div className="flex min-w-0 items-center gap-2 md:justify-end">
			<span className="border-accent/30 bg-accent-soft text-accent rounded-control min-w-0 truncate border px-3 py-2 text-sm">
				{filter.kind === 'source'
					? `Source = ${capitalize(filter.value)}`
					: `${filter.key} = ${propertyType(filter.value)} ${formatPropertyValue(filter.value)}`}
			</span>
			<Button asChild intent="secondary" size="small">
				<Link href={reportUrl(report, { filter: null })} aria-label="Clear event filter">
					Clear
				</Link>
			</Button>
		</div>
	);
}

function SourceMetric({ report, source, volume }: { report: Report; source: 'browser' | 'server'; volume: number }) {
	const active = report.activeFilter?.kind === 'source' && report.activeFilter.value === source;
	const selectedVolume = report.selectedEvent?.volume ?? 0;
	const share = selectedVolume ? (volume / selectedVolume) * 100 : 0;

	return (
		<Link
			href={reportUrl(report, { filter: active ? null : { kind: 'source', value: source } })}
			aria-current={active ? 'true' : undefined}
			className={`border-border block px-5 py-4 sm:border-r last:sm:border-r-0 ${active ? 'bg-accent-soft' : 'hover:bg-surface-muted'}`}
		>
			<p className="text-muted text-xs">{capitalize(source)}</p>
			<p className="text-ink mt-1 text-xl font-bold tabular-nums">{formatNumber(volume)}</p>
			<p className="text-muted text-xs tabular-nums">{share.toFixed(1)}%</p>
		</Link>
	);
}

function PropertyValues({ report, properties }: { report: Report; properties: EventProperty[] }) {
	const [selectedKey, setSelectedKey] = useState(properties[0]?.key ?? '');
	const selected = properties.find((property) => property.key === selectedKey) ?? properties[0];

	return (
		<Card padding="none" className="self-start overflow-hidden">
			<header className="border-border flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3">
				<div>
					<h2 className="text-ink text-sm font-semibold">Property values</h2>
					<p className="text-muted text-xs">
						{report.activeFilter ? 'Top values before filtering' : `${properties.length} primitive keys in this period`}
					</p>
				</div>
				{properties.length ? (
					<select
						value={selectedKey}
						onChange={(event) => setSelectedKey(event.target.value)}
						aria-label="Property key"
						className="border-border bg-surface text-ink rounded-control max-w-40 border px-3 py-2 text-sm font-medium"
					>
						{properties.map((property) => (
							<option key={property.key} value={property.key}>
								{property.key}
							</option>
						))}
					</select>
				) : null}
			</header>
			{selected ? (
				<table className="w-full table-fixed text-sm">
					<caption className="sr-only">Top values for {selected.key}</caption>
					<thead className="bg-surface-muted text-muted text-xs font-medium uppercase">
						<tr>
							<th scope="col" className="px-4 py-2 text-left">
								Typed value
							</th>
							<th scope="col" className="w-20 px-4 py-2 text-right">
								Events
							</th>
						</tr>
					</thead>
					<tbody>
						{selected.values.map((value) => {
							const active =
								report.activeFilter?.kind === 'property' &&
								report.activeFilter.key === selected.key &&
								JSON.stringify(report.activeFilter.value) === JSON.stringify(value.value);

							return (
								<tr
									key={`${propertyType(value.value)}:${JSON.stringify(value.value)}`}
									className="border-border border-t"
								>
									<th scope="row" className="p-0 text-left font-normal">
										<Link
											href={reportUrl(report, {
												filter: active ? null : { kind: 'property', key: selected.key, value: value.value },
											})}
											aria-current={active ? 'true' : undefined}
											className={`block truncate px-4 py-3 ${active ? 'bg-accent-soft text-accent' : 'text-ink hover:text-accent'}`}
										>
											<span className="text-muted mr-2 text-xs">{propertyType(value.value)}</span>
											{formatPropertyValue(value.value)}
										</Link>
									</th>
									<td className="text-ink px-4 text-right tabular-nums">{formatNumber(value.count)}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			) : (
				<p className="text-muted px-4 py-12 text-center text-sm">No primitive properties recorded in this period.</p>
			)}
		</Card>
	);
}

function reportUrl(
	report: Report,
	changes: {
		period?: 7 | 30 | 90;
		event?: string;
		filter?: ActiveFilter;
	} = {},
) {
	const query = new URLSearchParams({
		period: String(changes.period ?? report.period.preset),
	});
	const event = changes.event ?? report.selectedEvent?.name;
	const filter = changes.filter === undefined ? report.activeFilter : changes.filter;

	if (event) {
		query.set('event', event);
	}

	if (filter?.kind === 'source') {
		query.set('source', filter.value);
	} else if (filter?.kind === 'property') {
		query.set('property', filter.key);
		query.set('value', JSON.stringify(filter.value));
	}

	return `/websites/${report.website.id}/events?${query}`;
}

const numberFormatter = new Intl.NumberFormat('en');

function formatNumber(value: number) {
	return numberFormatter.format(value);
}

function formatPropertyValue(value: string | number | boolean | null) {
	return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function propertyType(value: string | number | boolean | null) {
	return value === null ? 'null' : typeof value;
}

function capitalize(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
