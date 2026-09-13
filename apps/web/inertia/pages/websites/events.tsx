import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import { ReportDataUnavailable } from '~/components/report-data-unavailable';
import { TrendChart } from '~/components/trend-chart';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ report: Data.Websites.WebsiteEvents }>;
type EventProperty = NonNullable<PageProps['report']['selectedEvent']>['properties'][number];

export default function WebsiteEvents({ report }: PageProps) {
	return (
		<>
			<Head title={`${report.website.name} events`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={report.website} period={report.period} activeReport="events" />

				{report.dataAvailability.status === 'unavailable' ? (
					<ReportDataUnavailable availableFrom={report.dataAvailability.availableFrom} websiteId={report.website.id} />
				) : (
					<AvailableEventsReport report={report} />
				)}
			</main>
		</>
	);
}

function AvailableEventsReport({ report }: { report: Data.Websites.WebsiteEvents }) {
	return (
		<>
			<Card padding="none" className="overflow-hidden">
				<header className="border-border flex min-h-12 items-center justify-between border-b px-4 py-3">
					<h2 className="text-ink text-sm font-semibold">Known events</h2>
					<span className="text-muted text-xs">Select an event to inspect it</span>
				</header>
				{report.events.length ? (
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
								<th scope="col" className="hidden w-32 px-4 py-2 text-right sm:table-cell">
									Avg. per day
								</th>
							</tr>
						</thead>
						<tbody>
							{report.events.map((event) => {
								const selected = event.name === report.selectedEvent?.name;
								return (
									<tr key={event.name} className={`border-border border-t ${selected ? 'bg-accent-soft' : ''}`}>
										<th scope="row" className="p-0 text-left font-normal">
											<Link
												href={`/websites/${report.website.id}/events?event=${encodeURIComponent(event.name)}`}
												aria-current={selected ? 'true' : undefined}
												className={`block truncate px-4 py-3 font-medium ${selected ? 'text-accent' : 'text-ink hover:text-accent'}`}
											>
												{event.name}
											</Link>
										</th>
										<td className="text-ink px-4 text-right font-semibold tabular-nums">
											{formatNumber(event.volume)}
										</td>
										<td className="text-muted hidden px-4 text-right tabular-nums sm:table-cell">
											{(event.volume / 30).toFixed(1)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				) : (
					<p className="text-muted px-4 py-12 text-center text-sm">No custom events recorded yet.</p>
				)}
			</Card>

			{report.selectedEvent ? (
				<div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)]">
					<Card padding="none" className="overflow-hidden">
						<header className="border-border flex items-center justify-between gap-5 border-b px-5 py-4">
							<div className="min-w-0">
								<h2 className="text-ink truncate text-base font-bold">{report.selectedEvent.name}</h2>
								<p className="text-muted text-xs">Selected custom event</p>
							</div>
							<div className="shrink-0 text-right">
								<p className="text-ink text-2xl font-bold tracking-tight tabular-nums">
									{formatNumber(report.selectedEvent.volume)}
								</p>
								<p className="text-muted text-xs">Total events</p>
							</div>
						</header>
						<TrendChart
							id="event-volume-heading"
							title="Event volume"
							dailyLabel="Daily events"
							valueLabel="Events"
							tableCaption={`Daily ${report.selectedEvent.name} event data`}
							trend={report.selectedEvent.trend.map((day) => ({ date: day.date, value: day.volume }))}
						/>
					</Card>

					<PropertyValues
						key={report.selectedEvent.name}
						properties={report.selectedEvent.properties}
						total={report.selectedEvent.volume}
					/>
				</div>
			) : null}
		</>
	);
}

function PropertyValues({ properties, total }: { properties: EventProperty[]; total: number }) {
	const [selectedKey, setSelectedKey] = useState(properties[0]?.key ?? '');
	const selected = properties.find((property) => property.key === selectedKey) ?? properties[0];

	return (
		<Card padding="none" className="self-start overflow-hidden">
			<header className="border-border flex min-h-16 items-center justify-between gap-3 border-b px-4 py-3">
				<div>
					<h2 className="text-ink text-sm font-semibold">Property values</h2>
					<p className="text-muted text-xs">{properties.length} keys recorded</p>
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
								Value
							</th>
							<th scope="col" className="w-20 px-2 py-2 text-right">
								Count
							</th>
							<th scope="col" className="w-20 px-4 py-2 text-right">
								Share
							</th>
						</tr>
					</thead>
					<tbody>
						{selected.values.map((value) => (
							<tr key={`${typeof value.value}:${String(value.value)}`} className="border-border border-t">
								<th scope="row" className="text-ink truncate px-4 py-3 text-left font-normal">
									{formatPropertyValue(value.value)}
								</th>
								<td className="text-ink px-2 text-right tabular-nums">{formatNumber(value.count)}</td>
								<td className="text-muted px-4 text-right tabular-nums">
									{total ? `${((value.count / total) * 100).toFixed(1)}%` : '0%'}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<p className="text-muted px-4 py-12 text-center text-sm">No properties recorded in this period.</p>
			)}
		</Card>
	);
}

const numberFormatter = new Intl.NumberFormat('en');

function formatNumber(value: number) {
	return numberFormatter.format(value);
}

function formatPropertyValue(value: string | number | boolean | null) {
	return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
