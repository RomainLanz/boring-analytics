import { Form } from '@adonisjs/inertia/react';
import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { Field } from '@boring-analytics/design-system/field';
import { type Data } from '@generated/data';
import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{
	settings: Data.Websites.WebsiteSettings;
	serverEventsUrl: string;
	trackerUrl: string;
}>;
type SettingsSection = 'identity' | 'browser-collection' | 'server-events' | 'data-controls';
type RetentionValue = '60' | '90' | '180' | '365' | 'forever';

const retentionOptions: Array<{ value: RetentionValue; label: string }> = [
	{ value: '60', label: '60 days' },
	{ value: '90', label: '90 days' },
	{ value: '180', label: '180 days' },
	{ value: '365', label: '1 year' },
	{ value: 'forever', label: 'Forever' },
];

export default function WebsiteSettings({ settings, serverEventsUrl, trackerUrl }: PageProps) {
	const { flash } = usePage();
	const [section, setSection] = useState<SettingsSection>(flash.serverKeySecret ? 'server-events' : 'data-controls');
	const [copiedSecret, setCopiedSecret] = useState<string>();
	const [copiedCollectionValue, setCopiedCollectionValue] = useState<string>();
	const [selectedCollectionKeyId, setSelectedCollectionKeyId] = useState(settings.collectionKeys[0]?.id);
	const [identityMode, setIdentityMode] = useState(settings.website.identityMode);
	const [retentionDays, setRetentionDays] = useState<RetentionValue>(
		settings.website.retentionDays === null ? 'forever' : (String(settings.website.retentionDays) as RetentionValue),
	);
	const curl = `curl -X POST "${serverEventsUrl}" \\
  -H "Authorization: Bearer $BORING_ANALYTICS_SERVER_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<JSON
  {
    "name": "invoice.paid",
    "occurredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "path": "/billing",
    "properties": { "amount": 49 }${settings.website.identityMode === 'product' ? ',\n    "distinctId": "opaque-account-42"' : ''}
  }
JSON`;

	async function copySecret() {
		if (!flash.serverKeySecret) {
			return;
		}

		await navigator.clipboard.writeText(flash.serverKeySecret);
		setCopiedSecret(flash.serverKeySecret);
	}

	async function copyCollectionValue(value: string) {
		await navigator.clipboard.writeText(value);
		setCopiedCollectionValue(value);
	}

	return (
		<>
			<Head title={`${settings.website.name} settings`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={settings.website} period={settings.period} activeReport="settings" />

				<div className="grid gap-7 md:grid-cols-[12rem_minmax(0,48rem)] md:items-start lg:gap-10">
					<nav
						className="border-border flex gap-1 overflow-x-auto border-b pb-2 md:block md:border-r md:border-b-0 md:pr-5 md:pb-0"
						aria-label="Website settings"
					>
						<SettingsLink active={section === 'identity'} onClick={() => setSection('identity')}>
							Identity
						</SettingsLink>
						<SettingsLink active={section === 'browser-collection'} onClick={() => setSection('browser-collection')}>
							Browser collection
						</SettingsLink>
						<SettingsLink active={section === 'server-events'} onClick={() => setSection('server-events')}>
							Server events
						</SettingsLink>
						<SettingsLink active={section === 'data-controls'} onClick={() => setSection('data-controls')}>
							Data controls
						</SettingsLink>
					</nav>

					<div>
						{section === 'identity' ? (
							<IdentitySettings
								websiteId={settings.website.id}
								identityMode={identityMode}
								onIdentityModeChange={setIdentityMode}
							/>
						) : null}
						{section === 'browser-collection' ? (
							<BrowserCollectionSettings
								settings={settings}
								trackerUrl={trackerUrl}
								selectedCollectionKeyId={selectedCollectionKeyId}
								copiedValue={copiedCollectionValue}
								onSelectKey={setSelectedCollectionKeyId}
								onCopy={copyCollectionValue}
							/>
						) : null}
						{section === 'server-events' ? (
							<ServerEventSettings
								settings={settings}
								curl={curl}
								copiedSecret={copiedSecret}
								onCopySecret={copySecret}
							/>
						) : null}
						{section === 'data-controls' ? (
							<DataControls
								websiteId={settings.website.id}
								retentionDays={retentionDays}
								onRetentionDaysChange={setRetentionDays}
							/>
						) : null}
					</div>
				</div>
			</main>
		</>
	);
}

function SettingsLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
	return (
		<button
			type="button"
			aria-current={active ? 'page' : undefined}
			onClick={onClick}
			className={`rounded-control w-max cursor-pointer px-3 py-2 text-left text-sm font-semibold transition-colors md:mb-1 md:block md:w-full ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface hover:text-ink'}`}
		>
			{children}
		</button>
	);
}

function SectionHeader({ title, description }: { title: string; description: string }) {
	return (
		<header className="mb-5">
			<h2 className="text-ink text-xl font-bold tracking-tight">{title}</h2>
			<p className="text-muted mt-1 text-sm">{description}</p>
		</header>
	);
}

function BrowserCollectionSettings({
	settings,
	trackerUrl,
	selectedCollectionKeyId,
	copiedValue,
	onSelectKey,
	onCopy,
}: {
	settings: Data.Websites.WebsiteSettings;
	trackerUrl: string;
	selectedCollectionKeyId?: string;
	copiedValue?: string;
	onSelectKey: (keyId: string) => void;
	onCopy: (value: string) => void;
}) {
	const selectedKey =
		settings.collectionKeys.find((collectionKey) => collectionKey.id === selectedCollectionKeyId) ??
		settings.collectionKeys[0];
	const snippet = selectedKey
		? `<script
  defer
  data-website-id="${selectedKey.key}"
  src="${trackerUrl}"
></script>`
		: '';

	return (
		<section aria-labelledby="browser-collection-title">
			<SectionHeader
				title="Browser collection"
				description="Control the exact hostnames and public keys allowed to send browser events for this Website."
			/>

			<div className="mb-3 flex items-end justify-between gap-4">
				<div>
					<h3 className="text-ink text-sm font-semibold">Allowed domains</h3>
					<p className="text-muted mt-1 text-xs">
						Exact hostnames only. Do not include a protocol, port, path, or wildcard.
					</p>
				</div>
				<span className="text-muted shrink-0 text-xs">{settings.allowedDomains.length} / 5</span>
			</div>
			<Card padding="none" className="overflow-hidden">
				{settings.allowedDomains.map((domain) => (
					<div
						key={domain.id}
						className="border-border flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
					>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<span className="bg-mint-soft text-mint rounded-control px-2 py-0.5 text-xs font-semibold">
									Allowed
								</span>
								<code className="text-ink truncate text-sm">{domain.hostname}</code>
							</div>
							<p className="text-muted mt-1 text-xs">Added {formatDate(domain.createdAt)}</p>
						</div>
						<Form
							route="website_allowed_domains.destroy"
							routeParams={{ id: settings.website.id, domainId: domain.id }}
						>
							{({ processing }) => (
								<Button
									type="submit"
									intent="secondary"
									size="small"
									loading={processing}
									disabled={settings.allowedDomains.length === 1}
									className="border-rose text-rose hover:bg-rose-soft self-start"
								>
									{processing ? 'Removing…' : 'Remove'}
								</Button>
							)}
						</Form>
					</div>
				))}
				<Form route="website_allowed_domains.store" routeParams={{ id: settings.website.id }} resetOnSuccess>
					{({ errors, processing }) => (
						<div className="bg-surface-muted border-border flex flex-col items-end gap-3 border-t p-5 sm:flex-row">
							<Field
								label="Add domain"
								name="hostname"
								placeholder="shop.example.com"
								error={errors.hostname}
								disabled={settings.allowedDomains.length >= 5}
								rootClassName="w-full flex-1"
							/>
							<Button
								type="submit"
								size="small"
								loading={processing}
								disabled={settings.allowedDomains.length >= 5}
								className="w-full sm:w-auto"
							>
								{processing ? 'Adding…' : 'Add domain'}
							</Button>
						</div>
					)}
				</Form>
			</Card>
			{settings.allowedDomains.length === 1 ? (
				<p className="text-muted mt-2 text-xs">Add another domain before removing the last allowed domain.</p>
			) : null}

			<div className="mt-8 mb-3 flex items-end justify-between gap-4">
				<div>
					<h3 className="text-ink text-sm font-semibold">Public collection keys</h3>
					<p className="text-muted mt-1 text-xs">
						Public, Website-scoped identifiers. They are safe to copy in browser code.
					</p>
				</div>
				<span className="text-muted shrink-0 text-xs">{settings.collectionKeys.length} / 2 active</span>
			</div>
			{settings.collectionKeys.length > 1 ? (
				<p className="border-peach bg-peach-soft text-muted rounded-control mb-3 border px-4 py-3 text-sm">
					Rotation in progress. Both keys accept events until you explicitly revoke one.
				</p>
			) : null}
			<Card padding="none" className="overflow-hidden">
				{settings.collectionKeys.map((collectionKey) => (
					<fieldset
						key={collectionKey.id}
						aria-label={`Collection key ${collectionKey.key}`}
						className="border-border flex flex-col gap-4 border-b p-5 last:border-b-0 sm:flex-row sm:items-end sm:justify-between"
					>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<span className="bg-mint-soft text-mint rounded-control px-2 py-0.5 text-xs font-semibold">
									{collectionKey.status === 'active' ? 'Active' : null}
								</span>
								<code className="text-ink text-sm break-all">{collectionKey.key}</code>
							</div>
							<p className="text-muted mt-2 text-xs">
								Created {formatDate(collectionKey.createdAt)} · {formatLastUsed(collectionKey.lastUsedAt)}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button type="button" intent="secondary" size="small" onClick={() => onCopy(collectionKey.key)}>
								{copiedValue === collectionKey.key ? 'Copied' : 'Copy key'}
							</Button>
							<Form
								route="website_collection_keys.destroy"
								routeParams={{ id: settings.website.id, keyId: collectionKey.id }}
							>
								{({ processing }) => (
									<Button
										type="submit"
										intent="secondary"
										size="small"
										loading={processing}
										disabled={settings.collectionKeys.length === 1}
										className="border-rose text-rose hover:bg-rose-soft"
										onClick={(event) => {
											const lastUsed = formatLastUsed(collectionKey.lastUsedAt);

											if (
												!window.confirm(
													`Revoke this public collection key? Revocation is immediate and snippets using it will stop collecting. ${lastUsed}.`,
												)
											) {
												event.preventDefault();
											}
										}}
									>
										{processing ? 'Revoking…' : 'Revoke'}
									</Button>
								)}
							</Form>
						</div>
					</fieldset>
				))}
				<div className="bg-surface-muted border-border flex justify-end border-t p-5">
					<Form route="website_collection_keys.store" routeParams={{ id: settings.website.id }}>
						{({ processing }) => (
							<Button type="submit" size="small" loading={processing} disabled={settings.collectionKeys.length >= 2}>
								{processing ? 'Creating…' : 'Create collection key'}
							</Button>
						)}
					</Form>
				</div>
			</Card>

			<div className="mt-6">
				<label htmlFor="snippet-key" className="text-ink block text-sm font-semibold">
					Snippet key
				</label>
				<select
					id="snippet-key"
					value={selectedKey?.id}
					onChange={(event) => onSelectKey(event.target.value)}
					className="border-border bg-surface text-ink rounded-control mt-2 w-full border px-3 py-2 text-sm"
				>
					{settings.collectionKeys.map((collectionKey) => (
						<option key={collectionKey.id} value={collectionKey.id}>
							{collectionKey.key}
						</option>
					))}
				</select>
				<div className="mt-3 flex flex-col gap-2 sm:flex-row">
					<pre className="bg-surface-muted text-ink border-border rounded-control min-w-0 flex-1 overflow-x-auto border p-4 text-sm whitespace-pre-wrap">
						<code>{snippet}</code>
					</pre>
					<Button type="button" intent="secondary" size="small" onClick={() => onCopy(snippet)}>
						{copiedValue === snippet ? 'Copied' : 'Copy snippet'}
					</Button>
				</div>
			</div>
		</section>
	);
}

function DataControls({
	websiteId,
	retentionDays,
	onRetentionDaysChange,
}: {
	websiteId: string;
	retentionDays: RetentionValue;
	onRetentionDaysChange: (value: RetentionValue) => void;
}) {
	return (
		<section aria-labelledby="data-controls-title">
			<header className="mb-5">
				<h2 id="data-controls-title" className="text-ink text-xl font-bold tracking-tight">
					Data controls
				</h2>
				<p className="text-muted mt-1 text-sm">Manage raw event retention and export the data you own.</p>
			</header>

			<Form route="website_retention.update" routeParams={{ id: websiteId }}>
				{({ processing }) => (
					<Card padding="none" className="overflow-hidden">
						<fieldset className="p-5">
							<legend className="text-ink text-base font-bold">Retention</legend>
							<p className="text-muted mt-1 text-sm">Choose how long raw events remain available for this Website.</p>
							<div className="border-border rounded-control mt-5 grid overflow-hidden border sm:grid-cols-5">
								{retentionOptions.map((option) => (
									<label
										key={option.value}
										className={`focus-within:ring-accent relative cursor-pointer border-b px-3 py-3 text-center text-sm font-semibold last:border-b-0 focus-within:z-10 focus-within:ring-2 sm:border-r sm:border-b-0 sm:last:border-r-0 ${retentionDays === option.value ? 'bg-accent text-accent-ink border-accent' : 'border-border bg-surface text-muted hover:bg-surface-muted hover:text-ink'}`}
									>
										<input
											type="radio"
											name="retentionDays"
											value={option.value}
											checked={retentionDays === option.value}
											onChange={() => onRetentionDaysChange(option.value)}
											className="sr-only"
										/>
										{option.label}
									</label>
								))}
							</div>
							<p className="text-muted mt-4 text-sm leading-6">
								60 days is the minimum. A 30-day Product Funnel with a 30-day conversion window needs about 60 days of
								events. Timestamp tolerance can make that edge report unavailable.
							</p>
							<div className="border-border mt-5 flex justify-end border-t pt-4">
								<Button type="submit" size="small" loading={processing}>
									{processing ? 'Saving…' : 'Save retention'}
								</Button>
							</div>
						</fieldset>
					</Card>
				)}
			</Form>

			<Card padding="none" className="mt-5 overflow-hidden">
				<div className="p-5">
					<h3 className="text-ink text-base font-bold">Portable export</h3>
					<p className="text-muted mt-1 text-sm">
						Download a versioned JSON Lines export for every Website in your Workspace.
					</p>
					<ul className="text-muted mt-4 list-disc space-y-1.5 pl-5 text-sm">
						<li>Website configuration and retention settings</li>
						<li>Retained raw events, including existing identity links</li>
						<li>Funnels and ordered steps</li>
						<li>Excludes server keys, sessions, authentication data, and secrets</li>
					</ul>
					<div className="border-border mt-5 flex justify-end border-t pt-4">
						<Button asChild size="small">
							<a href="/account/export" download>
								Download JSONL export
							</a>
						</Button>
					</div>
				</div>
			</Card>
		</section>
	);
}

function IdentitySettings({
	websiteId,
	identityMode,
	onIdentityModeChange,
}: {
	websiteId: string;
	identityMode: 'anonymous' | 'product';
	onIdentityModeChange: (value: 'anonymous' | 'product') => void;
}) {
	return (
		<section aria-labelledby="identity-mode-title">
			<SectionHeader
				title="Identity mode"
				description="Choose how this Website links events. Names, emails, and profiles are never inferred."
			/>
			<Form route="website_identity_mode.update" routeParams={{ id: websiteId }}>
				{({ processing }) => (
					<Card padding="none" className="overflow-hidden">
						<fieldset className="p-5">
							<legend className="text-ink text-sm font-semibold">Event identity</legend>
							<div className="mt-4 grid gap-3 sm:grid-cols-2">
								<IdentityModeChoice
									value="anonymous"
									selected={identityMode === 'anonymous'}
									onChange={() => onIdentityModeChange('anonymous')}
									title="Anonymous"
									description="Boring Analytics derives rotating visitor identity and 30-minute sessions."
								/>
								<IdentityModeChoice
									value="product"
									selected={identityMode === 'product'}
									onChange={() => onIdentityModeChange('product')}
									title="Product"
									description="Your application sends one opaque distinct_id. Funnels can span sessions."
								/>
							</div>
							<p className="border-accent bg-accent-soft text-muted rounded-control mt-4 border px-4 py-3 text-sm leading-6">
								{identityMode === 'product' ? (
									<>
										New browser and server events must include <code className="text-ink">distinctId</code>.
									</>
								) : (
									<>New events must omit Product identity and use 30-minute sessions.</>
								)}{' '}
								Historical events and existing Funnels stay unchanged.
							</p>
							<div className="mt-4 flex justify-end">
								<Button type="submit" size="small" loading={processing}>
									{processing ? 'Saving…' : 'Save identity mode'}
								</Button>
							</div>
						</fieldset>
					</Card>
				)}
			</Form>
		</section>
	);
}

function ServerEventSettings({
	settings,
	curl,
	copiedSecret,
	onCopySecret,
}: {
	settings: Data.Websites.WebsiteSettings;
	curl: string;
	copiedSecret?: string;
	onCopySecret: () => void;
}) {
	const { flash } = usePage();

	return (
		<section aria-labelledby="server-events-title">
			<header className="mb-5">
				<h2 id="server-events-title" className="text-ink text-xl font-bold tracking-tight">
					Server events
				</h2>
				<p className="text-muted mt-1 text-sm">
					Send custom events from your backend with one secret key scoped to this Website.
				</p>
			</header>

			{flash.serverKeySecret ? (
				<section className="border-mint bg-mint-soft rounded-card mb-5 border p-5" aria-labelledby="new-key-title">
					<h3 id="new-key-title" className="text-ink text-sm font-semibold">
						Your server key has been generated
					</h3>
					<p className="text-muted mt-1 text-sm">Copy this secret now. You won’t be able to see it again.</p>
					<div className="mt-4 flex flex-col gap-2 sm:flex-row">
						<code className="border-border bg-surface text-ink rounded-control min-w-0 flex-1 overflow-x-auto border px-3 py-2.5 text-sm whitespace-nowrap">
							{flash.serverKeySecret}
						</code>
						<Button type="button" size="small" onClick={onCopySecret}>
							{copiedSecret === flash.serverKeySecret ? 'Copied' : 'Copy secret'}
						</Button>
					</div>
				</section>
			) : null}

			<Card padding="none" className="overflow-hidden">
				<header className="border-border border-b px-5 py-4">
					<h3 className="text-ink text-sm font-semibold">Active server key</h3>
				</header>
				{settings.serverKey ? (
					<div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between">
						<dl className="grid flex-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted text-xs">Key prefix</dt>
								<dd className="text-ink mt-1 font-mono">{settings.serverKey.prefix}</dd>
							</div>
							<div>
								<dt className="text-muted text-xs">Created</dt>
								<dd className="text-ink mt-1">{formatDate(settings.serverKey.createdAt)}</dd>
							</div>
						</dl>
						<Form route="website_server_keys.destroy" routeParams={{ id: settings.website.id }}>
							{({ processing }) => (
								<Button
									type="submit"
									intent="secondary"
									size="small"
									loading={processing}
									className="border-rose text-rose hover:bg-rose-soft"
									onClick={(event) => {
										if (!window.confirm('Revoke this server key? Requests using it will stop immediately.')) {
											event.preventDefault();
										}
									}}
								>
									{processing ? 'Revoking…' : 'Revoke key'}
								</Button>
							)}
						</Form>
					</div>
				) : (
					<div className="p-5">
						<p className="text-muted text-sm">Create a key to authenticate events sent by your backend.</p>
						<Form route="website_server_keys.store" routeParams={{ id: settings.website.id }}>
							{({ processing }) => (
								<Button type="submit" size="small" loading={processing} className="mt-4">
									{processing ? 'Creating…' : 'Create server key'}
								</Button>
							)}
						</Form>
					</div>
				)}
			</Card>

			<Card padding="none" className="mt-5 overflow-hidden">
				<header className="border-border border-b px-5 py-4">
					<h3 className="text-ink text-sm font-semibold">Example request</h3>
				</header>
				<pre className="bg-surface-muted text-ink overflow-x-auto p-5 text-sm whitespace-pre-wrap">
					<code>{curl}</code>
				</pre>
			</Card>

			<p className="border-accent bg-accent-soft text-muted rounded-control mt-5 border px-4 py-3 text-sm">
				Server events use the same name, path, property, and timestamp rules as browser custom events.
			</p>
		</section>
	);
}

function IdentityModeChoice({
	value,
	selected,
	onChange,
	title,
	description,
}: {
	value: 'anonymous' | 'product';
	selected: boolean;
	onChange: () => void;
	title: string;
	description: string;
}) {
	return (
		<label
			aria-label={title}
			className={`rounded-control focus-within:ring-accent cursor-pointer border p-4 focus-within:ring-2 focus-within:ring-offset-2 ${selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}
		>
			<span className="flex items-start justify-between gap-3">
				<span>
					<strong className="text-ink block text-sm">{title}</strong>
					<span className="text-muted mt-1.5 block text-sm leading-5">{description}</span>
				</span>
				<input
					type="radio"
					name="identityMode"
					value={value}
					checked={selected}
					onChange={onChange}
					className="accent-accent mt-0.5 size-4 shrink-0"
				/>
			</span>
		</label>
	);
}

const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

function formatDate(value: string) {
	return dateFormatter.format(new Date(value));
}

function formatLastUsed(value: string | null) {
	return value ? `Last used ${formatDate(value)}` : 'Never used';
}
