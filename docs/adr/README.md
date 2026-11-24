# Architecture decision records

An ADR records one decision that is hard to see from the code and costly to undo: what was decided, what else
was on the table, and what it costs. Write one when a choice rules out something a reasonable person might add
later. Do not write one for a bug fix or a change that follows an existing decision.

Files are `NNNN-short-title.md`, numbered in the order they are written. Never renumber. To change a decision,
write a new ADR and set `supersedes:` in it; set the old one's status to `superseded`.

## Template

```markdown
---
status: proposed | accepted | superseded
date: YYYY-MM-DD
deciders: <who decided>
supersedes: <NNNN-title, optional>
relates-to: <NNNN-title, optional>
---

# <The decision, as a sentence>

Two or three sentences: what is decided and the one reason that drives it.

## Context

What forces the decision. Facts the code does not show: constraints, numbers, what already exists.

## Decision

Numbered sections (### 1., ### 2.), each a single rule that a reader can check against the code.

## Considered options

- **Option.** Rejected / Chosen: the reason, in one or two sentences.

## Consequences

What gets easier, what gets harder, the risks that were accepted, and anything left open.

---

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Code: <paths>. Change: <PR link>.
```

Prefer a sentence that says what was given up over a list of benefits. A rejected option needs its real reason; if
the reason is a guess, say it is inferred.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-ldap-sign-in.md) | Directory users sign in through LDAP, flagged per user | accepted |
| [0002](0002-two-api-keys.md) | Integrating apps share two environment keys | accepted |
| [0003](0003-rest-company.md) | A REST session stays inside the signed-in company | accepted |
| [0004](0004-allow-only-grants.md) | Access is allow-only grants to users or flat groups, at a scope tree node | accepted |
| [0005](0005-two-sql-packs.md) | Two SQL packs, Postgres first, and the ORM never changes the schema | accepted |
| [0006](0006-versioned-migrations.md) | Numbered forward-only migrations; the API refuses a mismatched database | accepted |
| [0007](0007-deactivate-then-remove.md) | Deactivate, then remove; every change but an insert is audited | accepted |
| [0008](0008-uuid-v7-ids.md) | UUID v7 row ids from the application; random shared keys | accepted |
| [0009](0009-one-process-rest-and-grpc.md) | One Nest process serves REST and gRPC; the proto file is the API contract | accepted |
| [0010](0010-multi-company-is-a-mode.md) | Several companies is a mode behind one flag; off means calls are not confined | accepted |
| [0011](0011-built-in-oidc-provider.md) | Built-in OpenID Connect provider, off until an issuer is set | accepted |
| [0012](0012-totp-two-step-verification.md) | TOTP two-step verification with encrypted secrets, enforceable per company | accepted |
| [0013](0013-web-on-vercel-api-long-lived.md) | Admin web speaks REST only; the API stays on a long-lived host | accepted |
| [0014](0014-passwords-sessions-and-sign-in-limits.md) | argon2id, httpOnly JWT cookie sessions, rate-limited uniform sign-in | accepted |
| [0015](0015-rest-session-proves-identity-not-authority.md) | A REST session proves identity; authority is re-checked on every admin request | accepted |
| [0016](0016-audit-log-kept-forever.md) | The audit log is append-only and nothing removes rows from it | accepted |

ADRs 0004 to 0016 were written after the fact from the code and docs at v0.1.1. They say so, and mark reasons the
repository does not state as inferred.
