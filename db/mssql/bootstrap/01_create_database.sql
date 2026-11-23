-- Create the dedicated SQL Server database and demo login.
-- Apply as a sysadmin against master:
--   sqlcmd -S localhost -U sa -C -b -i db/mssql/bootstrap/01_create_database.sql
--
-- Azure SQL / hosted: skip this file. Point DATABASE_URL at the
-- provisioned database and start at migrations/0001_baseline.sql.
--
-- Local demo credentials match DATABASE_URL=mssql://doorward:doorward@localhost:1433/doorward
-- Change the login password before any shared or production use.
-- CHECK_POLICY is off only so the local demo password can match Postgres.

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'doorward')
BEGIN
  CREATE LOGIN [doorward] WITH PASSWORD = N'doorward', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'doorward')
BEGIN
  CREATE DATABASE [doorward];
END
GO

USE [doorward];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'doorward')
BEGIN
  CREATE USER [doorward] FOR LOGIN [doorward];
END
GO

ALTER ROLE [db_owner] ADD MEMBER [doorward];
GO
