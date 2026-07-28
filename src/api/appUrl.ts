function appBaseUrl(): URL | null {
  if (typeof document === 'undefined') return null

  const base = new URL(document.baseURI)
  base.hash = ''
  base.search = ''
  if (!base.pathname.endsWith('/')) {
    base.pathname += '/'
  }
  return base
}

function normalizeAppPath(path: string): string {
  return path.replace(/^\/+/u, '')
}

export function appHttpUrl(path: string): string {
  const normalizedPath = normalizeAppPath(path)
  const base = appBaseUrl()
  return base ? new URL(normalizedPath, base).toString() : `/${normalizedPath}`
}

export function appWebSocketUrl(path: string): string {
  const url = new URL(appHttpUrl(path), 'http://localhost')
  if (typeof location !== 'undefined') {
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  } else {
    url.protocol = 'ws:'
  }
  return url.toString()
}

export function isAppPathname(pathname: string, appPath: string): boolean {
  const rootPathname = new URL(`http://localhost/${normalizeAppPath(appPath)}`).pathname
  const resolvedPathname = new URL(appHttpUrl(appPath), 'http://localhost').pathname
  return pathname === rootPathname || pathname === resolvedPathname
}

export function appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const resolvedInput = typeof input === 'string' && input.startsWith('/')
    ? appHttpUrl(input)
    : input
  return globalThis.fetch(resolvedInput, init)
}
