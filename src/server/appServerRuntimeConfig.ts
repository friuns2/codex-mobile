import { homedir } from 'node:os'
import { join } from 'node:path'

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
export type AppServerTransportMode = 'spawn' | 'shared'

export type AppServerRuntimeConfig = {
  sandboxMode: CodexSandboxMode
  approvalPolicy: CodexApprovalPolicy
  memories: boolean
  transportMode: AppServerTransportMode
  socketPath: string
}

const DEFAULT_RUNTIME_CONFIG: AppServerRuntimeConfig = {
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
  memories: true,
  transportMode: 'spawn',
  socketPath: '',
}

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

function readMemoriesFromEnv(): boolean {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_MEMORIES)
  if (candidate === 'false' || candidate === '0' || candidate === 'no') {
    return false
  }
  if (candidate === 'true' || candidate === '1' || candidate === 'yes') {
    return true
  }
  return DEFAULT_RUNTIME_CONFIG.memories
}

function readTransportModeFromEnv(): AppServerTransportMode {
  return normalizeRuntimeValue(process.env.CODEXUI_APP_SERVER_MODE) === 'shared'
    ? 'shared'
    : DEFAULT_RUNTIME_CONFIG.transportMode
}

function readAppServerSocketPathFromEnv(): string {
  const configured = process.env.CODEXUI_APP_SERVER_SOCKET?.trim()
  if (configured) return configured
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  return join(codexHome, 'app-server-control', 'app-server-control.sock')
}

export function resolveAppServerRuntimeConfig(): AppServerRuntimeConfig {
  return {
    sandboxMode: readSandboxModeFromEnv(),
    approvalPolicy: readApprovalPolicyFromEnv(),
    memories: readMemoriesFromEnv(),
    transportMode: readTransportModeFromEnv(),
    socketPath: readAppServerSocketPathFromEnv(),
  }
}

export function buildAppServerArgs(): string[] {
  const config = resolveAppServerRuntimeConfig()
  return [
    'app-server',
    '-c',
    `approval_policy="${config.approvalPolicy}"`,
    '-c',
    `sandbox_mode="${config.sandboxMode}"`,
    '-c',
    `features.memories=${config.memories ? 'true' : 'false'}`,
  ]
}

export function parseSandboxMode(value: string): CodexSandboxMode | null {
  const candidate = value.trim().toLowerCase()
  return SANDBOX_MODES.has(candidate as CodexSandboxMode) ? candidate as CodexSandboxMode : null
}

export function parseApprovalPolicy(value: string): CodexApprovalPolicy | null {
  const candidate = value.trim().toLowerCase()
  return APPROVAL_POLICIES.has(candidate as CodexApprovalPolicy) ? candidate as CodexApprovalPolicy : null
}
