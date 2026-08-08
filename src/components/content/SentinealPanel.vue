<template>
  <div class="sentineal-panel">
    <div class="sentineal-header">
      <div class="sentineal-header-left">
        <IconTablerShieldScan class="sentineal-header-icon" />
        <div class="sentineal-header-info">
          <h2 class="sentineal-title">Sentineal</h2>
          <p class="sentineal-subtitle">Dependency &amp; Supply Chain Security</p>
        </div>
      </div>
      <div class="sentineal-header-right">
        <button class="sentineal-scan-btn sentineal-scan-btn-primary" type="button" :disabled="isScanning" @click="onScan('npm')">
          <span v-if="isScanning" class="sentineal-scan-spinner" aria-hidden="true" />
          {{ isScanning ? 'Scanning…' : 'Scan npm' }}
        </button>
        <button class="sentineal-scan-btn" type="button" :disabled="isScanning" @click="onScan('socket')">
          <span v-if="isScanning" class="sentineal-scan-spinner" aria-hidden="true" />
          {{ isScanning ? 'Scanning…' : 'Socket.dev scan' }}
        </button>
      </div>
    </div>

    <div class="sentineal-summary-bar">
      <div class="sentineal-summary-item">
        <span class="sentineal-summary-dot" :class="status.projectFound ? 'is-ok' : 'is-down'" />
        <span class="sentineal-summary-label">
          {{ status.projectFound ? `${status.dependencyCount} dependencies` : 'No package.json found' }}
        </span>
      </div>
      <div class="sentineal-summary-item">
        <span class="sentineal-summary-dot" :class="status.vulnerableCount > 0 ? 'is-alert' : 'is-clear'" />
        <span class="sentineal-summary-label">{{ status.vulnerableCount }} vulnerable packages</span>
      </div>
      <div class="sentineal-summary-item">
        <IconTablerShieldCheck class="sentineal-summary-icon" />
        <span class="sentineal-summary-label">
          {{ status.hasSocketKey ? 'Socket.dev key connected' : 'Socket.dev key not set' }}
        </span>
      </div>
      <div class="sentineal-summary-item">
        <IconTablerTerminal class="sentineal-summary-icon" />
        <span class="sentineal-summary-label">
          {{ status.lastNpmScan ? `npm: ${formatTime(status.lastNpmScan)}` : 'npm: never scanned' }}
        </span>
      </div>
      <div class="sentineal-summary-item">
        <IconTablerTerminal class="sentineal-summary-icon" />
        <span class="sentineal-summary-label">
          {{ status.lastSocketScan ? `socket: ${formatTime(status.lastSocketScan)}` : 'socket: never scanned' }}
        </span>
      </div>
    </div>

    <div class="sentineal-socket-section">
      <div class="sentineal-socket-info">
        <div class="sentineal-socket-copy">
          <h3 class="sentineal-socket-title">Socket.dev API key</h3>
          <p class="sentineal-socket-desc">
            Optional. Connects the Socket.dev supply-chain analysis engine for deeper malware, license, and
            dependency-risk findings on top of npm advisories.
          </p>
        </div>
        <div class="sentineal-socket-form">
          <input
            class="sentineal-socket-input"
            type="password"
            placeholder="sock_…"
            v-model="socketKeyDraft"
          >
          <button
            v-if="!status.hasSocketKey"
            class="sentineal-socket-btn"
            type="button"
            :disabled="socketKeyDraft.trim().length === 0"
            @click="onSaveSocketKey"
          >
            Save key
          </button>
          <button v-else class="sentineal-socket-btn sentineal-socket-btn-remove" type="button" @click="onRemoveSocketKey">
            Remove
          </button>
        </div>
      </div>
    </div>

    <div class="sentineal-scan-section">
      <div class="sentineal-scan-header">
        <h3 class="sentineal-scan-title">Scan results</h3>
        <div class="sentineal-scan-actions">
          <span v-if="lastResult" class="sentineal-scan-time">Scanned {{ formatTime(lastResult.scannedAt) }}</span>
        </div>
      </div>

      <div v-if="!lastResult" class="sentineal-scan-empty">
        Run a scan to inspect dependency vulnerabilities for this project.
      </div>

      <template v-else>
        <div class="sentineal-severity-strip">
          <div class="sentineal-severity-tile sentineal-severity-tile--critical">
            <span class="sentineal-severity-count">{{ lastResult.summary.critical }}</span>
            <span class="sentineal-severity-label">Critical</span>
          </div>
          <div class="sentineal-severity-tile sentineal-severity-tile--high">
            <span class="sentineal-severity-count">{{ lastResult.summary.high }}</span>
            <span class="sentineal-severity-label">High</span>
          </div>
          <div class="sentineal-severity-tile sentineal-severity-tile--moderate">
            <span class="sentineal-severity-count">{{ lastResult.summary.moderate }}</span>
            <span class="sentineal-severity-label">Moderate</span>
          </div>
          <div class="sentineal-severity-tile sentineal-severity-tile--low">
            <span class="sentineal-severity-count">{{ lastResult.summary.low }}</span>
            <span class="sentineal-severity-label">Low</span>
          </div>
          <div class="sentineal-severity-tile sentineal-severity-tile--clean">
            <span class="sentineal-severity-count">{{ cleanDependencyCount }}</span>
            <span class="sentineal-severity-label">Clean</span>
          </div>
        </div>

        <div class="sentineal-results-list">
          <div
            v-for="dependency in lastResult.dependencies"
            :key="dependency.name"
            class="sentineal-dep-row"
            :class="{ 'has-vulnerabilities': dependency.advisories.length > 0 }"
          >
            <span class="sentineal-dep-led" :class="depLedClass(dependency)" />
            <div class="sentineal-dep-body">
              <div class="sentineal-dep-meta">
                <span class="sentineal-dep-name" :title="dependency.name">{{ dependency.name }}</span>
                <span class="sentineal-dep-version">v{{ dependency.version || '?' }}</span>
                <span v-if="dependency.dev" class="sentineal-dep-tag">dev</span>
                <span v-if="dependency.advisories.length === 0" class="sentineal-dep-clean">No known vulnerabilities</span>
              </div>
              <div v-if="dependency.advisories.length > 0" class="sentineal-advisories">
                <div v-for="advisory in dependency.advisories" :key="advisory.id || advisory.title" class="sentineal-advisory">
                  <span class="sentineal-advisory-severity" :class="'sentineal-severity--' + advisory.severity">
                    {{ advisory.severity.toUpperCase() }}
                  </span>
                  <span class="sentineal-advisory-source">{{ advisory.source === 'socket' ? 'Socket.dev' : 'npm' }}</span>
                  <span class="sentineal-advisory-title">{{ advisory.title }}</span>
                  <a
                    v-if="advisory.url"
                    class="sentineal-advisory-link"
                    :href="advisory.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Details ↗
                  </a>
                  <span v-if="advisory.patchedVersions" class="sentineal-advisory-fix">
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
  sentinealGetStatus,
  sentinealScan,
  sentinealSetSocketKey,
  sentinealRemoveSocketKey,
} from '../../api/sentineal'
import type { SentinealStatus, SentinealScanResult, ScannedDependency, VulnerabilitySeverity } from '../../api/sentineal'

const status = ref<SentinealStatus>({
  hasSocketKey: false,
  projectFound: false,
  dependencyCount: 0,
  vulnerableCount: 0,
  lastNpmScan: null,
  lastSocketScan: null,
})
const lastResult = ref<SentinealScanResult | null>(null)
const isScanning = ref(false)
const socketKeyDraft = ref('')

const cleanDependencyCount = computed(() => {
  if (!lastResult.value) return 0
  return lastResult.value.summary.total - lastResult.value.summary.vulnerable
})

async function refreshStatus(): Promise<void> {
  try {
    status.value = await sentinealGetStatus()
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
    lastResult.value = await sentinealScan(source)
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
    await sentinealSetSocketKey(key)
    status.value.hasSocketKey = true
    socketKeyDraft.value = ''
  } catch {
    // keep the draft so the user can retry
  }
}

async function onRemoveSocketKey(): Promise<void> {
  try {
    await sentinealRemoveSocketKey()
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
.sentineal-panel {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100%;
}

.sentineal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.sentineal-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sentineal-header-icon {
  font-size: 32px;
  opacity: 0.9;
}

.sentineal-header-info {
  display: flex;
  flex-direction: column;
}

.sentineal-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.sentineal-subtitle {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.sentineal-header-right {
  display: flex;
  gap: 8px;
}

.sentineal-scan-btn {
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

.sentineal-scan-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.sentineal-scan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sentineal-scan-btn-primary {
  background: color-mix(in srgb, #16a34a 15%, transparent);
  border-color: #16a34a;
  color: #16a34a;
}

.sentineal-scan-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: sentineal-spin 0.8s linear infinite;
}

@keyframes sentineal-spin {
  to { transform: rotate(360deg); }
}

.sentineal-summary-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 12px;
}

.sentineal-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.sentineal-summary-item:last-child {
  border-right: none;
}

.sentineal-summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sentineal-summary-dot.is-ok {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.sentineal-summary-dot.is-down {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.sentineal-summary-dot.is-clear {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.sentineal-summary-dot.is-alert {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
  animation: sentineal-pulse 1.5s infinite;
}

@keyframes sentineal-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.sentineal-summary-icon {
  font-size: 14px;
  opacity: 0.6;
}

.sentineal-summary-label {
  white-space: nowrap;
}

.sentineal-socket-section {
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
}

.sentineal-socket-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.sentineal-socket-copy {
  flex: 1;
  min-width: 220px;
}

.sentineal-socket-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.sentineal-socket-desc {
  margin: 0;
  font-size: 12px;
  opacity: 0.65;
  line-height: 1.5;
}

.sentineal-socket-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sentineal-socket-input {
  min-width: 220px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
}

.sentineal-socket-btn {
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

.sentineal-socket-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sentineal-socket-btn-remove {
  border-color: color-mix(in srgb, #ef4444 40%, transparent);
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}

.sentineal-scan-section {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  overflow: hidden;
}

.sentineal-scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.sentineal-scan-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.sentineal-scan-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sentineal-scan-time {
  font-size: 11px;
  opacity: 0.5;
}

.sentineal-scan-empty {
  padding: 40px 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.4;
  font-style: italic;
}

.sentineal-severity-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.sentineal-severity-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.sentineal-severity-count {
  font-size: 18px;
  font-weight: 700;
}

.sentineal-severity-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.6;
}

.sentineal-severity-tile--critical .sentineal-severity-count { color: #ef4444; }
.sentineal-severity-tile--high .sentineal-severity-count { color: #f97316; }
.sentineal-severity-tile--moderate .sentineal-severity-count { color: #f59e0b; }
.sentineal-severity-tile--low .sentineal-severity-count { color: #22c55e; }
.sentineal-severity-tile--clean .sentineal-severity-count { color: #22c55e; }

.sentineal-results-list {
  max-height: 520px;
  overflow-y: auto;
}

.sentineal-dep-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 4%, transparent);
}

.sentineal-dep-row:last-child {
  border-bottom: none;
}

.sentineal-dep-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.sentineal-dep-led.is-clean { background: #22c55e; }
.sentineal-dep-led.is-low { background: #22c55e; box-shadow: 0 0 4px #22c55e; }
.sentineal-dep-led.is-moderate { background: #f59e0b; box-shadow: 0 0 4px #f59e0b; }
.sentineal-dep-led.is-high { background: #f97316; box-shadow: 0 0 6px #f97316; }
.sentineal-dep-led.is-critical { background: #ef4444; box-shadow: 0 0 8px #ef4444; animation: sentineal-pulse 1.5s infinite; }

.sentineal-dep-body {
  flex: 1;
  min-width: 0;
}

.sentineal-dep-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sentineal-dep-name {
  font-size: 12px;
  font-weight: 600;
}

.sentineal-dep-version {
  font-size: 11px;
  opacity: 0.6;
}

.sentineal-dep-tag {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.sentineal-dep-clean {
  font-size: 11px;
  color: #22c55e;
  margin-left: auto;
}

.sentineal-advisories {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sentineal-advisory {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  flex-wrap: wrap;
}

.sentineal-advisory-severity {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.sentineal-severity--low { background: color-mix(in srgb, #22c55e 15%, transparent); color: #22c55e; }
.sentineal-severity--moderate { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #f59e0b; }
.sentineal-severity--high { background: color-mix(in srgb, #f97316 15%, transparent); color: #f97316; }
.sentineal-severity--critical { background: color-mix(in srgb, #ef4444 15%, transparent); color: #ef4444; }

.sentineal-advisory-source {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.sentineal-advisory-title {
  opacity: 0.8;
}

.sentineal-advisory-link {
  font-size: 11px;
  color: inherit;
  opacity: 0.7;
}

.sentineal-advisory-fix {
  font-size: 10px;
  color: #22c55e;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, #22c55e 12%, transparent);
}

.sentineal-results-list::-webkit-scrollbar {
  width: 6px;
}

.sentineal-results-list::-webkit-scrollbar-track {
  background: transparent;
}

.sentineal-results-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 3px;
}

@media (max-width: 768px) {
  .sentineal-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .sentineal-header-right {
    width: 100%;
  }
  .sentineal-scan-btn {
    flex: 1;
    justify-content: center;
  }
  .sentineal-summary-bar {
    flex-direction: column;
    gap: 6px;
  }
  .sentineal-summary-item {
    width: 100%;
  }
  .sentineal-severity-strip {
    grid-template-columns: repeat(2, 1fr);
  }
  .sentineal-socket-info {
    flex-direction: column;
    align-items: stretch;
  }
  .sentineal-socket-form {
    flex-direction: column;
    align-items: stretch;
  }
  .sentineal-socket-input {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 480px) {
  .sentineal-panel {
    padding: 8px;
  }
  .sentineal-title {
    font-size: 18px;
  }
}
</style>
