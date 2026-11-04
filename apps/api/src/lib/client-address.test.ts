import { describe, expect, it } from 'vitest';
import { clientAddress } from './client-address.js';

describe('clientAddress', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(clientAddress('203.0.113.1')).toBe('203.0.113.1');
  });

  it('treats an IPv4 address in IPv6 form as the same address', () => {
    expect(clientAddress('::ffff:203.0.113.1')).toBe('203.0.113.1');
    expect(clientAddress('::FFFF:203.0.113.1')).toBe('203.0.113.1');
  });

  it('counts all of one IPv6 network as one client', () => {
    expect(clientAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(clientAddress('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(clientAddress('2001:db8:1:2:ffff::9')).toBe('2001:db8:1:2::/64');
  });

  it('keeps different IPv6 networks apart', () => {
    expect(clientAddress('2001:db8:1:3::1')).not.toBe(clientAddress('2001:db8:1:2::1'));
  });

  it('expands "::" wherever it falls, and ignores case and leading zeros', () => {
    expect(clientAddress('::1')).toBe('0:0:0:0::/64');
    expect(clientAddress('2001:0DB8::1')).toBe('2001:db8:0:0::/64');
  });

  it('ignores a zone', () => {
    expect(clientAddress('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('leaves anything else alone', () => {
    expect(clientAddress('not an address')).toBe('not an address');
  });
});
