import { describe, expect, it } from 'vitest';
import { buildFilter, groupChanges, parseGroupMap } from './ldap.service.js';

describe('buildFilter', () => {
  it('puts the username into the template', () => {
    expect(buildFilter('(uid={username})', 'alice')).toBe('(uid=alice)');
  });

  it('escapes filter characters so a typed name cannot change the query', () => {
    expect(buildFilter('(uid={username})', 'a*)(uid=*')).toBe('(uid=a\\2a\\29\\28uid=\\2a)');
  });

  it('fills every placeholder', () => {
    expect(buildFilter('(|(uid={username})(mail={username}))', 'bob')).toBe('(|(uid=bob)(mail=bob))');
  });
});

describe('parseGroupMap', () => {
  it('is empty when unset', () => {
    expect(parseGroupMap('').size).toBe(0);
  });

  it('lower-cases the directory DN and keeps the group name as written', () => {
    const map = parseGroupMap('{"CN=Admins,OU=Groups,DC=example,DC=com":"Admin"}');
    expect(map.get('cn=admins,ou=groups,dc=example,dc=com')).toBe('Admin');
  });

  it.each(['not json', '[]', '{"cn=a":""}', '{"cn=a":1}'])('rejects %s', (bad) => {
    expect(() => parseGroupMap(bad)).toThrow(/LDAP_GROUP_MAP/);
  });
});

describe('groupChanges', () => {
  it('adds what is missing and drops what the directory no longer lists', () => {
    expect(groupChanges(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('changes nothing when both agree', () => {
    expect(groupChanges(['a'], ['a'])).toEqual({ added: [], removed: [] });
  });
});
