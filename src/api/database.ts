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

export async function databaseGetStatus(): Promise<DatabaseStatus> {
  const res = await fetch('/codex-api/database/status')
  if (!res.ok) throw new Error('Failed to fetch database status')
  return res.json()
}

export async function databaseListTables(): Promise<{ backend: 'sqlite' | 'supabase'; tables: TableInfo[] }> {
  const res = await fetch('/codex-api/database/tables')
  if (!res.ok) throw new Error('Failed to fetch tables')
  return res.json()
}

export async function databaseRunQuery(sql: string): Promise<QueryResult> {
  const res = await fetch('/codex-api/database/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.error ?? 'Database query failed')
  }
  return res.json()
}
