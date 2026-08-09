<template>
  <div class="aegis-panel">
    <div class="aegis-header">
      <div class="aegis-header-left">
        <IconTablerShieldScan class="aegis-header-icon" />
        <div class="aegis-header-info">
          <h2 class="aegis-title">Aegis</h2>
          <p class="aegis-subtitle">Dependency &amp; Supply Chain Security</p>
        </div>
      </div>
      <div class="aegis-header-right">
        <button class="aegis-scan-btn aegis-scan-btn-primary" type="button" :disabled="isScanning" @click="onScan('npm')">
          <span v-if="isScanning" class="aegis-scan-spinner" aria-hidden="true" />
          {{ isScanning ? 'Scanning…' : 'Scan npm' }}
        </button>
        <button class="aegis-scan-btn" type="button" :disabled="isScanning" @click="onScan('socket')">
          <span v-if="isScanning" class="aegis-scan-spinner" aria-hidden="true" />
          {{ isScanning ? 'Scanning…' : 'Socket.dev scan' }}
        </button>
      </div>
    </div>

    <div class="aegis-summary-bar">
      <div class="aegis-summary-item">
        <span class="aegis-summary-dot" :class="status.projectFound ? 'is-ok' : 'is-down'" />
        <span class="aegis-summary-label">
          {{ status.projectFound ? `${status.dependencyCount} dependencies` : 'No package.json found' }}
        </span>
      </div>
      <div class="aegis-summary-item">
        <span class="aegis-summary-dot" :class="status.vulnerableCount > 0 ? 'is-alert' : 'is-clear'" />
        <span class="aegis-summary-label">{{ status.vulnerableCount }} vulnerable packages</span>
      </div>
      <div class="aegis-summary-item">
        <IconTablerShieldCheck class="aegis-summary-icon" />
        <span class="aegis-summary-label">
          {{ status.hasSocketKey ? 'Socket.dev key connected' : 'Socket.dev key not set' }}
        </span>
      </div>
      <div class="aegis-summary-item">
        <IconTablerTerminal class="aegis-summary-icon" />
        <span class="aegis-summary-label">
          {{ status.lastNpmScan ? `npm: ${formatTime(status.lastNpmScan)}` : 'npm: never scanned' }}
        </span>
      </div>
      <div class="aegis-summary-item">
        <IconTablerTerminal class="aegis-summary-icon" />
        <span class="aegis-summary-label">
          {{ status.lastSocketScan ? `socket: ${formatTime(status.lastSocketScan)}` : 'socket: never scanned' }}
        </span>
      </div>
    </div>

    <div class="aegis-socket-section">
      <div class="aegis-socket-info">
        <div class="aegis-socket-copy">
          <h3 class="aegis-socket-title">Socket.dev API key</h3>
          <p class="aegis-socket-desc">
            Optional. Connects the Socket.dev supply-chain analysis engine for deeper malware, license, and
            dependency-risk findings on top of npm advisories.
          </p>
        </div>
        <div class="aegis-socket-form">
          <input
            class="aegis-socket-input"
            type="password"
            placeholder="sock_…"
            v-model="socketKeyDraft"
          >
          <button
            v-if="!status.hasSocketKey"
            class="aegis-socket-btn"
            type="button"
            :disabled="socketKeyDraft.trim().length === 0"
            @click="onSaveSocketKey"
          >
            Save key
          </button>
          <button v-else class="aegis-socket-btn aegis-socket-btn-remove" type="button" @click="onRemoveSocketKey">
            Remove
          </button>
        </div>
      </div>
    </div>

    <div class="aegis-scan-section">
      <div class="aegis-scan-header">
        <h3 class="aegis-scan-title">Scan results</h3>
        <div class="aegis-scan-actions">
          <span v-if="lastResult" class="aegis-scan-time">Scanned {{ formatTime(lastResult.scannedAt) }}</span>
        </div>
      </div>

      <div v-if="!lastResult" class="aegis-scan-empty">
        Run a scan to inspect dependency vulnerabilities for this project.
      </div>

      <template v-else>
        <div class="aegis-severity-strip">
          <div class="aegis-severity-tile aegis-severity-tile--critical">
            <span class="aegis-severity-count">{{ lastResult.summary.critical }}</span>
            <span class="aegis-severity-label">Critical</span>
          </div>
          <div class="aegis-severity-tile aegis-severity-tile--high">
            <span class="aegis-severity-count">{{ lastResult.summary.high }}</span>
            <span class="aegis-severity-label">High</span>
          </div>
          <div class="aegis-severity-tile aegis-severity-tile--moderate">
            <span class="aegis-severity-count">{{ lastResult.summary.moderate }}</span>
            <span class="aegis-severity-label">Moderate</span>
          </div>
          <div class="aegis-severity-tile aegis-severity-tile--low">
            <span class="aegis-severity-count">{{ lastResult.summary.low }}</span>
            <span class="aegis-severity-label">Low</span>
          </div>
          <div class="aegis-severity-tile aegis-severity-tile--clean">
            <span class="aegis-severity-count">{{ cleanDependencyCount }}</span>
            <span class="aegis-severity-label">Clean</span>
          </div>
        </div>

        <div class="aegis-results-list">
          <div
            v-for="dependency in lastResult.dependencies"
            :key="dependency.name"
            class="aegis-dep-row"
            :class="{ 'has-vulnerabilities': dependency.advisories.length > 0 }"
          >
            <span class="aegis-dep-led" :class="depLedClass(dependency)" />
            <div class="aegis-dep-body">
              <div class="aegis-dep-meta">
                <span class="aegis-dep-name" :title="dependency.name">{{ dependency.name }}</span>
                <span class="aegis-dep-version">v{{ dependency.version || '?' }}</span>
                <span v-if="dependency.dev" class="aegis-dep-tag">dev</span>
                <span v-if="dependency.advisories.length === 0" class="aegis-dep-clean">No known vulnerabilities</span>
              </div>
              <div v-if="dependency.advisories.length > 0" class="aegis-advisories">
                <div v-for="advisory in dependency.advisories" :key="advisory.id || advisory.title" class="aegis-advisory">
                  <span class="aegis-advisory-severity" :class="'aegis-severity--' + advisory.severity">
                    {{ advisory.severity.toUpperCase() }}
                  </span>
                  <span class="aegis-advisory-source">{{ advisory.source === 'socket' ? 'Socket.dev' : 'npm' }}</span>
                  <span class="aegis-advisory-title">{{ advisory.title }}</span>
                  <a
                    v-if="advisory.url"
                    class="aegis-advisory-link"
                    :href="advisory.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Details ↗
                  </a>
                  <span v-if="advisory.patchedVersions" class="aegis-advisory-fix">
                    Fix: {{ advisory.patchedVersions }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import IconTablerShieldScan from '../icons/IconTablerShieldScan.vue'
import IconTablerShieldCheck from '../icons/IconTablerShieldCheck.vue'
import IconTablerTerminal from '../icons/IconTablerTerminal.vue'
import {
  aegisGetStatus,
  aegisScan,
  aegisSetSocketKey,
  aegisRemoveSocketKey,
} from '../../api/aegis'
import type { AegisStatus, AegisScanResult, ScannedDependency, VulnerabilitySeverity } from '../../api/aegis'

const status = ref<AegisStatus>({
  hasSocketKey: false,
  projectFound: false,
  dependencyCount: 0,
  vulnerableCount: 0,
  lastNpmScan: null,
  lastSocketScan: null,
})
const lastResult = ref<AegisScanResult | null>(null)
const isScanning = ref(false)
const socketKeyDraft = ref('')

const cleanDependencyCount = computed(() => {
  if (!lastResult.value) return 0
  return lastResult.value.summary.total - lastResult.value.summary.vulnerable
})

async function refreshStatus(): Promise<void> {
  try {
    status.value = await aegisGetStatus()
  } catch {
    // silently retry on next action
  }
}

function depLedClass(dependency: ScannedDependency): string {
  if (dependency.advisories.length === 0) return 'is-clean'
  const worst = dependency.advisories.reduce<VulnerabilitySeverity>((acc, advisory) => {
    const rank: Record<VulnerabilitySeverity, number> = { critical: 0, high: 1, moderate: 2, low: 3 }
    return rank[advisory.severity] < rank[acc] ? advisory.severity : acc
  }, 'low')
  return `is-${worst}`
}

async function onScan(source: 'npm' | 'socket'): Promise<void> {
  if (isScanning.value) return
  isScanning.value = true
  try {
    lastResult.value = await aegisScan(source)
    await refreshStatus()
  } catch {
    // failure leaves previous results in place
  } finally {
    isScanning.value = false
  }
}

async function onSaveSocketKey(): Promise<void> {
  const key = socketKeyDraft.value.trim()
  if (!key) return
  try {
    await aegisSetSocketKey(key)
    status.value.hasSocketKey = true
    socketKeyDraft.value = ''
  } catch {
    // keep the draft so the user can retry
  }
}

async function onRemoveSocketKey(): Promise<void> {
  try {
    await aegisRemoveSocketKey()
    status.value.hasSocketKey = false
    socketKeyDraft.value = ''
  } catch {
    // ignore
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return d.toLocaleDateString()
}

onMounted(() => {
  refreshStatus()
})
</script>

<style scoped>
.aegis-panel {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100%;
}

.aegis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.aegis-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.aegis-header-icon {
  font-size: 32px;
  opacity: 0.9;
}

.aegis-header-info {
  display: flex;
  flex-direction: column;
}

.aegis-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.aegis-subtitle {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.aegis-header-right {
  display: flex;
  gap: 8px;
}

.aegis-scan-btn {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  color: inherit;
}

.aegis-scan-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.aegis-scan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aegis-scan-btn-primary {
  background: color-mix(in srgb, #16a34a 15%, transparent);
  border-color: #16a34a;
  color: #16a34a;
}

.aegis-scan-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: aegis-spin 0.8s linear infinite;
}

@keyframes aegis-spin {
  to { transform: rotate(360deg); }
}

.aegis-summary-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 12px;
}

.aegis-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.aegis-summary-item:last-child {
  border-right: none;
}

.aegis-summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.aegis-summary-dot.is-ok {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.aegis-summary-dot.is-down {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.aegis-summary-dot.is-clear {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.aegis-summary-dot.is-alert {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
  animation: aegis-pulse 1.5s infinite;
}

@keyframes aegis-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.aegis-summary-icon {
  font-size: 14px;
  opacity: 0.6;
}

.aegis-summary-label {
  white-space: nowrap;
}

.aegis-socket-section {
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
}

.aegis-socket-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.aegis-socket-copy {
  flex: 1;
  min-width: 220px;
}

.aegis-socket-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.aegis-socket-desc {
  margin: 0;
  font-size: 12px;
  opacity: 0.65;
  line-height: 1.5;
}

.aegis-socket-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aegis-socket-input {
  min-width: 220px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
}

.aegis-socket-btn {
  font-size: 11px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #16a34a 40%, transparent);
  background: color-mix(in srgb, #16a34a 15%, transparent);
  color: #16a34a;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.aegis-socket-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aegis-socket-btn-remove {
  border-color: color-mix(in srgb, #ef4444 40%, transparent);
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}

.aegis-scan-section {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  overflow: hidden;
}

.aegis-scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.aegis-scan-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.aegis-scan-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.aegis-scan-time {
  font-size: 11px;
  opacity: 0.5;
}

.aegis-scan-empty {
  padding: 40px 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.4;
  font-style: italic;
}

.aegis-severity-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.aegis-severity-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.aegis-severity-count {
  font-size: 18px;
  font-weight: 700;
}

.aegis-severity-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.6;
}

.aegis-severity-tile--critical .aegis-severity-count { color: #ef4444; }
.aegis-severity-tile--high .aegis-severity-count { color: #f97316; }
.aegis-severity-tile--moderate .aegis-severity-count { color: #f59e0b; }
.aegis-severity-tile--low .aegis-severity-count { color: #22c55e; }
.aegis-severity-tile--clean .aegis-severity-count { color: #22c55e; }

.aegis-results-list {
  max-height: 520px;
  overflow-y: auto;
}

.aegis-dep-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 4%, transparent);
}

.aegis-dep-row:last-child {
  border-bottom: none;
}

.aegis-dep-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.aegis-dep-led.is-clean { background: #22c55e; }
.aegis-dep-led.is-low { background: #22c55e; box-shadow: 0 0 4px #22c55e; }
.aegis-dep-led.is-moderate { background: #f59e0b; box-shadow: 0 0 4px #f59e0b; }
.aegis-dep-led.is-high { background: #f97316; box-shadow: 0 0 6px #f97316; }
.aegis-dep-led.is-critical { background: #ef4444; box-shadow: 0 0 8px #ef4444; animation: aegis-pulse 1.5s infinite; }

.aegis-dep-body {
  flex: 1;
  min-width: 0;
}

.aegis-dep-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.aegis-dep-name {
  font-size: 12px;
  font-weight: 600;
}

.aegis-dep-version {
  font-size: 11px;
  opacity: 0.6;
}

.aegis-dep-tag {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.aegis-dep-clean {
  font-size: 11px;
  color: #22c55e;
  margin-left: auto;
}

.aegis-advisories {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aegis-advisory {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  flex-wrap: wrap;
}

.aegis-advisory-severity {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.aegis-severity--low { background: color-mix(in srgb, #22c55e 15%, transparent); color: #22c55e; }
.aegis-severity--moderate { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #f59e0b; }
.aegis-severity--high { background: color-mix(in srgb, #f97316 15%, transparent); color: #f97316; }
.aegis-severity--critical { background: color-mix(in srgb, #ef4444 15%, transparent); color: #ef4444; }

.aegis-advisory-source {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.aegis-advisory-title {
  opacity: 0.8;
}

.aegis-advisory-link {
  font-size: 11px;
  color: inherit;
  opacity: 0.7;
}

.aegis-advisory-fix {
  font-size: 10px;
  color: #22c55e;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, #22c55e 12%, transparent);
}

.aegis-results-list::-webkit-scrollbar {
  width: 6px;
}

.aegis-results-list::-webkit-scrollbar-track {
  background: transparent;
}

.aegis-results-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 3px;
}

@media (max-width: 768px) {
  .aegis-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .aegis-header-right {
    width: 100%;
  }
  .aegis-scan-btn {
    flex: 1;
    justify-content: center;
  }
  .aegis-summary-bar {
    flex-direction: column;
    gap: 6px;
  }
  .aegis-summary-item {
    width: 100%;
  }
  .aegis-severity-strip {
    grid-template-columns: repeat(2, 1fr);
  }
  .aegis-socket-info {
    flex-direction: column;
    align-items: stretch;
  }
  .aegis-socket-form {
    flex-direction: column;
    align-items: stretch;
  }
  .aegis-socket-input {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 480px) {
  .aegis-panel {
    padding: 8px;
  }
  .aegis-title {
    font-size: 18px;
  }
}
</style>
