import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('scripts/dev.cjs', () => {
  it('starts the installed Vite entry on Windows', () => {
    const result = spawnSync(process.execPath, ['scripts/dev.cjs', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      timeout: 10_000,
    })

    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain('vite/')
  })
})
