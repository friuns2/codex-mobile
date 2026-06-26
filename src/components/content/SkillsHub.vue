<template>
  <div class="skills-hub">
    <div class="skills-hub-header">
      <h2 class="skills-hub-title">{{ t('Skills Hub') }}</h2>
      <p class="skills-hub-subtitle">{{ t('Manage installed skills on this machine') }}</p>
    </div>

    <div class="skills-sync-panel">
      <div class="skills-sync-header">
        <strong>{{ t('Skills Sync (GitHub)') }}</strong>
        <a
          v-if="syncStatus.configured && githubRepoUrl"
          class="skills-sync-badge skills-sync-badge-link"
          :href="githubRepoUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('Connected') }}: {{ syncStatus.repoOwner }}/{{ syncStatus.repoName }}
        </a>
        <span v-else-if="syncStatus.loggedIn" class="skills-sync-badge">{{ t('Logged in as') }} {{ syncStatus.githubUsername }}</span>
        <span v-else class="skills-sync-badge">{{ t('Not connected') }}</span>
      </div>
      <div class="skills-sync-meta">
        <span>{{ t('Startup') }}: {{ syncStatus.startup.mode }}</span>
        <span>{{ t('Branch') }}: {{ syncStatus.startup.branch }}</span>
        <span>{{ t('Action') }}: {{ syncStatus.startup.lastAction }}</span>
      </div>
      <div v-if="syncStatus.startup.lastError" class="skills-sync-error">
        <span>{{ syncStatus.startup.lastError }}</span>
        <a class="skills-error-feedback" :href="feedbackMailto" @click="prepareSkillsErrorFeedback($event, syncStatus.startup.lastError)">{{ t('Send feedback') }}</a>
      </div>
      <div v-if="syncActionStatus" class="skills-sync-meta">
        <span>{{ t('Manual sync') }}: {{ syncActionStatus }}</span>
      </div>
      <div v-if="syncActionError" class="skills-sync-error">
        <span>{{ syncActionError }}</span>
        <a class="skills-error-feedback" :href="feedbackMailto" @click="prepareSkillsErrorFeedback($event, syncActionError)">{{ t('Send feedback') }}</a>
      </div>
      <div v-if="deviceLogin" class="skills-sync-device">
        <span>{{ t('Open') }} <a :href="deviceLogin.verification_uri" target="_blank" rel="noreferrer">{{ t('GitHub device login') }}</a> {{ t('and enter code:') }}</span>
        <code>{{ deviceLogin.user_code }}</code>
      </div>
      <div class="skills-sync-actions">
        <button v-if="!syncStatus.loggedIn" class="skills-hub-sort" type="button" @click="startGithubFirebaseLogin">{{ t('Login with GitHub') }}</button>
        <button v-if="!syncStatus.loggedIn" class="skills-hub-sort" type="button" @click="startGithubLogin">{{ t('Device Login') }}</button>
        <button v-if="syncStatus.loggedIn" class="skills-hub-sort" type="button" @click="logoutGithub" :disabled="isSyncActionInFlight">{{ t('Logout GitHub') }}</button>
        <button class="skills-hub-sort" type="button" @click="startupSkillsSync" :disabled="isSyncActionInFlight">{{ isStartupSyncInFlight ? t('Syncing...') : t('Startup Sync') }}</button>
        <button class="skills-hub-sort" type="button" @click="pullSkillsSync" :disabled="isSyncActionInFlight">{{ isPullInFlight ? t('Pulling...') : t('Pull') }}</button>
        <button v-if="syncStatus.loggedIn" class="skills-hub-sort" type="button" @click="pushSkillsSync" :disabled="!syncStatus.configured || isSyncActionInFlight">{{ isPushInFlight ? t('Pushing...') : t('Push') }}</button>
      </div>
    </div>

    <div v-if="toast" class="skills-hub-toast" :class="toastClass">{{ toast.text }}</div>

    <div class="skills-search-panel">
      <div class="skills-search-header">
        <div class="skills-search-copy">
          <strong>{{ t('Find skills') }}</strong>
          <span>{{ t('Search the Skills registry with npx skills find.') }}</span>
        </div>
        <a
          class="skills-directory-link"
          href="https://skills.anyclaw.store/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('Skills directory') }}
        </a>
      </div>
      <form class="skills-search-form" @submit.prevent="searchSkills">
        <input
          v-model="skillSearchQuery"
          class="skills-search-input"
          type="search"
          :placeholder="t('Search skills...')"
          aria-label="Search skills"
        />
        <button class="skills-hub-sort" type="submit" :disabled="isSearchingSkills || skillSearchQuery.trim().length < 2">
          {{ isSearchingSkills ? t('Searching...') : t('Search') }}
        </button>
      </form>
      <div v-if="skillSearchError" class="skills-hub-error">
        <span>{{ skillSearchError }}</span>
        <a class="skills-error-feedback" :href="feedbackMailto" @click="prepareSkillsErrorFeedback($event, skillSearchError)">{{ t('Send feedback') }}</a>
      </div>
    </div>

    <div v-if="skillSearchResults.length > 0" class="skills-hub-section">
      <button class="skills-hub-section-toggle" type="button" @click="isSearchResultsOpen = !isSearchResultsOpen">
        <span class="skills-hub-section-title">{{ t('Search results ({count})', { count: skillSearchResults.length }) }}</span>
        <IconTablerChevronRight class="skills-hub-section-chevron" :class="{ 'is-open': isSearchResultsOpen }" />
      </button>
      <div v-if="isSearchResultsOpen" class="skills-hub-grid">
        <SkillCard
          v-for="skill in skillSearchResults"
          :key="skill.source || `${skill.owner}/${skill.name}`"
          :skill="skill"
          :show-browse-action="false"
          @select="(skill) => openDetail(skill as HubSkill)"
        />
      </div>
    </div>

    <slot name="before-installed" />

    <div v-if="filteredInstalled.length > 0" class="skills-hub-section">
      <button class="skills-hub-section-toggle" type="button" @click="isInstalledOpen = !isInstalledOpen">
        <span class="skills-hub-section-title">{{ t('Installed skills ({count})', { count: filteredInstalled.length }) }}</span>
        <IconTablerChevronRight class="skills-hub-section-chevron" :class="{ 'is-open': isInstalledOpen }" />
      </button>
      <div v-if="isInstalledOpen" class="skills-hub-grid">
        <SkillCard
          v-for="skill in filteredInstalled"
          :key="skill.name"
          :skill="skill"
          :show-status-badge="false"
          :show-owner="false"
          @select="(skill) => openDetail(skill as HubSkill)"
        />
      </div>
    </div>

    <div class="skills-hub-section">
      <div v-if="isLoading" class="skills-hub-loading">{{ t('Loading skills...') }}</div>
      <div v-else-if="error" class="skills-hub-error">
        <span>{{ error }}</span>
        <a class="skills-error-feedback" :href="feedbackMailto" @click="prepareSkillsErrorFeedback($event, error)">{{ t('Send feedback') }}</a>
      </div>
      <div v-else-if="installedSkills.length === 0" class="skills-hub-empty">{{ t('No installed skills found.') }}</div>
    </div>

    <SkillDetailModal
      :skill="detailSkill"
      :visible="isDetailOpen"
      :is-installing="isDetailInstalling"
      :is-uninstalling="isDetailUninstalling"
      :is-trying="props.tryInFlightKey === skillTryKey(detailSkill)"
      @close="isDetailOpen = false"
      @install="handleInstall"
      @uninstall="handleUninstall"
      @toggle-enabled="handleToggleEnabled"
      @try="handleTrySkill"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import SkillCard from './SkillCard.vue'
import SkillDetailModal, { type HubSkill } from './SkillDetailModal.vue'
import { useGithubSkillsSync } from '../../composables/useGithubSkillsSync'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { useUiLanguage } from '../../composables/useUiLanguage'

const EMPTY_SKILL: HubSkill = { name: '', owner: '', description: '', url: '', installed: false }
type SkillsHubPayload = { installed?: HubSkill[] }
type SkillsSearchPayload = { results?: HubSkill[]; error?: string }

const installedSkills = ref<HubSkill[]>([])
const skillSearchResults = ref<HubSkill[]>([])
const isLoading = ref(false)
const isSearchingSkills = ref(false)
const error = ref('')
const skillSearchQuery = ref('')
const skillSearchError = ref('')
const isInstalledOpen = ref(true)
const isSearchResultsOpen = ref(true)
const isDetailOpen = ref(false)
const detailSkill = ref<HubSkill>(EMPTY_SKILL)
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
const actionSkillKey = ref('')
const isInstallActionInFlight = ref(false)
const isUninstallActionInFlight = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
const { t } = useUiLanguage()
const { buildFeedbackMailto, feedbackMailtoBase, recordVisibleFailure } = useFeedbackDiagnostics()
const feedbackMailto = feedbackMailtoBase()

const props = defineProps<{
  tryInFlightKey?: string
}>()

const emit = defineEmits<{
  'skills-changed': []
  'try-item': [payload: { kind: 'skill'; name: string; displayName: string; skillPath?: string }]
}>()

const toastClass = computed(() => toast.value?.type === 'error' ? 'skills-hub-toast-error' : 'skills-hub-toast-success')
const currentDetailSkillKey = computed(() => `${detailSkill.value.owner}/${detailSkill.value.name}`)
const isDetailInstalling = computed(() =>
  isInstallActionInFlight.value && actionSkillKey.value === currentDetailSkillKey.value,
)
const isDetailUninstalling = computed(() =>
  isUninstallActionInFlight.value && actionSkillKey.value === currentDetailSkillKey.value,
)
const githubRepoUrl = computed(() => {
  if (!syncStatus.value.configured) return ''
  const owner = syncStatus.value.repoOwner.trim()
  const repo = syncStatus.value.repoName.trim()
  if (!owner || !repo) return ''
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
})
const filteredInstalled = computed(() => installedSkills.value)

function showToast(text: string, type: 'success' | 'error' = 'success'): void {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

function prepareSkillsErrorFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackMailto()
  }
}

function applySkillsPayload(payload: SkillsHubPayload): void {
  installedSkills.value = payload.installed ?? []
  if (skillSearchResults.value.length > 0) {
    const installedByName = new Map(installedSkills.value.map((skill) => [skill.name, skill]))
    skillSearchResults.value = skillSearchResults.value.map((skill) => {
      const installed = installedByName.get(skill.name)
      return installed ? registrySearchSkillWithLocalState(skill, installed) : skill
    })
  }
}

function registrySearchSkillWithLocalState(registrySkill: HubSkill, installed: HubSkill): HubSkill {
  return {
    ...registrySkill,
    installed: true,
    path: installed.path,
    enabled: installed.enabled,
  }
}

function localSearchSkill(installed: HubSkill, registrySkill: HubSkill): HubSkill {
  return {
    ...installed,
    installed: true,
    source: registrySkill.source,
    publishedAt: registrySkill.publishedAt,
  }
}

async function fetchSkills(): Promise<void> {
  isLoading.value = true
  error.value = ''
  try {
    const resp = await fetch('/codex-api/skills-hub')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as SkillsHubPayload
    applySkillsPayload(data)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load skills'
  } finally {
    isLoading.value = false
  }
}

function openDetail(skill: HubSkill): void {
  const installedSkill = skill.installed ? installedSkills.value.find((candidate) => candidate.name === skill.name) : undefined
  detailSkill.value = installedSkill ? localSearchSkill(installedSkill, skill) : skill
  isDetailOpen.value = true
}

async function searchSkills(): Promise<void> {
  const query = skillSearchQuery.value.trim()
  if (query.length < 2) return
  isSearchingSkills.value = true
  skillSearchError.value = ''
  try {
    const params = new URLSearchParams({ q: query })
    const resp = await fetch(`/codex-api/skills-hub/search?${params}`)
    const data = (await resp.json()) as SkillsSearchPayload
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
    const installedByName = new Map(installedSkills.value.map((skill) => [skill.name, skill]))
    skillSearchResults.value = (data.results ?? []).map((skill) => {
      const installed = installedByName.get(skill.name)
      return installed ? registrySearchSkillWithLocalState(skill, installed) : skill
    })
    isSearchResultsOpen.value = true
    if (skillSearchResults.value.length === 0) {
      showToast(t('No matching skills found.'), 'error')
    }
  } catch (e) {
    skillSearchError.value = e instanceof Error ? e.message : 'Failed to search skills'
  } finally {
    isSearchingSkills.value = false
  }
}

async function handleInstall(skill: HubSkill): Promise<void> {
  actionSkillKey.value = `${skill.owner}/${skill.name}`
  isInstallActionInFlight.value = true
  try {
    const resp = await fetch('/codex-api/skills-hub/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: skill.owner, name: skill.name, source: skill.source }),
    })
    const data = (await resp.json()) as { ok?: boolean; error?: string; path?: string }
    if (!data.ok) throw new Error(data.error || 'Install failed')
    if (!data.path) throw new Error('Install completed but no local skill path was returned')
    await fetchSkills()
    const installed = installedSkills.value.find((candidate) => candidate.name === skill.name)
    if (!installed?.path) {
      throw new Error('Install completed but the local skill was not found after refresh')
    }
    detailSkill.value = localSearchSkill(installed, skill)
    showToast(`${skill.displayName || skill.name} skill installed`)
    isDetailOpen.value = false
    emit('skills-changed')
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Failed to install skill', 'error')
  } finally {
    isInstallActionInFlight.value = false
  }
}

async function handleUninstall(skill: HubSkill): Promise<void> {
  actionSkillKey.value = `${skill.owner}/${skill.name}`
  isUninstallActionInFlight.value = true
  try {
    const resp = await fetch('/codex-api/skills-hub/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: skill.name, path: skill.path }),
    })
    const data = (await resp.json()) as { ok?: boolean; error?: string }
    if (!data.ok) throw new Error(data.error || 'Uninstall failed')
    installedSkills.value = installedSkills.value.filter((s) => s.name !== skill.name)
    showToast(`${skill.displayName || skill.name} skill uninstalled`)
    isDetailOpen.value = false
    emit('skills-changed')
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Failed to uninstall skill', 'error')
  } finally {
    isUninstallActionInFlight.value = false
  }
}

async function handleToggleEnabled(skill: HubSkill, enabled: boolean): Promise<void> {
  try {
    const resp = await fetch('/codex-api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'skills/config/write', params: { path: skill.path, enabled } }),
    })
    if (!resp.ok) throw new Error('Failed to update skill')
    await fetch('/codex-api/skills-sync/push', { method: 'POST' })
    showToast(`${skill.displayName || skill.name} skill ${enabled ? 'enabled' : 'disabled'}`)
    await fetchSkills()
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Failed to update skill', 'error')
  }
}

function handleTrySkill(skill: HubSkill): void {
  if (!skill.installed || skill.enabled === false) return
  if (props.tryInFlightKey) return
  emit('try-item', {
    kind: 'skill',
    name: skill.name,
    displayName: skill.displayName || skill.name,
    skillPath: skill.path,
  })
  isDetailOpen.value = false
}

function skillTryKey(skill: HubSkill): string {
  return `skill:${skill.name}:${skill.path ?? ''}`
}

const {
  deviceLogin,
  isPullInFlight,
  isPushInFlight,
  isStartupSyncInFlight,
  isSyncActionInFlight,
  loadSyncStatus,
  logoutGithub,
  pullSkillsSync,
  pushSkillsSync,
  startupSkillsSync,
  startGithubFirebaseLogin,
  startGithubLogin,
  syncActionError,
  syncActionStatus,
  syncStatus,
} = useGithubSkillsSync({
  showToast,
  onPulled: async () => {
    await fetchSkills()
    emit('skills-changed')
  },
})
const visibleSkillErrors = [
  computed(() => syncStatus.value.startup.lastError),
  syncActionError,
  skillSearchError,
  error,
]

onMounted(() => {
  void fetchSkills()
  void loadSyncStatus()
})

watch(visibleSkillErrors, (values, oldValues) => {
  values.forEach((value, index) => {
    if (value === oldValues[index]) return
    const message = value.trim()
    if (message) {
      recordVisibleFailure(message)
    }
  })
})
</script>

<style scoped>
@reference "tailwindcss";

.skills-hub {
  @apply flex flex-col gap-3 sm:gap-4 p-3 sm:p-6 max-w-4xl mx-auto w-full overflow-y-auto h-full;
}

.skills-hub-header {
  @apply flex flex-col gap-1;
}

.skills-hub-title {
  @apply text-xl sm:text-2xl font-semibold text-zinc-900 m-0;
}

.skills-hub-subtitle {
  @apply text-sm text-zinc-500 m-0;
}

.skills-hub-sort {
  @apply shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:border-zinc-300 cursor-pointer;
}

.skills-sync-panel {
  @apply rounded-xl border border-zinc-200 bg-zinc-50 p-3 flex flex-col gap-2;
}

.skills-sync-header {
  @apply flex flex-wrap items-center gap-2 text-sm text-zinc-700;
}

.skills-sync-badge {
  @apply text-xs rounded-md border border-zinc-300 bg-white px-2 py-0.5;
}

.skills-sync-badge-link {
  @apply text-zinc-700 hover:text-zinc-900 hover:border-zinc-400;
}

.skills-sync-device {
  @apply text-xs text-zinc-600 flex items-center gap-2 flex-wrap;
}

.skills-sync-meta {
  @apply text-xs text-zinc-600 flex items-center gap-3 flex-wrap;
}

.skills-sync-error {
  @apply flex items-start justify-between gap-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1;
}

.skills-sync-actions {
  @apply flex flex-wrap gap-2;
}

.skills-search-panel {
  @apply rounded-xl border border-zinc-200 bg-white p-3 flex flex-col gap-2;
}

.skills-search-header {
  @apply flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between;
}

.skills-search-copy {
  @apply flex flex-col gap-0.5 text-sm text-zinc-700;
}

.skills-search-copy span {
  @apply text-xs text-zinc-500;
}

.skills-directory-link {
  @apply inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900;
}

.skills-search-form {
  @apply flex flex-col gap-2 sm:flex-row;
}

.skills-search-input {
  @apply min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none placeholder-zinc-400 transition focus:border-zinc-300 focus:bg-white;
}

.skills-hub-toast {
  @apply rounded-lg px-3 py-2 text-sm font-medium;
}

.skills-hub-toast-success {
  @apply border border-emerald-200 bg-emerald-50 text-emerald-700;
}

.skills-hub-toast-error {
  @apply border border-rose-200 bg-rose-50 text-rose-700;
}

.skills-hub-section {
  @apply flex flex-col gap-2;
}

.skills-hub-section-toggle {
  @apply flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 cursor-pointer;
}

.skills-hub-section-title {
  @apply text-sm font-medium;
}

.skills-hub-section-chevron {
  @apply w-3.5 h-3.5 transition-transform;
}

.skills-hub-section-chevron.is-open {
  @apply rotate-90;
}

.skills-hub-grid {
  @apply grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3;
}

.skills-hub-loading {
  @apply text-sm text-zinc-400 py-8 text-center;
}

.skills-hub-error {
  @apply flex items-start justify-between gap-3 text-sm text-rose-600 p-4 text-left rounded-lg border border-rose-200 bg-rose-50;
}

.skills-error-feedback {
  @apply shrink-0 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}

.skills-hub-empty {
  @apply text-sm text-zinc-400 py-8 text-center;
}
</style>
