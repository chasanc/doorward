import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, escapeFilter, type Entry } from 'ldapts';

/** What the directory knows about a user who just proved their password. */
export type DirectoryUser = {
  dn: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** DNs of the groups the user is in, lower-cased for comparing */
  groupDns: string[];
};

/** Directory group DN (lower-cased) to the name of a Doorward group. */
export type GroupMap = Map<string, string>;

/** `{username}` in the configured filter becomes the escaped username, so a typed `*)(` cannot change the query. */
export function buildFilter(template: string, username: string): string {
  const [head, ...rest] = template.split('{username}');
  return head + rest.map((part) => escapeFilter`${username}` + part).join('');
}

/** LDAP_GROUP_MAP is JSON: {"cn=admins,ou=groups,dc=example,dc=com": "Admin"}. */
export function parseGroupMap(json: string): GroupMap {
  if (!json) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('LDAP_GROUP_MAP must be a JSON object of directory group DN to Doorward group name');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LDAP_GROUP_MAP must be a JSON object of directory group DN to Doorward group name');
  }
  return new Map(
    Object.entries(parsed).map(([dn, name]) => {
      if (typeof name !== 'string' || !name.trim()) throw new Error(`LDAP_GROUP_MAP: "${dn}" needs a group name`);
      return [dn.trim().toLowerCase(), name.trim()];
    }),
  );
}

/** Which of the directory-managed memberships to add and which to drop so `existing` becomes `wanted`. */
export function groupChanges(existing: string[], wanted: string[]) {
  return {
    added: wanted.filter((id) => !existing.includes(id)),
    removed: existing.filter((id) => !wanted.includes(id)),
  };
}

const first =(value: Entry[string] | undefined): string | null => {
  const one = Array.isArray(value) ? value[0] : value;
  const text = one === undefined ? '' : one.toString().trim();
  return text || null;
};

@Injectable()
export class LdapService {
  readonly groupMap: GroupMap;

  constructor(private readonly config: ConfigService) {
    this.groupMap = parseGroupMap(this.setting('ldapGroupMap'));
    if (this.enabled) {
      if (!this.setting('ldapUserBase')) throw new Error('LDAP_URL is set, so LDAP_USER_BASE is required');
      if (!this.setting('ldapCompanyKey')) throw new Error('LDAP_URL is set, so LDAP_COMPANY_KEY is required');
      if (!this.setting('ldapUserFilter').includes('{username}')) {
        throw new Error('LDAP_USER_FILTER must contain {username}');
      }
    }
  }

  private setting(key: string): string {
    return this.config.get<string>(key) ?? '';
  }

  get enabled(): boolean {
    return this.setting('ldapUrl') !== '';
  }

  get companyKey(): string {
    return this.setting('ldapCompanyKey');
  }

  /**
   * Find the user in the directory, then bind as them with the password they typed.
   * Returns null for an unknown user or a wrong password; throws when the directory cannot be reached.
   */
  async authenticate(username: string, password: string): Promise<DirectoryUser | null> {
    // An empty password makes many servers accept an "unauthenticated bind" as a success.
    if (!username || !password) return null;
    const client = new Client({ url: this.setting('ldapUrl'), timeout: 5000, connectTimeout: 5000 });
    try {
      await client.bind(this.setting('ldapBindDn'), this.setting('ldapBindPassword'));
      const { searchEntries } = await client.search(this.setting('ldapUserBase'), {
        scope: 'sub',
        filter: buildFilter(this.setting('ldapUserFilter'), username),
        attributes: ['givenName', 'sn', 'cn', 'mail', 'memberOf'],
        sizeLimit: 2,
      });
      // Zero matches is an unknown user; two means the filter is ambiguous, so nobody signs in.
      if (searchEntries.length !== 1) return null;
      const entry = searchEntries[0];
      try {
        await client.bind(entry.dn, password);
      } catch {
        return null;
      }
      const memberOf = entry.memberOf === undefined ? [] : [entry.memberOf].flat();
      return {
        dn: entry.dn,
        firstName: first(entry.givenName) ?? first(entry.cn) ?? username,
        lastName: first(entry.sn) ?? '',
        email: first(entry.mail),
        groupDns: memberOf.map((dn) => dn.toString().trim().toLowerCase()),
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
