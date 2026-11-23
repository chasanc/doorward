# C++ integration sample

One `main.cpp` that talks to Doorward over gRPC and runs the same flow as the C# and REST samples: authenticate a user, check `doorward.admin`, list their grants and the users, and make sure `doorward.admin`, `data.create`, `data.update` and `data.delete` exist. It prints one line per step and exits non-zero on failure.

The stubs are generated at build time from `packages/proto/doorward.proto`, so nothing generated is checked in.

Needs CMake, a C++17 compiler, gRPC and protobuf. On Debian or Ubuntu:

```bash
sudo apt install cmake libgrpc++-dev protobuf-compiler-grpc libprotobuf-dev
```

Build and run against a Doorward API with gRPC on 5581:

```bash
cmake -S . -B build
cmake --build build
./build/doorward_check
```

Settings come from the environment: `DOORWARD_TARGET` (default `127.0.0.1:5581`), `DOORWARD_API_KEY`, `DOORWARD_COMPANY_KEY`, `DOORWARD_USER` and `DOORWARD_PASSWORD` (defaults to the seed `admin` user). The sample uses an insecure channel, so for TLS swap in `grpc::SslCredentials`.

`Authenticate` answers `UNAUTHENTICATED` for a bad password; it grants nothing, so call `Check` for permissions.
