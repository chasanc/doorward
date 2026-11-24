import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import type { User } from '@doorward/proto';
import { ConfigService } from '@nestjs/config';
import { logAuthFailure } from '../logging/auth-failure.js';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { UserGroupEntity } from '../infrastructure/database/entities/user-group.entity.js';
import { UserGroupMemberEntity } from '../infrastructure/database/entities/user-group-member.entity.js';
import { AccessService } from './access.service.js';
import { runAudited } from './audit.js';
import { Tenancy } from './common.js';
import { AppError, invalid, unauthenticated } from './errors.js';
import { uuidv7 } from './ids.js';
import { groupChanges, LdapService, type DirectoryUser } from './ldap.service.js';
import { toUser } from './mappers.js';
import { PasswordService } from './password.service.js';
import type { ServiceCall } from './service-call.js';

export const ADMIN_PERMISSION = 'doorward.admin';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly passwords: PasswordService,
    private readonly access: AccessService,
    private readonly tenancy: Tenancy,
    private readonly config: ConfigService,
    private readonly ldap: LdapService,
  ) {}

  private readonly log = new Logger('Auth');

  /**
   * Sign-in: an active, not-deleted user of an active company with the right password.
   * Every failure gives the same answer so callers cannot learn which part was wrong.
   */
  async authenticate(
    input: { username?: string; userKey?: string; password: string; companyId?: string },
    call: ServiceCall,
  ): Promise<User> {
    if (!(input.username || input.userKey) || !input.password) {
      throw invalid('username (or user_key) and password are required');
    }
    const who = input.userKey ? { userKey: input.userKey } : { username: input.username };
    const where = { ...who, deletedAt: IsNull(), active: true };
    const users = await this.db
      .getRepository(UserEntity)
      .find({ where: input.companyId ? { ...where, companyId: input.companyId.toLowerCase() } : where, take: 2 });
    // The same username can exist in two companies; without a company the sign-in is ambiguous.
    const user = users.length === 1 ? users[0] : undefined;
    // A directory user checks the directory. A username nobody holds may be a directory user's first sign-in.
    // A local user never falls through to the directory, so the directory cannot take over a local account.
    const viaDirectory =
      user?.authSource === 'ldap' || (this.ldap.enabled && users.length === 0 && !input.userKey && !!input.username);
    let directory: DirectoryUser | null = null;
    let ok: boolean;
    if (viaDirectory) {
      try {
        directory = await this.ldap.authenticate(user?.username ?? input.username ?? '', input.password);
      } catch (error) {
        // Callers see a plain failed sign-in; the log tells the operator the directory is down.
        logAuthFailure(this.config, 'ldap_unavailable', { error: (error as Error).message, source: call.source });
      }
      ok = directory !== null;
    } else {
      // Verify even when no user matched so timing does not reveal the username.
      ok = await this.passwords.verify(user?.passwordHash ?? '', input.password);
    }
    // The caller always sees the same message; the log says which check failed, for operators only.
    const fail = (reason: string) => {
      // The stored username, and only when a row matched: what was typed can be a password.
      logAuthFailure(this.config, reason, { username: user?.username, source: call.source });
      return unauthenticated('Invalid username or password');
    };
    if (!ok || (!user && !directory)) throw fail('bad_credentials');
    let account = user;
    if (!account) {
      try {
        account = await this.provision(directory!, input.username!, input.companyId);
      } catch (error) {
        // A name that differs from a local user only by case collides on the unique index.
        if (error instanceof AppError) throw fail('provision_failed');
        throw error;
      }
      if (!account) throw fail('company_inactive');
    }
    const confined = this.tenancy.confined(call);
    if (confined !== undefined && confined !== account.companyId) throw fail('company_mismatch');
    const company = await this.db
      .getRepository(CompanyEntity)
      .findOne({ where: { id: account.companyId, deletedAt: IsNull(), active: true } });
    if (!company) throw fail('company_inactive');
    if (account.authSource === 'ldap') {
      await this.syncGroups(account, directory!, call);
    } else if (this.passwords.needsRehash(account.passwordHash)) {
      const passwordHash = await this.passwords.hash(input.password);
      await this.db.getRepository(UserEntity).update({ id: account.id }, { passwordHash });
    }
    return toUser(account);
  }

  /** First directory sign-in: create the user in the configured company. Inserts are not audited. */
  private async provision(directory: DirectoryUser, username: string, companyId?: string) {
    const company = await this.db
      .getRepository(CompanyEntity)
      .findOne({ where: { companyKey: this.ldap.companyKey, deletedAt: IsNull(), active: true } });
    if (!company || (companyId && companyId.toLowerCase() !== company.id)) return undefined;
    const now = new Date();
    const row = this.db.getRepository(UserEntity).create({
      id: uuidv7(),
      companyId: company.id,
      userKey: randomUUID(),
      username,
      firstName: directory.firstName,
      lastName: directory.lastName,
      email: directory.email,
      mobile: null,
      avatar: null,
      passwordHash: '',
      authSource: 'ldap',
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAudited(this.db, { source: 'rest' }, (manager) =>
      manager.getRepository(UserEntity).insert(row).then(() => null),
    );
    return row;
  }

  /**
   * Make the user's memberships in the groups named in LDAP_GROUP_MAP match the directory.
   * Other groups are left alone, so hand-made memberships survive; a mapped group is the directory's.
   */
  private async syncGroups(user: UserEntity, directory: DirectoryUser, call: ServiceCall): Promise<void> {
    const map = this.ldap.groupMap;
    if (map.size === 0) return;
    const names = [...new Set(map.values())];
    const groups = await this.db
      .getRepository(UserGroupEntity)
      .find({ where: { companyId: user.companyId, name: In(names), deletedAt: IsNull() } });
    const idByName = new Map(groups.map((group) => [group.name, group.id]));
    const missing = names.filter((name) => !idByName.has(name));
    if (missing.length) this.log.warn({ event: 'ldap_group_missing', groups: missing });
    if (groups.length === 0) return;
    const wanted = [...map]
      .filter(([dn]) => directory.groupDns.includes(dn))
      .map(([, name]) => idByName.get(name))
      .filter((id): id is string => id !== undefined);
    await runAudited(this.db, { source: call.source, actorUserId: user.id }, async (manager) => {
      const repo = manager.getRepository(UserGroupMemberEntity);
      const existing = (await repo.find({ where: { userId: user.id, groupId: In(groups.map((g) => g.id)) } })).map(
        (member) => member.groupId,
      );
      const { added, removed } = groupChanges(existing, [...new Set(wanted)]);
      if (removed.length) await repo.delete({ userId: user.id, groupId: In(removed) });
      if (added.length) await repo.insert(added.map((groupId) => ({ userId: user.id, groupId })));
      if (!removed.length) return null; // only additions: inserts are not audited
      return {
        entityType: 'user_group_member',
        entityId: user.id,
        companyId: user.companyId,
        eventType: 'ldap_sync',
        payload: { added, removed },
      };
    });
  }

  /** The admin UI needs sign-in plus doorward.admin company-wide. */
  async isAdmin(userId: string, call: ServiceCall): Promise<boolean> {
    const result = await this.access.check({ userId, permission: ADMIN_PERMISSION }, call);
    return result.allowed && !result.matchedGrant?.scopeId;
  }
}
