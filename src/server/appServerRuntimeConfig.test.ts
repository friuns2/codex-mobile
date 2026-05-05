import { afterEach, describe, expect, it, vi } from 'vitest'

const MACOS_NODE_REPL = '/Applications/Codex.app/Contents/Resources/node_repl'

async function loadWithMocks(options: {
  platform: NodeJS.Platform
  existingPaths: string[]
}) {
  vi.resetModules()
  vi.doMock('node:fs', () => ({
    existsSync: (path: string) => options.existingPaths.includes(path),
  }))
  vi.stubGlobal('process', {
    ...process,
    platform: options.platform,
    env: {},
  })
  return import('./appServerRuntimeConfig')
}

describe('buildAppServerArgs', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.doUnmock('node:fs')
  })

  it('adds the bundled node_repl MCP server on macOS when available', async () => {
    const { buildAppServerArgs } = await loadWithMocks({
      platform: 'darwin',
      existingPaths: [MACOS_NODE_REPL],
    })

    const args = buildAppServerArgs()
    expect(args).toContain(`mcp_servers.node_repl.command="${MACOS_NODE_REPL}"`)
    expect(args).toContain('mcp_servers.node_repl.args=["--disable-sandbox"]')
  })

  it('does not add node_repl on non-macOS hosts', async () => {
    const { buildAppServerArgs } = await loadWithMocks({
      platform: 'linux',
      existingPaths: [MACOS_NODE_REPL],
    })

    expect(buildAppServerArgs().join('\n')).not.toContain('mcp_servers.node_repl')
  })
})
