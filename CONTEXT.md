# Boring Analytics domain

This glossary defines the domain language used by Boring Analytics.

## Identity

**User**:
A person who can authenticate and use the application.

**Workspace**:
A personal ownership boundary created with a User. It owns Websites.

**Website**:
A source of browser analytics events identified by a public tracking ID and restricted to one allowed domain.

**Anonymous Mode**:
The default Website identity mode. Boring Analytics derives rotating anonymous and 30-minute session identifiers from
request context, then discards the raw IP address and User-Agent.

**Product Mode**:
A Website identity mode where browser events may start anonymously before the integrating application identifies the
current anonymous identity with an opaque pseudonymous Distinct ID. Server events require the Distinct ID. Boring
Analytics stores no Person or profile and does not infer whether an identifier contains personal data.

**Distinct ID**:
An opaque pseudonymous identifier supplied by an integrating application in Product Mode. It links future events that
carry the same value and anonymous browser events explicitly associated through `$identify`. It does not create a user
profile.

**Identification**:
A Website-scoped, first-write-wins association from one rotating Anonymous ID to one Distinct ID. It attributes only
anonymous events that occurred no later than `$identify`. Multiple Anonymous IDs may identify the same Distinct ID.

**Event**:
An append-only fact received for a Website. Browser events are the reserved `$pageview` and `$identify` system events,
or a custom event whose name does not start with `$`.

**Funnel**:
An ordered sequence of Events counted by one persisted identity kind. Anonymous Funnels use `session_id` and a maximum
30-minute conversion window. Product Funnels use `distinct_id` and may use a conversion window of up to 30 days.
