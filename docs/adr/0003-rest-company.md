---
status: accepted
date: 2026-11-23
deciders: Hasan Hüse
relates-to: 0002-two-api-keys
---

# A REST session stays inside the signed-in company

When `MULTI_COMPANY_MODE=true`, a signed-in REST call is confined to `session.companyId`. The caller does not
pick another company with a query or body field. gRPC keeps sending `company-key`, because an integrating app
is not a user in one company.

## Context

- Multi-company mode already required gRPC metadata `company-key`. REST lists accepted a `companyId` query, so
  an admin session could read another company's rows, including the audit log, by passing that id.
- Check itself stays inside one company ([docs/domain.md](../domain.md#rules), rule 7). The hole was the REST
  admin surface, not the Check rule.

## Decision

### 1. REST confinement comes from the session

`as()` in the v1 controller sets `ServiceCall.companyId` from the signed-in user. `Tenancy.confined` returns
that id when multi-company mode is on. Lists that ask for a different company get no rows. A row in another
company is not found. Creating a row in another company is denied.

### 2. An app key on REST Check still sends `company-key`

`POST /api/v1/check` with a manage or check key is not a user session. It resolves `company-key` the same way
gRPC does. A session Check uses the session's company and does not trust that header.

### 3. Single-company installs are not confined

`confinedCompany` returns nothing when multi-company mode is off, so `Tenancy.filter` does not force the seeded
company. A caller that sends a `companyId` uses that company. A caller that sends none is not filtered, and a
list can return every company. The seeded `Default` company is what an install has until someone creates another
([0010](0010-multi-company-is-a-mode.md)).

## Considered options

- **Let REST pass `company-key` too, and trust it on an admin session.** Rejected: the session already names
  a company, and a second header would let that session step into another tenant.
- **Confine gRPC to a company stored on the API key.** Not chosen: keys are not rows ([0002](0002-two-api-keys.md)),
  so there is nowhere to store that company. `company-key` stays on the call.

## Consequences

- **An admin who belongs to company A cannot administer company B** through REST while multi-company mode is
  on. A person who must operate two companies needs two users.
- **A missing `company-key` on an app-key Check matches nothing** (the nil company id), the same as a missing
  gRPC header. It does not fall through to the default company.
- **Turning multi-company mode off removes the confinement.** The flag is the whole switch. There is no
  per-route exception.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: `apps/api/src/http/v1.controller.ts`,
`apps/api/src/application/common.ts`, `apps/api/src/application/service-call.ts`,
`apps/api/src/http/check.controller.ts`. Change: PR #4.
