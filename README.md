# Boring Analytics

The open-source, self-hosted analytics application for teams that want useful product and website insights without operating a data platform.

This repository currently contains the development foundation only. Product analytics capabilities will be added separately. The application starts as a single AdonisJS process backed by PostgreSQL, following the scope defined in [boring-money.app#92](https://github.com/RomainLanz/boring-money.app/issues/92).

## What is included

- AdonisJS 7 as the HTTP server and Backend for Frontend;
- Inertia 3 and React 19 for server-driven pages;
- Postgres 18, Kysely, and generated database types instead of Lucid;
- pragmatic DDD building blocks for entities, identifiers, value objects, and repositories;
- Actions for command-side use cases and Queries for read-side projections;
- typed `Result` values for expected business outcomes;
- Yarn 4 workspaces and a shared dependency catalog;
- a design-system workspace using Tailwind CSS 4, Tailwind Variants, Ark UI, and Storybook;
- Oxlint and Oxfmt as the only linting and formatting tools;
- Docker Compose for local Postgres and the self-hosted application stack;
- architecture documentation and `AGENTS.md` instructions designed to guide coding agents.

## Repository structure

```text
.
├── apps/
│   └── web/
│       ├── app/             Adonis delivery layer and Inertia BFF
│       ├── src/             application and business capabilities
│       ├── inertia/         React pages, layouts, and browser concerns
│       ├── database/        Postgres migrations
│       ├── config/          Adonis configuration
│       ├── providers/       framework-to-application bindings
│       ├── start/           routes and application bootstrapping
│       └── tests/           web application tests
├── packages/
│   └── design-system/       shared UI primitives, styles, and stories
├── docs/
│   ├── architecture/        application architecture rules
│   ├── agents/              task-specific guidance for coding agents
│   └── adr/                 architectural decision records
├── compose.dev.yml          local Postgres service
├── compose.yml              self-hosted application and Postgres
├── oxfmt.config.ts          repository-wide formatting rules
├── oxlint.config.ts         repository-wide linting rules
└── AGENTS.md                entry point for coding agents
```

### `apps/web/app`: delivery and BFF

`app` contains framework-facing code: controllers, middleware, validators, policies, transformers, and capability routes. It composes Actions and Queries into HTTP or Inertia responses. It may depend on `src`, but it must not contain business rules or persistence logic.

Inertia controllers expose at most two public methods:

- `render` composes read data and renders a page;
- `execute` validates transport input, runs an Action, and maps its outcome.

When a form and its submission represent the same use case, both methods belong to the same controller. A read-only page can expose only `render`, and an endpoint without a page can expose only `execute`.

```text
GET  /login -> LoginController.render  -> Inertia login page
POST /login -> LoginController.execute -> VerifyUserCredentials Action
```

Controllers are grouped by use case, not merely by page. A composite Settings page has one controller responsible for `render`, while each independently submitted module uses its own focused `execute` controller:

```text
GET   /settings          -> SettingsController.render
PATCH /settings/profile  -> UpdateProfileController.execute
PUT   /settings/password -> ChangePasswordController.execute
```

This prevents one page controller from accumulating unrelated validation, authorization, and mutation flows.

### `apps/web/src`: application core

`src` is organized by business capability. It owns Actions, Queries, domain objects, repositories, jobs, and application services. It may use AdonisJS when useful, but it never imports from `app` or `inertia`.

Command paths load domain objects when behavior or invariants justify them. Read paths return purpose-built projections without forcing them through command-side entities. Kysely access and row mapping stay behind repositories or explicit Queries.

```text
app/<capability>  ──┐
                    ├──> src/<capability>
inertia/          ──┘
```

### `packages/design-system`: reusable UI

The design system owns shared visual primitives and their variants. Components are built with Ark UI, styled with Tailwind CSS and Tailwind Variants, and documented in Storybook. Inertia pages consume the package rather than maintaining private copies of reusable UI.

## Getting started

### Requirements

- Node.js 24 or newer;
- Corepack with Yarn 4;
- Docker with Docker Compose.

### Installation

```bash
corepack enable
yarn install
cp apps/web/.env.example apps/web/.env
yarn workspace @boring-analytics/web exec node ace generate:key
anonymous_id_secret="$(openssl rand -hex 32)"
sed -i.bak "s/^ANONYMOUS_ID_SECRET=$/ANONYMOUS_ID_SECRET=$anonymous_id_secret/" apps/web/.env && rm apps/web/.env.bak
yarn docker:up
yarn workspace @boring-analytics/web db:migrate
yarn dev
```

In an Amp orb, run `.agents/setup` instead. It installs dependencies, configures PostgreSQL, creates the local environment file, and applies migrations. The declared service in `.amp/services.yaml` runs the application.

The web application is available at [http://localhost:3333](http://localhost:3333). Start Storybook separately with `yarn storybook`; it is served at [http://localhost:6006](http://localhost:6006).

Stop the database with:

```bash
yarn docker:down
```

## Common commands

| Command            | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `yarn dev`         | Start AdonisJS with HMR                     |
| `yarn build`       | Build every workspace                       |
| `yarn storybook`   | Run the design-system workshop              |
| `yarn test`        | Run the web test suite                      |
| `yarn typecheck`   | Type-check every workspace                  |
| `yarn lint`        | Check the repository with Oxlint            |
| `yarn lint:fix`    | Apply safe Oxlint fixes                     |
| `yarn format`      | Check formatting with Oxfmt                 |
| `yarn format:fix`  | Format the repository with Oxfmt            |
| `yarn docker:up`   | Start local infrastructure                  |
| `yarn docker:down` | Stop local infrastructure                   |
| `yarn taze`        | Review dependency updates across workspaces |

Raw event retention, the bounded purge command, host scheduling, and the portable owner export are documented in
[Data lifecycle](docs/data-lifecycle.md).

Production installation, health probes, updates, PostgreSQL backup and restore, and the disposable Docker smoke test
are documented in [Self-hosting with Docker Compose](docs/self-hosting.md).

Create a user interactively with the `create:user` Ace command:

```bash
yarn workspace @boring-analytics/web exec node ace create:user
```

For provisioning and local automation, pass any available values as flags. The command asks only for values that were omitted:

```bash
yarn workspace @boring-analytics/web exec node ace create:user \
	--name='Ada Lovelace' \
	--email='ada@example.com' \
	--password='a-secure-password'
```

The command is a thin adapter over the same `RegisterUser` Action used by the HTTP registration flow. `RegisterUser` constructs the `EmailAddress` Value Object and owns input normalization, password policy, password hashing, transactions, and duplicate-email handling.

After changing migrations, regenerate the Kysely database types while Postgres is running:

```bash
yarn workspace @boring-analytics/web db:codegen
```

Do not edit `apps/web/types/db.ts` or `apps/web/.adonisjs/` manually; both are generated artifacts.

Reset the local database by dropping every table in the `public` schema and rerunning all migrations:

```bash
yarn workspace @boring-analytics/web db:fresh
```

This command is destructive. It refuses to run in production unless `--force` is passed explicitly.

## Browser tracking

Each Website page displays a self-contained `<script>` tag for the instance's `/tracker.js`. The tracker has no client
framework dependency. It records the first page load and History API or `popstate` navigation, strips query strings and
fragments from paths and referrers, honors Do Not Track, and writes no cookies or durable browser identifier. It keeps
only a random per-tab session ID and last-activity timestamp in `sessionStorage`. It sends JSON using a cross-origin
`sendBeacon` request and falls back to `fetch` with `keepalive`. The collection endpoint allows the credentialed CORS
preflight required by `sendBeacon`, but does not read cookies, application sessions, or authorization.

Collection requests are limited to 4 KiB. For unusually long URLs, the tracker keeps the pathname and removes the
referrer first, followed by campaign, medium, and source, until the request fits. It does not send paths longer than the
2,048-character protocol limit.

Every Website starts in Anonymous Mode. The server derives `anonymous_id` from the Website ID, request IP, User-Agent,
and `ANONYMOUS_ID_SECRET`, stores only the HMAC result, and rotates it at UTC day boundaries. The tracker supplies a
random `session_id`, renews it when the next Event is exactly 30 minutes or more after the previous activity, and keeps
it only in `sessionStorage`. It therefore crosses clock buckets, same-tab reloads, and UTC Anonymous ID rotation without
a cookie, durable browser identifier, or mutable per-visitor server state. Browser-created tabs normally start a new
session, except when the browser initially copies `sessionStorage` from an opener tab.
Changing the secret immediately breaks Anonymous ID linkage; keep it out of source control and rotate it only when that
break is intended.

The endpoint temporarily accepts cached tracker versions that omit `sessionId` and assigns their former fixed-bucket
HMAC. Traffic marks session metrics unavailable whenever the displayed period contains one of those legacy pageviews;
it never presents a mixed approximation as complete. Historical Anonymous Funnels retain their original Session IDs,
while newly collected Funnel Events use the inactivity-based tracker session without changing Funnel query semantics.

Traffic counts a Session when it contains a `$pageview`. A completed Session with exactly one `$pageview` is a bounce,
even when it also contains custom Events. Duration is the elapsed `occurredAt` time from the first to last browser Event
in that Session; a one-Event Session is zero seconds. Bounce rate and median duration include only Sessions whose last
activity is at least 30 minutes old, while the Session count includes active Sessions. Delayed or out-of-order Events
retain the Session ID assigned when the tracker created them and reports order by `occurredAt`; accepted late Events may
therefore revise a previously reported Session. Identified Product browser Events and Product server Events have no
Anonymous Session ID and do not contribute to these metrics.

`EVENT_TIME_TOLERANCE_HOURS` bounds accepted client timestamps in both directions and defaults to 24 in the example
environment. Existing installations must add the new variables before upgrading. The tolerance absorbs offline Beacon
delivery and moderate clock skew without accepting arbitrarily old events.

`TRUST_PROXY` is a comma-separated list using the `proxy-addr` names and CIDR syntax. It must contain only the reverse
proxies allowed to provide `X-Forwarded-For`. The example trusts loopback and private network ranges for a local or
containerized proxy. Use the exact ingress CIDRs when the application is reachable through public proxy addresses.
Requests received directly from an untrusted address ignore forwarded IP headers.

### Custom browser events

The tracker exposes a framework-independent browser API after it loads:

```js
window.boringAnalytics?.track('signup', {
	plan: 'pro',
	trial: true,
	seats: 3,
	coupon: null,
});

// Supply a stable ID only when the caller may retry this event.
window.boringAnalytics?.track('invoice_paid', { amount: 49 }, { eventId: 'invoice-018f6b9a' });
```

Custom event names cannot start with `$`, which is reserved for built-in events. A name must contain 1 to 64
characters and cannot contain control characters or unpaired UTF-16 surrogates. Each event accepts at most 20
properties. Property keys must contain 1 to 64
characters, cannot equal `__proto__`, and cannot contain control characters or unpaired UTF-16 surrogates. Values may
only be strings, finite numbers, booleans, or `null`; strings may contain at most 255 characters and cannot contain NUL
or unpaired UTF-16 surrogates. Nested objects and arrays are rejected. The complete JSON request must remain within the
4 KiB collection limit. `track` returns `false` and sends nothing when its input violates these rules, exceeds the
payload limit, or Do Not Track is enabled.

`eventId` is optional. It must be an opaque token containing 1 to 255 characters, with no whitespace, control
characters, or malformed UTF-16. When supplied, only the first event with that `eventId` is inserted for a Website,
even across browser and server requests or concurrent deliveries. The same value remains independent on another
Website. An event without `eventId` remains append-only and every accepted delivery is inserted. The tracker does not
generate IDs, retry requests, or persist an offline queue; an integrator that retries must retain and resubmit its own
stable ID.

Send up to 20 custom browser events in one atomic request with `trackBatch`:

```js
window.boringAnalytics?.trackBatch([
	{ name: 'signup', properties: { plan: 'pro' }, eventId: 'signup-018f6b9a' },
	{ name: 'checkout_started', eventId: 'checkout-018f6b9a' },
]);
```

The equivalent public HTTP form is `{ "trackingId": "...", "events": [...] }`; each item has the same fields and
rules as one browser event except that `trackingId` is factored to the envelope. A batch contains 1 to 20 events and
its complete JSON body is limited to 64 KiB. `trackBatch` returns `false` and sends nothing when any item or either
bound is invalid.

Custom events use the same Origin checks, rate limits, timestamp tolerance, and Website identity contract as
pageviews. The collector derives identity from the request IP and User-Agent, then persists only the HMAC identifiers.
It never stores the raw IP or User-Agent.

### Product Mode

An owner can change a Website to Product Mode from Settings. Browser events without a `distinctId` remain anonymous
until the integrating application explicitly identifies the current browser. Browser events after identification and
all server events use an opaque pseudonymous `distinctId`, which Boring Analytics persists as `distinct_id`. The value
must be a non-empty string of at most 255 characters. Numbers, objects, arrays, NUL, and malformed UTF-16 are rejected.
Boring Analytics does not accept name, email, traits, or profile fields and does not inspect identifiers for personal
data. The integrating application is responsible for generating a value that contains no direct personal data.

Supply the identity needed by the automatic first pageview on the tracker script:

```html
<script
	data-website-id="YOUR_WEBSITE_TRACKING_ID"
	data-distinct-id="opaque-account-42"
	src="https://YOUR_BORING_ANALYTICS_HOST/tracker.js"
></script>
```

When the browser starts anonymously, identify it as soon as the application obtains its Product identity:

```js
window.boringAnalytics?.identify('opaque-account-42');
window.boringAnalytics?.track('signup');
```

`identify` sends the reserved `$identify` system event with the server-derived current Anonymous ID, then switches future
tracker events to the supplied Distinct ID. It returns `false`, sends nothing, and keeps the current identity when input
validation, Do Not Track, path validation, or the payload limit rejects the call. The collector accepts `$identify` only
for Product Websites. It stores the Anonymous ID, Distinct ID, event timestamps, and path, but never the raw IP or
User-Agent.

An Anonymous ID can link only once. Repeating the same identification is idempotent. If later calls submit another
Distinct ID for that Anonymous ID, the first persisted link wins. Multiple Anonymous IDs may link to one Distinct ID.
Product Funnels attribute anonymous events from the same Website when their `occurredAt` is before or equal to the
identification timestamp. This includes an earlier event received after `$identify`; it excludes events whose
`occurredAt` is later. The daily Anonymous ID rotation limits attribution to the captured identity. The Website boundary
also separates owners, and each Distinct ID counts once even when several Anonymous IDs link to it. Switching Website
mode leaves persisted links and existing Funnel identity kinds unchanged. Anonymous Funnels continue to use only
`session_id`.

Use `setDistinctId` instead when no anonymous acquisition should be associated, for example when changing accounts in a
single-page application:

```js
window.boringAnalytics?.setDistinctId('opaque-account-84');
window.boringAnalytics?.track('checkout_started', { plan: 'pro' });
```

`setDistinctId` returns `false` and keeps the previous value when validation fails. It changes only future events and
does not create an identification link. Arbitrary aliases, profiles, traits, transitive identity merging, automatic
retry, and general deduplication without an explicit `eventId` remain out of scope.

### Server events

A Website owner can create one active server key from the Website's server-event settings. Copy the returned secret
when it appears. The application stores its scrypt hash and safe prefix, so it cannot display the secret again. Revoke
the key and create a replacement if the secret is lost or exposed.

Send one custom event with a Bearer token:

```bash
curl -X POST "$BORING_ANALYTICS_URL/api/server/events" \
	-H "Authorization: Bearer $BORING_ANALYTICS_SERVER_KEY" \
	-H 'Content-Type: application/json' \
	-d @- <<JSON
	{
		"name": "invoice.paid",
		"occurredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
		"path": "/billing",
		"properties": { "amount": 49, "currency": "CHF" },
		"distinctId": "opaque-account-42"
	}
JSON
```

To send a batch, keep the same authenticated endpoint and wrap 1 to 20 event objects in `events`:

```json
{
	"events": [
		{
			"name": "invoice.paid",
			"occurredAt": "2026-09-12T12:00:00Z",
			"path": "/billing",
			"properties": { "amount": 49 },
			"eventId": "invoice-018f6b9a"
		}
	]
}
```

The endpoint returns `202 Accepted` and records the event with a server source. It does not require an `Origin` header
and does not create anonymous or session identity. Omit `distinctId` for an Anonymous Website; it is required for a
Product Website. The server API does not accept `$identify`, because a server request has no current anonymous browser
identity to associate. Names, paths, properties, timestamps, the 4 KiB payload limit, and
JSON media type follow the browser custom-event contract above. Missing, malformed, incorrect, and revoked keys all
return `401` with `{ "error": "invalid_server_key" }`.

Browser and server batches are fully atomic. Every item is validated with the single-event rules before commit and
items are applied in array order. This makes a browser `$identify` preceding Product events deterministic. If an
application rule fails, the response is `422` with its zero-based `index` and no event from the batch is committed.
Duplicate `eventId` values, whether repeated inside the batch, already persisted, or inserted concurrently, are
successful no-ops; the response remains `202` and does not disclose which IDs existed. Public requests use the same
`collection_forbidden` response for an unknown tracking ID and a disallowed Origin. Both single and batch requests
consume rate-limit capacity by event count, including duplicate no-ops. The batch JSON limit is 64 KiB; the 4 KiB
limit remains unchanged for single events.

## Adding a capability

Use a vertical slice and create only the folders the capability needs:

```text
apps/web/
├── app/billing/
│   ├── controllers/
│   ├── transformers/
│   └── routes.ts
└── src/billing/
    ├── actions/
    ├── domain/
    ├── queries/
    └── repositories/
```

For a mutation, define the Action contract and its expected outcomes, put persistence mapping in a repository, then adapt it in a controller's `execute` method. For a non-trivial read, define an explicit Query and compose its projection in `render`. Database constraints remain the final defense for persistent invariants.

Before opening a pull request, run:

```bash
yarn lint
yarn format
yarn typecheck
yarn test
```

## Documentation

- [Domain glossary](CONTEXT.md): canonical language used by the example capabilities.
- [Agent instructions](AGENTS.md): repository-wide rules and verification commands.
- [Application architecture](docs/architecture/application.md): dependency direction, controllers, Actions, Queries, domain modeling, Results, and transactions.
- [Design-system guide](docs/agents/design-system.md): component ownership, variants, accessibility, and Storybook expectations.
- [ADR 0001](docs/adr/0001-monorepo-with-adonis-bff-and-modular-core.md): monorepo, Adonis BFF, and modular core.
- [ADR 0002](docs/adr/0002-use-postgres-through-kysely.md): Postgres and Kysely persistence.
- [ADR 0003](docs/adr/0003-use-command-models-and-read-model-projections.md): command models and read projections.
- [ADR 0004](docs/adr/0004-use-result-for-expected-business-outcomes.md): typed Results for expected failures.

## License

This project is available under the [MIT License](LICENSE).
