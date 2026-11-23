-- Default data for an empty doorward: company, groups, scope and the doorward.admin permission.
-- `pnpm db:seed` runs this only when the database has no company yet, then creates the admin user
-- from DOORWARD_ADMIN_USERNAME / DOORWARD_ADMIN_PASSWORD (the admin is never in a SQL file).
-- Run by hand only against an empty database, after migrations:
--   sqlcmd -S localhost -U doorward -P doorward -d doorward -C -b -i db/mssql/seed/default.sql
--
-- Ids are fixed GUIDs so the seed is repeatable. The application generates UUID v7 for new rows.

SET QUOTED_IDENTIFIER ON;
GO

INSERT INTO users.company (id, company_key, name, active) VALUES
  ('01930000-0000-7000-8000-000000000001', N'6146103c-529a-4c8c-93dc-b1e96c678371', N'Default', 1);

INSERT INTO users.user_group (id, company_id, name, description) VALUES
  ('01930000-0000-7000-8000-000000000003', '01930000-0000-7000-8000-000000000001', N'Admin', N'Has admin privileges'),
  ('01930000-0000-7000-8000-000000000004', '01930000-0000-7000-8000-000000000001', N'Everyone', N'Default group for users');

INSERT INTO users.scope (id, company_id, parent_id, scope_key, name, description) VALUES (
  '01930000-0000-7000-8000-000000000005',
  '01930000-0000-7000-8000-000000000001',
  NULL,
  N'b7cf4551-4bef-4336-8bbc-9b2d55e3bfdb',
  N'Application',
  N'Default location'
);

INSERT INTO users.permission (id, company_id, name, description) VALUES
  ('01930000-0000-7000-8000-000000000006', '01930000-0000-7000-8000-000000000001', N'doorward.admin', N'Use the admin UI and manage users, groups, permissions, scopes and grants');
GO
