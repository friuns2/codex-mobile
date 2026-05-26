<template>
  <section class="review-pane" :class="{ 'is-mobile': isMobile }" @pointerdown.stop @click.stop>
    <header class="review-pane-header">
      <div class="review-pane-heading">
        <p class="review-pane-eyebrow">{{ t('Review') }}</p>
        <p class="review-pane-title">{{ headerTitle }}</p>
      </div>
      <div class="review-pane-header-actions">
        <button
          v-if="isMobile && snapshot?.files.length"
          type="button"
          class="review-pane-mobile-files-button"
          @click="isFileSheetOpen = true"
        >
          {{ t('Files') }}
        </button>
        <button type="button" class="review-pane-close" :aria-label="t('Close review pane')" @click="$emit('close')">
          <IconTablerX class="icon-svg" />
        </button>
      </div>
    </header>

    <div class="review-pane-toolbar">
      <div class="review-pane-toolbar-controls">
        <div v-if="!isCommitReview" class="review-pane-control-cluster">
          <span class="review-pane-control-label">{{ t('Compare') }}</span>
          <div class="review-pane-segmented">
            <button
              type="button"
              class="review-pane-segmented-button review-pane-scope"
              :data-active="activeScope === 'workspace'"
              @click="activeScope = 'workspace'"
            >
              {{ t('Workspace') }}
            </button>
            <button
              type="button"
              class="review-pane-segmented-button review-pane-scope"
              :data-active="activeScope === 'baseBranch'"
              :disabled="!snapshot?.baseBranch"
              @click="activeScope = 'baseBranch'"
            >
              {{ t('Base branch') }}
            </button>
          </div>
        </div>

        <div v-if="!isCommitReview && activeScope === 'baseBranch' && snapshot?.baseBranchOptions.length" class="review-pane-control-cluster">
          <span class="review-pane-control-label">{{ t('Branch') }}</span>
          <ComposerDropdown
            v-model="selectedBaseBranch"
            class="review-pane-branch-dropdown"
            :options="baseBranchDropdownOptions"
            :placeholder="t('Branch')"
            enable-search
            :search-placeholder="t('Search branches...')"
          />
        </div>

        <div v-if="!isCommitReview && activeScope === 'workspace'" class="review-pane-control-cluster">
          <span class="review-pane-control-label">{{ t('Changes') }}</span>
          <div class="review-pane-segmented">
            <button
              type="button"
              class="review-pane-segmented-button review-pane-view"
              :data-active="workspaceView === 'unstaged'"
              @click="workspaceView = 'unstaged'"
            >
              {{ t('Unstaged') }}
            </button>
            <button
              type="button"
              class="review-pane-segmented-button review-pane-view"
              :data-active="workspaceView === 'staged'"
              @click="workspaceView = 'staged'"
            >
              {{ t('Staged') }}
            </button>
          </div>
        </div>
      </div>

      <div class="review-pane-toolbar-actions">
        <button type="button" class="review-pane-refresh" :disabled="isLoadingSnapshot" @click="reloadAll">
          {{ t('Refresh') }}
        </button>
      </div>
    </div>

    <div v-if="reviewBannerText" class="review-pane-banner" :class="{ 'is-error': reviewBannerIsError }">
      {{ reviewBannerText }}
    </div>

    <div v-if="snapshot" class="review-pane-meta">
      <span>{{ snapshot.summary.fileCount }} {{ t('files') }}</span>
      <span class="review-pane-summary-pill review-pane-summary-pill-add">+{{ snapshot.summary.addedLineCount }}</span>
      <span class="review-pane-summary-pill review-pane-summary-pill-remove">-{{ snapshot.summary.removedLineCount }}</span>
      <span v-if="snapshot.headBranch">{{ snapshot.headBranch }}</span>
      <span v-if="isCommitReview && snapshot.commitSha">{{ shortCommitSha(snapshot.commitSha) }}</span>
      <span v-if="!isCommitReview && activeScope === 'baseBranch' && snapshot.baseBranch">vs {{ snapshot.baseBranch }}</span>
    </div>

    <div class="review-pane-content">
      <template v-if="!snapshot">
        <div class="review-pane-empty">
          <p class="review-pane-empty-title">{{ t('Loading review state') }}</p>
        </div>
      </template>

      <template v-else-if="!snapshot.isGitRepo">
        <div class="review-pane-empty">
          <p class="review-pane-empty-title">{{ t('This folder is not a Git repository') }}</p>
          <p class="review-pane-empty-text">{{ t('Initialize Git to review local changes and run Codex review.') }}</p>
          <button type="button" class="review-pane-primary-cta" :disabled="isInitializingGit" @click="initializeGit">
            {{ isInitializingGit ? t('Initializing…') : t('Initialize Git') }}
          </button>
        </div>
      </template>

      <template v-else-if="!isCommitReview && activeScope === 'baseBranch' && !snapshot.baseBranch">
        <div class="review-pane-empty">
          <p class="review-pane-empty-title">{{ t('Base branch unavailable') }}</p>
          <p class="review-pane-empty-text">{{ t('Could not resolve `origin/HEAD`, `main`, or `master` for this repository.') }}</p>
        </div>
      </template>

      <template v-else>
        <div v-if="showBulkActions" class="review-pane-bulk-actions">
          <button
            v-for="action in bulkActions"
            :key="action.value"
            type="button"
            class="review-pane-bulk-button"
            :disabled="isApplyingAction"
            @click="applyBulkAction(action.value)"
          >
            {{ action.label }}
          </button>
        </div>

        <div v-if="!snapshot.files.length" class="review-pane-empty">
          <p class="review-pane-empty-title">{{ t('No changes in this scope') }}</p>
          <p class="review-pane-empty-text">
            {{ emptyReviewMessage }}
          </p>
        </div>

        <div v-else class="review-pane-main" :style="reviewMainStyle">
          <aside v-if="!isMobile" class="review-pane-file-list">
            <template v-for="node in visibleFileTreeNodes" :key="node.treeKey">
              <button
                v-if="node.kind === 'folder'"
                type="button"
                class="review-pane-tree-folder"
                :style="treeIndentStyle(node.depth)"
                :data-expanded="isFolderExpanded(node.id)"
                @click="toggleFolder(node.id)"
              >
                <span class="review-pane-tree-caret" :data-expanded="isFolderExpanded(node.id)"></span>
                <span class="review-pane-tree-folder-name">{{ node.name }}</span>
                <span class="review-pane-tree-folder-count">{{ node.fileCount }}</span>
              </button>

              <button
                v-else
                type="button"
                class="review-pane-file review-pane-tree-file"
                :style="treeFileIndentStyle()"
                :data-active="selectedFile?.id === node.file.id"
                :title="node.file.path"
                @click="selectFile(node.file.id)"
              >
                <span class="review-pane-file-meta-row">
                  <span class="review-pane-file-path">
                    {{ node.name }}
                    <template v-if="node.file.previousPath"> ← {{ fileBaseName(node.file.previousPath) }}</template>
                  </span>
                  <span class="review-pane-file-delta">
                    <span class="review-pane-delta-add">+{{ node.file.addedLineCount }}</span>
                    <span class="review-pane-delta-separator">/</span>
                    <span class="review-pane-delta-remove">-{{ node.file.removedLineCount }}</span>
                  </span>
                </span>
                <span class="review-pane-file-op" :data-operation="node.file.operation">{{ formatOperation(node.file.operation) }}</span>
              </button>
            </template>
          </aside>

          <div
            v-if="!isMobile"
            class="review-pane-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file list"
            @pointerdown="onResizerPointerDown"
          ></div>

          <section class="review-pane-diff">
            <template v-if="selectedFile">
              <div class="review-pane-file-header">
                <div class="review-pane-file-header-main">
                  <p class="review-pane-file-title">
                    {{ selectedFile.path }}
                    <template v-if="selectedFile.previousPath"> ← {{ selectedFile.previousPath }}</template>
                  </p>
                  <p class="review-pane-file-subtitle">
                    {{ formatOperation(selectedFile.operation) }} · +{{ selectedFile.addedLineCount }} / -{{ selectedFile.removedLineCount }}
                  </p>
                </div>
                <div v-if="showRowActions" class="review-pane-row-actions">
                  <button
                    v-for="action in fileActions"
                    :key="`${selectedFile.id}:${action.value}`"
                    type="button"
                    class="review-pane-row-button"
                    :disabled="isApplyingAction"
                    @click="applyFileAction(action.value, selectedFile)"
                  >
                    {{ action.label }}
                  </button>
                </div>
              </div>

              <div v-if="selectedFile.hunks.length === 0" class="review-pane-raw-diff">
                <pre>{{ selectedFile.diff || 'No unified diff available.' }}</pre>
              </div>

              <div v-else class="review-pane-hunks">
                <article
                  v-for="hunk in selectedFile.hunks"
                  :key="hunk.id"
                  class="review-pane-hunk"
                  :data-active="selectedHunkId === hunk.id"
                  @click="selectedHunkId = hunk.id"
                >
                  <div class="review-pane-hunk-header">
                    <div>
                      <p class="review-pane-hunk-title">{{ hunk.header }}</p>
                      <p class="review-pane-hunk-meta">+{{ hunk.addedLineCount }} / -{{ hunk.removedLineCount }}</p>
                    </div>
                    <div v-if="showRowActions" class="review-pane-row-actions">
                      <button
                        v-for="action in hunkActions"
                        :key="`${hunk.id}:${action.value}`"
                        type="button"
                        class="review-pane-row-button"
                        :disabled="isApplyingAction"
                        @click="applyHunkAction(action.value, hunk)"
                      >
                        {{ action.label }}
                      </button>
                    </div>
                  </div>

                  <div class="review-pane-lines">
                    <div
                      v-for="line in hunk.lines"
                      :key="line.key"
                      class="review-pane-line"
                      :data-kind="line.kind"
                    >
                      <span class="review-pane-line-number">{{ line.oldLine ?? '' }}</span>
                      <span class="review-pane-line-number">{{ line.newLine ?? '' }}</span>
                      <span class="review-pane-line-marker">{{ lineMarker(line.kind) }}</span>
                      <code class="review-pane-line-code">{{ line.text || ' ' }}</code>
                    </div>
                  </div>
                </article>
              </div>
            </template>
          </section>
        </div>
      </template>
    </div>

    <Transition name="review-pane-sheet">
      <div
        v-if="isMobile && isFileSheetOpen && snapshot?.files.length"
        class="review-pane-sheet-backdrop"
        @click="isFileSheetOpen = false"
      >
        <div class="review-pane-sheet" @click.stop>
          <div class="review-pane-sheet-handle" aria-hidden="true"></div>
          <div class="review-pane-sheet-header">
            <p class="review-pane-sheet-title">Changed files</p>
            <p class="review-pane-sheet-count">{{ snapshot.files.length }}</p>
          </div>
          <div class="review-pane-sheet-list">
            <template v-for="node in visibleFileTreeNodes" :key="`sheet:${node.treeKey}`">
              <button
                v-if="node.kind === 'folder'"
                type="button"
                class="review-pane-tree-folder review-pane-tree-folder-sheet"
                :style="treeIndentStyle(node.depth)"
                :data-expanded="isFolderExpanded(node.id)"
                @click="toggleFolder(node.id)"
              >
                <span class="review-pane-tree-caret" :data-expanded="isFolderExpanded(node.id)"></span>
                <span class="review-pane-tree-folder-name">{{ node.name }}</span>
                <span class="review-pane-tree-folder-count">{{ node.fileCount }}</span>
              </button>

              <button
                v-else
                type="button"
                class="review-pane-file review-pane-tree-file"
                :style="treeFileIndentStyle()"
                :data-active="selectedFile?.id === node.file.id"
                :title="node.file.path"
                @click="selectFile(node.file.id)"
              >
                <span class="review-pane-file-meta-row">
                  <span class="review-pane-file-path">
                    {{ node.name }}
                    <template v-if="node.file.previousPath"> ← {{ fileBaseName(node.file.previousPath) }}</template>
                  </span>
                  <span class="review-pane-file-delta">
                    <span class="review-pane-delta-add">+{{ node.file.addedLineCount }}</span>
                    <span class="review-pane-delta-separator">/</span>
                    <span class="review-pane-delta-remove">-{{ node.file.removedLineCount }}</span>
                  </span>
                </span>
                <span class="review-pane-file-op" :data-operation="node.file.operation">{{ formatOperation(node.file.operation) }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  applyReviewAction,
  getReviewSnapshot,
  initializeReviewGit,
  subscribeCodexNotifications,
  type RpcNotification,
} from '../../api/codexGateway'
import { useMobile } from '../../composables/useMobile'
import { useUiLanguage } from '../../composables/useUiLanguage'
import type {
  UiReviewAction,
  UiReviewScope,
  UiReviewSnapshot,
  UiReviewWorkspaceView,
  UiReviewFile,
  UiReviewHunk,
} from '../../types/codex'
import IconTablerX from '../icons/IconTablerX.vue'
import ComposerDropdown from './ComposerDropdown.vue'

const props = defineProps<{
  threadId: string
  cwd: string
  isThreadInProgress: boolean
  initialFilePath?: string
  commitSha?: string
}>()

defineEmits<{
  close: []
}>()

const { isMobile } = useMobile()
const { t } = useUiLanguage()

const activeScope = ref<UiReviewScope>('workspace')
const workspaceView = ref<UiReviewWorkspaceView>('unstaged')
const snapshot = ref<UiReviewSnapshot | null>(null)
const selectedBaseBranch = ref('')
const isSyncingBaseBranch = ref(false)
const selectedFileId = ref('')
const selectedHunkId = ref('')
const isFileSheetOpen = ref(false)
const isLoadingSnapshot = ref(false)
const isApplyingAction = ref(false)
const isInitializingGit = ref(false)
const snapshotError = ref('')
const reviewError = ref('')
const reviewStatusLabel = ref('')
let stopNotifications: (() => void) | null = null
let stopResizeTracking: (() => void) | null = null

type ReviewTreeFolderNode = {
  kind: 'folder'
  treeKey: string
  id: string
  name: string
  depth: number
  fileCount: number
}

type ReviewTreeFileNode = {
  kind: 'file'
  treeKey: string
  id: string
  name: string
  depth: number
  file: UiReviewFile
}

type ReviewTreeNode = ReviewTreeFolderNode | ReviewTreeFileNode

type MutableReviewTreeFile = {
  file: UiReviewFile
  name: string
  depth: number
}

type MutableReviewTreeFolder = {
  id: string
  name: string
  depth: number
  folders: Map<string, MutableReviewTreeFolder>
  files: MutableReviewTreeFile[]
}

const selectedFile = computed(() => snapshot.value?.files.find((file) => file.id === selectedFileId.value) ?? snapshot.value?.files[0] ?? null)
const folderExpansionState = ref<Record<string, boolean>>({})
const isCommitReview = computed(() => Boolean(props.commitSha?.trim()))
const baseBranchDropdownOptions = computed(() => {
  return (snapshot.value?.baseBranchOptions ?? []).map((branch) => ({ value: branch, label: branch }))
})
const emptyReviewMessage = computed(() => {
  if (snapshot.value?.scope === 'commit' || isCommitReview.value) {
    return t('No file changes in this commit.')
  }
  return activeScope.value === 'workspace'
    ? t('Your current workspace is clean.')
    : t('No merge diff found against the base branch.')
})

function normalizeReviewPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/')
}

function findFileByPath(filePath: string): UiReviewFile | null {
  const targetPath = normalizeReviewPath(filePath)
  if (!targetPath || !snapshot.value) return null
  return snapshot.value.files.find((file) => {
    return [
      file.path,
      file.absolutePath,
      file.previousPath,
      file.previousAbsolutePath,
    ].some((candidate) => typeof candidate === 'string' && normalizeReviewPath(candidate) === targetPath)
  }) ?? null
}

function selectInitialFilePath(): boolean {
  const targetFile = findFileByPath(props.initialFilePath ?? '')
  if (!targetFile) return false
  selectFile(targetFile.id)
  return true
}

const headerTitle = computed(() => {
  if (!snapshot.value?.isGitRepo) return t('Repository review')
  if (isCommitReview.value) {
    return snapshot.value.commitSha ? `${t('Commit')} ${shortCommitSha(snapshot.value.commitSha)}` : t('Commit')
  }
  if (activeScope.value === 'workspace') {
    return workspaceView.value === 'staged' ? t('Staged changes') : t('Workspace changes')
  }
  return snapshot.value?.baseBranch ? `${t('Against')} ${snapshot.value.baseBranch}` : t('Base branch')
})

const showBulkActions = computed(() => (
  !isCommitReview.value
  && activeScope.value === 'workspace'
  && snapshot.value?.isGitRepo === true
  && snapshot.value.files.length > 0
))

const showRowActions = computed(() => showBulkActions.value && !isApplyingAction.value)

const bulkActions = computed(() => {
  if (workspaceView.value === 'staged') {
    return [{ value: 'unstage' as UiReviewAction, label: t('Unstage all') }]
  }
  return [
    { value: 'stage' as UiReviewAction, label: t('Stage all') },
    { value: 'revert' as UiReviewAction, label: t('Revert all') },
  ]
})

const fileActions = computed(() => {
  if (workspaceView.value === 'staged') {
    return [{ value: 'unstage' as UiReviewAction, label: t('Unstage file') }]
  }
  return [
    { value: 'stage' as UiReviewAction, label: t('Stage file') },
    { value: 'revert' as UiReviewAction, label: t('Revert file') },
  ]
})

const hunkActions = computed(() => {
  if (workspaceView.value === 'staged') {
    return [{ value: 'unstage' as UiReviewAction, label: t('Unstage hunk') }]
  }
  return [
    { value: 'stage' as UiReviewAction, label: t('Stage hunk') },
    { value: 'revert' as UiReviewAction, label: t('Revert hunk') },
  ]
})

const reviewBannerText = computed(() => (
  reviewError.value
  || snapshotError.value
  || reviewStatusLabel.value
))
const reviewBannerIsError = computed(() => Boolean(reviewError.value || snapshotError.value))
const REVIEW_FILE_LIST_WIDTH_KEY = 'codex-web-local.review-pane-file-list-width.v1'
const MIN_FILE_LIST_WIDTH = 220
const MAX_FILE_LIST_WIDTH = 420
const DEFAULT_FILE_LIST_WIDTH = 288
const fileListWidth = ref(loadFileListWidth())

const reviewMainStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (!isMobile.value) {
    style['--review-file-list-width'] = `${fileListWidth.value}px`
  }
  return style
})

const fileTreeData = computed(() => buildVisibleFileTree(snapshot.value?.files ?? [], folderExpansionState.value))
const visibleFileTreeNodes = computed(() => fileTreeData.value.nodes)
const fileTreeFolderIdsByFileId = computed(() => fileTreeData.value.folderIdsByFileId)

function clampFileListWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FILE_LIST_WIDTH
  return Math.min(MAX_FILE_LIST_WIDTH, Math.max(MIN_FILE_LIST_WIDTH, Math.round(value)))
}

function loadFileListWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_FILE_LIST_WIDTH
  const raw = window.localStorage.getItem(REVIEW_FILE_LIST_WIDTH_KEY)
  const parsed = raw ? Number(raw) : Number.NaN
  return clampFileListWidth(parsed)
}

function persistFileListWidth(value: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(REVIEW_FILE_LIST_WIDTH_KEY, String(clampFileListWidth(value)))
}

function onResizerPointerDown(event: PointerEvent): void {
  if (isMobile.value) return
  event.preventDefault()
  stopResizeTracking?.()
  const startX = event.clientX
  const startWidth = fileListWidth.value

  const handleMove = (moveEvent: PointerEvent) => {
    fileListWidth.value = clampFileListWidth(startWidth + (moveEvent.clientX - startX))
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    stopResizeTracking = null
  }

  const handleUp = () => {
    cleanup()
    persistFileListWidth(fileListWidth.value)
  }

  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
  stopResizeTracking = cleanup
}

function lineMarker(kind: string): string {
  if (kind === 'add') return '+'
  if (kind === 'remove') return '-'
  if (kind === 'hunk') return '@@'
  return ' '
}

function fileBaseName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function sortTreeEntries(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function buildVisibleFileTree(
  files: UiReviewFile[],
  expansionState: Record<string, boolean>,
): {
  nodes: ReviewTreeNode[]
  folderIdsByFileId: Record<string, string[]>
} {
  const root: MutableReviewTreeFolder = {
    id: '',
    name: '',
    depth: -1,
    folders: new Map(),
    files: [],
  }
  const folderIdsByFileId: Record<string, string[]> = {}

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    const fileName = segments.pop() ?? file.path
    let currentFolder = root
    let folderPath = ''
    const parentFolderIds: string[] = []

    for (const [index, segment] of segments.entries()) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment
      let nextFolder = currentFolder.folders.get(segment)
      if (!nextFolder) {
        nextFolder = {
          id: folderPath,
          name: segment,
          depth: index,
          folders: new Map(),
          files: [],
        }
        currentFolder.folders.set(segment, nextFolder)
      }
      currentFolder = nextFolder
      parentFolderIds.push(nextFolder.id)
    }

    currentFolder.files.push({
      file,
      name: fileName,
      depth: segments.length,
    })
    folderIdsByFileId[file.id] = parentFolderIds
  }

  const nodes: ReviewTreeNode[] = []
  const countFiles = (folder: MutableReviewTreeFolder): number => (
    folder.files.length + Array.from(folder.folders.values()).reduce((sum, child) => sum + countFiles(child), 0)
  )

  const visitFolder = (folder: MutableReviewTreeFolder) => {
    const childFolders = Array.from(folder.folders.values()).sort((left, right) => sortTreeEntries(left.name, right.name))
    const childFiles = [...folder.files].sort((left, right) => sortTreeEntries(left.name, right.name))

    for (const childFolder of childFolders) {
      nodes.push({
        kind: 'folder',
        treeKey: `folder:${childFolder.id}`,
        id: childFolder.id,
        name: childFolder.name,
        depth: childFolder.depth,
        fileCount: countFiles(childFolder),
      })
      if (expansionState[childFolder.id] !== false) {
        visitFolder(childFolder)
      }
    }

    for (const childFile of childFiles) {
      nodes.push({
        kind: 'file',
        treeKey: `file:${childFile.file.id}`,
        id: childFile.file.id,
        name: childFile.name,
        depth: childFile.depth,
        file: childFile.file,
      })
    }
  }

  visitFolder(root)
  return { nodes, folderIdsByFileId }
}

function isFolderExpanded(folderId: string): boolean {
  return folderExpansionState.value[folderId] !== false
}

function toggleFolder(folderId: string): void {
  folderExpansionState.value = {
    ...folderExpansionState.value,
    [folderId]: !isFolderExpanded(folderId),
  }
}

function expandFileAncestors(fileId: string): void {
  const folderIds = fileTreeFolderIdsByFileId.value[fileId] ?? []
  if (folderIds.length === 0) return
  const nextState = { ...folderExpansionState.value }
  let changed = false
  for (const folderId of folderIds) {
    if (nextState[folderId] === false) {
      nextState[folderId] = true
      changed = true
    }
  }
  if (changed) {
    folderExpansionState.value = nextState
  }
}

function treeIndentStyle(depth: number): Record<string, string> {
  const base = isMobile.value ? 8 : 10
  const step = isMobile.value ? 12 : 14
  return {
    paddingLeft: `${base + (depth * step)}px`,
  }
}

function treeFileIndentStyle(): Record<string, string> {
  return {
    paddingLeft: isMobile.value ? '8px' : '10px',
  }
}

function formatOperation(operation: string): string {
  if (operation === 'add') return 'Added'
  if (operation === 'delete') return 'Deleted'
  if (operation === 'rename') return 'Renamed'
  return 'Modified'
}

function extractNotificationThreadId(notification: RpcNotification): string {
  const params = notification.params !== null && typeof notification.params === 'object' && !Array.isArray(notification.params)
    ? notification.params as Record<string, unknown>
    : null
  return typeof params?.threadId === 'string' ? params.threadId : ''
}

async function loadSnapshot(): Promise<void> {
  if (!props.cwd.trim()) return
  isLoadingSnapshot.value = true
  snapshotError.value = ''
  try {
    const desiredBaseBranch = activeScope.value === 'baseBranch' ? selectedBaseBranch.value.trim() : ''
    const desiredCommitSha = props.commitSha?.trim() ?? ''
    const nextSnapshot = await getReviewSnapshot(
      props.cwd,
      isCommitReview.value ? 'commit' : activeScope.value,
      workspaceView.value,
      desiredBaseBranch || null,
      desiredCommitSha || null,
    )
    if (nextSnapshot.baseBranchOptions.length > 0) {
      const normalizedBaseBranch = nextSnapshot.baseBranch ?? nextSnapshot.baseBranchOptions[0] ?? ''
      if (selectedBaseBranch.value !== normalizedBaseBranch) {
        isSyncingBaseBranch.value = true
        selectedBaseBranch.value = normalizedBaseBranch
      }
    } else {
      if (selectedBaseBranch.value !== '') {
        isSyncingBaseBranch.value = true
        selectedBaseBranch.value = ''
      }
    }
    snapshot.value = nextSnapshot
    const hasSelectedFile = nextSnapshot.files.some((file) => file.id === selectedFileId.value)
    if (!selectInitialFilePath() && !hasSelectedFile) {
      selectedFileId.value = nextSnapshot.files[0]?.id ?? ''
      selectedHunkId.value = nextSnapshot.files[0]?.hunks[0]?.id ?? ''
    }
  } catch (error) {
    snapshotError.value = error instanceof Error ? error.message : 'Failed to load review snapshot'
  } finally {
    isLoadingSnapshot.value = false
  }
}

async function reloadAll(): Promise<void> {
  await loadSnapshot()
}

function selectFile(fileId: string): void {
  expandFileAncestors(fileId)
  selectedFileId.value = fileId
  const file = snapshot.value?.files.find((entry) => entry.id === fileId) ?? null
  selectedHunkId.value = file?.hunks[0]?.id ?? ''
  if (isMobile.value) {
    isFileSheetOpen.value = false
  }
}

function shortCommitSha(value: string): string {
  return value.trim().slice(0, 7)
}

async function applyAction(action: UiReviewAction, level: 'all' | 'file' | 'hunk', patch = ''): Promise<void> {
  if (!snapshot.value) return
  isApplyingAction.value = true
  reviewError.value = ''
  try {
    const nextSnapshot = await applyReviewAction({
      cwd: props.cwd,
      scope: activeScope.value,
      workspaceView: workspaceView.value,
      action,
      level,
      patch,
    })
    snapshot.value = nextSnapshot
    const hasSelectedFile = nextSnapshot.files.some((file) => file.id === selectedFileId.value)
    if (!hasSelectedFile) {
      selectedFileId.value = nextSnapshot.files[0]?.id ?? ''
      selectedHunkId.value = nextSnapshot.files[0]?.hunks[0]?.id ?? ''
    }
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : 'Failed to apply review action'
  } finally {
    isApplyingAction.value = false
  }
}

async function applyBulkAction(action: UiReviewAction): Promise<void> {
  await applyAction(action, 'all')
}

async function applyFileAction(action: UiReviewAction, file: UiReviewFile): Promise<void> {
  await applyAction(action, 'file', file.diff)
}

async function applyHunkAction(action: UiReviewAction, hunk: UiReviewHunk): Promise<void> {
  selectedHunkId.value = hunk.id
  await applyAction(action, 'hunk', hunk.patch)
}

async function initializeGit(): Promise<void> {
  if (!props.cwd.trim()) return
  isInitializingGit.value = true
  reviewError.value = ''
  try {
    await initializeReviewGit(props.cwd)
    await loadSnapshot()
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : 'Failed to initialize Git'
  } finally {
    isInitializingGit.value = false
  }
}

function handleNotification(notification: RpcNotification): void {
  if (extractNotificationThreadId(notification) !== props.threadId) return
  const params = notification.params !== null && typeof notification.params === 'object' && !Array.isArray(notification.params)
    ? notification.params as Record<string, unknown>
    : null
  const item = params?.item !== null && typeof params?.item === 'object' && !Array.isArray(params.item)
    ? params.item as Record<string, unknown>
    : null
  const itemType = typeof item?.type === 'string' ? item.type : ''

  if (notification.method === 'item/started' && itemType === 'enteredReviewMode') {
    reviewStatusLabel.value = typeof item?.review === 'string' ? item.review : 'Review in progress'
    return
  }

  if (notification.method === 'item/completed' && itemType === 'exitedReviewMode') {
    reviewStatusLabel.value = ''
  }
}

watch(
  () => [props.threadId, props.cwd, props.commitSha] as const,
  () => {
    if (isCommitReview.value) activeScope.value = 'workspace'
    selectedFileId.value = ''
    selectedHunkId.value = ''
    reviewError.value = ''
    reviewStatusLabel.value = ''
    void reloadAll()
  },
  { immediate: true },
)

watch(
  () => [props.initialFilePath, props.commitSha] as const,
  () => {
    selectInitialFilePath()
  },
)

watch(
  () => [activeScope.value, workspaceView.value] as const,
  () => {
    selectedFileId.value = ''
    selectedHunkId.value = ''
    reviewError.value = ''
    snapshotError.value = ''
    void loadSnapshot()
  },
)

watch(selectedBaseBranch, (branch, previous) => {
  if (isSyncingBaseBranch.value) {
    isSyncingBaseBranch.value = false
    return
  }
  if (activeScope.value !== 'baseBranch') return
  if (!branch || branch === previous) return
  void loadSnapshot()
})

watch(selectedFile, (file) => {
  if (!file) return
  expandFileAncestors(file.id)
  if (!file.hunks.some((hunk) => hunk.id === selectedHunkId.value)) {
    selectedHunkId.value = file.hunks[0]?.id ?? ''
  }
})

onMounted(() => {
  stopNotifications = subscribeCodexNotifications(handleNotification)
})

onBeforeUnmount(() => {
  if (stopNotifications) {
    stopNotifications()
    stopNotifications = null
  }
  stopResizeTracking?.()
})
</script>

<style scoped>
@reference "tailwindcss";

.review-pane {
  @apply fixed inset-3 z-[1200] flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl;
}

.review-pane.is-mobile {
  @apply inset-0 rounded-none border-0;
}

.review-pane-header {
  @apply flex items-start justify-between gap-3 border-b border-zinc-200 px-3 py-2.5;
}

.review-pane-heading {
  @apply min-w-0 flex-1;
}

.review-pane-eyebrow {
  @apply m-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400;
}

.review-pane-title {
  @apply m-0 truncate text-sm font-medium text-zinc-900;
}

.review-pane-header-actions {
  @apply flex shrink-0 items-center gap-2;
}

.review-pane-close,
.review-pane-mobile-files-button,
.review-pane-refresh,
.review-pane-bulk-button,
.review-pane-row-button,
.review-pane-primary-cta {
  @apply rounded-full border border-zinc-200 bg-white px-2.5 py-1.25 text-[11px] text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-50;
}

.review-pane-close {
  @apply flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full p-0;
}

.review-pane-toolbar {
  @apply flex flex-col gap-2 border-b border-zinc-100 px-3 py-2.5;
}

.review-pane-toolbar-controls {
  @apply flex flex-wrap items-center gap-2;
}

.review-pane-control-cluster {
  @apply flex min-w-0 items-center gap-1.5;
}

.review-pane-control-label {
  @apply shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-400;
}

.review-pane-branch-dropdown {
  @apply min-w-[9rem];
}

.review-pane-branch-dropdown :deep(.composer-dropdown-trigger) {
  @apply min-h-7 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm;
}

.review-pane-branch-dropdown :deep(.composer-dropdown-value) {
  @apply max-w-36;
}

.review-pane-segmented {
  @apply inline-flex min-w-0 items-center gap-1 rounded-full bg-zinc-100 p-1;
}

.review-pane-segmented-button {
  @apply relative min-w-0 rounded-full border border-transparent px-2.5 py-1.25 text-[11px] font-medium text-zinc-500 transition-colors;
}

.review-pane-segmented-button::before {
  content: '';
  @apply mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-zinc-300 align-middle transition-colors;
}

.review-pane-segmented-button[data-active='true'] {
  @apply border-sky-200 bg-sky-600 text-white shadow-sm;
}

.review-pane-segmented-button[data-active='true']::before {
  @apply bg-white;
}

.review-pane-segmented-button:disabled {
  @apply opacity-45;
}

.review-pane-toolbar-actions {
  @apply flex shrink-0 items-center gap-1.5;
}

.review-pane-refresh {
  @apply border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100;
}

.review-pane-banner {
  @apply mx-3 mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800;
}

.review-pane-banner.is-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.review-pane-meta {
  @apply flex flex-wrap items-center gap-1.5 px-3 pt-2.5 text-[11px] text-zinc-500;
}

.review-pane-meta span {
  @apply rounded-full bg-zinc-100 px-2 py-1;
}

.review-pane-summary-pill.review-pane-summary-pill-add {
  @apply bg-emerald-100 text-emerald-700;
}

.review-pane-summary-pill.review-pane-summary-pill-remove {
  @apply bg-rose-100 text-rose-700;
}

.review-pane-content {
  @apply min-h-0 flex-1 overflow-hidden;
}

.review-pane-bulk-actions {
  @apply flex flex-nowrap gap-1.5 overflow-x-auto border-b border-zinc-100 px-3 py-2.5;
}

.review-pane-main {
  @apply grid h-full min-h-0 grid-cols-[var(--review-file-list-width,18rem)_0.5rem_minmax(0,1fr)];
}

.review-pane-file-list {
  @apply hidden min-w-0 overflow-y-auto border-r border-zinc-100 bg-zinc-50/60 p-2 md:flex md:flex-col md:gap-1.5;
  container-type: inline-size;
}

.review-pane-tree-folder {
  @apply flex w-full items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-left text-[12px] font-medium text-zinc-600 transition hover:bg-white hover:text-zinc-900;
}

.review-pane-tree-folder[data-expanded='false'] {
  @apply text-zinc-500;
}

.review-pane-tree-folder-sheet {
  @apply rounded-md bg-zinc-50/80;
}

.review-pane-tree-caret {
  @apply relative h-3.5 w-3.5 shrink-0;
}

.review-pane-tree-caret::before {
  content: '';
  @apply absolute left-1 top-1 h-0 w-0 border-y-[4px] border-l-[5px] border-y-transparent border-l-current transition-transform;
}

.review-pane-tree-caret[data-expanded='true']::before {
  transform: rotate(90deg);
  transform-origin: 2px 4px;
}

.review-pane-tree-folder-name {
  @apply min-w-0 flex-1 truncate;
}

.review-pane-tree-folder-count {
  @apply shrink-0 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500;
}

.review-pane-resizer {
  @apply relative hidden cursor-col-resize bg-zinc-100 md:block;
}

.review-pane-resizer::before {
  content: '';
  @apply absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-300 transition-colors;
}

.review-pane-resizer:hover::before {
  @apply bg-sky-500;
}

.review-pane-file {
  @apply flex w-full flex-col gap-0.75 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-zinc-200 hover:bg-white;
}

.review-pane-tree-file {
  @apply rounded-lg px-2 py-1.75;
}

.review-pane-file-meta-row {
  @apply flex min-w-0 items-start justify-between gap-2;
}

.review-pane-file[data-active='true'] {
  @apply border-zinc-300 bg-white shadow-sm;
}

.review-pane-file-op {
  @apply inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em];
}

.review-pane-file-op[data-operation='add'] {
  @apply bg-emerald-100 text-emerald-800;
}

.review-pane-file-op[data-operation='delete'] {
  @apply bg-rose-100 text-rose-700;
}

.review-pane-file-op[data-operation='rename'] {
  @apply bg-sky-100 text-sky-700;
}

.review-pane-file-op[data-operation='update'] {
  @apply bg-amber-100 text-amber-800;
}

.review-pane-file-path {
  @apply min-w-0 truncate text-sm text-zinc-800;
}

.review-pane-file-delta {
  @apply inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px];
}

@container (max-width: 14rem) {
  .review-pane-file-list .review-pane-file-meta-row {
    @apply flex-col items-stretch gap-1;
  }

  .review-pane-file-list .review-pane-file-delta {
    @apply self-start;
  }
}

.review-pane-delta-add {
  @apply text-emerald-600;
}

.review-pane-delta-remove {
  @apply text-rose-600;
}

.review-pane-delta-separator {
  @apply text-zinc-400;
}

.review-pane-diff {
  @apply min-h-0 overflow-y-auto px-3 py-3;
}

.review-pane-file-header,
.review-pane-hunk {
  @apply rounded-2xl border border-zinc-200 bg-white;
}

.review-pane-file-header {
  @apply mb-3 flex flex-wrap items-start justify-between gap-2 px-3 py-2.5;
}

.review-pane-file-title {
  @apply m-0 break-all text-sm font-medium text-zinc-900;
}

.review-pane-file-subtitle,
.review-pane-hunk-meta {
  @apply m-0 text-[11px] text-zinc-500;
}

.review-pane-row-actions {
  @apply flex flex-wrap gap-1.5;
}

.review-pane-hunks {
  @apply flex flex-col gap-2.5;
}

.review-pane-hunk {
  @apply overflow-hidden;
}

.review-pane-hunk[data-active='true'] {
  @apply border-zinc-400 shadow-[0_0_0_1px_rgba(24,24,27,0.08)];
}

.review-pane-hunk-header {
  @apply flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-3 py-2.5;
}

.review-pane-hunk-title {
  @apply m-0 font-mono text-xs text-zinc-800;
}

.review-pane-lines {
  @apply overflow-x-auto bg-zinc-950 px-0 py-0 font-mono text-xs text-zinc-100;
}

.review-pane-line {
  @apply grid min-w-max grid-cols-[3.5rem_3.5rem_1.5rem_minmax(0,1fr)] gap-0;
}

.review-pane-line-number {
  @apply px-2.5 py-1 text-right text-zinc-500;
}

.review-pane-line-marker {
  @apply px-2 py-1 text-center text-zinc-500;
}

.review-pane-line-code {
  @apply block px-2.5 py-1 whitespace-pre-wrap break-all;
}

.review-pane-line[data-kind='add'] {
  @apply bg-emerald-950/60 text-emerald-100;
}

.review-pane-line[data-kind='remove'] {
  @apply bg-rose-950/60 text-rose-100;
}

.review-pane-line[data-kind='add'] .review-pane-line-marker,
.review-pane-line[data-kind='add'] .review-pane-line-code {
  @apply text-emerald-300;
}

.review-pane-line[data-kind='remove'] .review-pane-line-marker,
.review-pane-line[data-kind='remove'] .review-pane-line-code {
  @apply text-rose-300;
}

.review-pane-line[data-kind='hunk'] {
  @apply bg-sky-950/70 text-sky-200;
}

.review-pane-line[data-kind='meta'] {
  @apply bg-zinc-900 text-zinc-400;
}

.review-pane-raw-diff {
  @apply overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-950 p-3 text-xs text-zinc-100;
}

.review-pane-raw-diff pre {
  @apply m-0 whitespace-pre-wrap break-all font-mono;
}

.review-pane-empty {
  @apply flex h-full min-h-0 flex-col items-center justify-center px-6 text-center;
}

.review-pane-empty-title {
  @apply m-0 text-sm font-medium text-zinc-900;
}

.review-pane-empty-text {
  @apply mt-2 max-w-sm text-sm text-zinc-500;
}

.review-pane-primary-cta {
  @apply mt-4 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700;
}

.review-pane-sheet-backdrop {
  @apply fixed inset-0 z-50 bg-black/30;
}

.review-pane-sheet {
  @apply absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-4 pb-6 pt-3 shadow-2xl;
}

.review-pane-sheet-handle {
  @apply mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-300;
}

.review-pane-sheet-header {
  @apply mb-3 flex items-center justify-between;
}

.review-pane-sheet-title {
  @apply m-0 text-sm font-medium text-zinc-900;
}

.review-pane-sheet-count {
  @apply m-0 rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500;
}

.review-pane-sheet-list {
  @apply flex max-h-[60vh] flex-col gap-2 overflow-y-auto pb-3;
}

.review-pane-sheet-enter-active,
.review-pane-sheet-leave-active {
  transition: opacity 160ms ease;
}

.review-pane-sheet-enter-active .review-pane-sheet,
.review-pane-sheet-leave-active .review-pane-sheet {
  transition: transform 200ms ease;
}

.review-pane-sheet-enter-from,
.review-pane-sheet-leave-to {
  opacity: 0;
}

.review-pane-sheet-enter-from .review-pane-sheet,
.review-pane-sheet-leave-to .review-pane-sheet {
  transform: translateY(16px);
}

@media (max-width: 767px) {
  .review-pane-header {
    @apply px-3 py-2;
  }

  .review-pane-eyebrow {
    @apply text-[10px];
  }

  .review-pane-title {
    @apply text-xs leading-5;
  }

  .review-pane-header-actions {
    @apply gap-1.5;
  }

  .review-pane-close,
  .review-pane-mobile-files-button,
  .review-pane-refresh {
    @apply px-2.5 py-1 text-[12px];
  }

  .review-pane-close {
    @apply h-7 w-7;
  }

  .review-pane-toolbar {
    @apply gap-1.5 px-3 py-2;
  }

  .review-pane-toolbar-controls {
    @apply grid grid-cols-1 gap-1.5;
  }

  .review-pane-control-cluster {
    @apply gap-1;
  }

  .review-pane-control-label {
    @apply text-[9px];
  }

  .review-pane-branch-dropdown {
    @apply min-w-0 flex-1;
  }

  .review-pane-branch-dropdown :deep(.composer-dropdown-trigger) {
    @apply px-2 py-0.75 text-[12px];
  }

  .review-pane-segmented {
    @apply w-full justify-between gap-1 p-0.75;
  }

  .review-pane-segmented-button {
    @apply flex-1 px-2 py-1 text-[12px];
  }

  .review-pane-toolbar-actions {
    @apply w-auto gap-1;
  }

  .review-pane-refresh {
    @apply px-2.5 py-1 text-[12px];
  }

  .review-pane-banner {
    @apply mx-3 mt-2 px-2.5 py-1.5 text-xs;
  }

  .review-pane-meta {
    @apply gap-1 px-3 pt-2;
  }

  .review-pane-meta span {
    @apply px-1.75 py-0.75 text-[11px];
  }

  .review-pane-bulk-actions {
    @apply gap-1 px-3 py-2;
  }

  .review-pane-bulk-button {
    @apply px-2.5 py-1 text-[12px];
  }

  .review-pane-main {
    @apply flex h-full min-h-0 flex-col;
  }

  .review-pane-resizer {
    @apply hidden;
  }

  .review-pane-diff {
    @apply min-h-0 flex-1 overflow-y-auto px-2 py-2.5;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  .review-pane-file-header,
  .review-pane-hunk-header {
    @apply px-2.5 py-2;
  }

  .review-pane-sheet {
    @apply px-3 pb-4 pt-2.5;
  }

  .review-pane-sheet-handle {
    @apply mb-2 h-1.25 w-11;
  }

  .review-pane-sheet-header {
    @apply mb-2;
  }

  .review-pane-sheet-title {
    @apply text-xs;
  }

  .review-pane-sheet-count {
    @apply px-1.5 py-0.75 text-[10px];
  }

  .review-pane-sheet-list {
    @apply gap-1.5 pb-2;
  }

  .review-pane-sheet-list .review-pane-tree-folder {
    @apply gap-1 rounded-md px-2 py-1 text-[12px];
  }

  .review-pane-sheet-list .review-pane-tree-folder-count {
    @apply px-1.25 py-0.25 text-[9px];
  }

  .review-pane-sheet-list .review-pane-file {
    @apply gap-0.5 rounded-lg px-2 py-1.5;
  }

  .review-pane-sheet-list .review-pane-file-meta-row {
    @apply gap-1.5;
  }

  .review-pane-sheet-list .review-pane-file-op {
    @apply px-1.5 py-0.25 text-[9px];
  }

  .review-pane-sheet-list .review-pane-file-path {
    @apply text-[13px] leading-5;
  }

  .review-pane-sheet-list .review-pane-file-delta {
    @apply text-[11px];
  }
}

@media (min-width: 768px) {
  .review-pane-toolbar {
    @apply flex-row items-center gap-2.5;
  }

  .review-pane-toolbar-controls {
    @apply min-w-0 flex-nowrap;
  }

  .review-pane-control-cluster {
    @apply shrink-0;
  }

  .review-pane-toolbar-actions {
    @apply ml-auto;
  }
}
</style>
