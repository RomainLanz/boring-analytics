import { Card } from '@boring-analytics/design-system/card';
import { Link } from '@inertiajs/react';

export function ReportDataUnavailable({ availableFrom, websiteId }: { availableFrom: string; websiteId: string }) {
	return (
		<Card padding="none" className="overflow-hidden">
			<section className="px-5 py-12 text-center" aria-labelledby="report-data-unavailable-title">
				<h2 id="report-data-unavailable-title" className="text-ink text-base font-bold">
					This report is unavailable
				</h2>
				<p className="text-muted mx-auto mt-2 max-w-xl text-sm leading-6">
					The selected period needs raw events that are no longer retained. Complete data is available from{' '}
					<strong className="text-ink font-semibold">{dateFormatter.format(new Date(availableFrom))}</strong>. Choose a
					later period or review this Website’s{' '}
					<Link href={`/websites/${websiteId}/settings`} className="text-accent font-semibold hover:underline">
						retention settings
					</Link>
					.
				</p>
			</section>
		</Card>
	);
}

const dateFormatter = new Intl.DateTimeFormat('en', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	timeZone: 'UTC',
	timeZoneName: 'short',
});
