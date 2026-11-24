---
status: accepted
date: 2026-11-22
deciders: Hasan Hüse
relates-to: 0003-rest-company, 0004-allow-only-grants
---

# Several companies is a mode switched by one flag; with it off, nothing confines a call to a company

Doorward models tenants as companies, and every record belongs to one. `MULTI_COMPANY_MODE` decides whether
callers are confined to one. Off (the default), nothing confines a call: an install has the seeded `Default`
company until someone creates another, and a caller that sends a company id gets that company. On, gRPC callers
send a `company-key` and REST sessions stay inside their own company.

Recorded afterwards from `docs/domain.md`, `apps/api/src/application/service-call.ts` and the seed.

## Context

- Most installs serve one organization. Asking every integrating app to send a company would be noise for them.
- Some operators host several organizations on one install. Access must never cross a company then.
- The schema has to hold both, because a database cannot switch shape after data exists.

## Decision

### 1. The company is always in the schema

Users, groups, permissions, scopes and OIDC clients carry `company_id`. Names are unique per company. A grant's
subject, permission and scope must all belong to the same company, or the API rejects the request. A user can only
join groups of their own company.

### 2. The flag decides whether a call is confined

`confinedCompany` returns nothing when the flag is off. Then `Tenancy.filter` returns the requested company id or
nothing, so a list with no company id can return every company's rows, and no service forces the seeded company.
Creates still need an explicit `company_id`. With the flag on, a call is confined to a company id, and the
service refuses rows, lists and creates in any other. The gRPC id comes from
`company-key` metadata; the REST id comes from the session ([0003](0003-rest-company.md)).

### 3. A missing company fails closed

An unknown or missing `company-key` resolves to the nil UUID, which matches no row ([0008](0008-uuid-v7-ids.md)).
It never falls through to the default company.

### 4. `company_key` is the public name of a company

It is a random UUID separate from the row id ([0008](0008-uuid-v7-ids.md)), unique among live companies. Apps
and the OIDC flow use it; the row id stays internal.

### 5. The web build mirrors the flag

`NEXT_PUBLIC_MULTI_COMPANY_MODE` should match the API's value. It decides whether the admin console loads and
shows companies, not what the API allows.

## Considered options

- **Always multi-company.** Rejected: every single-organization install would send and manage a company it does
  not care about.
- **Single-company schema, with multi-tenancy later.** Rejected: adding `company_id` to every table and every
  unique index after data exists is the hardest migration there is.
- **One database or schema per tenant.** Not chosen: it multiplies migrations ([0006](0006-versioned-migrations.md))
  and connections. Inferred.
- **Derive the company from the API key.** Not chosen: keys are environment values, not rows
  ([0002](0002-two-api-keys.md)).

## Consequences

- **The flag is the whole switch, and off means unconfined.** Turning it off removes confinement at once; two
  companies in one database then see each other's rows. Do not turn it off once a second company has data.
- **Turning it on later needs integrators to send `company-key`.** Until they do, their calls fail closed.
- **Per-company uniqueness** means the same username can exist in two companies, so sign-in without a company is
  ambiguous and fails when both match. Sign-in callers pass a company key then.
- **There are no cross-company admins in REST.** An admin who runs two companies needs two users.
- **Web and API flags can disagree.** The deploy docs ask for them to match; the code does not check it.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/application/service-call.ts`,
`apps/api/src/application/common.ts`, `apps/api/src/grpc/doorward.grpc.controller.ts`.
