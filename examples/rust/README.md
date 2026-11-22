# Rust integration sample

One `src/main.rs` that talks to Doorward over gRPC with tonic and runs the same flow as the other samples: authenticate a user, check `doorward.admin`, list their grants and the users, and make sure `doorward.admin`, `data.create`, `data.update` and `data.delete` exist. It prints one line per step and exits non-zero on failure.

The client is generated at build time from `packages/proto/doorward.proto`. `build.rs` uses a vendored `protoc`, so you only need a Rust toolchain.

```bash
cargo run
```

Settings come from the environment: `DOORWARD_TARGET` (default `http://127.0.0.1:5581`), `DOORWARD_API_KEY`, `DOORWARD_COMPANY_KEY`, `DOORWARD_USER` and `DOORWARD_PASSWORD` (defaults to the seed `admin` user). Each call sends the key and company key as gRPC metadata. For TLS, enable tonic's `tls` feature and use `ClientTlsConfig`.

`Authenticate` answers `UNAUTHENTICATED` for a bad password; it grants nothing, so call `Check` for permissions.
