-- Development reset only (never part of the migration runner). Apply against doorward, then
-- re-apply migrations/0001_baseline.sql and seed/default.sql:
--   sqlcmd -S localhost -U sa -d doorward -C -b -i db/mssql/dev/reset.sql
--
-- SQL Server has no DROP SCHEMA CASCADE; tables are dropped in FK-safe order.
--
-- To drop the database itself (sysadmin, connected to master, not doorward):
--   ALTER DATABASE doorward SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
--   DROP DATABASE doorward;

USE [doorward];
GO

DROP TABLE IF EXISTS users.user_totp;
DROP TABLE IF EXISTS users.oidc_payload;
DROP TABLE IF EXISTS users.oidc_client;
DROP TABLE IF EXISTS users.[grant];
DROP TABLE IF EXISTS users.user_group_member;
DROP TABLE IF EXISTS users.permission;
DROP TABLE IF EXISTS users.scope;
DROP TABLE IF EXISTS users.user_group;
DROP TABLE IF EXISTS users.[user];
DROP TABLE IF EXISTS users.company;
DROP TABLE IF EXISTS users.audit_log;
GO

DROP SCHEMA IF EXISTS users;
GO
