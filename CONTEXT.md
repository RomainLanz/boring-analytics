# Boring Analytics domain

This glossary defines the domain language used by Boring Analytics.

## Identity

**User**:
A person who can authenticate and use the application.

**Workspace**:
A personal ownership boundary created with a User. It owns Websites.

**Website**:
A source of browser analytics events identified by a public tracking ID and restricted to one allowed domain.

**Event**:
An append-only fact received for a Website. Browser events are either the reserved `$pageview` event or a custom event
whose name does not start with `$`.
