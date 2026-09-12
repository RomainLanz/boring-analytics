import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { type Data } from '@generated/data';
import { Head, Link } from '@inertiajs/react';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ index: Data.Funnels.FunnelIndex }>;

export default function FunnelIndex({ index }: PageProps) {
	return (
		<>
			<Head title={`${index.website.name} Funnels`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={index.website} period={index.period} activeReport="funnels">
					<Button asChild size="small">
						<Link href={`/websites/${index.website.id}/funnels/new`}>Create Funnel</Link>
					</Button>
				</WebsiteReportHeader>
				<Card padding="none" className="overflow-hidden">
					<header className="border-border border-b px-5 py-4">
						<h2 className="text-ink text-sm font-semibold">Funnels</h2>
					</header>
					{index.funnels.length ? (
						<ul className="divide-border divide-y">
							{index.funnels.map((funnel) => (
								<li key={funnel.id}>
									<Link
										href={`/websites/${index.website.id}/funnels/${funnel.id}`}
										className="hover:bg-surface-muted flex items-center justify-between gap-4 px-5 py-4 transition-colors"
									>
										<span>
											<strong className="text-ink block text-sm">{funnel.name}</strong>
											<span className="text-muted mt-1 block text-xs">
												{funnel.stepCount} steps ·{' '}
												{funnel.identityKind === 'distinct_id' ? 'Product users' : 'Anonymous sessions'} ·{' '}
												{formatWindow(funnel.conversionWindowSeconds)}
											</span>
										</span>
										<span className="text-accent text-sm font-semibold">View report →</span>
									</Link>
								</li>
							))}
						</ul>
					) : (
						<div className="px-5 py-14 text-center">
							<h3 className="text-ink text-base font-semibold">No Funnels yet</h3>
							<p className="text-muted mx-auto mt-2 max-w-md text-sm">
								Create a Funnel to measure how identities move through ordered events.
							</p>
							<Button asChild className="mt-5">
								<Link href={`/websites/${index.website.id}/funnels/new`}>Create your first Funnel</Link>
							</Button>
						</div>
					)}
				</Card>
			</main>
		</>
	);
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
