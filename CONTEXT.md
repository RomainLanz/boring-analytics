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
A Website identity mode where the integrating application supplies an opaque pseudonymous Distinct ID with every
browser and server event. Boring Analytics stores no Person or profile and does not infer whether an identifier contains
personal data.

**Distinct ID**:
An opaque pseudonymous identifier supplied by an integrating application in Product Mode. It links future events that
carry the same value. It does not merge earlier Anonymous Mode events or create a user profile.

**Event**:
An append-only fact received for a Website. Browser events are either the reserved `$pageview` event or a custom event
whose name does not start with `$`.

**Funnel**:
An ordered sequence of Events counted by one persisted identity kind. Anonymous Funnels use `session_id` and a maximum
30-minute conversion window. Product Funnels use `distinct_id` and may use a conversion window of up to 30 days.
