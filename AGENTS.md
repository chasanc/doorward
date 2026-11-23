# Doorward agent notes

Read [CONTEXT.md](CONTEXT.md) before changing domain names. Permission, never Asset. The product is Doorward.

Next.js app-specific notes: [apps/web/AGENTS.md](apps/web/AGENTS.md).

## Releases

A release is one unit: bump, changelog, then tag. Never tag a commit whose files still show the old version.

1. In one PR, set `version` in `apps/api`, `apps/web`, `packages/domain` and `packages/proto` `package.json`, rename `## [Unreleased]` in `CHANGELOG.md` to `## [x.y.z] - YYYY-MM-DD`, and update the `DOORWARD_VERSION=` examples in `README.md`, `docs/deploy.md` and `deploy/compose/docker-compose.yml`.
2. After that PR merges, tag its merge commit with an annotated `vx.y.z` tag and push the tag. CI publishes the images.
3. Create the GitHub release from that version's CHANGELOG section.
