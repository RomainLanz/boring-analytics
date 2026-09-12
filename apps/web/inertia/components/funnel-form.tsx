import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { Field } from '@boring-analytics/design-system/field';
import { type Data } from '@generated/data';
import { useState } from 'react';

type Editor = Data.Funnels.FunnelEditor;
type EditorStep = NonNullable<Editor['funnel']>['steps'][number];

interface FormStep {
	id: number;
	eventName: string;
	filterField: 'none' | 'path' | 'property';
	filterKey: string;
	filterType: 'string' | 'number' | 'boolean' | 'null';
	filterValue: string;
}

export function FunnelForm({
	editor,
	errors,
	processing,
	submitLabel,
}: {
	editor: Editor;
	errors: Record<string, string | undefined>;
	processing: boolean;
	submitLabel: string;
}) {
	const initialSteps = editor.funnel?.steps.length
		? editor.funnel.steps.map(toFormStep)
		: [emptyStep(1, editor.eventNames[0] ?? '$pageview'), emptyStep(2, editor.eventNames[1] ?? '$pageview')];
	const [steps, setSteps] = useState(initialSteps);
	const nextId = Math.max(...steps.map((step) => step.id), 0) + 1;
	const stepErrors = Object.entries(errors).filter(([field]) => field === 'steps' || field.startsWith('steps.'));
	const conversionWindow = editor.funnel?.conversionWindowSeconds ?? 1_800;
	const identityKind =
		editor.funnel?.identityKind ?? (editor.website.identityMode === 'product' ? 'distinct_id' : 'session_id');
	const conversionWindows =
		identityKind === 'distinct_id' ? [300, 900, 1_800, 3_600, 86_400, 7 * 86_400, 30 * 86_400] : [300, 900, 1_800];

	function updateStep(id: number, values: Partial<FormStep>) {
		setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...values } : step)));
	}

	function moveStep(index: number, offset: number) {
		setSteps((current) => {
			const target = index + offset;

			if (target < 0 || target >= current.length) {
				return current;
			}

			const reordered = [...current];
			[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
			return reordered;
		});
	}

	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
			<Card padding="none" className="overflow-hidden">
				<header className="border-border flex items-center justify-between border-b px-5 py-4">
					<div>
						<h2 className="text-ink text-sm font-semibold">Funnel steps</h2>
						<p className="text-muted mt-0.5 text-xs">Intermediate events are allowed.</p>
					</div>
					<span className="bg-accent-soft text-accent rounded-full px-2.5 py-1 text-xs font-semibold">
						{steps.length} steps
					</span>
				</header>

				<div className="space-y-4 p-5">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Funnel name"
							name="name"
							defaultValue={editor.funnel?.name ?? ''}
							placeholder="Checkout conversion"
							error={errors.name}
							required
						/>
						<label className="space-y-2">
							<span className="text-ink block text-sm font-semibold">Website</span>
							<select
								disabled
								className="border-border bg-surface text-ink rounded-control h-11 w-full border px-3.5 text-sm disabled:opacity-70"
							>
								<option>
									{editor.website.name} · {editor.website.allowedDomain}
								</option>
							</select>
						</label>
					</div>

					{steps.map((step, index) => (
						<section
							key={step.id}
							className="border-border rounded-card border p-4"
							aria-labelledby={`step-${step.id}`}
						>
							<div className="mb-4 flex items-center justify-between gap-3">
								<span
									id={`step-${step.id}`}
									className="bg-accent-soft text-accent flex size-8 items-center justify-center rounded-full text-xs font-bold"
								>
									{index + 1}
								</span>
								<div className="flex items-center gap-1">
									<Button
										type="button"
										intent="secondary"
										size="small"
										disabled={index === 0}
										onClick={() => moveStep(index, -1)}
										aria-label={`Move step ${index + 1} up`}
									>
										↑
									</Button>
									<Button
										type="button"
										intent="secondary"
										size="small"
										disabled={index === steps.length - 1}
										onClick={() => moveStep(index, 1)}
										aria-label={`Move step ${index + 1} down`}
									>
										↓
									</Button>
									<Button
										type="button"
										intent="secondary"
										size="small"
										disabled={steps.length === 2}
										onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
										aria-label={`Remove step ${index + 1}`}
									>
										Remove
									</Button>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="space-y-2">
									<span className="text-ink block text-sm font-semibold">Event</span>
									<input
										name={`steps[${index}][eventName]`}
										value={step.eventName}
										onChange={(event) => updateStep(step.id, { eventName: event.target.value })}
										list="funnel-event-names"
										className="border-border bg-surface text-ink rounded-control h-11 w-full border px-3.5 text-sm"
										required
									/>
								</label>
								<label className="space-y-2">
									<span className="text-ink block text-sm font-semibold">Filter</span>
									<select
										name={`steps[${index}][filterField]`}
										value={step.filterField}
										onChange={(event) =>
											updateStep(step.id, { filterField: event.target.value as FormStep['filterField'] })
										}
										className="border-border bg-surface text-ink rounded-control h-11 w-full border px-3.5 text-sm"
									>
										<option value="none">No filter</option>
										<option value="path">Path equals</option>
										<option value="property">Property equals</option>
									</select>
								</label>
							</div>
							{step.filterField === 'path' ? (
								<Field
									rootClassName="mt-4"
									label="Path value"
									name={`steps[${index}][filterValue]`}
									value={step.filterValue}
									onChange={(event) => updateStep(step.id, { filterValue: event.target.value })}
									placeholder="/pricing"
									required
								/>
							) : null}
							{step.filterField === 'property' ? (
								<div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
									<Field
										label="Property key"
										name={`steps[${index}][filterKey]`}
										value={step.filterKey}
										onChange={(event) => updateStep(step.id, { filterKey: event.target.value })}
										required
									/>
									<label className="space-y-2">
										<span className="text-ink block text-sm font-semibold">Value type</span>
										<select
											name={`steps[${index}][filterType]`}
											value={step.filterType}
											onChange={(event) =>
												updateStep(step.id, { filterType: event.target.value as FormStep['filterType'] })
											}
											className="border-border bg-surface text-ink rounded-control h-11 w-full border px-3 text-sm"
										>
											<option value="string">Text</option>
											<option value="number">Number</option>
											<option value="boolean">Boolean</option>
											<option value="null">Null</option>
										</select>
									</label>
									{step.filterType === 'boolean' ? (
										<label className="space-y-2">
											<span className="text-ink block text-sm font-semibold">Value</span>
											<select
												name={`steps[${index}][filterValue]`}
												value={step.filterValue || 'true'}
												onChange={(event) => updateStep(step.id, { filterValue: event.target.value })}
												className="border-border bg-surface text-ink rounded-control h-11 w-full border px-3 text-sm"
											>
												<option value="true">True</option>
												<option value="false">False</option>
											</select>
										</label>
									) : null}
									{!['boolean', 'null'].includes(step.filterType) ? (
										<Field
											label="Value"
											name={`steps[${index}][filterValue]`}
											value={step.filterValue}
											onChange={(event) => updateStep(step.id, { filterValue: event.target.value })}
											required={step.filterType === 'number'}
										/>
									) : null}
								</div>
							) : null}
						</section>
					))}

					{stepErrors.length ? (
						<div role="alert" className="bg-rose-soft text-rose rounded-control px-3.5 py-3 text-sm">
							<p className="font-semibold">Check the Funnel steps.</p>
							<ul className="mt-1 list-disc pl-4">
								{stepErrors.map(([field, message]) => (
									<li key={field}>{message}</li>
								))}
							</ul>
						</div>
					) : null}
					<Button
						type="button"
						intent="secondary"
						className="w-full border-dashed"
						disabled={steps.length === 20}
						onClick={() => setSteps((current) => [...current, emptyStep(nextId, editor.eventNames[0] ?? '$pageview')])}
					>
						+ Add step
					</Button>
					<datalist id="funnel-event-names">
						{editor.eventNames.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</datalist>
				</div>
			</Card>

			<aside className="self-start" aria-labelledby="counting-title">
				<Card padding="none" className="overflow-hidden">
					<header className="border-border border-b px-5 py-4">
						<h2 id="counting-title" className="text-ink text-sm font-semibold">
							Counting
						</h2>
					</header>
					<div className="space-y-5 p-5">
						<div>
							<span className="text-muted text-xs font-semibold tracking-wide uppercase">Identity</span>
							<div className="border-accent bg-accent-soft rounded-control mt-2 border px-3 py-3">
								<strong className="text-ink block text-sm">
									{identityKind === 'distinct_id' ? 'Product users' : 'Anonymous sessions'}
								</strong>
								<span className="text-muted mt-1 block text-xs leading-5">
									{identityKind === 'distinct_id'
										? 'Each distinct_id counts once across browser and server events.'
										: 'Each session_id counts once inside its 30-minute session.'}
								</span>
							</div>
						</div>
						<label className="space-y-2">
							<span className="text-ink block text-sm font-semibold">Conversion window</span>
							<select
								name="conversionWindowSeconds"
								defaultValue={conversionWindow}
								className="border-border bg-surface text-ink rounded-control h-11 w-full border px-3.5 text-sm"
							>
								{!conversionWindows.includes(conversionWindow) ? (
									<option value={conversionWindow}>{formatWindow(conversionWindow)}</option>
								) : null}
								{conversionWindows.map((seconds) => (
									<option key={seconds} value={seconds}>
										{formatWindow(seconds)}
									</option>
								))}
							</select>
						</label>
						<Button type="submit" size="large" loading={processing} className="w-full">
							{processing ? 'Saving…' : submitLabel}
						</Button>
					</div>
				</Card>
			</aside>
		</div>
	);
}

function emptyStep(id: number, eventName: string): FormStep {
	return { id, eventName, filterField: 'none', filterKey: '', filterType: 'string', filterValue: '' };
}

function toFormStep(step: EditorStep): FormStep {
	if (!step.filter) {
		return emptyStep(step.position, step.eventName);
	}

	if (step.filter.field === 'path') {
		return { ...emptyStep(step.position, step.eventName), filterField: 'path', filterValue: step.filter.value };
	}

	return {
		...emptyStep(step.position, step.eventName),
		filterField: 'property',
		filterKey: step.filter.key,
		filterType: propertyValueType(step.filter.value),
		filterValue: step.filter.value === null ? '' : String(step.filter.value),
	};
}

function propertyValueType(value: string | number | boolean | null): FormStep['filterType'] {
	if (value === null) {
		return 'null';
	}

	if (typeof value === 'number') {
		return 'number';
	}

	if (typeof value === 'boolean') {
		return 'boolean';
	}

	return 'string';
}

function formatWindow(seconds: number) {
	if (seconds < 3_600) {
		return `${seconds / 60} minutes`;
	}

	if (seconds < 86_400) {
		return `${seconds / 3_600} hour${seconds === 3_600 ? '' : 's'}`;
	}

	const days = seconds / 86_400;
	return `${days} day${days === 1 ? '' : 's'}`;
}
