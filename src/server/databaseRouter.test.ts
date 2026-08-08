import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleDatabaseRoutes } from './databaseRouter'

class MockResponse {
  statusCode = 0
  headers: Record<string, string> = {}
  body = ''
  setHeader(name: string, value: string): this {
    this.headers[name] = value
    return this
  }
  end(payload: string): this {
    this.body = payload
    return this
  }
}

function mockRequest(method: string, path: string, body?: unknown): IncomingMessage {
  const req = {
    method,
    url: path,
    setEncoding: () => {},
    on: (event: string, cb: (chunk?: string) => void) => {
      if (event === 'data') {
        if (body !== undefined) cb(JSON.stringify(body))
        return req
      }
      if (event === 'end') {
        cb()
        return req
      }
      return req
    },
  } as unknown as IncomingMessage
  return req
}

describe('database router', () => {
  it('rejects unknown endpoints with 404', async () => {
    const req = mockRequest('GET', '/codex-api/database/nope')
    const res = new MockResponse() as unknown as ServerResponse
    const handled = await handleDatabaseRoutes(req, res, new URL('http://x/codex-api/database/nope'))
    expect(handled).toBe(true)
    expect((res as unknown as MockResponse).statusCode).toBe(404)
  })

  it('returns local sqlite status in a local environment', async () => {
    const req = mockRequest('GET', '/codex-api/database/status')
    const res = new MockResponse() as unknown as ServerResponse
    const handled = await handleDatabaseRoutes(req, res, new URL('http://x/codex-api/database/status'))
    expect(handled).toBe(true)
    const payload = JSON.parse((res as unknown as MockResponse).body) as { backend: string }
    expect(payload.backend).toBe('sqlite')
  })

  it('returns 400 for a query with no sql', async () => {
    const req = mockRequest('POST', '/codex-api/database/query', {})
    const res = new MockResponse() as unknown as ServerResponse
    const handled = await handleDatabaseRoutes(req, res, new URL('http://x/codex-api/database/query'))
    expect(handled).toBe(true)
    expect((res as unknown as MockResponse).statusCode).toBe(400)
  })

  it('runs a CREATE + INSERT + SELECT flow against the local store', async () => {
    const tableName = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const createReq = mockRequest('POST', '/codex-api/database/query', { sql: `CREATE TABLE ${tableName} (id TEXT)` })
    const createRes = new MockResponse() as unknown as ServerResponse
    await handleDatabaseRoutes(createReq, createRes, new URL('http://x/codex-api/database/query'))
    expect((createRes as unknown as MockResponse).statusCode).toBe(200)

    const insertReq = mockRequest('POST', '/codex-api/database/query', { sql: `INSERT INTO ${tableName} (id) VALUES ('a'), ('b')` })
    const insertRes = new MockResponse() as unknown as ServerResponse
    await handleDatabaseRoutes(insertReq, insertRes, new URL('http://x/codex-api/database/query'))
    expect((insertRes as unknown as MockResponse).statusCode).toBe(200)

    const selectReq = mockRequest('POST', '/codex-api/database/query', { sql: `SELECT * FROM ${tableName}` })
    const selectRes = new MockResponse() as unknown as ServerResponse
    await handleDatabaseRoutes(selectReq, selectRes, new URL('http://x/codex-api/database/query'))
    expect((selectRes as unknown as MockResponse).statusCode).toBe(200)
    const payload = JSON.parse((selectRes as unknown as MockResponse).body) as { columns: string[]; rows: unknown[][] }
    expect(payload.columns).toContain('id')
    expect(payload.rows.length).toBe(2)
  })
})
