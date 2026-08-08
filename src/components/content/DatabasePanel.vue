<template>
  <div class="database-panel">
    <div class="database-header">
      <div class="database-header-left">
        <IconTablerDatabase class="database-header-icon" />
        <div class="database-header-info">
          <h2 class="database-title">Database</h2>
          <p class="database-subtitle">{{ status.message }}</p>
        </div>
      </div>
      <div class="database-header-right">
        <button class="database-refresh-btn" type="button" :disabled="isRefreshing" @click="refreshAll">
          <span v-if="isRefreshing" class="database-spinner" aria-hidden="true" />
          Refresh
        </button>
      </div>
    </div>

    <div class="database-summary-bar">
      <div class="database-summary-item">
        <span class="database-summary-dot" :class="status.backend === 'supabase' ? 'is-cloud' : 'is-local'" />
        <span class="database-summary-label">
          {{ status.backend === 'supabase' ? 'Supabase cloud' : 'Local embedded store' }}
        </span>
      </div>
      <div class="database-summary-item">
        <IconTablerTerminal class="database-summary-icon" />
        <span class="database-summary-label">
          {{ status.backend === 'supabase' ? 'Deployed' : 'Self-hosted' }} · {{ deploymentLabel }}
        </span>
      </div>
      <div v-if="status.supabaseConfigured" class="database-summary-item">
        <IconTablerTerminal class="database-summary-icon" />
        <span class="database-summary-label" :title="status.supabaseUrl">{{ status.supabaseUrl }}</span>
      </div>
      <div v-else class="database-summary-item">
        <IconTablerTerminal class="database-summary-icon" />
        <span class="database-summary-label" :title="status.localDbPath">{{ status.localDbSizeBytes > 0 ? formatBytes(status.localDbSizeBytes) : 'empty' }} on disk</span>
      </div>
      <div class="database-summary-item">
        <span class="database-summary-label">{{ tables.length }} tables</span>
      </div>
    </div>

    <div class="database-layout">
      <div class="database-tables-column">
        <div class="database-tables-header">
          <h3 class="database-tables-title">Tables</h3>
        </div>
        <div class="database-tables-list">
          <div v-if="tables.length === 0" class="database-tables-empty">
            No tables yet. Run a query below to create one.
          </div>
          <button
            v-for="table in tables"
            :key="table.name"
            class="database-table-btn"
            :class="{ 'is-active': selectedTable?.name === table.name }"
            type="button"
            @click="onSelectTable(table)"
          >
            <span class="database-table-name">{{ table.name }}</span>
            <span class="database-table-count">{{ table.rowCount }} rows</span>
          </button>
        </div>
      </div>

      <div class="database-content-column">
        <div class="database-query-section">
          <div class="database-query-header">
            <h3 class="database-query-title">SQL runner</h3>
            <div class="database-query-hint">
              {{ status.backend === 'supabase' ? 'SELECT queries run via the Supabase REST API' : 'SQLite-compatible SQL' }}
            </div>
          </div>
          <textarea
            v-model="querySql"
            class="database-query-input"
            rows="4"
            placeholder="SELECT * FROM codex_meta;"
            spellcheck="false"
          ></textarea>
          <div class="database-query-actions">
            <button class="database-run-btn" type="button" :disabled="!querySql.trim() || isRunningQuery" @click="onRunQuery">
              <span v-if="isRunningQuery" class="database-spinner" aria-hidden="true" />
              Run query
            </button>
            <span v-if="lastQueryTime !== null" class="database-query-time">{{ lastQueryTime }}ms</span>
          </div>
        </div>

        <div v-if="queryError" class="database-error-box">{{ queryError }}</div>

        <div v-if="selectedTable || lastResult" class="database-results-section">
          <div class="database-results-header">
            <h3 class="database-results-title">
              {{ selectedTable ? `Table: ${selectedTable.name}` : 'Query results' }}
            </h3>
            <span v-if="selectedTable" class="database-results-schema">{{ selectedTable.sql }}</span>
          </div>
          <div v-if="resultColumns.length === 0" class="database-results-empty">
            No rows returned.
          </div>
          <div v-else class="database-table-wrap">
            <table class="database-results-table">
              <thead>
                <tr>
                  <th v-for="column in resultColumns" :key="column">{{ column }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in resultRows" :key="rowIndex">
                  <td v-for="(value, colIndex) in row" :key="colIndex">
                    {{ formatCell(value) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else-if="tables.length > 0" class="database-results-empty-hint">
          Select a table from the left or run a query to inspect data.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import IconTablerDatabase from '../icons/IconTablerDatabase.vue'
import IconTablerTerminal from '../icons/IconTablerTerminal.vue'
import { databaseGetStatus, databaseListTables, databaseRunQuery } from '../../api/database'
import type { DatabaseStatus, TableInfo, QueryResult } from '../../api/database'

const status = ref<DatabaseStatus>({
  backend: 'sqlite',
  deployment: 'local',
  supabaseConfigured: false,
  supabaseUrl: '',
  localDbPath: '',
  localDbExists: false,
  localDbSizeBytes: 0,
  message: '',
})
const tables = ref<TableInfo[]>([])
const selectedTable = ref<TableInfo | null>(null)
const querySql = ref('SELECT * FROM codex_meta;')
const queryError = ref('')
const lastResult = ref<QueryResult | null>(null)
const lastQueryTime = ref<number | null>(null)
const isRefreshing = ref(false)
const isRunningQuery = ref(false)

const deploymentLabel = computed(() => {
  const map = { local: 'Local env', docker: 'Docker env', cloud: 'Cloud hosted' }
  return map[status.value.deployment] ?? 'Local env'
})

const resultColumns = computed(() => lastResult.value?.columns ?? [])
const resultRows = computed(() => lastResult.value?.rows ?? [])

async function refreshStatus(): Promise<void> {
  try {
    status.value = await databaseGetStatus()
  } catch {
    // keep previous status
  }
}

async function refreshTables(): Promise<void> {
  try {
    const result = await databaseListTables()
    tables.value = result.tables
    if (selectedTable.value) {
      const refreshed = tables.value.find((t) => t.name === selectedTable.value?.name)
      selectedTable.value = refreshed ?? null
    }
  } catch {
    // keep previous tables
  }
}

async function refreshAll(): Promise<void> {
  isRefreshing.value = true
  try {
    await Promise.all([refreshStatus(), refreshTables()])
  } finally {
    isRefreshing.value = false
  }
}

async function onSelectTable(table: TableInfo): Promise<void> {
  selectedTable.value = table
  queryError.value = ''
  querySql.value = `SELECT * FROM "${table.name}" LIMIT 100;`
  await onRunQuery()
}

async function onRunQuery(): Promise<void> {
  const sql = querySql.value.trim()
  if (!sql || isRunningQuery.value) return
  isRunningQuery.value = true
  queryError.value = ''
  try {
    const result = await databaseRunQuery(sql)
    lastResult.value = result
    lastQueryTime.value = result.executionMs
  } catch (error) {
    lastResult.value = null
    lastQueryTime.value = null
    queryError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRunningQuery.value = false
  }
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  return String(value)
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
.database-panel {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100%;
}

.database-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.database-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.database-header-icon {
  font-size: 32px;
  opacity: 0.9;
}

.database-header-info {
  display: flex;
  flex-direction: column;
}

.database-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.database-subtitle {
  margin: 0;
  font-size: 12px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.database-refresh-btn {
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

.database-refresh-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.database-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.database-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: database-spin 0.8s linear infinite;
}

@keyframes database-spin {
  to { transform: rotate(360deg); }
}

.database-summary-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 12px;
}

.database-summary-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.database-summary-item:last-child {
  border-right: none;
}

.database-summary-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.database-summary-dot.is-cloud {
  background: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}

.database-summary-dot.is-local {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.database-summary-icon {
  font-size: 14px;
  opacity: 0.6;
}

.database-summary-label {
  white-space: nowrap;
}

.database-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
}

.database-tables-column {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  overflow: hidden;
  align-self: start;
}

.database-tables-header {
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.database-tables-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.database-tables-list {
  max-height: 460px;
  overflow-y: auto;
  padding: 6px;
}

.database-tables-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
  font-style: italic;
}

.database-table-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition: background 0.2s;
  color: inherit;
}

.database-table-btn:hover {
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.database-table-btn.is-active {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #22c55e;
}

.database-table-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.database-table-count {
  font-size: 10px;
  opacity: 0.6;
  flex-shrink: 0;
  margin-left: 8px;
}

.database-content-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.database-query-section {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  padding: 14px 16px;
}

.database-query-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.database-query-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.database-query-hint {
  font-size: 11px;
  opacity: 0.5;
}

.database-query-input {
  width: 100%;
  font-family: monospace;
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.database-query-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.database-run-btn {
  font-size: 12px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #16a34a 40%, transparent);
  background: color-mix(in srgb, #16a34a 15%, transparent);
  color: #16a34a;
  cursor: pointer;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.database-run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.database-query-time {
  font-size: 11px;
  opacity: 0.5;
}

.database-error-box {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #ef4444 40%, transparent);
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
  font-size: 12px;
}

.database-results-section {
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 2%, transparent);
  overflow: hidden;
}

.database-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  gap: 12px;
}

.database-results-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.database-results-schema {
  font-size: 10px;
  opacity: 0.5;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.database-results-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
  font-style: italic;
}

.database-results-empty-hint {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.4;
  font-style: italic;
  border-radius: 10px;
  border: 1px dashed color-mix(in srgb, currentColor 15%, transparent);
}

.database-table-wrap {
  overflow-x: auto;
  max-height: 480px;
  overflow-y: auto;
}

.database-results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.database-results-table th {
  position: sticky;
  top: 0;
  background: color-mix(in srgb, currentColor 6%, transparent);
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  white-space: nowrap;
}

.database-results-table td {
  padding: 6px 12px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 4%, transparent);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.database-results-table tr:hover td {
  background: color-mix(in srgb, currentColor 2%, transparent);
}

.database-results-table::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.database-results-table::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, currentColor 15%, transparent);
  border-radius: 3px;
}

@media (max-width: 900px) {
  .database-layout {
    grid-template-columns: 1fr;
  }
  .database-tables-column {
    max-height: 240px;
    overflow-y: auto;
  }
}

@media (max-width: 768px) {
  .database-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .database-summary-bar {
    flex-direction: column;
    gap: 6px;
  }
  .database-summary-item {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .database-panel {
    padding: 8px;
  }
  .database-title {
    font-size: 18px;
  }
}
</style>
