interface TrendChartProps {
	id: string;
	title: string;
	dailyLabel: string;
	valueLabel: string;
	tableCaption: string;
	trend: Array<{ date: string; value: number }>;
}

export function TrendChart({ id, title, dailyLabel, valueLabel, tableCaption, trend }: TrendChartProps) {
	const width = 1_000;
	const height = 220;
	const maximum = Math.max(...trend.map((day) => day.value), 0);
	const scaleMaximum = maximum <= 1 ? 1 : Math.ceil(maximum / 2) * 2;
	const points = trend.map((day, index) => {
		const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * width;
		const y = height - 12 - (day.value / scaleMaximum) * (height - 30);
		return `${x},${y}`;
	});
	const area = points.length ? `M${points.join(' L')} L${width},${height} L0,${height} Z` : '';
	const labels = trend
		.map((day, index) => ({ day, index }))
		.filter(({ index }) => (index % 7 === 0 && index < trend.length - 2) || index === trend.length - 1);
	const scaleTicks = maximum === 0 ? [0] : scaleMaximum === 1 ? [1, 0] : [scaleMaximum, scaleMaximum / 2, 0];

	return (
		<section className="p-5" aria-labelledby={id}>
			<div className="mb-3 flex items-center justify-between">
				<h2 id={id} className="text-ink text-sm font-semibold">
					{title}
				</h2>
				<span className="text-muted text-xs">{dailyLabel}</span>
			</div>
			<div className="border-border relative h-56 border-b bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_54px,var(--color-border)_55px)]">
				<svg
					className="text-accent size-full overflow-visible"
					viewBox={`0 0 ${width} ${height}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<defs>
						<linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="currentColor" stopOpacity="0.25" />
							<stop offset="1" stopColor="currentColor" stopOpacity="0" />
						</linearGradient>
					</defs>
					<path d={area} fill={`url(#${id}-fill)`} />
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
							{numberFormatter.format(tick)}
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
				<caption>{tableCaption}</caption>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">{valueLabel}</th>
					</tr>
				</thead>
				<tbody>
					{trend.map((day) => (
						<tr key={day.date}>
							<td>
								<time dateTime={day.date}>{formatDate(day.date)}</time>
							</td>
							<td>{day.value}</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

const numberFormatter = new Intl.NumberFormat('en');
const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function formatDate(date: string) {
	return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}
