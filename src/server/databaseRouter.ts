import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const DATABASE_API_PREFIX = '/codex-api/database'
const LOCAL_DB_FILE_NAME = 'codexapp-local.db'

export type DatabaseDeploymentMode = 'local' | 'docker' | 'cloud'

export interface DatabaseStatus {
  backend: 'sqlite' | 'supabase'
  deployment: DatabaseDeploymentMode
  supabaseConfigured: boolean
  supabaseUrl: string
  localDbPath: string
  localDbExists: boolean
  localDbSizeBytes: number
  message: string
}

export interface TableInfo {
  name: string
  sql: string
  rowCount: number
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executionMs: number
}

interface LocalDbAdapter {
  listTables(): TableInfo[]
  query(sql: string): QueryResult
  close(): void
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getLocalDbPath(): string {
  return join(getCodexHomeDir(), LOCAL_DB_FILE_NAME)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }
  const record = asRecord(payload)
  if (!record) return fallback
  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error
  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) {
    return nestedError.message
  }
  return fallback
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const rawBody = await new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
  if (rawBody.trim().length === 0) return {}
  try {
    return asRecord(JSON.parse(rawBody))
  } catch {
    return null
  }
}

function detectDeploymentMode(): DatabaseDeploymentMode {
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) {
    return 'cloud'
  }
  if (existsSync('/.dockerenv') || existsSync('/run/.containerenv')) {
    return 'docker'
  }
  const cgroup = readCgroupHint()
  if (cgroup) return 'docker'
  return 'local'
}

function readCgroupHint(): string {
  try {
    const content = readFileSync('/proc/1/cgroup', 'utf8')
    return /docker|containerd|kubepods/.test(content) ? content : ''
  } catch {
    return ''
  }
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))
}

interface SqliteDatabaseLike {
  exec(sql: string): unknown
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[]
    columns(): { name: string }[]
  }
  close(): void
}

interface SqliteConstructor {
  new (path: string): SqliteDatabaseLike
}

function createLocalDbAdapter(): LocalDbAdapter {
  let DatabaseSync: SqliteConstructor | null = null
  try {
    // node:sqlite is a built-in module available in Node >=22.5. Fall back to
    // a JSON-backed store when it is unavailable on the host.
    const mod = require('node:sqlite') as { DatabaseSync?: SqliteConstructor }
    if (typeof mod.DatabaseSync === 'function') {
      DatabaseSync = mod.DatabaseSync
    }
  } catch (error) {
    DatabaseSync = null
  }

  if (DatabaseSync) {
    const dbPath = getLocalDbPath()
    let db: SqliteDatabaseLike
    try {
      db = new DatabaseSync(dbPath)
    } catch (error) {
      return createJsonStoreAdapter()
    }
    try {
      db.exec('PRAGMA journal_mode = WAL')
    } catch {
      // pragma is best-effort
    }
    db.exec(`CREATE TABLE IF NOT EXISTS codex_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )`)
    db.exec(`INSERT OR IGNORE INTO codex_meta (key, value) VALUES ('schema_version', '1')`)

    return {
      listTables(): TableInfo[] {
        const rows = db.prepare(
          `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        ).all() as Array<{ name: string; sql: string | null }>
        return rows.map((row) => {
          let rowCount = 0
          try {
            const countRow = db.prepare(`SELECT COUNT(*) AS n FROM "${row.name}"`).all()[0] as { n: number }
            rowCount = countRow?.n ?? 0
          } catch {
            rowCount = 0
          }
          return { name: row.name, sql: row.sql ?? '', rowCount }
        })
      },
      query(sql: string): QueryResult {
        const trimmed = sql.trim().replace(/;+\s*$/, '')
        const started = Date.now()
        const statement = db.prepare(trimmed)
        const all = statement.all() as Record<string, unknown>[]
        const columns = all.length > 0
          ? Object.keys(all[0])
          : (() => {
              try {
                return statement.columns().map((c) => c.name)
              } catch {
                return []
              }
            })()
        const rows = all.map((row) => columns.map((col) => normalizeCell(row[col])))
        return { columns, rows, rowCount: rows.length, executionMs: Date.now() - started }
      },
      close(): void {
        try {
          db.close()
        } catch {
          // already closed
        }
      },
    }
  }

  return createJsonStoreAdapter()
}

function normalizeCell(value: unknown): unknown {
  if (value instanceof Uint8Array) return `[blob: ${value.length} bytes]`
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

function createJsonStoreAdapter(): LocalDbAdapter {
  const storePath = join(getCodexHomeDir(), 'codexapp-local-store.json')
  let store: Record<string, unknown[]> = {}

  function persist(): void {
    try {
      const dir = dirname(storePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(storePath, JSON.stringify({ tables: store }, null, 2), 'utf8')
    } catch {
      // best effort persistence
    }
  }

  function load(): void {
    try {
      if (existsSync(storePath)) {
        const raw = JSON.parse(readFileSync(storePath, 'utf8')) as unknown
        const parsed = asRecord(raw)
        const tables = asRecord(parsed?.tables)
        if (tables) {
          for (const [name, rows] of Object.entries(tables)) {
            if (Array.isArray(rows)) store[name] = rows
          }
        }
      }
    } catch {
      store = {}
    }
  }

  load()
  if (!store.codex_meta) {
    store.codex_meta = [{ key: 'schema_version', value: '1' }]
    persist()
  }

  return {
    listTables(): TableInfo[] {
      return Object.keys(store)
        .sort()
        .map((name) => ({
          name,
          sql: `-- local JSON-backed store: ${name}`,
          rowCount: (store[name] ?? []).length,
        }))
    },
    query(sql: string): QueryResult {
      const started = Date.now()
      const lower = sql.toLowerCase().trim()
      const createMatch = /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?([\w-]+)["'`]?\s*\((.+)\)/i.exec(sql)
      if (createMatch) {
        const tableName = createMatch[1]
        if (!store[tableName]) {
          store[tableName] = []
          persist()
        }
        return { columns: ['created'], rows: [['ok']], rowCount: 1, executionMs: Date.now() - started }
      }
      const insertMatch = /insert\s+into\s+["'`]?([\w-]+)["'`]?\s*(?:\(([^)]+)\))?\s*values\s*\((.+)\)/i.exec(sql)
      if (insertMatch) {
        const tableName = insertMatch[1]
        const columns = insertMatch[2] ? insertMatch[2].split(',').map((c) => c.trim().replace(/["'`]/g, '')) : null
        const values = insertMatch[3].split(',').map((v) => {
          const trimmed = v.trim()
          if (trimmed.startsWith("'") || trimmed.startsWith('"')) return trimmed.slice(1, -1)
          if (trimmed === 'null') return null
          const num = Number(trimmed)
          return Number.isNaN(num) ? trimmed : num
        })
        const row: Record<string, unknown> = {}
        if (columns) {
          columns.forEach((col, index) => { row[col] = values[index] })
        } else {
          store[tableName] ??= []
          const sample = store[tableName][0]
          const sampleColumns = asRecord(sample)
          const columnNames = sampleColumns ? Object.keys(sampleColumns) : values.map((_, i) => `c${i + 1}`)
          columnNames.forEach((col, index) => { row[col] = values[index] })
        }
        store[tableName] ??= []
        store[tableName].push(row)
        persist()
        return { columns: ['inserted'], rows: [[1]], rowCount: 1, executionMs: Date.now() - started }
      }
      const selectMatch = /select\s+\*\s+from\s+["'`]?([\w-]+)["'`]?/i.exec(sql)
      if (selectMatch) {
        const tableName = selectMatch[1]
        const rows = (store[tableName] ?? []).map((row) => {
          const record = asRecord(row)
          return record ? record : { value: row }
        })
        const columns = rows.length > 0 ? Object.keys(rows[0]) : ['(empty)']
        return {
          columns,
          rows: rows.map((row) => columns.map((col) => normalizeCell(row[col]))),
          rowCount: rows.length,
          executionMs: Date.now() - started,
        }
      }
      return { columns: [], rows: [], rowCount: 0, executionMs: Date.now() - started }
    },
    close(): void {
      persist()
    },
  }
}

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL?.replace(/\/+$/, '') ?? ''
}

async function fetchSupabaseTableCount(tableName: string): Promise<number> {
  try {
    const response = await fetch(`${getSupabaseUrl()}/rest/v1/${encodeURIComponent(tableName)}?select=count`, {
      method: 'HEAD',
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(10_000),
    })
    return parseInt(response.headers.get('content-range')?.split('/')[1] ?? '0', 10) || 0
  } catch {
    return 0
  }
}

function supabaseHeaders(): Record<string, string> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (url) headers.Accept = 'application/vnd.pgrst.object+json'
  return headers
}

async function fetchSupabaseSchema(): Promise<string[]> {
  try {
    const response = await fetch(`${getSupabaseUrl()}/rest/v1/`, {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return []
    const raw = await response.text()
    const tableMatch = /"path":"\/(\w+)"/g
    const tables = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = tableMatch.exec(raw)) !== null) {
      const name = match[1]
      if (!name.startsWith('_') && name !== 'supabase') tables.add(name)
    }
    return [...tables].sort()
  } catch {
    return []
  }
}

async function querySupabase(sql: string): Promise<QueryResult> {
  const started = Date.now()
  const lower = sql.toLowerCase().trim()
  const selectMatch = /select\s+(.+?)\s+from\s+["'`]?([\w-]+)["'`]?/i.exec(sql)
  if (selectMatch && !selectMatch[1].includes('*')) {
    const fields = selectMatch[1].split(',').map((f) => f.trim())
    const table = selectMatch[2]
    const limitMatch = /limit\s+(\d+)/i.exec(sql)
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 50
    const url = `${getSupabaseUrl()}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(fields.join(','))}&limit=${limit}`
    const response = await fetch(url, {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Supabase query failed (${response.status})`)
    const rows = await response.json() as Record<string, unknown>[]
    const columns = fields
    return {
      columns,
      rows: rows.map((row) => columns.map((col) => normalizeCell(row[col]))),
      rowCount: rows.length,
      executionMs: Date.now() - started,
    }
  }

  const simpleSelect = /select\s+\*\s+from\s+["'`]?([\w-]+)["'`]?/i.exec(sql)
  if (simpleSelect) {
    const table = simpleSelect[1]
    const url = `${getSupabaseUrl()}/rest/v1/${encodeURIComponent(table)}?select=*&limit=50`
    const response = await fetch(url, {
      headers: supabaseHeaders(),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Supabase query failed (${response.status})`)
    const rows = await response.json() as Record<string, unknown>[]
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return {
      columns,
      rows: rows.map((row) => columns.map((col) => normalizeCell(row[col]))),
      rowCount: rows.length,
      executionMs: Date.now() - started,
    }
  }

  throw new Error('For Supabase, only SELECT queries are supported via the REST API')
}

export async function handleDatabaseRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith(DATABASE_API_PREFIX)) return false

  try {
    const path = url.pathname.slice(DATABASE_API_PREFIX.length) || '/'

    if (req.method === 'GET' && path === '/status') {
      const deployment = detectDeploymentMode()
      const supabaseConfigured = isSupabaseConfigured()
      const backend: DatabaseStatus['backend'] = supabaseConfigured ? 'supabase' : 'sqlite'
      const localDbPath = getLocalDbPath()
      const localDbExists = existsSync(localDbPath)
      let localDbSizeBytes = 0
      if (localDbExists) {
        try {
          localDbSizeBytes = statSync(localDbPath).size
        } catch {
          localDbSizeBytes = 0
        }
      }
      const message = supabaseConfigured
        ? 'Connected to Supabase cloud database'
        : deployment === 'docker'
          ? 'Running inside a container — using local embedded store'
          : 'Local environment — using local embedded store'
      setJson(res, 200, {
        backend,
        deployment,
        supabaseConfigured,
        supabaseUrl: supabaseConfigured ? getSupabaseUrl() : '',
        localDbPath,
        localDbExists,
        localDbSizeBytes,
        message,
      } satisfies DatabaseStatus)
      return true
    }

    if (req.method === 'GET' && path === '/tables') {
      if (isSupabaseConfigured()) {
        const names = await fetchSupabaseSchema()
        const tables: TableInfo[] = []
        for (const name of names) {
          tables.push({ name, sql: '-- Supabase table (REST)', rowCount: await fetchSupabaseTableCount(name) })
        }
        setJson(res, 200, { backend: 'supabase', tables })
        return true
      }
      const adapter = createLocalDbAdapter()
      try {
        setJson(res, 200, { backend: 'sqlite', tables: adapter.listTables() })
      } finally {
        adapter.close()
      }
      return true
    }

    if (req.method === 'POST' && path === '/query') {
      const body = await readJsonBody(req)
      if (!body) {
        setJson(res, 400, { error: 'Invalid request body' })
        return true
      }
      const sql = readString(body.sql)
      if (!sql) {
        setJson(res, 400, { error: 'Missing sql' })
        return true
      }
      try {
        if (isSupabaseConfigured()) {
          setJson(res, 200, await querySupabase(sql))
          return true
        }
        const adapter = createLocalDbAdapter()
        try {
          setJson(res, 200, adapter.query(sql))
        } finally {
          adapter.close()
        }
        return true
      } catch (error) {
        setJson(res, 400, { error: getErrorMessage(error, 'Query failed') })
        return true
      }
    }

    setJson(res, 404, { error: 'Unknown database endpoint' })
    return true
  } catch (error) {
    setJson(res, 500, { error: getErrorMessage(error, 'Database error') })
    return true
  }
}
