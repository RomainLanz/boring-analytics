import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';

interface WebsiteReportHeaderProps {
	website: {
		id: string;
		name: string;
		allowedDomain: string;
		timezone: string;
	};
	period: { startDate: string; endDate: string };
	activeReport: 'traffic' | 'events' | 'funnels' | 'settings';
	children?: ReactNode;
}

export function WebsiteReportHeader({ website, period, activeReport, children }: WebsiteReportHeaderProps) {
	return (
		<>
			<header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-accent text-xs font-semibold tracking-widest uppercase">Website overview</p>
					<h1 className="text-ink mt-1 text-2xl font-bold tracking-tight">{website.name}</h1>
					<p className="text-muted mt-1 text-sm">
						{website.allowedDomain} · {website.timezone}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2 sm:justify-end">
					<span className="border-border bg-surface text-ink rounded-control border px-3 py-2 text-sm font-medium">
						{formatPeriod(period.startDate, period.endDate)}
					</span>
					{children}
				</div>
			</header>
			<nav className="border-border mb-5 flex gap-5 border-b" aria-label="Website reports">
				<ReportLink href={`/websites/${website.id}`} active={activeReport === 'traffic'}>
					Traffic
				</ReportLink>
				<ReportLink href={`/websites/${website.id}/events`} active={activeReport === 'events'}>
					Events
				</ReportLink>
				<ReportLink href={`/websites/${website.id}/funnels`} active={activeReport === 'funnels'}>
					Funnels
				</ReportLink>
				<ReportLink href={`/websites/${website.id}/settings`} active={activeReport === 'settings'}>
					Settings
				</ReportLink>
			</nav>
		</>
	);
}

function ReportLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
	return (
		<Link
			href={href}
			aria-current={active ? 'page' : undefined}
			className={
				active
					? 'border-accent text-ink border-b-2 px-0.5 pb-2 text-sm font-semibold'
					: 'text-muted hover:text-ink px-0.5 pb-2 text-sm font-semibold transition-colors'
			}
		>
			{children}
		</Link>
	);
}

const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function formatPeriod(startDate: string, endDate: string) {
	const start = dateFormatter.format(new Date(`${startDate}T00:00:00.000Z`));
	const end = dateFormatter.format(new Date(`${endDate}T00:00:00.000Z`));
	return `${start} – ${end}`;
}
