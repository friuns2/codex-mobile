import { spawn } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getCodexAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) return payload.message
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) return nestedError.message
  return fallback
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readCodexAuth(): Promise<{ accessToken: string; accountId?: string } | null> {
  try {
    const raw = await readFile(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as { tokens?: { access_token?: string; account_id?: string } }
    const token = auth.tokens?.access_token
    if (!token) return null
    return { accessToken: token, accountId: auth.tokens?.account_id ?? undefined }
  } catch {
    return null
  }
}

function bufferIndexOf(buf: Buffer, needle: Buffer, start = 0): number {
  for (let i = start; i <= buf.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) { match = false; break }
    }
    if (match) return i
  }
  return -1
}

export function handleFileUpload(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)
      const contentType = req.headers['content-type'] ?? ''
      const boundaryMatch = contentType.match(/boundary=(.+)/i)
      if (!boundaryMatch) { setJson(res, 400, { error: 'Missing multipart boundary' }); return }
      const boundary = boundaryMatch[1]
      const boundaryBuf = Buffer.from(`--${boundary}`)
      const parts: Buffer[] = []
      let searchStart = 0
      while (searchStart < body.length) {
        const idx = body.indexOf(boundaryBuf, searchStart)
        if (idx < 0) break
        if (searchStart > 0) parts.push(body.subarray(searchStart, idx))
        searchStart = idx + boundaryBuf.length
        if (body[searchStart] === 0x0d && body[searchStart + 1] === 0x0a) searchStart += 2
      }
      let fileName = 'uploaded-file'
      let fileData: Buffer | null = null
      const headerSep = Buffer.from('\r\n\r\n')
      for (const part of parts) {
        const headerEnd = bufferIndexOf(part, headerSep)
        if (headerEnd < 0) continue
        const headers = part.subarray(0, headerEnd).toString('utf8')
        const fnMatch = headers.match(/filename="([^"]+)"/i)
        if (!fnMatch) continue
        fileName = fnMatch[1].replace(/[/\\]/g, '_')
        let end = part.length
        if (end >= 2 && part[end - 2] === 0x0d && part[end - 1] === 0x0a) end -= 2
        fileData = part.subarray(headerEnd + 4, end)
        break
      }
      if (!fileData) { setJson(res, 400, { error: 'No file in request' }); return }
      const uploadDir = join(tmpdir(), 'codex-web-uploads')
      await mkdir(uploadDir, { recursive: true })
      const destDir = await mkdtemp(join(uploadDir, 'f-'))
      const destPath = join(destDir, fileName)
      await writeFile(destPath, fileData)
      setJson(res, 200, { path: destPath })
    } catch (err) {
      setJson(res, 500, { error: getErrorMessage(err, 'Upload failed') })
    }
  })
  req.on('error', (err: Error) => {
    setJson(res, 500, { error: getErrorMessage(err, 'Upload stream error') })
  })
}

function httpPost(
  url: string,
  headers: Record<string, string | number>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  const doRequest = url.startsWith('http://') ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    const req = doRequest(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

let curlImpersonateAvailable: boolean | null = null

function curlImpersonatePost(
  url: string,
  headers: Record<string, string | number>,
  body: Buffer,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-w', '\n%{http_code}', '-X', 'POST', url]
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'content-length') continue
      args.push('-H', `${k}: ${String(v)}`)
    }
    args.push('--data-binary', '@-')
    const proc = spawn('curl-impersonate-chrome', args, {
      env: { ...process.env, CURL_IMPERSONATE: 'chrome116' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    proc.stdout.on('data', (c: Buffer) => chunks.push(c))
    proc.on('error', (e) => {
      curlImpersonateAvailable = false
      reject(e)
    })
    proc.on('close', (code) => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const lastNewline = raw.lastIndexOf('\n')
      const statusStr = lastNewline >= 0 ? raw.slice(lastNewline + 1).trim() : ''
      const responseBody = lastNewline >= 0 ? raw.slice(0, lastNewline) : raw
      const status = parseInt(statusStr, 10) || (code === 0 ? 200 : 500)
      curlImpersonateAvailable = true
      resolve({ status, body: responseBody })
    })
    proc.stdin.write(body)
    proc.stdin.end()
  })
}

export async function proxyTranscribe(
  body: Buffer,
  contentType: string,
  authToken: string,
  accountId?: string,
): Promise<{ status: number; body: string }> {
  const chatgptHeaders: Record<string, string | number> = {
    'Content-Type': contentType,
    'Content-Length': body.length,
    Authorization: `Bearer ${authToken}`,
    originator: 'Codex Desktop',
    'User-Agent': `Codex Desktop/0.1.0 (${process.platform}; ${process.arch})`,
  }
  if (accountId) chatgptHeaders['ChatGPT-Account-Id'] = accountId

  const postFn = curlImpersonateAvailable !== false ? curlImpersonatePost : httpPost
  let result: { status: number; body: string }
  try {
    result = await postFn('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
  } catch {
    result = await httpPost('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
  }

  if (result.status === 403 && result.body.includes('cf_chl')) {
    if (curlImpersonateAvailable !== false && postFn !== curlImpersonatePost) {
      try {
        const ciResult = await curlImpersonatePost('https://chatgpt.com/backend-api/transcribe', chatgptHeaders, body)
        if (ciResult.status !== 403) return ciResult
      } catch {}
    }
    return { status: 503, body: JSON.stringify({ error: 'Transcription blocked by Cloudflare. Install curl-impersonate-chrome.' }) }
  }

  return result
}

function parseConnectorLogoUrl(rawUrl: string): { connectorId: string; theme: 'light' | 'dark' } | null {
  const trimmed = rawUrl.trim()
  if (!trimmed.startsWith('connectors://')) return null
  const rest = trimmed.slice('connectors://'.length)
  const connectorId = (rest.split(/[/?#]/u)[0] ?? '').trim()
  if (!connectorId) return null
  const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1).split('#')[0] ?? '' : ''
  const theme = new URLSearchParams(query).get('theme')?.toLowerCase() === 'dark' ? 'dark' : 'light'
  return { connectorId, theme }
}

export async function fetchConnectorLogo(rawUrl: string): Promise<{ contentType: string; body: Buffer }> {
  const parsed = parseConnectorLogoUrl(rawUrl)
  if (!parsed) throw new Error('Unsupported connector logo URL')
  const auth = await readCodexAuth()
  if (!auth) throw new Error('No auth token available for connector logo')

  const endpoint = `https://chatgpt.com/backend-api/aip/connectors/${encodeURIComponent(parsed.connectorId)}/logo?theme=${parsed.theme}`
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      originator: 'Codex Desktop',
      'User-Agent': `Codex Desktop/0.1.0 (${process.platform}; ${process.arch})`,
      ...(auth.accountId ? { 'ChatGPT-Account-Id': auth.accountId } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Connector logo fetch failed (${response.status})`)

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = asRecord(await response.json())
    const body = asRecord(payload?.body)
    const base64 = readNonEmptyString(body?.base64)
    const nestedContentType = readNonEmptyString(body?.contentType) ?? readNonEmptyString(body?.content_type)
    if (!base64 || !nestedContentType) throw new Error('Connector logo response was missing image data')
    return { contentType: nestedContentType, body: Buffer.from(base64, 'base64') }
  }

  return {
    contentType: contentType || 'image/png',
    body: Buffer.from(await response.arrayBuffer()),
  }
}
