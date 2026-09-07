export function formatHttpUrl(host: string, port: number): string {
  const authority = host.includes(':') ? `[${host}]` : host
  return `http://${authority}:${String(port)}`
}

export function getLocalServerUrl(host: string, port: number): string {
  const target = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host
  return formatHttpUrl(target, port)
}
