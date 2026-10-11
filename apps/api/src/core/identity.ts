/** Opaque client identity used as the rate-limit key. */
export type ClientId = string;

export function clientIdFromIp(ip: string): ClientId {
  return `ip:${ip}`;
}

export function clientIdFromTestOverride(value: string): ClientId {
  return `test:${value}`;
}
