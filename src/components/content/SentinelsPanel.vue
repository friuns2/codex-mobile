<template>
  <div class="sentinels-panel">
    <div class="sentinels-header">
      <div class="sentinels-header-left">
        <IconTablerShieldScan class="sentinels-header-icon" />
        <div class="sentinels-header-info">
          <h2 class="sentinels-title">Sentinels</h2>
          <p class="sentinels-subtitle">Security Operations Center</p>
        </div>
      </div>
      <div class="sentinels-header-right">
        <div class="sentinels-mode-toggle" :class="{ 'is-manual': masterMode === 'manual' }">
          <span class="sentinels-mode-label">Fully Autonomous</span>
          <button
            class="sentinels-mode-switch"
            :class="{ 'is-auto': masterMode === 'auto', 'is-manual': masterMode === 'manual' }"
            role="switch"
            :aria-checked="masterMode === 'auto'"
            :aria-label="'Toggle sentinel mode: currently ' + masterMode"
            @click="onToggleMasterMode"
          >
            <span class="sentinels-mode-switch-knob" />
          </button>
          <span class="sentinels-mode-label">Manual</span>
        </div>
      </div>
    </div>

    <div class="sentinels-summary-bar">
      <div class="sentinels-summary-item">
        <span class="sentinels-summary-dot" :class="statusClass(agentsOnline, agentsTotal)" />
        <span class="sentinels-summary-label">{{ agentsOnline }}/{{ agentsTotal }} Agents Online</span>
      </div>
      <div class="sentinels-summary-item">
        <span class="sentinels-summary-dot" :class="unacknowledgedAlertCount > 0 ? 'is-alert' : 'is-clear'" />
        <span class="sentinels-summary-label">{{ unacknowledgedAlertCount }} Unacknowledged Alerts</span>
      </div>
      <div class="sentinels-summary-item">
        <IconTablerTerminal class="sentinels-summary-icon" />
        <span class="sentinels-summary-label">{{ formatUptime(metrics.uptime) }}</span>
      </div>
      <div class="sentinels-summary-item">
        <IconTablerTerminal class="sentinels-summary-icon" />
        <span class="sentinels-summary-label">{{ metrics.memoryUsageMB }} MB Heap</span>
      </div>
      <div class="sentinels-summary-item">
        <IconTablerTerminal class="sentinels-summary-icon" />
        <span class="sentinels-summary-label">{{ metrics.activeConnections }} Connections</span>
      </div>
    </div>

    <div class="sentinels-agents-grid">
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="sentinels-agent-card"
        :class="'sentinels-agent--' + agent.status"
      >
        <div class="sentinels-agent-led-strip">
          <span class="sentinels-agent-led" :class="'sentinels-led--' + agent.status" />
          <span class="sentinels-agent-status-label">{{ agent.status }}</span>
        </div>
        <div class="sentinels-agent-body">
          <div class="sentinels-agent-header">
            <h3 class="sentinels-agent-name">{{ agent.name }}</h3>
            <span class="sentinels-agent-alert-count" :class="{ 'has-alerts': agent.alertCount > 0 }">
              {{ agent.alertCount }} alerts
            </span>
          </div>
          <p class="sentinels-agent-desc">{{ agent.description }}</p>
          <div class="sentinels-agent-footer">
            <div class="sentinels-agent-time">
              <span v-if="agent.lastTriggered" class="sentinels-agent-last">
                Last trigger: {{ formatTime(agent.lastTriggered) }}
              </span>
              <span v-else class="sentinels-agent-last sentinels-agent-never">No triggers</span>
            </div>
            <div class="sentinels-agent-controls">
              <button
                class="sentinels-agent-toggle"
                :class="{ 'is-enabled': agent.enabled }"
                :aria-label="(agent.enabled ? 'Disable' : 'Enable') + ' ' + agent.name"
                @click="onToggleAgent(agent.id, !agent.enabled)"
              >
                {{ agent.enabled ? 'Enabled' : 'Disabled' }}
              </button>
              <button
                v-if="masterMode === 'auto'"
                class="sentinels-agent-mode-btn"
                :class="'sentinels-mode--' + agent.mode"
                :aria-label="'Set ' + agent.name + ' to ' + (agent.mode === 'auto' ? 'manual' : 'auto')"
                @click="onSetAgentMode(agent.id, agent.mode === 'auto' ? 'manual' : 'auto')"
              >
                {{ agent.mode === 'auto' ? 'Auto' : 'Manual' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="sentinels-alerts-section">
      <div class="sentinels-alerts-header">
        <h3 class="sentinels-alerts-title">Alert Feed</h3>
        <div class="sentinels-alerts-actions">
          <span class="sentinels-alerts-count">{{ alerts.length }} events</span>
          <button
            v-if="unacknowledgedAlertCount > 0"
            class="sentinels-alerts-ack-all"
            @click="onAcknowledgeAll"
          >
            Acknowledge All
          </button>
        </div>
      </div>
      <div class="sentinels-alerts-list">
        <div v-if="alerts.length === 0" class="sentinels-alerts-empty">
          No alerts recorded. All sentinels are nominal.
        </div>
        <div
          v-for="alert in alerts"
          :key="alert.id"
          class="sentinels-alert-row"
          :class="{ 'is-unacknowledged': !alert.acknowledged }"
        >
          <span class="sentinels-alert-led" :class="'sentinels-severity--' + alert.severity" />
          <div class="sentinels-alert-body">
            <div class="sentinels-alert-meta">
              <span class="sentinels-alert-agent">{{ alert.agentName }}</span>
              <span class="sentinels-alert-severity" :class="'sentinels-severity--' + alert.severity">
                {{ alert.severity.toUpperCase() }}
              </span>
              <span class="sentinels-alert-time">{{ formatTime(alert.timestamp) }}</span>
            </div>
            <p class="sentinels-alert-message">{{ alert.message }}</p>
          </div>
          <button
            v-if="!alert.acknowledged"
            class="sentinels-alert-ack"
            :aria-label="'Acknowledge alert from ' + alert.agentName"
            @click="onAcknowledgeAlert(alert.id)"
          >
            ACK
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import IconTablerShieldScan from '../icons/IconTablerShieldScan.vue'
import IconTablerTerminal from '../icons/IconTablerTerminal.vue'
import {
  sentinelGetStatus,
  sentinelGetAlerts,
  sentinelSetMasterMode,
  sentinelSetAgentMode,
  sentinelToggleAgent,
  sentinelAcknowledgeAlert,
} from '../../api/sentinel'
import type { AgentState, AlertEntry, SystemMetrics } from '../../api/sentinel'

const agents = ref<AgentState[]>([])
const alerts = ref<AlertEntry[]>([])
const masterMode = ref<'auto' | 'manual'>('auto')
const metrics = ref<SystemMetrics>({
  uptime: 0,
  activeConnections: 0,
  memoryUsageMB: 0,
  totalAlerts: 0,
  agentsOnline: 0,
  agentsTotal: 0,
})
const agentsOnline = ref(0)
const agentsTotal = ref(0)
const unacknowledgedAlertCount = ref(0)

let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchStatus(): Promise<void> {
  try {
    const status = await sentinelGetStatus()
    masterMode.value = status.masterMode
    agents.value = status.agents
    metrics.value = status.metrics
    agentsOnline.value = status.metrics.agentsOnline
    agentsTotal.value = status.metrics.agentsTotal
    unacknowledgedAlertCount.value = status.unacknowledgedAlerts
  } catch {
    // silently retry on next poll
  }
}

async function fetchAlerts(): Promise<void> {
  try {
    alerts.value = await sentinelGetAlerts(100)
  } catch {
    // silently retry on next poll
  }
}

async function refresh(): Promise<void> {
  await Promise.all([fetchStatus(), fetchAlerts()])
}

async function onToggleMasterMode(): Promise<void> {
  const nextMode = masterMode.value === 'auto' ? 'manual' : 'auto'
  try {
    await sentinelSetMasterMode(nextMode)
    masterMode.value = nextMode
    for (const agent of agents.value) {
      agent.mode = nextMode
    }
  } catch {
    // revert on failure handled by next poll
  }
}

async function onSetAgentMode(agentId: string, mode: 'auto' | 'manual'): Promise<void> {
  try {
    await sentinelSetAgentMode(agentId, mode)
    const agent = agents.value.find((a) => a.id === agentId)
    if (agent) agent.mode = mode
  } catch {
    // revert on failure handled by next poll
  }
}

async function onToggleAgent(agentId: string, enabled: boolean): Promise<void> {
  try {
    await sentinelToggleAgent(agentId, enabled)
    const agent = agents.value.find((a) => a.id === agentId)
    if (agent) agent.enabled = enabled
  } catch {
    // revert on failure handled by next poll
  }
}

async function onAcknowledgeAlert(alertId: string): Promise<void> {
  try {
    await sentinelAcknowledgeAlert(alertId)
    const alert = alerts.value.find((a) => a.id === alertId)
    if (alert) alert.acknowledged = true
    unacknowledgedAlertCount.value = Math.max(0, unacknowledgedAlertCount.value - 1)
  } catch {
    // silently fail
  }
}

async function onAcknowledgeAll(): Promise<void> {
  try {
    await sentinelAcknowledgeAlert()
    for (const alert of alerts.value) alert.acknowledged = true
    unacknowledgedAlertCount.value = 0
  } catch {
    // silently fail
  }
}

function statusClass(online: number, total: number): string {
  if (online === total) return 'is-ok'
  if (online > 0) return 'is-degraded'
  return 'is-down'
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

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m uptime`
  if (m > 0) return `${m}m ${s}s uptime`
  return `${s}s uptime`
}

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, 5000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
.sentinels-panel {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100%;
}

/* Header */
.sentinels-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.sentinels-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sentinels-header-icon {
  font-size: 32px;
  opacity: 0.9;
}

.sentinels-header-info {
  display: flex;
  flex-direction: column;
}

.sentinels-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.sentinels-subtitle {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Master Mode Toggle */
.sentinels-mode-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sentinels-mode-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.sentinels-mode-switch {
  position: relative;
  width: 60px;
  height: 28px;
  border-radius: 14px;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 0.3s;
  background: #dc2626;
}

.sentinels-mode-switch.is-auto {
  background: #16a34a;
}

.sentinels-mode-switch.is-manual {
  background: #dc2626;
}

.sentinels-mode-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.3s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.sentinels-mode-switch.is-auto .sentinels-mode-switch-knob {
  transform: translateX(32px);
}

/* Summary Bar */
.sentinels-summary-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 12px;
}

.sentinels-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.sentinels-summary-item:last-child {
  border-right: none;
}

.sentinels-summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sentinels-summary-dot.is-ok {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.sentinels-summary-dot.is-degraded {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}

.sentinels-summary-dot.is-down {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.sentinels-summary-dot.is-clear {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.sentinels-summary-dot.is-alert {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
  animation: pulse-alert 1.5s infinite;
}

@keyframes pulse-alert {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.sentinels-summary-icon {
  font-size: 14px;
  opacity: 0.6;
}

.sentinels-summary-label {
  white-space: nowrap;
}

/* Agents Grid */
.sentinels-agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}

/* Agent Card */
.sentinels-agent-card {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 3%, transparent);
  transition: border-color 0.3s, box-shadow 0.3s;
}

.sentinels-agent--alert {
  border-color: #ef4444;
  box-shadow: 0 0 12px color-mix(in srgb, #ef4444 20%, transparent);
}

.sentinels-agent--error {
  border-color: #f59e0b;
  box-shadow: 0 0 12px color-mix(in srgb, #f59e0b 15%, transparent);
}

.sentinels-agent-led-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: color-mix(in srgb, currentColor 5%, transparent);
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.sentinels-agent-led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sentinels-led--idle {
  background: #6b7280;
  box-shadow: none;
}

.sentinels-led--monitoring {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  animation: pulse-led 2s infinite;
}

.sentinels-led--alert {
  background: #ef4444;
  box-shadow: 0 0 10px #ef4444;
  animation: pulse-alert 1s infinite;
}

.sentinels-led--error {
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
  animation: pulse-alert 1.5s infinite;
}

@keyframes pulse-led {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.sentinels-agent-status-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.6;
}

.sentinels-agent-body {
  padding: 14px;
}

.sentinels-agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.sentinels-agent-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.sentinels-agent-alert-count {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  opacity: 0.7;
}

.sentinels-agent-alert-count.has-alerts {
  background: color-mix(in srgb, #ef4444 20%, transparent);
  color: #ef4444;
  opacity: 1;
}

.sentinels-agent-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.65;
}

.sentinels-agent-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sentinels-agent-time {
  font-size: 11px;
  opacity: 0.5;
}

.sentinels-agent-never {
  font-style: italic;
}

.sentinels-agent-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.sentinels-agent-toggle {
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  transition: all 0.2s;
  color: inherit;
}

.sentinels-agent-toggle.is-enabled {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  border-color: #22c55e;
  color: #22c55e;
}

.sentinels-agent-toggle:not(.is-enabled) {
  background: color-mix(in srgb, currentColor 5%, transparent);
  border-color: color-mix(in srgb, currentColor 15%, transparent);
  opacity: 0.5;
}

.sentinels-agent-mode-btn {
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  transition: all 0.2s;
  color: inherit;
}

.sentinels-mode--auto {
  background: color-mix(in srgb, #22c55e 12%, transparent);
  border-color: #22c55e;
  color: #22c55e;
}

.sentinels-mode--manual {
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  border-color: #f59e0b;
  color: #f59e0b;
}

/* Alerts Feed */
.sentinels-alerts-section {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  overflow: hidden;
}

.sentinels-alerts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.sentinels-alerts-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.sentinels-alerts-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sentinels-alerts-count {
  font-size: 11px;
  opacity: 0.5;
}

.sentinels-alerts-ack-all {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  color: inherit;
}

.sentinels-alerts-ack-all:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.sentinels-alerts-list {
  max-height: 320px;
  overflow-y: auto;
}

.sentinels-alerts-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.4;
  font-style: italic;
}

.sentinels-alert-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 4%, transparent);
  transition: background 0.2s;
}

.sentinels-alert-row:last-child {
  border-bottom: none;
}

.sentinels-alert-row.is-unacknowledged {
  background: color-mix(in srgb, currentColor 2%, transparent);
}

.sentinels-alert-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.sentinels-severity--low {
  background: #22c55e;
  box-shadow: 0 0 4px #22c55e;
}

.sentinels-severity--medium {
  background: #f59e0b;
  box-shadow: 0 0 4px #f59e0b;
}

.sentinels-severity--high {
  background: #f97316;
  box-shadow: 0 0 6px #f97316;
}

.sentinels-severity--critical {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
  animation: pulse-alert 1.5s infinite;
}

.sentinels-alert-body {
  flex: 1;
  min-width: 0;
}

.sentinels-alert-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
  flex-wrap: wrap;
}

.sentinels-alert-agent {
  font-size: 12px;
  font-weight: 600;
}

.sentinels-alert-severity {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.sentinels-severity--low {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #22c55e;
}

.sentinels-severity--medium {
  background: color-mix(in srgb, #f59e0b 15%, transparent);
  color: #f59e0b;
}

.sentinels-severity--high {
  background: color-mix(in srgb, #f97316 15%, transparent);
  color: #f97316;
}

.sentinels-severity--critical {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}

.sentinels-alert-time {
  font-size: 11px;
  opacity: 0.5;
  margin-left: auto;
}

.sentinels-alert-message {
  margin: 0;
  font-size: 12px;
  opacity: 0.75;
  line-height: 1.4;
}

.sentinels-alert-ack {
  font-size: 9px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 0.2s;
  color: inherit;
}

.sentinels-alert-ack:hover {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  border-color: #22c55e;
  color: #22c55e;
}

/* Scrollbar styling */
.sentinels-alerts-list::-webkit-scrollbar {
  width: 6px;
}

.sentinels-alerts-list::-webkit-scrollbar-track {
  background: transparent;
}

.sentinels-alerts-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 3px;
}

/* ── Responsive / Mobile ── */
@media (max-width: 768px) {
  .sentinels-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .sentinels-header-right {
    width: 100%;
  }
  .sentinels-mode-toggle {
    width: 100%;
    justify-content: center;
  }
  .sentinels-summary-bar {
    flex-direction: column;
    gap: 6px;
  }
  .sentinels-summary-item {
    width: 100%;
  }
  .sentinels-agents-grid {
    grid-template-columns: 1fr;
  }
  .sentinels-agent-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .sentinels-agent-controls {
    justify-content: flex-end;
  }
  .sentinels-alert-row {
    flex-direction: column;
    gap: 6px;
  }
  .sentinels-alert-ack {
    align-self: flex-end;
  }
}

@media (max-width: 480px) {
  .sentinels-panel {
    padding: 8px;
  }
  .sentinels-header-left {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .sentinels-title {
    font-size: 18px;
  }
  .sentinels-agent-card {
    border-radius: 8px;
  }
  .sentinels-agent-body {
    padding: 10px;
  }
  .sentinels-alerts-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
}
</style>
