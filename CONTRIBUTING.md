# Contributing

Thanks for helping. Open an issue first for anything larger than a small fix.

```bash
pnpm install
node scripts/write-local-env.mjs
pnpm lint
pnpm test
```

- Read [CONTEXT.md](CONTEXT.md) for the vocabulary: code and SQL say **Permission**, never Asset.
- The proto file and the SQL packs are the sources of truth. After changing the proto run `pnpm proto:generate` and commit `packages/proto/gen`.
- A database change is a new numbered file in both `db/postgres/migrations` and `db/mssql/migrations` (same number, e.g. `0002_add_x.sql`). Never edit a released migration; the runner rejects changed checksums. Test with `pnpm db:migrate`, then `pnpm db:scaffold`.
- Keep commits focused, and add or update a test for behaviour you change.
