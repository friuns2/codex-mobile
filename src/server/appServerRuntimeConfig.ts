import { existsSync } from 'node:fs'

const SANDBOX_MODES = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const)

const APPROVAL_POLICIES = new Set([
  'untrusted',
  'on-failure',
  'on-request',
  'never',
] as const)

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'

type AppServerRuntimeConfig = {
  sandboxMode: CodexSandboxMode
  approvalPolicy: CodexApprovalPolicy
}

const DEFAULT_RUNTIME_CONFIG: AppServerRuntimeConfig = {
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
}

const MACOS_CODEX_APP_NODE_REPL_COMMAND = '/Applications/Codex.app/Contents/Resources/node_repl'

function normalizeRuntimeValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function readSandboxModeFromEnv(): CodexSandboxMode {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_SANDBOX_MODE)
  if (SANDBOX_MODES.has(candidate as CodexSandboxMode)) {
    return candidate as CodexSandboxMode
  }
  return DEFAULT_RUNTIME_CONFIG.sandboxMode
}

function readApprovalPolicyFromEnv(): CodexApprovalPolicy {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_APPROVAL_POLICY)
  if (APPROVAL_POLICIES.has(candidate as CodexApprovalPolicy)) {
    return candidate as CodexApprovalPolicy
  }
  return DEFAULT_RUNTIME_CONFIG.approvalPolicy
}

export function resolveAppServerRuntimeConfig(): AppServerRuntimeConfig {
  return {
    sandboxMode: readSandboxModeFromEnv(),
    approvalPolicy: readApprovalPolicyFromEnv(),
  }
}

export function buildAppServerArgs(): string[] {
  const config = resolveAppServerRuntimeConfig()
  const args = [
    'app-server',
    '-c',
    `approval_policy="${config.approvalPolicy}"`,
    '-c',
    `sandbox_mode="${config.sandboxMode}"`,
  ]
  if (process.platform === 'darwin' && existsSync(MACOS_CODEX_APP_NODE_REPL_COMMAND)) {
    args.push(
      '-c',
      `mcp_servers.node_repl.command="${MACOS_CODEX_APP_NODE_REPL_COMMAND}"`,
      '-c',
      'mcp_servers.node_repl.args=["--disable-sandbox"]',
    )
  }
  return args
}

export function parseSandboxMode(value: string): CodexSandboxMode | null {
  const candidate = value.trim().toLowerCase()
  return SANDBOX_MODES.has(candidate as CodexSandboxMode) ? candidate as CodexSandboxMode : null
}

export function parseApprovalPolicy(value: string): CodexApprovalPolicy | null {
  const candidate = value.trim().toLowerCase()
  return APPROVAL_POLICIES.has(candidate as CodexApprovalPolicy) ? candidate as CodexApprovalPolicy : null
}
