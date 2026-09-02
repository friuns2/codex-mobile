import { computed, ref } from 'vue'
import { appFetch } from '../basePath'

type ToastType = 'success' | 'error'

type SyncStartupStatus = {
  inProgress: boolean
  mode: string
  branch: string
  lastAction: string
  lastRunAtIso: string
  lastSuccessAtIso: string
  lastError: string
}

export type SkillsSyncStatus = {
  loggedIn: boolean
  githubUsername: string
  repoOwner: string
  repoName: string
  configured: boolean
  startup: SyncStartupStatus
}

type UseGithubSkillsSyncOptions = {
  showToast: (text: string, type?: ToastType) => void
  onPulled: () => Promise<void>
}

const firebaseConfig = {
  apiKey: 'AIzaSyAf0CIHBZ-wEQJ8CCUUWo1Wl9P7typ_ZPI',
  authDomain: 'gptcall-416910.firebaseapp.com',
  projectId: 'gptcall-416910',
  storageBucket: 'gptcall-416910.appspot.com',
  messagingSenderId: '99275526699',
  appId: '1:99275526699:web:3b623e1e2996108b52106e',
}

let firebaseGithubAuthLoader:
  Promise<[typeof import('firebase/app'), typeof import('firebase/auth')]> | null = null

function loadFirebaseGithubAuth() {
  if (!firebaseGithubAuthLoader) {
    firebaseGithubAuthLoader = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ])
  }
  return firebaseGithubAuthLoader
}

export function useGithubSkillsSync(options: UseGithubSkillsSyncOptions) {
  const deviceLogin = ref<{ device_code: string; user_code: string; verification_uri: string } | null>(null)
  const syncActionStatus = ref('')
  const syncActionError = ref('')
  const syncActionInFlight = ref<'pull' | 'push' | 'startup-sync' | ''>('')
  const syncStatus = ref<SkillsSyncStatus>({
    loggedIn: false,
    githubUsername: '',
    repoOwner: '',
    repoName: '',
    configured: false,
    startup: {
      inProgress: false,
      mode: 'idle',
      branch: 'main',
      lastAction: 'not-started',
      lastRunAtIso: '',
      lastSuccessAtIso: '',
      lastError: '',
    },
  })

  const isPullInFlight = computed(() => syncActionInFlight.value === 'pull')
  const isPushInFlight = computed(() => syncActionInFlight.value === 'push')
  const isStartupSyncInFlight = computed(() => syncActionInFlight.value === 'startup-sync')
  const isSyncActionInFlight = computed(() => syncActionInFlight.value !== '')

  async function loadSyncStatus(): Promise<void> {
    try {
      const resp = await appFetch('/codex-api/skills-sync/status')
      if (!resp.ok) return
      const payload = (await resp.json()) as { data?: SkillsSyncStatus }
      if (payload.data) syncStatus.value = payload.data
    } catch {
      // best effort
    }
  }

  async function startGithubLogin(): Promise<void> {
    try {
      const startResp = await appFetch('/codex-api/skills-sync/github/start-login', { method: 'POST' })
      const startData = (await startResp.json()) as { data?: { device_code: string; user_code: string; verification_uri: string; interval?: number } }
      if (!startResp.ok || !startData.data) throw new Error('Failed to start GitHub login')
      deviceLogin.value = startData.data
      const maxAttempts = 30
      const waitMs = Math.max((startData.data.interval ?? 5) * 1000, 3000)
      let loggedIn = false
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        const completeResp = await appFetch('/codex-api/skills-sync/github/complete-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: startData.data.device_code }),
        })
        const completeData = (await completeResp.json()) as { ok?: boolean; pending?: boolean; error?: string }
        if (!completeResp.ok) throw new Error(completeData.error || 'Failed to complete GitHub login')
        if (completeData.ok) {
          loggedIn = true
          break
        }
        if (!completeData.pending) throw new Error(completeData.error || 'Failed to complete GitHub login')
      }
      if (!loggedIn) throw new Error('GitHub login timed out. Please retry.')
      deviceLogin.value = null
      await loadSyncStatus()
      options.showToast('GitHub login successful')
    } catch (e) {
      options.showToast(e instanceof Error ? e.message : 'Failed GitHub login', 'error')
    }
  }

  async function startGithubFirebaseLogin(): Promise<void> {
    try {
      const [firebaseApp, firebaseAuth] = await loadFirebaseGithubAuth()
      const { getApp, getApps, initializeApp } = firebaseApp
      const { getAuth, GithubAuthProvider, signInWithPopup } = firebaseAuth
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
      const auth = getAuth(app)
      const provider = new GithubAuthProvider()
      provider.addScope('repo')
      const result = await signInWithPopup(auth, provider)
      const credential = GithubAuthProvider.credentialFromResult(result)
      const token = credential?.accessToken ?? ''
      if (!token) {
        throw new Error('GitHub access token missing from Firebase login')
      }
      const resp = await appFetch('/codex-api/skills-sync/github/token-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await resp.json()) as { ok?: boolean; error?: string }
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Failed to login with GitHub token')
      }
      await loadSyncStatus()
      options.showToast('GitHub login successful')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed Firebase GitHub login'
      options.showToast(message, 'error')
    }
  }

  async function pullSkillsSync(): Promise<void> {
    syncActionError.value = ''
    syncActionStatus.value = 'pull-started'
    syncActionInFlight.value = 'pull'
    try {
      const resp = await appFetch('/codex-api/skills-sync/pull', { method: 'POST' })
      const data = (await resp.json()) as { ok?: boolean; error?: string }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to pull synced skills')
      await options.onPulled()
      syncActionStatus.value = 'pull-success'
      options.showToast(syncStatus.value.loggedIn ? 'Pulled skills from private sync repo' : 'Pulled skills from upstream repo')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to pull sync'
      syncActionError.value = message
      syncActionStatus.value = 'pull-failed'
      options.showToast(message, 'error')
    } finally {
      syncActionInFlight.value = ''
    }
  }

  async function pushSkillsSync(): Promise<void> {
    syncActionError.value = ''
    syncActionStatus.value = 'push-started'
    syncActionInFlight.value = 'push'
    try {
      const resp = await appFetch('/codex-api/skills-sync/push', { method: 'POST' })
      const data = (await resp.json()) as { ok?: boolean; error?: string }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to push synced skills')
      syncActionStatus.value = 'push-success'
      options.showToast('Pushed skills to private sync repo')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to push sync'
      syncActionError.value = message
      syncActionStatus.value = 'push-failed'
      options.showToast(message, 'error')
    } finally {
      syncActionInFlight.value = ''
    }
  }

  async function startupSkillsSync(): Promise<void> {
    syncActionError.value = ''
    syncActionStatus.value = 'startup-sync-started'
    syncActionInFlight.value = 'startup-sync'
    try {
      const resp = await appFetch('/codex-api/skills-sync/startup-sync', { method: 'POST' })
      const data = (await resp.json()) as { ok?: boolean; error?: string }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to run startup sync')
      await options.onPulled()
      await loadSyncStatus()
      syncActionStatus.value = 'startup-sync-success'
      options.showToast('Startup sync completed')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed startup sync'
      syncActionError.value = message
      syncActionStatus.value = 'startup-sync-failed'
      options.showToast(message, 'error')
    } finally {
      syncActionInFlight.value = ''
    }
  }

  async function logoutGithub(): Promise<void> {
    try {
      const resp = await appFetch('/codex-api/skills-sync/github/logout', { method: 'POST' })
      const data = (await resp.json()) as { ok?: boolean; error?: string }
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to logout GitHub')
      await loadSyncStatus()
      options.showToast('Logged out from GitHub')
    } catch (e) {
      options.showToast(e instanceof Error ? e.message : 'Failed to logout GitHub', 'error')
    }
  }

  return {
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
  }
}
