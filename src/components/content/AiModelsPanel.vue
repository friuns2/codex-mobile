<template>
  <div class="ai-models-panel">
    <div class="ai-models-header">
      <div class="ai-models-header-left">
        <IconTablerSettings class="ai-models-header-icon" />
        <div class="ai-models-header-info">
          <h2 class="ai-models-title">AI Models</h2>
          <p class="ai-models-subtitle">Local models, HuggingFace &amp; cloud LLM APIs</p>
        </div>
      </div>
      <div class="ai-models-header-right">
        <button class="ai-models-header-btn ai-models-header-btn-primary" type="button" @click="openAddModal">
          Add AI API
        </button>
      </div>
    </div>

    <div class="ai-models-summary-bar">
      <div class="ai-models-summary-item">
        <span class="ai-models-summary-dot" :class="status.ollama.reachable ? 'is-ok' : 'is-down'" />
        <span class="ai-models-summary-label">
          {{ status.ollama.reachable ? `Ollama online (${status.ollama.models.length} models)` : 'Ollama offline' }}
        </span>
      </div>
      <div class="ai-models-summary-item">
        <span class="ai-models-summary-dot" :class="hardware.canRunOfflineModels ? 'is-ok' : 'is-warn'" />
        <span class="ai-models-summary-label">{{ formatBytes(hardware.totalRamBytes) }} RAM · {{ hardware.tier }} tier</span>
      </div>
      <div class="ai-models-summary-item">
        <IconTablerTerminal class="ai-models-summary-icon" />
        <span class="ai-models-summary-label">{{ status.providers.length }} cloud providers</span>
      </div>
      <div class="ai-models-summary-item">
        <IconTablerTerminal class="ai-models-summary-icon" />
        <span class="ai-models-summary-label">Model sync every 10 min</span>
      </div>
    </div>

    <div class="ai-models-section ai-models-hardware-section">
      <div class="ai-models-section-header">
        <h3 class="ai-models-section-title">Device hardware scan</h3>
        <button class="ai-models-section-btn" type="button" @click="loadStatus">Rescan</button>
      </div>
      <div class="ai-models-hardware-grid">
        <div class="ai-models-hardware-cell">
          <span class="ai-models-hardware-label">CPU</span>
          <span class="ai-models-hardware-value" :title="hardware.cpus[0]?.model">{{ hardware.cpus[0]?.model || 'Unknown' }}</span>
        </div>
        <div class="ai-models-hardware-cell">
          <span class="ai-models-hardware-label">Cores</span>
          <span class="ai-models-hardware-value">{{ hardware.cpus.length }}</span>
        </div>
        <div class="ai-models-hardware-cell">
          <span class="ai-models-hardware-label">RAM</span>
          <span class="ai-models-hardware-value">{{ formatBytes(hardware.totalRamBytes) }} ({{ formatBytes(hardware.freeRamBytes) }} free)</span>
        </div>
        <div class="ai-models-hardware-cell">
          <span class="ai-models-hardware-label">Platform</span>
          <span class="ai-models-hardware-value">{{ hardware.platform }} / {{ hardware.arch }}</span>
        </div>
      </div>
      <div v-if="suggestions.length > 0" class="ai-models-suggestions">
        <div class="ai-models-suggestions-title">Recommended offline models for this device</div>
        <div class="ai-models-suggestions-grid">
          <div v-for="suggestion in suggestions" :key="suggestion.name" class="ai-models-suggestion-card">
            <div class="ai-models-suggestion-body">
              <div class="ai-models-suggestion-name">{{ suggestion.name }}</div>
              <div class="ai-models-suggestion-meta">
                <span class="ai-models-suggestion-tag">{{ suggestion.source }}</span>
                <span class="ai-models-suggestion-size">{{ suggestion.sizeLabel }}</span>
              </div>
              <div class="ai-models-suggestion-desc">{{ suggestion.description }}</div>
            </div>
            <button
              class="ai-models-suggestion-btn"
              type="button"
              :disabled="isPullingModel === suggestion.name"
              @click="onPullSuggestion(suggestion.name)"
            >
              {{ isPullingModel === suggestion.name ? 'Pulling…' : 'Pull with Ollama' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="ai-models-section">
      <div class="ai-models-section-header">
        <h3 class="ai-models-section-title">Cloud LLM APIs</h3>
        <span class="ai-models-section-hint">Keys are stored server-side and never sent back to the client</span>
      </div>
      <div v-if="status.providers.length === 0" class="ai-models-empty">
        No cloud providers configured. Add your first API to auto-activate and sync its models.
      </div>
      <div v-else class="ai-models-provider-list">
        <div v-for="provider in status.providers" :key="provider.id" class="ai-models-provider-card">
          <div class="ai-models-provider-led" :class="provider.active ? 'is-active' : 'is-inactive'" />
          <div class="ai-models-provider-body">
            <div class="ai-models-provider-name-row">
              <span class="ai-models-provider-name">{{ provider.name }}</span>
              <span class="ai-models-provider-status" :class="provider.active ? 'is-active' : 'is-inactive'">
                {{ provider.active ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <div class="ai-models-provider-meta">
              <span class="ai-models-provider-url" :title="provider.baseUrl">{{ provider.baseUrl }}</span>
              <span class="ai-models-provider-models">{{ provider.modelIds.length }} models</span>
              <span v-if="provider.lastSyncedAt" class="ai-models-provider-synced">
                Synced {{ formatTime(provider.lastSyncedAt) }}
              </span>
            </div>
            <div v-if="provider.activationError" class="ai-models-provider-error">
              {{ provider.activationError }}
            </div>
            <div v-if="provider.modelIds.length > 0" class="ai-models-provider-tags">
              <span v-for="modelId in provider.modelIds.slice(0, 12)" :key="modelId" class="ai-models-provider-tag">
                {{ modelId }}
              </span>
              <span v-if="provider.modelIds.length > 12" class="ai-models-provider-tag-more">
                +{{ provider.modelIds.length - 12 }} more
              </span>
            </div>
          </div>
          <div class="ai-models-provider-actions">
            <button class="ai-models-provider-btn" type="button" :disabled="isRefreshingProvider === provider.id" @click="onRefreshProvider(provider.id)">
              {{ isRefreshingProvider === provider.id ? 'Syncing…' : 'Sync now' }}
            </button>
            <button class="ai-models-provider-btn ai-models-provider-btn-danger" type="button" @click="onRemoveProvider(provider.id)">
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="ai-models-section">
      <div class="ai-models-section-header">
        <h3 class="ai-models-section-title">Ollama local models</h3>
        <button class="ai-models-section-btn" type="button" @click="loadStatus">Refresh</button>
      </div>
      <div v-if="!status.ollama.reachable" class="ai-models-empty">
        Ollama is not reachable at {{ status.ollama.baseUrl }}. Install <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Ollama</a>
        to run models fully offline on this device.
      </div>
      <div v-else-if="status.ollama.models.length === 0" class="ai-models-empty">
        No models installed yet. Pull one from the suggestions above.
      </div>
      <div v-else class="ai-models-ollama-grid">
        <div v-for="model in status.ollama.models" :key="model.name" class="ai-models-ollama-card">
          <div class="ai-models-ollama-name">{{ model.name }}</div>
          <div class="ai-models-ollama-meta">{{ formatBytes(model.sizeBytes) }}</div>
        </div>
      </div>
    </div>

    <div class="ai-models-section">
      <div class="ai-models-section-header">
        <h3 class="ai-models-section-title">HuggingFace</h3>
        <div class="ai-models-search">
          <input
            v-model="hfQuery"
            class="ai-models-search-input"
            type="search"
            placeholder="Search HuggingFace models…"
            @keydown.enter.prevent="onSearchHuggingFace"
          >
          <button class="ai-models-section-btn" type="button" :disabled="hfQuery.trim().length === 0" @click="onSearchHuggingFace">
            Search
          </button>
        </div>
      </div>
      <div v-if="hfResults.length > 0" class="ai-models-hf-grid">
        <div v-for="result in hfResults" :key="result.name" class="ai-models-hf-card">
          <div class="ai-models-hf-name">{{ result.name }}</div>
          <div class="ai-models-hf-meta">
            <span class="ai-models-hf-size">{{ result.sizeLabel }}</span>
          </div>
          <div class="ai-models-hf-desc">{{ result.description }}</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isAddModalOpen" class="ai-models-modal-backdrop" @click.self="closeAddModal">
        <div class="ai-models-modal" role="dialog" aria-modal="true" aria-labelledby="ai-models-modal-title">
          <div class="ai-models-modal-header">
            <h3 id="ai-models-modal-title" class="ai-models-modal-title">Add AI API provider</h3>
            <button class="ai-models-modal-close" type="button" :aria-label="'Close'" @click="closeAddModal">
              <IconTablerX />
            </button>
          </div>
          <div class="ai-models-modal-body">
            <label class="ai-models-field">
              <span class="ai-models-field-label">Provider name</span>
              <input v-model="addForm.name" class="ai-models-field-input" type="text" placeholder="e.g. Groq, Together, DeepSeek" />
            </label>
            <label class="ai-models-field">
              <span class="ai-models-field-label">Base URL</span>
              <input v-model="addForm.baseUrl" class="ai-models-field-input" type="text" placeholder="https://api.example.com/v1" />
            </label>
            <label class="ai-models-field">
              <span class="ai-models-field-label">API key</span>
              <input v-model="addForm.apiKey" class="ai-models-field-input" type="password" placeholder="sk-…" />
            </label>
            <label class="ai-models-field">
              <span class="ai-models-field-label">Wire API</span>
              <select v-model="addForm.wireApi" class="ai-models-field-input">
                <option value="chat">chat</option>
                <option value="responses">responses</option>
              </select>
            </label>
            <p class="ai-models-modal-note">
              The key is used only to activate the provider (call its <code>/models</code> endpoint) and is stored
              server-side. Activation happens automatically when you add the provider.
            </p>
            <div v-if="addModalError" class="ai-models-modal-error">{{ addModalError }}</div>
          </div>
          <div class="ai-models-modal-footer">
            <button class="ai-models-modal-btn" type="button" @click="closeAddModal">Cancel</button>
            <button
              class="ai-models-modal-btn ai-models-modal-btn-primary"
              type="button"
              :disabled="!canAddProvider || isAddingProvider"
              @click="onAddProvider"
            >
              {{ isAddingProvider ? 'Activating…' : 'Add & activate' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import IconTablerSettings from '../icons/IconTablerSettings.vue'
import IconTablerTerminal from '../icons/IconTablerTerminal.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import {
  aiModelsGetStatus,
  aiModelsGetSuggestions,
  aiModelsPullOllamaModel,
  aiModelsSearchHuggingFace,
  aiModelsAddProvider,
  aiModelsRefreshProvider,
  aiModelsRemoveProvider,
} from '../../api/aiModels'
import type { AiModelsStatus, HardwareProfile, ModelSuggestion, CloudModelProvider } from '../../api/aiModels'

const status = ref<AiModelsStatus>({
  hardware: {
    cpus: [],
    totalRamBytes: 0,
    freeRamBytes: 0,
    platform: '',
    arch: '',
    release: '',
    hostname: '',
    tier: 'low',
    canRunOfflineModels: false,
  },
  ollama: { reachable: false, baseUrl: 'http://127.0.0.1:11434', models: [] },
  providers: [],
  syncTimerRunning: false,
  syncIntervalMs: 600000,
})
const hardware = ref<HardwareProfile>(status.value.hardware)
const suggestions = ref<ModelSuggestion[]>([])
const isPullingModel = ref('')
const isRefreshingProvider = ref('')
const hfQuery = ref('')
const hfResults = ref<ModelSuggestion[]>([])

const isAddModalOpen = ref(false)
const isAddingProvider = ref(false)
const addModalError = ref('')
const addForm = ref({ name: '', baseUrl: '', apiKey: '', wireApi: 'chat' })

const canAddProvider = computed(() => {
  return addForm.value.name.trim().length > 0
    && addForm.value.baseUrl.trim().length > 0
    && addForm.value.apiKey.trim().length > 0
})

async function loadStatus(): Promise<void> {
  try {
    status.value = await aiModelsGetStatus()
    hardware.value = status.value.hardware
  } catch {
    // keep previous state
  }
}

async function loadSuggestions(): Promise<void> {
  try {
    const result = await aiModelsGetSuggestions()
    hardware.value = result.hardware
    suggestions.value = result.suggestions
  } catch {
    // keep previous state
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([loadStatus(), loadSuggestions()])
}

async function onPullSuggestion(name: string): Promise<void> {
  if (isPullingModel.value) return
  isPullingModel.value = name
  try {
    await aiModelsPullOllamaModel(name)
    await loadStatus()
    await loadSuggestions()
  } catch {
    // failure leaves state unchanged
  } finally {
    isPullingModel.value = ''
  }
}

async function onSearchHuggingFace(): Promise<void> {
  const query = hfQuery.value.trim()
  if (!query) return
  try {
    const result = await aiModelsSearchHuggingFace(query)
    hfResults.value = result.results
  } catch {
    hfResults.value = []
  }
}

function openAddModal(): void {
  addModalError.value = ''
  isAddModalOpen.value = true
}

function closeAddModal(): void {
  if (isAddingProvider.value) return
  isAddModalOpen.value = false
  addModalError.value = ''
}

async function onAddProvider(): Promise<void> {
  if (!canAddProvider.value || isAddingProvider.value) return
  isAddingProvider.value = true
  addModalError.value = ''
  try {
    const result = await aiModelsAddProvider({
      name: addForm.value.name.trim(),
      baseUrl: addForm.value.baseUrl.trim(),
      apiKey: addForm.value.apiKey.trim(),
      wireApi: addForm.value.wireApi,
    })
    await loadStatus()
    await loadSuggestions()
    if (!result.activated) {
      addModalError.value = 'Provider added but activation failed — check the base URL and key, then press Sync now.'
    } else {
      isAddModalOpen.value = false
      addForm.value = { name: '', baseUrl: '', apiKey: '', wireApi: 'chat' }
    }
  } catch (error) {
    addModalError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isAddingProvider.value = false
  }
}

async function onRefreshProvider(id: string): Promise<void> {
  if (isRefreshingProvider.value) return
  isRefreshingProvider.value = id
  try {
    await aiModelsRefreshProvider(id)
    await loadStatus()
  } catch {
    // failure leaves state unchanged
  } finally {
    isRefreshingProvider.value = ''
  }
}

async function onRemoveProvider(id: string): Promise<void> {
  try {
    await aiModelsRemoveProvider(id)
    await loadStatus()
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`
}

onMounted(() => {
  refreshAll()
})
</script>

<style scoped>
.ai-models-panel {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.ai-models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ai-models-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-models-header-icon {
  font-size: 32px;
  opacity: 0.9;
}

.ai-models-header-info {
  display: flex;
  flex-direction: column;
}

.ai-models-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.ai-models-subtitle {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.ai-models-header-btn {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  color: inherit;
}

.ai-models-header-btn-primary {
  background: color-mix(in srgb, #16a34a 15%, transparent);
  border-color: #16a34a;
  color: #16a34a;
}

.ai-models-summary-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 12px;
}

.ai-models-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.ai-models-summary-item:last-child {
  border-right: none;
}

.ai-models-summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.ai-models-summary-dot.is-ok {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.ai-models-summary-dot.is-down {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.ai-models-summary-dot.is-warn {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}

.ai-models-summary-icon {
  font-size: 14px;
  opacity: 0.6;
}

.ai-models-summary-label {
  white-space: nowrap;
}

.ai-models-section {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  padding: 14px 16px;
}

.ai-models-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.ai-models-section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.ai-models-section-hint {
  font-size: 11px;
  opacity: 0.5;
}

.ai-models-section-btn {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  color: inherit;
}

.ai-models-section-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.ai-models-section-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-models-hardware-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.ai-models-hardware-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.ai-models-hardware-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.5;
}

.ai-models-hardware-value {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-models-suggestions-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  opacity: 0.8;
}

.ai-models-suggestions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.ai-models-suggestion-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.ai-models-suggestion-name {
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.ai-models-suggestion-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-models-suggestion-tag {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.ai-models-suggestion-size {
  font-size: 11px;
  opacity: 0.6;
}

.ai-models-suggestion-desc {
  font-size: 11px;
  opacity: 0.6;
  line-height: 1.4;
}

.ai-models-suggestion-btn {
  font-size: 11px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #16a34a 40%, transparent);
  background: color-mix(in srgb, #16a34a 15%, transparent);
  color: #16a34a;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  align-self: flex-start;
}

.ai-models-suggestion-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-models-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.5;
  font-style: italic;
}

.ai-models-empty a {
  color: inherit;
}

.ai-models-provider-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-models-provider-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.ai-models-provider-led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}

.ai-models-provider-led.is-active {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.ai-models-provider-led.is-inactive {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.ai-models-provider-body {
  flex: 1;
  min-width: 0;
}

.ai-models-provider-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.ai-models-provider-name {
  font-size: 13px;
  font-weight: 600;
}

.ai-models-provider-status {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
}

.ai-models-provider-status.is-active {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #22c55e;
}

.ai-models-provider-status.is-inactive {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #ef4444;
}

.ai-models-provider-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  opacity: 0.6;
  flex-wrap: wrap;
}

.ai-models-provider-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.ai-models-provider-error {
  margin-top: 6px;
  font-size: 11px;
  color: #ef4444;
}

.ai-models-provider-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.ai-models-provider-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  font-family: monospace;
}

.ai-models-provider-tag-more {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  opacity: 0.6;
}

.ai-models-provider-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.ai-models-provider-btn {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  color: inherit;
}

.ai-models-provider-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.ai-models-provider-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-models-provider-btn-danger {
  border-color: color-mix(in srgb, #ef4444 40%, transparent);
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
}

.ai-models-ollama-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.ai-models-ollama-card {
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 3%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.ai-models-ollama-name {
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
}

.ai-models-ollama-meta {
  font-size: 11px;
  opacity: 0.6;
  margin-top: 2px;
}

.ai-models-search {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-models-search-input {
  min-width: 260px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
}

.ai-models-hf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.ai-models-hf-card {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.ai-models-hf-name {
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-models-hf-meta {
  margin-top: 4px;
}

.ai-models-hf-size {
  font-size: 11px;
  opacity: 0.6;
}

.ai-models-hf-desc {
  font-size: 11px;
  opacity: 0.6;
  margin-top: 4px;
  line-height: 1.4;
}

.ai-models-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ai-models-modal {
  width: 100%;
  max-width: 460px;
  border-radius: 12px;
  background: #ffffff;
  color: #1f2937;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

:global(:root.dark) .ai-models-modal {
  background: #111827;
  color: #f3f4f6;
}

.ai-models-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

:global(:root.dark) .ai-models-modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.ai-models-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.ai-models-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.ai-models-modal-close:hover {
  background: rgba(0, 0, 0, 0.06);
}

.ai-models-modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-models-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-models-field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.ai-models-field-input {
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: transparent;
  color: inherit;
}

:global(:root.dark) .ai-models-field-input {
  border-color: rgba(255, 255, 255, 0.15);
}

.ai-models-modal-note {
  margin: 0;
  font-size: 11px;
  opacity: 0.6;
  line-height: 1.5;
}

.ai-models-modal-note code {
  font-family: monospace;
}

.ai-models-modal-error {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.ai-models-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

:global(:root.dark) .ai-models-modal-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.ai-models-modal-btn {
  font-size: 12px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  color: inherit;
}

.ai-models-modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-models-modal-btn-primary {
  border-color: #16a34a;
  background: #16a34a;
  color: #ffffff;
}

@media (max-width: 768px) {
  .ai-models-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .ai-models-summary-bar {
    flex-direction: column;
    gap: 6px;
  }
  .ai-models-summary-item {
    width: 100%;
  }
  .ai-models-provider-card {
    flex-direction: column;
  }
  .ai-models-provider-actions {
    flex-direction: row;
  }
  .ai-models-search {
    width: 100%;
  }
  .ai-models-search-input {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 480px) {
  .ai-models-panel {
    padding: 8px;
  }
  .ai-models-title {
    font-size: 18px;
  }
}
</style>
