-- Directory (LDAP) sign-in.
-- auth_source: 'local' checks password_hash; 'ldap' binds to the directory (password_hash stays empty).
ALTER TABLE users."user" ADD COLUMN auth_source varchar(10) NOT NULL DEFAULT 'local';
ALTER TABLE users."user" ADD CONSTRAINT ck_user_auth_source CHECK (auth_source IN ('local', 'ldap'));
