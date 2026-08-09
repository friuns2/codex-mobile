import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { RequestHandler, Request, Response, NextFunction } from 'express'

const TOKEN_COOKIE = 'portal_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_STORE_FILE = 'webui-auth-sessions.json'
const MAX_PERSISTED_TOKENS = 128
const LOGIN_RATE_WINDOW_MS = 5 * 60 * 1000
const LOGIN_RATE_MAX_ATTEMPTS = 20

type PersistedAuthState = {
  tokens?: Array<{
    value?: unknown
    expiresAt?: unknown
  }>
}

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    const key = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    cookies[key] = value
  }
  return cookies
}

function isLocalhostRemote(remote: string): boolean {
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

function isLocalhostHost(host: string): boolean {
  const normalized = host.toLowerCase()
  return normalized.startsWith('localhost:') || normalized === 'localhost' || normalized.startsWith('127.0.0.1:')
}

function isIPv4Octet(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) return false
  const parsed = Number.parseInt(value, 10)
  return parsed >= 0 && parsed <= 255
}

function isTrustedTailscaleIPv4(remote: string): boolean {
  const normalized = remote.startsWith('::ffff:') ? remote.slice('::ffff:'.length) : remote
  const parts = normalized.split('.')
  if (parts.length !== 4 || !parts.every(isIPv4Octet)) {
    return false
  }

  const first = Number.parseInt(parts[0] ?? '', 10)
  const second = Number.parseInt(parts[1] ?? '', 10)
  return first === 100 && second >= 64 && second <= 127
}

function isTrustedTailscaleIPv6(remote: string): boolean {
  const normalized = remote.toLowerCase()
  return normalized === 'fd7a:115c:a1e0::1' || normalized.startsWith('fd7a:115c:a1e0:')
}

function isTrustedTailscaleRemote(remote: string): boolean {
  return isTrustedTailscaleIPv4(remote) || isTrustedTailscaleIPv6(remote)
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getSessionStorePath(): string {
  return join(getCodexHomeDir(), SESSION_STORE_FILE)
}

function readPersistedSessions(): Map<string, number> {
  const sessionStorePath = getSessionStorePath()
  if (!existsSync(sessionStorePath)) return new Map()

  try {
    const raw = readFileSync(sessionStorePath, 'utf8')
    const parsed = JSON.parse(raw) as PersistedAuthState
    const now = Date.now()
    const sessions = new Map<string, number>()
    for (const entry of parsed.tokens ?? []) {
      const token = typeof entry?.value === 'string' ? entry.value : ''
      const expiresAt = typeof entry?.expiresAt === 'number' ? entry.expiresAt : 0
      if (!token || !Number.isFinite(expiresAt) || expiresAt <= now) continue
      sessions.set(token, expiresAt)
    }
    return sessions
  } catch {
    return new Map()
  }
}

function persistSessions(validTokens: Map<string, number>): void {
  const sessionStorePath = getSessionStorePath()
  mkdirSync(dirname(sessionStorePath), { recursive: true })

  const tokens = Array.from(validTokens.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_PERSISTED_TOKENS)
    .map(([value, expiresAt]) => ({ value, expiresAt }))
  const tmpPath = `${sessionStorePath}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify({ tokens }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmpPath, sessionStorePath)
}

function tryPersistSessions(validTokens: Map<string, number>): void {
  try {
    persistSessions(validTokens)
  } catch (error) {
    console.warn('[auth] failed to persist login sessions:', error)
  }
}

function pruneExpiredSessions(validTokens: Map<string, number>): boolean {
  const now = Date.now()
  let changed = false
  for (const [token, expiresAt] of validTokens.entries()) {
    if (expiresAt > now) continue
    validTokens.delete(token)
    changed = true
  }
  return changed
}

function buildSessionCookie(token: string, expiresAt: number): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  return [
    `${TOKEN_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${String(maxAgeSeconds)}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].join('; ')
}

function isAuthorizedByRequestLike(
  remoteAddress: string | undefined,
  hostHeader: string | undefined,
  cookieHeader: string | undefined,
  validTokens: Map<string, number>,
): boolean {
  const remote = remoteAddress ?? ''
  // SSH reverse tunnels terminate on loopback, so remoteAddress alone is not enough
  // to prove this is a direct local browser request.
  if (isLocalhostRemote(remote) && isLocalhostHost(hostHeader ?? '')) {
    return true
  }
  if (isTrustedTailscaleRemote(remote)) {
    return true
  }

  const cookies = parseCookies(cookieHeader)
  const token = cookies[TOKEN_COOKIE]
  if (!token) return false
  const expiresAt = validTokens.get(token)
  return typeof expiresAt === 'number' && expiresAt > Date.now()
}

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mobidex</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:2rem;width:100%;max-width:380px}
h1{font-size:1.25rem;font-weight:600;margin-bottom:1.5rem;text-align:center;color:#fafafa}
label{display:block;font-size:.875rem;color:#a3a3a3;margin-bottom:.5rem}
input{width:100%;padding:.625rem .75rem;background:#0a0a0a;border:1px solid #404040;border-radius:8px;color:#fafafa;font-size:1rem;outline:none;transition:border-color .15s}
input:focus{border-color:#3b82f6}
button{width:100%;padding:.625rem;margin-top:1rem;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:.9375rem;font-weight:500;cursor:pointer;transition:background .15s}
button:hover{background:#2563eb}
.error{color:#ef4444;font-size:.8125rem;margin-top:.75rem;text-align:center;display:none}
</style>
</head>
<body>
<div class="card">
<h1>Mobidex</h1>
<form id="f">
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Sign in</button>
<p class="error" id="err">Incorrect password</p>
</form>
</div>
<script>
const form=document.getElementById('f');
const errEl=document.getElementById('err');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  errEl.style.display='none';
  const res=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})});
  if(res.ok){window.location.reload()}else{errEl.style.display='block';document.getElementById('pw').value='';document.getElementById('pw').focus()}
});
</script>
</body>
</html>`

export function createAuthMiddleware(password: string): RequestHandler {
  return createAuthSession(password).middleware
}

export type AuthSession = {
  middleware: RequestHandler
  isRequestAuthorized: (req: IncomingMessage) => boolean
}

export function createAuthSession(password: string): AuthSession {
  const validTokens = readPersistedSessions()
  if (pruneExpiredSessions(validTokens)) {
    tryPersistSessions(validTokens)
  }

  const loginAttemptsByRemote = new Map<string, number[]>()
  function isLoginRateLimited(remote: string): boolean {
    const now = Date.now()
    const attempts = (loginAttemptsByRemote.get(remote) ?? []).filter((timestamp) => now - timestamp < LOGIN_RATE_WINDOW_MS)
    loginAttemptsByRemote.set(remote, attempts)
    if (attempts.length >= LOGIN_RATE_MAX_ATTEMPTS) {
      return true
    }
    attempts.push(now)
    loginAttemptsByRemote.set(remote, attempts)
    return false
  }

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    if (pruneExpiredSessions(validTokens)) {
      tryPersistSessions(validTokens)
    }

    if (isAuthorizedByRequestLike(req.socket.remoteAddress, req.headers.host, req.headers.cookie, validTokens)) {
      next()
      return
    }

    // Handle login POST
    if (req.method === 'POST' && req.path === '/auth/login') {
      const remote = req.socket.remoteAddress ?? 'unknown'
      if (isLoginRateLimited(remote)) {
        res.status(429).json({ error: 'Too many login attempts. Try again later.' })
        return
      }
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => { body += chunk })
      req.on('end', () => {
        let parsed: { password?: string }
        try {
          parsed = JSON.parse(body) as { password?: string }
        } catch {
          res.status(400).json({ error: 'Invalid request body' })
          return
        }

        const provided = typeof parsed.password === 'string' ? parsed.password : ''
        if (!constantTimeCompare(provided, password)) {
          res.status(401).json({ error: 'Invalid password' })
          return
        }

        try {
          const token = randomBytes(32).toString('hex')
          const expiresAt = Date.now() + SESSION_TTL_MS
          validTokens.set(token, expiresAt)
          tryPersistSessions(validTokens)
          res.setHeader('Set-Cookie', buildSessionCookie(token, expiresAt))
          res.json({ ok: true })
        } catch {
          res.status(500).json({ error: 'Failed to create login session' })
        }
      })
      return
    }

    // Handle one-click auth links like /password=<value>
    if (req.method === 'GET' && req.path.startsWith('/password=')) {
      const provided = req.path.slice('/password='.length)
      if (constantTimeCompare(provided, password)) {
        const token = randomBytes(32).toString('hex')
        const expiresAt = Date.now() + SESSION_TTL_MS
        validTokens.set(token, expiresAt)
        tryPersistSessions(validTokens)
        res.setHeader('Set-Cookie', buildSessionCookie(token, expiresAt))
        res.redirect(302, '/')
        return
      }
    }

    // No valid session — serve login page
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(LOGIN_PAGE_HTML)
  }

  return {
    middleware,
    isRequestAuthorized: (req: IncomingMessage) => (
      isAuthorizedByRequestLike(req.socket.remoteAddress, req.headers.host, req.headers.cookie, validTokens)
    ),
  }
}
