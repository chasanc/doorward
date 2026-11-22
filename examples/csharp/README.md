# C# integration sample

A small ASP.NET service that talks to Doorward over gRPC. It is layered the way a real integrator would split it:

- `Doorward.Integration.Model` generates the gRPC client from `packages/proto/doorward.proto`.
- `Doorward.Integration.DataAccess` holds `IUserDirectory` and its gRPC implementation, plus the permission names and options.
- `Doorward.Integration.Service` is the host: `POST /login` and a `--check` mode.

Requires the .NET 10 SDK and a running Doorward API (gRPC on 5581).

```bash
dotnet run --project Doorward.Integration.Service -- --check
```

`--check` authenticates a user, checks `doorward.admin`, lists the user's grants and the company's users, and makes sure `doorward.admin`, `data.create`, `data.update` and `data.delete` exist. It prints one line per step and exits non-zero on failure. Set `DOORWARD_USER` and `DOORWARD_PASSWORD` to use other credentials; the defaults are the seed `admin` user.

Connection settings live in the `Doorward` section of `Doorward.Integration.Service/appsettings.json`: `Target`, `ApiKey`, `CompanyKey`. Each call sends them as `x-api-key` and `company-key` metadata.

`Authenticate` only proves the password and answers `UNAUTHENTICATED` otherwise. Ask `AccessService.Check` what the user may do.
