#!/usr/bin/env bash
set -euo pipefail

HOST="${MSSQL_HOST:-mssql}"
SA_PASSWORD="${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is required}"
DOORWARD_PASSWORD="${MSSQL_DOORWARD_PASSWORD:-doorward}"
SQLCMD="${SQLCMD:-/opt/mssql-tools18/bin/sqlcmd}"
SCRIPTS="${SCRIPTS:-/scripts}"

wait_for_sql() {
  local i=0
  until "$SQLCMD" -C -S "$HOST" -U sa -P "$SA_PASSWORD" -Q "SELECT 1" -b -o /dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "SQL Server at ${HOST} did not become ready" >&2
      exit 1
    fi
    sleep 2
  done
}

wait_for_sql
# Creates the login and database only. The schema and demo data come from the API (AUTO_MIGRATE / AUTO_SEED)
# or from `pnpm db:migrate` and `pnpm db:seed`.
"$SQLCMD" -C -S "$HOST" -U sa -P "$SA_PASSWORD" -b -i "${SCRIPTS}/bootstrap/01_create_database.sql"
echo "doorward MSSQL database ready"
