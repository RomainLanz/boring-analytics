interface TrendChartProps {
	id: string;
	title: string;
	dailyLabel: string;
	valueLabel: string;
	tableCaption: string;
	trend: Array<{ date: string; value: number }>;
	comparisonTrend?: Array<{ date: string; value: number }>;
}

export function TrendChart({
	id,
	title,
	dailyLabel,
	valueLabel,
	tableCaption,
	trend,
	comparisonTrend,
}: TrendChartProps) {
	const width = 1_000;
	const height = 220;
	const maximum = Math.max(...trend.map((day) => day.value), ...(comparisonTrend?.map((day) => day.value) ?? []), 0);
	const scaleMaximum = maximum <= 1 ? 1 : Math.ceil(maximum / 2) * 2;
	const points = chartPoints(trend, scaleMaximum, width, height);
	const comparisonPoints = comparisonTrend ? chartPoints(comparisonTrend, scaleMaximum, width, height) : [];
	const area = points.length ? `M${points.join(' L')} L${width},${height} L${plotStart},${height} Z` : '';
	const labelCount = Math.min(trend.length, 5);
	const labelIndexes = new Set(
		Array.from({ length: labelCount }, (_, index) =>
			Math.round((index / Math.max(labelCount - 1, 1)) * (trend.length - 1)),
		),
	);
	const labels = trend.map((day, index) => ({ day, index })).filter(({ index }) => labelIndexes.has(index));
	const scaleTicks = maximum === 0 ? [0] : scaleMaximum === 1 ? [1, 0] : [scaleMaximum, scaleMaximum / 2, 0];

	return (
		<section className="p-5" aria-labelledby={id}>
			<div className="mb-3 flex items-center justify-between">
				<h2 id={id} className="text-ink text-sm font-semibold">
					{title}
				</h2>
				<span className="text-muted text-xs">{dailyLabel}</span>
			</div>
			{comparisonTrend ? (
				<div className="text-muted mb-3 flex justify-end gap-4 text-xs" aria-label="Traffic periods">
					<span className="flex items-center gap-1.5">
						<span className="bg-accent h-0.5 w-5" aria-hidden="true" /> Current
					</span>
					<span className="flex items-center gap-1.5">
						<svg className="h-1 w-5" viewBox="0 0 20 4" aria-hidden="true">
							<path d="M0 2 H20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
						</svg>
						Previous period
					</span>
				</div>
			) : null}
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
					{comparisonPoints.length ? (
						<polyline
							className="text-muted"
							points={comparisonPoints.join(' ')}
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeDasharray="6 5"
							vectorEffect="non-scaling-stroke"
						/>
					) : null}
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
							left: `${(chartX(index, trend.length, width) / width) * 100}%`,
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
						{comparisonTrend ? (
							<>
								<th scope="col">Previous date</th>
								<th scope="col">Previous {valueLabel}</th>
							</>
						) : null}
						<th scope="col">Date</th>
						<th scope="col">{valueLabel}</th>
					</tr>
				</thead>
				<tbody>
					{trend.map((day, index) => (
						<tr key={day.date}>
							{comparisonTrend ? (
								<>
									<td>
										<time dateTime={comparisonTrend[index].date}>{formatDate(comparisonTrend[index].date)}</time>
									</td>
									<td>{comparisonTrend[index].value}</td>
								</>
							) : null}
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

const plotStart = 32;

function chartPoints(trend: Array<{ value: number }>, scaleMaximum: number, width: number, height: number) {
	return trend.map((day, index) => {
		const x = chartX(index, trend.length, width);
		const y = height - 12 - (day.value / scaleMaximum) * (height - 30);
		return `${x},${y}`;
	});
}

function chartX(index: number, length: number, width: number) {
	return length === 1 ? plotStart : plotStart + (index / (length - 1)) * (width - plotStart);
}

const numberFormatter = new Intl.NumberFormat('en');
const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function formatDate(date: string) {
	return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}
