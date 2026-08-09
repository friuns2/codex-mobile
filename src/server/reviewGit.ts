import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const REVIEW_GIT_TIMEOUT_MS = 30_000

type ReviewScope = 'workspace' | 'baseBranch' | 'commit'
type ReviewWorkspaceView = 'unstaged' | 'staged'
type ReviewAction = 'stage' | 'unstage' | 'revert'
type ReviewActionLevel = 'all' | 'file' | 'hunk'

type ReviewDiffLine = {
  key: string
  kind: 'meta' | 'hunk' | 'add' | 'remove' | 'context'
  text: string
  oldLine: number | null
  newLine: number | null
}

type ReviewSnapshotHunk = {
  id: string
  header: string
  patch: string
  addedLineCount: number
  removedLineCount: number
  oldStart: number | null
  oldLineCount: number
  newStart: number | null
  newLineCount: number
  lines: ReviewDiffLine[]
}

type ReviewSnapshotFile = {
  id: string
  path: string
  absolutePath: string
  previousPath: string | null
  previousAbsolutePath: string | null
  operation: 'add' | 'delete' | 'update' | 'rename'
  addedLineCount: number
  removedLineCount: number
  diff: string
  hunks: ReviewSnapshotHunk[]
}

type ReviewSnapshot = {
  cwd: string
  gitRoot: string | null
  isGitRepo: boolean
  scope: ReviewScope
  workspaceView: ReviewWorkspaceView
  baseBranch: string | null
  baseBranchOptions: string[]
  commitSha: string | null
  headBranch: string | null
  mergeBaseSha: string | null
  generatedAtIso: string
  summary: {
    fileCount: number
    addedLineCount: number
    removedLineCount: number
  }
  files: ReviewSnapshotFile[]
}

type ReviewSummary = ReviewSnapshot['summary']

type ReviewRouteContext = {
  readJsonBody: (req: IncomingMessage) => Promise<unknown>
}

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

type DetectedBaseBranch = {
  displayName: string
  gitRef: string
}

function getNodeErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : ''
}

function normalizeBaseBranchDisplayName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('origin/') ? trimmed.slice('origin/'.length) : trimmed
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }

  const record = asRecord(payload)
  if (!record) return fallback

  const direct = readString(record.error)
  if (direct) return direct

  const nested = asRecord(record.error)
  const nestedMessage = readString(nested?.message)
  if (nestedMessage) return nestedMessage

  return fallback
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function runCommandResult(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(new Error(`Git command timed out after ${REVIEW_GIT_TIMEOUT_MS}ms (${command} ${args.join(' ')})`))
    }, REVIEW_GIT_TIMEOUT_MS)
    timer.unref()

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}

async function runCommand(command: string, args: string[], options: { cwd?: string } = {}): Promise<void> {
  const result = await runCommandResult(command, args, options)
  if (result.code === 0) return
  const details = [result.stderr, result.stdout].filter(Boolean).join('\n')
  const suffix = details ? `: ${details}` : ''
  throw new Error(`Command failed (${command} ${args.join(' ')})${suffix}`)
}

async function runCommandCapture(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  const result = await runCommandResult(command, args, options)
  if (result.code === 0) return result.stdout
  const details = [result.stderr, result.stdout].filter(Boolean).join('\n')
  const suffix = details ? `: ${details}` : ''
  throw new Error(`Command failed (${command} ${args.join(' ')})${suffix}`)
}

async function runCommandCaptureRaw(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(new Error(`Command timed out after ${REVIEW_GIT_TIMEOUT_MS}ms (${command} ${args.join(' ')})`))
    }, REVIEW_GIT_TIMEOUT_MS)
    timer.unref()

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout)
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      const suffix = details ? `: ${details}` : ''
      reject(new Error(`Command failed (${command} ${args.join(' ')})${suffix}`))
    })
  })
}

function isNotGitRepositoryError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('not a git repository') || message.includes('fatal: not a git repository')
}

function isMissingHeadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes("ambiguous argument 'head'") ||
    message.includes("bad revision 'head'") ||
    message.includes('unknown revision or path not in the working tree') ||
    message.includes("not a valid object name 'head'") ||
    message.includes('not a valid object name: head')
  )
}

function normalizeInputCwd(value: string): string {
  return isAbsolute(value) ? value : resolve(value)
}

async function ensureDirectory(cwd: string): Promise<void> {
  const info = await stat(cwd)
  if (!info.isDirectory()) {
    throw new Error('cwd is not a directory')
  }
}

async function resolveGitRoot(cwd: string): Promise<string | null> {
  try {
    return await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return null
    }
    throw error
  }
}

async function gitRefExists(repoRoot: string, ref: string): Promise<boolean> {
  const result = await runCommandResult('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoRoot })
  return result.code === 0
}

async function detectBaseBranch(repoRoot: string): Promise<DetectedBaseBranch | null> {
  const originHead = await runCommandResult('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: repoRoot })
  const originHeadRef = originHead.code === 0 ? originHead.stdout : ''
  if (originHeadRef.startsWith('origin/')) {
    return {
      displayName: originHeadRef.slice('origin/'.length),
      gitRef: originHeadRef,
    }
  }

  for (const candidate of ['main', 'master']) {
    if (await gitRefExists(repoRoot, candidate)) {
      return { displayName: candidate, gitRef: candidate }
    }
    const remoteCandidate = `origin/${candidate}`
    if (await gitRefExists(repoRoot, remoteCandidate)) {
      return { displayName: candidate, gitRef: remoteCandidate }
    }
  }

  return null
}

async function listBaseBranchOptions(repoRoot: string): Promise<string[]> {
  const result = await runCommandResult(
    'git',
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin'],
    { cwd: repoRoot },
  )
  if (result.code !== 0) {
    return []
  }

  const options: string[] = []
  for (const line of result.stdout.split(/\r?\n/u)) {
    const normalized = normalizeBaseBranchDisplayName(line)
    if (!normalized || normalized === 'HEAD' || normalized.endsWith('/HEAD')) continue
    if (!options.includes(normalized)) {
      options.push(normalized)
    }
  }

  for (const fallback of ['main', 'master']) {
    if (!options.includes(fallback)) {
      options.push(fallback)
    }
  }

  return options
}

async function resolveBaseBranch(repoRoot: string, requestedBaseBranch = ''): Promise<DetectedBaseBranch | null> {
  const normalizedRequested = normalizeBaseBranchDisplayName(requestedBaseBranch)
  if (normalizedRequested) {
    for (const candidate of [normalizedRequested, `origin/${normalizedRequested}`]) {
      if (await gitRefExists(repoRoot, candidate)) {
        return {
          displayName: normalizedRequested,
          gitRef: candidate,
        }
      }
    }
  }

  return await detectBaseBranch(repoRoot)
}

async function detectHeadBranch(repoRoot: string): Promise<string | null> {
  const result = await runCommandResult('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: repoRoot })
  return result.code === 0 && result.stdout !== 'HEAD' ? result.stdout : null
}

function splitGitPathList(raw: string): string[] {
  return raw.split('\0').filter((entry) => entry.length > 0)
}

function isSafeGitRelativePath(filePath: string): boolean {
  return Boolean(filePath) && !isAbsolute(filePath) && !filePath.split('/').includes('..')
}

async function listUntrackedPaths(repoRoot: string): Promise<string[]> {
  const output = await runCommandCaptureRaw('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repoRoot })
  return splitGitPathList(output).filter(isSafeGitRelativePath)
}

async function diffUntrackedFile(repoRoot: string, path: string): Promise<string> {
  const result = await runCommandResult(
    'git',
    ['diff', '--no-index', '--no-ext-diff', '--patch', '--', '/dev/null', path],
    { cwd: repoRoot },
  )

  if (result.code !== 0 && result.code !== 1) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n')
    const suffix = details ? `: ${details}` : ''
    throw new Error(`Command failed (git diff --no-index -- /dev/null ${path})${suffix}`)
  }

  return result.stdout
}

function parseNumstatSummary(output: string): ReviewSummary {
  let fileCount = 0
  let addedLineCount = 0
  let removedLineCount = 0
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [addedRaw, removedRaw] = trimmed.split(/\s+/u)
    if (addedRaw === undefined || removedRaw === undefined) continue
    fileCount += 1
    const added = Number(addedRaw)
    const removed = Number(removedRaw)
    if (Number.isFinite(added)) addedLineCount += added
    if (Number.isFinite(removed)) removedLineCount += removed
  }
  return { fileCount, addedLineCount, removedLineCount }
}

function addReviewSummary(left: ReviewSummary, right: ReviewSummary): ReviewSummary {
  return {
    fileCount: left.fileCount + right.fileCount,
    addedLineCount: left.addedLineCount + right.addedLineCount,
    removedLineCount: left.removedLineCount + right.removedLineCount,
  }
}

async function summarizeUntrackedFile(repoRoot: string, path: string): Promise<ReviewSummary> {
  const absolutePath = join(repoRoot, ...path.split('/'))
  let info
  try {
    info = await stat(absolutePath)
  } catch (error) {
    const code = getNodeErrorCode(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { fileCount: 0, addedLineCount: 0, removedLineCount: 0 }
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return { fileCount: 1, addedLineCount: 0, removedLineCount: 0 }
    }
    throw error
  }
  if (!info.isFile()) {
    return { fileCount: 0, addedLineCount: 0, removedLineCount: 0 }
  }
  const addedLineCount = await new Promise<number>((resolve, reject) => {
    const stream = createReadStream(absolutePath)
    let lineCount = 0
    let sawAnyByte = false
    let lastByteWasNewline = false
    stream.on('data', (chunk: string | Buffer) => {
      if (typeof chunk === 'string') chunk = Buffer.from(chunk)
      sawAnyByte = true
      for (const byte of chunk) {
        if (byte === 10) lineCount += 1
      }
      lastByteWasNewline = chunk[chunk.length - 1] === 10
    })
    stream.on('error', (error: unknown) => {
      const code = getNodeErrorCode(error)
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        resolve(0)
        return
      }
      if (code === 'EACCES' || code === 'EPERM') {
        resolve(0)
        return
      }
      reject(error)
    })
    stream.on('end', () => {
      resolve(sawAnyByte && !lastByteWasNewline ? lineCount + 1 : lineCount)
    })
  })
  return { fileCount: 1, addedLineCount, removedLineCount: 0 }
}

async function buildWorkspaceDiffSummary(repoRoot: string, workspaceView: ReviewWorkspaceView): Promise<ReviewSummary> {
  if (workspaceView === 'staged') {
    try {
      const output = await runCommandCapture('git', ['diff', '--cached', '--no-ext-diff', '--find-renames', '--numstat'], { cwd: repoRoot })
      return parseNumstatSummary(output)
    } catch (error) {
      if (isMissingHeadError(error)) {
        return { fileCount: 0, addedLineCount: 0, removedLineCount: 0 }
      }
      throw error
    }
  }

  let summary: ReviewSummary = { fileCount: 0, addedLineCount: 0, removedLineCount: 0 }
  try {
    const output = await runCommandCapture('git', ['diff', '--no-ext-diff', '--find-renames', '--numstat'], { cwd: repoRoot })
    summary = addReviewSummary(summary, parseNumstatSummary(output))
  } catch (error) {
    if (!isMissingHeadError(error)) {
      throw error
    }
  }

  for (const path of await listUntrackedPaths(repoRoot)) {
    summary = addReviewSummary(summary, await summarizeUntrackedFile(repoRoot, path))
  }
  return summary
}

async function buildWorkspaceDiff(repoRoot: string, workspaceView: ReviewWorkspaceView): Promise<string> {
  if (workspaceView === 'staged') {
    try {
      return await runCommandCapture('git', ['diff', '--cached', '--no-ext-diff', '--find-renames', '--patch'], { cwd: repoRoot })
    } catch (error) {
      if (isMissingHeadError(error)) {
        return ''
      }
      throw error
    }
  }

  let trackedDiff = ''
  try {
    trackedDiff = await runCommandCapture('git', ['diff', '--no-ext-diff', '--find-renames', '--patch'], { cwd: repoRoot })
  } catch (error) {
    if (!isMissingHeadError(error)) {
      throw error
    }
  }

  const untrackedDiffs = await Promise.all(
    (await listUntrackedPaths(repoRoot)).map(async (path) => await diffUntrackedFile(repoRoot, path)),
  )

  return [trackedDiff, ...untrackedDiffs]
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join('\n')
}

async function buildBaseBranchDiff(
  repoRoot: string,
  baseBranch: DetectedBaseBranch,
): Promise<{ diffText: string; mergeBaseSha: string | null }> {
  const mergeBaseResult = await runCommandResult('git', ['merge-base', 'HEAD', baseBranch.gitRef], { cwd: repoRoot })
  if (mergeBaseResult.code !== 0 || !mergeBaseResult.stdout) {
    return { diffText: '', mergeBaseSha: null }
  }

  const diffText = await runCommandCapture(
    'git',
    ['diff', '--no-ext-diff', '--find-renames', '--patch', mergeBaseResult.stdout, 'HEAD'],
    { cwd: repoRoot },
  )

  return {
    diffText,
    mergeBaseSha: mergeBaseResult.stdout,
  }
}

async function buildCommitDiff(repoRoot: string, commitSha: string): Promise<{ diffText: string; commitSha: string }> {
  const resolvedSha = await runCommandCapture('git', ['rev-parse', '--verify', `${commitSha}^{commit}`], { cwd: repoRoot })
  const diffText = await runCommandCapture(
    'git',
    ['diff-tree', '--root', '-r', '--no-commit-id', '--no-ext-diff', '--find-renames', '--patch', resolvedSha],
    { cwd: repoRoot },
  )
  return { diffText, commitSha: resolvedSha }
}

function normalizeDiffPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/dev/null') return null
  if (trimmed.startsWith('a/') || trimmed.startsWith('b/')) {
    return trimmed.slice(2)
  }
  return trimmed
}

function filePathFromDiffHeader(line: string, side: 'old' | 'new'): string | null {
  const prefix = side === 'old' ? '--- ' : '+++ '
  if (!line.startsWith(prefix)) return null
  return normalizeDiffPath(line.slice(prefix.length))
}

function parseDiffGitLine(line: string): { oldPath: string | null; newPath: string | null } {
  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/u)
  if (!match) return { oldPath: null, newPath: null }
  return {
    oldPath: normalizeDiffPath(`a/${match[1]}`),
    newPath: normalizeDiffPath(`b/${match[2]}`),
  }
}

function buildReviewDiffLines(fileId: string, hunkId: string, lines: string[]): {
  addedLineCount: number
  removedLineCount: number
  lines: ReviewDiffLine[]
} {
  const output: ReviewDiffLine[] = []
  let addedLineCount = 0
  let removedLineCount = 0
  let oldLine: number | null = null
  let newLine: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (index === 0) {
      const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/u)
      if (match) {
        oldLine = Number(match[1])
        newLine = Number(match[3])
      }
      output.push({
        key: `${fileId}:${hunkId}:header`,
        kind: 'hunk',
        text: line,
        oldLine: null,
        newLine: null,
      })
      continue
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      output.push({
        key: `${fileId}:${hunkId}:add:${index}`,
        kind: 'add',
        text: line.slice(1),
        oldLine: null,
        newLine,
      })
      addedLineCount += 1
      newLine = newLine === null ? null : newLine + 1
      continue
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      output.push({
        key: `${fileId}:${hunkId}:remove:${index}`,
        kind: 'remove',
        text: line.slice(1),
        oldLine,
        newLine: null,
      })
      removedLineCount += 1
      oldLine = oldLine === null ? null : oldLine + 1
      continue
    }

    if (line.startsWith('\\')) {
      output.push({
        key: `${fileId}:${hunkId}:meta:${index}`,
        kind: 'meta',
        text: line,
        oldLine: null,
        newLine: null,
      })
      continue
    }

    output.push({
      key: `${fileId}:${hunkId}:context:${index}`,
      kind: 'context',
      text: line.startsWith(' ') ? line.slice(1) : line,
      oldLine,
      newLine,
    })
    oldLine = oldLine === null ? null : oldLine + 1
    newLine = newLine === null ? null : newLine + 1
  }

  return { addedLineCount, removedLineCount, lines: output }
}

function parseDiffBlocks(diffText: string): string[][] {
  const normalized = diffText.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const blocks: string[][] = []
  let current: string[] = []
  for (const line of normalized.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current.length > 0) {
        blocks.push(current)
      }
      current = [line]
      continue
    }
    if (current.length > 0) {
      current.push(line)
    }
  }
  if (current.length > 0) {
    blocks.push(current)
  }
  return blocks
}

function serializePatch(lines: string[]): string {
  if (lines.length === 0) return ''
  return `${lines.join('\n')}\n`
}

function parseReviewSnapshotFile(repoRoot: string, blockLines: string[], fileIndex: number): ReviewSnapshotFile | null {
  if (blockLines.length === 0) return null

  let oldPath: string | null = null
  let newPath: string | null = null
  let renameFrom: string | null = null
  let renameTo: string | null = null
  let operation: ReviewSnapshotFile['operation'] = 'update'

  const firstHunkIndex = blockLines.findIndex((line) => line.startsWith('@@ '))
  const headerLines = firstHunkIndex >= 0 ? blockLines.slice(0, firstHunkIndex) : [...blockLines]

  for (const line of headerLines) {
    if (line.startsWith('diff --git ')) {
      const parsed = parseDiffGitLine(line)
      oldPath = parsed.oldPath ?? oldPath
      newPath = parsed.newPath ?? newPath
      continue
    }
    if (line.startsWith('rename from ')) {
      renameFrom = normalizeDiffPath(line.slice('rename from '.length))
      operation = 'rename'
      continue
    }
    if (line.startsWith('rename to ')) {
      renameTo = normalizeDiffPath(line.slice('rename to '.length))
      operation = 'rename'
      continue
    }
    if (line.startsWith('new file mode ')) {
      operation = 'add'
      continue
    }
    if (line.startsWith('deleted file mode ')) {
      operation = 'delete'
      continue
    }
    const headerOldPath = filePathFromDiffHeader(line, 'old')
    if (headerOldPath !== null) {
      oldPath = headerOldPath
      continue
    }
    const headerNewPath = filePathFromDiffHeader(line, 'new')
    if (headerNewPath !== null) {
      newPath = headerNewPath
    }
  }

  const previousPath = renameFrom ?? oldPath
  const resolvedPath = renameTo ?? newPath ?? oldPath
  if (!resolvedPath) return null

  if (operation === 'update') {
    if (!previousPath) {
      operation = 'add'
    } else if (!newPath) {
      operation = 'delete'
    }
  }

  const hunks: ReviewSnapshotHunk[] = []
  if (firstHunkIndex >= 0) {
    let currentHunk: string[] = []
    let hunkCounter = 0
    const flushHunk = () => {
      if (currentHunk.length === 0) return
      const header = currentHunk[0] ?? ''
      const match = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/u)
      const hunkId = `review-hunk:${fileIndex}:${hunkCounter}`
      const rendered = buildReviewDiffLines(`review-file:${fileIndex}`, hunkId, currentHunk)
      hunks.push({
        id: hunkId,
        header,
        patch: serializePatch([...headerLines, ...currentHunk]),
        addedLineCount: rendered.addedLineCount,
        removedLineCount: rendered.removedLineCount,
        oldStart: match ? Number(match[1]) : null,
        oldLineCount: match ? Number(match[2] ?? '1') : 0,
        newStart: match ? Number(match[3]) : null,
        newLineCount: match ? Number(match[4] ?? '1') : 0,
        lines: rendered.lines,
      })
      currentHunk = []
      hunkCounter += 1
    }

    for (let index = firstHunkIndex; index < blockLines.length; index += 1) {
      const line = blockLines[index] ?? ''
      if (line.startsWith('@@ ')) {
        flushHunk()
        currentHunk = [line]
        continue
      }
      if (currentHunk.length > 0) {
        currentHunk.push(line)
      }
    }
    flushHunk()
  }

  const addedLineCount = hunks.reduce((sum, hunk) => sum + hunk.addedLineCount, 0)
  const removedLineCount = hunks.reduce((sum, hunk) => sum + hunk.removedLineCount, 0)

  return {
    id: `review-file:${fileIndex}`,
    path: resolvedPath,
    absolutePath: join(repoRoot, resolvedPath),
    previousPath: previousPath && previousPath !== resolvedPath ? previousPath : null,
    previousAbsolutePath: previousPath && previousPath !== resolvedPath ? join(repoRoot, previousPath) : null,
    operation,
    addedLineCount,
    removedLineCount,
    diff: serializePatch(blockLines),
    hunks,
  }
}

function parseReviewSnapshotFiles(repoRoot: string, diffText: string): ReviewSnapshotFile[] {
  return parseDiffBlocks(diffText)
    .map((block, index) => parseReviewSnapshotFile(repoRoot, block, index))
    .filter((entry): entry is ReviewSnapshotFile => entry !== null)
}

async function buildReviewSnapshot(
  cwd: string,
  scope: ReviewScope,
  workspaceView: ReviewWorkspaceView,
  requestedBaseBranch = '',
  requestedCommitSha = '',
): Promise<ReviewSnapshot> {
  const normalizedCwd = normalizeInputCwd(cwd)
  await ensureDirectory(normalizedCwd)

  const gitRoot = await resolveGitRoot(normalizedCwd)
  if (!gitRoot) {
    return {
      cwd: normalizedCwd,
      gitRoot: null,
      isGitRepo: false,
      scope,
      workspaceView,
      baseBranch: null,
      baseBranchOptions: [],
      commitSha: null,
      headBranch: null,
      mergeBaseSha: null,
      generatedAtIso: new Date().toISOString(),
      summary: {
        fileCount: 0,
        addedLineCount: 0,
        removedLineCount: 0,
      },
      files: [],
    }
  }

  const [baseBranch, baseBranchOptions, headBranch] = await Promise.all([
    resolveBaseBranch(gitRoot, requestedBaseBranch),
    listBaseBranchOptions(gitRoot),
    detectHeadBranch(gitRoot),
  ])

  let diffText = ''
  let mergeBaseSha: string | null = null
  let commitSha: string | null = null

  if (scope === 'commit') {
    if (!requestedCommitSha.trim()) {
      throw new Error('Missing commit')
    }
    const commitDiff = await buildCommitDiff(gitRoot, requestedCommitSha.trim())
    diffText = commitDiff.diffText
    commitSha = commitDiff.commitSha
  } else if (scope === 'baseBranch') {
    if (baseBranch) {
      const baseDiff = await buildBaseBranchDiff(gitRoot, baseBranch)
      diffText = baseDiff.diffText
      mergeBaseSha = baseDiff.mergeBaseSha
    }
  } else {
    diffText = await buildWorkspaceDiff(gitRoot, workspaceView)
  }

  const files = parseReviewSnapshotFiles(gitRoot, diffText)
  return {
    cwd: normalizedCwd,
    gitRoot,
    isGitRepo: true,
    scope,
    workspaceView,
    baseBranch: baseBranch?.displayName ?? null,
    baseBranchOptions,
    commitSha,
    headBranch,
    mergeBaseSha,
    generatedAtIso: new Date().toISOString(),
    summary: {
      fileCount: files.length,
      addedLineCount: files.reduce((sum, file) => sum + file.addedLineCount, 0),
      removedLineCount: files.reduce((sum, file) => sum + file.removedLineCount, 0),
    },
    files,
  }
}

async function buildReviewSummary(cwd: string, workspaceView: ReviewWorkspaceView): Promise<ReviewSummary> {
  const normalizedCwd = normalizeInputCwd(cwd)
  await ensureDirectory(normalizedCwd)

  const gitRoot = await resolveGitRoot(normalizedCwd)
  if (!gitRoot) {
    return { fileCount: 0, addedLineCount: 0, removedLineCount: 0 }
  }

  return await buildWorkspaceDiffSummary(gitRoot, workspaceView)
}

async function writePatchFile(patch: string): Promise<string> {
  const dir = await mkdir(join(tmpdir(), 'codexui-review-patches'), { recursive: true }).then(() => join(tmpdir(), 'codexui-review-patches'))
  const filePath = join(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}.patch`)
  const normalizedPatch = patch.endsWith('\n') ? patch : `${patch}\n`
  await writeFile(filePath, normalizedPatch, 'utf8')
  return filePath
}

async function applyPatchAction(
  repoRoot: string,
  action: ReviewAction,
  workspaceView: ReviewWorkspaceView,
  patch: string,
): Promise<void> {
  const patchPath = await writePatchFile(patch)
  try {
    if (workspaceView === 'unstaged' && action === 'stage') {
      await runCommand('git', ['apply', '--cached', '--recount', patchPath], { cwd: repoRoot })
      return
    }
    if (workspaceView === 'unstaged' && action === 'revert') {
      await runCommand('git', ['apply', '-R', '--recount', patchPath], { cwd: repoRoot })
      return
    }
    if (workspaceView === 'staged' && action === 'unstage') {
      await runCommand('git', ['apply', '--cached', '-R', '--recount', patchPath], { cwd: repoRoot })
      return
    }
    throw new Error('Unsupported patch action for this view')
  } finally {
    await rm(patchPath, { force: true })
  }
}

async function applyAllAction(repoRoot: string, action: ReviewAction, workspaceView: ReviewWorkspaceView): Promise<void> {
  if (workspaceView === 'unstaged' && action === 'stage') {
    await runCommand('git', ['add', '-A'], { cwd: repoRoot })
    return
  }

  if (workspaceView === 'unstaged' && action === 'revert') {
    try {
      await runCommand('git', ['restore', '--worktree', '--source=HEAD', '--', '.'], { cwd: repoRoot })
    } catch (error) {
      if (!isMissingHeadError(error)) {
        throw error
      }
    }
    await runCommand('git', ['clean', '-fd', '--', '.'], { cwd: repoRoot })
    return
  }

  if (workspaceView === 'staged' && action === 'unstage') {
    await runCommand('git', ['restore', '--staged', '--', '.'], { cwd: repoRoot })
    return
  }

  throw new Error('Unsupported bulk action for this view')
}

async function initializeGitRepository(cwd: string): Promise<void> {
  const normalizedCwd = normalizeInputCwd(cwd)
  await ensureDirectory(normalizedCwd)
  await runCommand('git', ['init'], { cwd: normalizedCwd })
}

async function applyReviewAction(payload: unknown): Promise<ReviewSnapshot> {
  const record = asRecord(payload)
  if (!record) {
    throw new Error('Invalid body: expected object')
  }

  const cwd = readString(record.cwd)
  const scope = record.scope === 'baseBranch' ? 'baseBranch' : record.scope === 'commit' ? 'commit' : 'workspace'
  const workspaceView = record.workspaceView === 'staged' ? 'staged' : 'unstaged'
  const action = readString(record.action)
  const level = readString(record.level)
  const patch = typeof record.patch === 'string' ? record.patch : ''

  if (!cwd) {
    throw new Error('Missing cwd')
  }
  if (scope !== 'workspace') {
    throw new Error('Review actions are only available for workspace changes')
  }
  if (action !== 'stage' && action !== 'unstage' && action !== 'revert') {
    throw new Error('Invalid review action')
  }
  if (level !== 'all' && level !== 'file' && level !== 'hunk') {
    throw new Error('Invalid review action level')
  }

  const normalizedCwd = normalizeInputCwd(cwd)
  await ensureDirectory(normalizedCwd)
  const repoRoot = await resolveGitRoot(normalizedCwd)
  if (!repoRoot) {
    throw new Error('Not a Git repository')
  }

  if (level === 'all') {
    await applyAllAction(repoRoot, action, workspaceView)
  } else {
    if (!patch.trim()) {
      throw new Error('Missing patch payload')
    }
    await applyPatchAction(repoRoot, action, workspaceView, patch)
  }

  return await buildReviewSnapshot(normalizedCwd, scope, workspaceView)
}

export async function handleReviewRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ReviewRouteContext,
): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/codex-api/review/summary') {
    const cwd = url.searchParams.get('cwd')?.trim() ?? ''
    const workspaceView = url.searchParams.get('workspaceView') === 'staged' ? 'staged' : 'unstaged'
    if (!cwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }

    try {
      setJson(res, 200, {
        data: await buildReviewSummary(cwd, workspaceView),
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to load review summary') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/review/snapshot') {
    const cwd = url.searchParams.get('cwd')?.trim() ?? ''
    const scope = url.searchParams.get('scope') === 'baseBranch'
      ? 'baseBranch'
      : url.searchParams.get('scope') === 'commit'
        ? 'commit'
        : 'workspace'
    const workspaceView = url.searchParams.get('workspaceView') === 'staged' ? 'staged' : 'unstaged'
    const baseBranch = url.searchParams.get('baseBranch')?.trim() ?? ''
    const commitSha = url.searchParams.get('commitSha')?.trim() ?? ''
    if (!cwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }

    try {
      setJson(res, 200, {
        data: await buildReviewSnapshot(cwd, scope, workspaceView, baseBranch, commitSha),
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to load review snapshot') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/review/action') {
    try {
      const payload = await context.readJsonBody(req)
      setJson(res, 200, {
        data: await applyReviewAction(payload),
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to apply review action') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/review/git/init') {
    const payload = asRecord(await context.readJsonBody(req))
    const cwd = readString(payload?.cwd)
    if (!cwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }

    try {
      await initializeGitRepository(cwd)
      setJson(res, 200, { ok: true })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to initialize Git') })
    }
    return true
  }

  return false
}
