import { isIPv4, isIPv6 } from 'node:net';

/**
 * The address to count a client's tries under. One person with IPv6 usually
 * controls a whole /64 network, so counting single addresses would hand them
 * billions of fresh limits: IPv6 counts by its first 64 bits. An IPv4 address that
 * arrives in IPv6 form ("::ffff:203.0.113.1") counts as the IPv4 address it is.
 */
export function clientAddress(ip: string): string {
  const withoutZone = ip.split('%', 1)[0] ?? ip;
  const mapped = /^::ffff:(.+)$/i.exec(withoutZone)?.[1];
  if (mapped && isIPv4(mapped)) return mapped;
  if (!isIPv6(withoutZone)) return ip;

  // "::" stands for as many zero groups as it takes to make 8.
  const [head = '', tail = ''] = withoutZone.split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const zeros = withoutZone.includes('::') ? 8 - before.length - after.length : 0;
  const groups = [...before, ...Array<string>(zeros).fill('0'), ...after];

  const network = groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':');
  return `${network}::/64`;
}
