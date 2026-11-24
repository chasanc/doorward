-- Directory (LDAP) sign-in.
-- auth_source: 'local' checks password_hash; 'ldap' binds to the directory (password_hash stays empty).
ALTER TABLE users.[user] ADD auth_source nvarchar(10) NOT NULL CONSTRAINT df_user_auth_source DEFAULT 'local';
GO
ALTER TABLE users.[user] ADD CONSTRAINT ck_user_auth_source CHECK (auth_source IN ('local', 'ldap'));
GO
