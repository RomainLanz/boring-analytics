export type TrafficMetricChange =
	| { status: 'unavailable' }
	| { status: 'unchanged' }
	| { status: 'new' }
	| { status: 'increase' | 'decrease'; amount: number };

export function metricChange(current: number | null, previous: number | null): TrafficMetricChange {
	if (current === null || previous === null) {
		return { status: 'unavailable' };
	}

	if (current === previous) {
		return { status: 'unchanged' };
	}

	if (previous === 0) {
		return { status: 'new' };
	}

	const amount = roundOne((Math.abs(current - previous) / previous) * 100);
	return { status: current > previous ? 'increase' : 'decrease', amount };
}

export function percentagePointChange(current: number | null, previous: number | null): TrafficMetricChange {
	if (current === null || previous === null) {
		return { status: 'unavailable' };
	}

	if (current === previous) {
		return { status: 'unchanged' };
	}

	return {
		status: current > previous ? 'increase' : 'decrease',
		amount: roundOne(Math.abs(current - previous)),
	};
}

function roundOne(value: number) {
	return Math.round(value * 10) / 10;
}
