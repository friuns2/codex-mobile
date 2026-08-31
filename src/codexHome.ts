import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveCodexHome(
  env: { CODEX_HOME?: string } = process.env,
  homeDirectory = homedir(),
): string {
  const configured = env.CODEX_HOME?.trim()
  return configured || join(homeDirectory, '.codex')
}
