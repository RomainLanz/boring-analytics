# Country GeoIP data

Boring Analytics derives only an ISO 3166-1 alpha-2 Country code while accepting a Browser Event. The client IP stays
inside the HTTP request boundary and is never passed to event persistence or export. Server Events are not geolocated.
No application process performs a network lookup or downloads GeoIP data.

## Distributed database

The viable redistributable Country databases were compared before selecting the image default:

| Source                   | License and attribution                                         |               Country database size checked | Freshness and reproducibility                                                                               | Node and architectures                        |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------: | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DB-IP Country Lite       | CC BY 4.0; link to DB-IP required                               |                             8,340,464 bytes | Monthly public `YYYY-MM` URL; checksum can be pinned                                                        | Standard MMDB; pure-JS `maxmind`; amd64/arm64 |
| MaxMind GeoLite2 Country | GeoLite2 EULA and attribution; account and license key required |                       8.61–9.69 MB observed | Twice weekly, but authenticated acquisition and deletion obligations complicate reproducible redistribution | Standard MMDB; pure-JS `maxmind`; amd64/arm64 |
| IP2Location LITE DB1     | CC BY-SA 4.0 attribution/share-alike; account required          | 14.79 MB IPv4 + 11.08 MB IPv6 MMDB observed | Monthly authenticated artifacts, split by address family                                                    | Standard MMDB; pure-JS `maxmind`; amd64/arm64 |

DB-IP is the smallest clean option with an unauthenticated, month-addressed artifact and a standard dual-stack format.
The other two remain usable as operator-mounted MMDB replacements, subject to their own licenses.

The application image contains **DB-IP Country Lite, September 2026**, published by [DB-IP.com](https://db-ip.com/).
The data is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The image build downloads this exact artifact:

```text
https://download.db-ip.com/free/dbip-country-lite-2026-09.mmdb.gz
SHA-256 cb0578ce59f569f2c933bb40feb820804a334855a60739011b0a89cab1d6e4ed
compressed size 4,116,896 bytes
uncompressed size 8,340,464 bytes
MMDB build timestamp 2026-09-01T01:32:45.000Z
```

The pinned monthly URL and checksum make a build fail rather than silently consume changed data. The MMDB contains
IPv4 and IPv6 Country records and is read by the pure-JavaScript, MIT-licensed `maxmind` package. It has no native
architecture dependency, so the same data and API work on amd64 and arm64.

DB-IP publishes Country Lite monthly. To update it:

1. Select the new `YYYY-MM` artifact from the DB-IP free database downloads page and review its license and release
   information.
2. Download it outside the application process, calculate `sha256sum` on the compressed artifact, and inspect its
   uncompressed size.
3. Change `DBIP_COUNTRY_LITE_VERSION` and `DBIP_COUNTRY_LITE_SHA256` in the `geoip` stage of `Dockerfile`.
4. Build the image for amd64 and arm64, verify the reported database version, image-size delta, and Browser ingestion
   against public IPv4 and IPv6 fixtures.

The repository does not contain the 8.3 MB production database. Docker obtains it only while building the image.

Country labels and Unicode flags in reports come from the local `countries-list` 3.4.1 tables, licensed under MIT.
They are bundled into the web assets and never fetched from an icon or country service at runtime. The lockfile pins
the exact table version used by reproducible installs.

## Replacing or disabling the database

`GEOIP_DATABASE_PATH` is read once when the process starts. A missing, unreadable, or corrupt file disables Country
resolution without making the application unavailable; new events then store `null` and reports show **Unknown**.
Replacing a file takes effect after restarting the application process.

To use an operator-supplied standard Country MMDB, mount it read-only and point the application at its container path:

```yaml
services:
  app:
    volumes:
      - ./geoip/country.mmdb:/run/geoip/country.mmdb:ro
    environment:
      GEOIP_DATABASE_PATH: /run/geoip/country.mmdb
```

Apply this as a Compose override and restart `app`. Set `GEOIP_DATABASE_PATH` to a nonexistent container path to run
without GeoIP data. Boring Analytics never downloads a missing replacement at runtime.

## Proxy trust and privacy

The collector resolves the client address through AdonisJS `request.ip()`. `TRUST_PROXY` is the only policy that allows
a proxy hop to contribute `X-Forwarded-For`; country headers and `X-Real-IP` are ignored. Keep it restricted to the
actual ingress addresses or CIDRs. A direct untrusted client cannot select Country through forwarded headers.

Malformed, private, loopback, link-local, and unique-local addresses resolve to Unknown. An absent lookup and an
unknown or invalid result also resolve to Unknown. The application persists no raw IP, raw User-Agent, city, region,
coordinates, ASN, network precision, or GeoIP error.
