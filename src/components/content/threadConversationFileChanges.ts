import type { UiFileChange } from '../../types/codex'

export type TurnFileChangeSummary = {
  changes: UiFileChange[]
  sourceMessageIds: string[]
  source: 'assistant' | 'metadata'
}
export type DiffViewerLineKind = 'meta' | 'hunk' | 'add' | 'remove' | 'context'
export type DiffViewerLine = {
  key: string
  kind: DiffViewerLineKind
  oldLine: number | null
  newLine: number | null
  text: string
}

export function fileChangeKey(change: UiFileChange): string {
  return `${change.path}\u0000${change.movedToPath ?? ''}`
}

export function mergeFileChangeDiff(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  return `${first}\n${second}`.trim()
}

export function mergeFileChangeEntry(first: UiFileChange, second: UiFileChange): UiFileChange {
  const operation = first.operation === 'add' || second.operation === 'add'
    ? 'add'
    : first.operation === 'delete' || second.operation === 'delete'
      ? 'delete'
      : 'update'
  return {
    path: second.path || first.path,
    operation,
    movedToPath: second.movedToPath ?? first.movedToPath ?? null,
    diff: mergeFileChangeDiff(first.diff, second.diff),
    addedLineCount: first.addedLineCount + second.addedLineCount,
    removedLineCount: first.removedLineCount + second.removedLineCount,
  }
}

export function compareFileChanges(first: UiFileChange, second: UiFileChange): number {
  const firstRank = first.operation === 'add' ? 0 : first.operation === 'update' ? 1 : 2
  const secondRank = second.operation === 'add' ? 0 : second.operation === 'update' ? 1 : 2
  if (firstRank !== secondRank) return firstRank - secondRank
  const firstPath = `${first.path}\u0000${first.movedToPath ?? ''}`
  const secondPath = `${second.path}\u0000${second.movedToPath ?? ''}`
  return firstPath.localeCompare(secondPath)
}

export function aggregateFileChanges(changes: UiFileChange[]): UiFileChange[] {
  const byPath = new Map<string, UiFileChange>()
  for (const change of changes) {
    const key = `${change.path}\u0000${change.movedToPath ?? ''}`
    const previous = byPath.get(key)
    byPath.set(key, previous ? mergeFileChangeEntry(previous, change) : { ...change })
  }
  return Array.from(byPath.values()).sort(compareFileChanges)
}

export function fileChangeOperationLabel(change: UiFileChange): string {
  if (change.operation === 'update' && change.movedToPath) {
    return change.addedLineCount > 0 || change.removedLineCount > 0 ? 'Moved + edited' : 'Moved'
  }
  if (change.operation === 'add') return 'Added'
  if (change.operation === 'delete') return 'Deleted'
  return 'Edited'
}

export function fileChangeOperationTone(change: UiFileChange): 'add' | 'delete' | 'update' | 'move' {
  if (change.operation === 'update' && change.movedToPath) return 'move'
  return change.operation
}

export function formatFileChangeDelta(change: UiFileChange): string {
  const parts: string[] = []
  if (change.addedLineCount > 0) parts.push(`+${change.addedLineCount}`)
  if (change.removedLineCount > 0) parts.push(`-${change.removedLineCount}`)
  return parts.join(' ')
}

export type FileChangeDeltaTone = 'add' | 'remove' | 'neutral'

export type FileChangeDeltaPart = {
  tone: FileChangeDeltaTone
  label: string
}

export function buildFileChangeDeltaParts(addedCount: number, removedCount: number, fallbackLabel = ''): FileChangeDeltaPart[] {
  const parts: FileChangeDeltaPart[] = []
  if (addedCount > 0) parts.push({ tone: 'add', label: `+${addedCount}` })
  if (removedCount > 0) parts.push({ tone: 'remove', label: `-${removedCount}` })
  if (parts.length > 0) return parts
  return fallbackLabel ? [{ tone: 'neutral', label: fallbackLabel }] : []
}

export function fileChangeDeltaParts(change: UiFileChange): FileChangeDeltaPart[] {
  return buildFileChangeDeltaParts(change.addedLineCount, change.removedLineCount)
}

export function formatFileChangeCountLabel(count: number): string {
  return count === 1 ? '1 file changed' : `${count} files changed`
}

export function summarizeFileChangeKinds(summary: TurnFileChangeSummary | null): string {
  if (!summary || summary.changes.length === 0) return ''
  let added = 0
  let deleted = 0
  let edited = 0
  let moved = 0

  for (const change of summary.changes) {
    if (change.operation === 'add') {
      added += 1
      continue
    }
    if (change.operation === 'delete') {
      deleted += 1
      continue
    }
    if (change.movedToPath) {
      moved += 1
      continue
    }
    edited += 1
  }

  const parts: string[] = []
  if (edited > 0) parts.push(`${edited} edited`)
  if (added > 0) parts.push(`${added} added`)
  if (deleted > 0) parts.push(`${deleted} deleted`)
  if (moved > 0) parts.push(`${moved} moved`)
  return parts.join(', ')
}

export function fileChangeSummaryLabel(summary: TurnFileChangeSummary | null): string {
  if (!summary || summary.changes.length === 0) return 'Modified files'
  const countLabel = formatFileChangeCountLabel(summary.changes.length)
  const kindSummary = summarizeFileChangeKinds(summary)
  return kindSummary ? `${countLabel} · ${kindSummary}` : countLabel
}

export function fileChangeSummaryStatusParts(summary: TurnFileChangeSummary | null): FileChangeDeltaPart[] {
  if (!summary || summary.changes.length === 0) return []
  const totalAdded = summary.changes.reduce((sum, change) => sum + change.addedLineCount, 0)
  const totalRemoved = summary.changes.reduce((sum, change) => sum + change.removedLineCount, 0)
  const fallbackLabel = summary.changes.some((change) => change.movedToPath) ? 'Moved' : 'Ready'
  return buildFileChangeDeltaParts(totalAdded, totalRemoved, fallbackLabel)
}

export function hasStructuredUnifiedDiff(change: UiFileChange): boolean {
  return change.operation === 'update' && /^diff --git |^@@ |^--- |^\+\+\+ |^[ +-]|^\*\*\* (Move to:|End of File)/mu.test(change.diff)
}

export function buildSyntheticDiffLines(change: UiFileChange): DiffViewerLine[] {
  const normalized = change.diff.replace(/\r\n/g, '\n')
  const lines = normalized.length > 0 ? normalized.split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.map((line, index) => ({
    key: `${fileChangeKey(change)}:synthetic:${index}`,
    kind: change.operation === 'delete' ? 'remove' : 'add',
    oldLine: change.operation === 'delete' ? index + 1 : null,
    newLine: change.operation === 'delete' ? null : index + 1,
    text: line,
  }))
}

export function buildUnifiedDiffLines(change: UiFileChange): DiffViewerLine[] {
  const normalized = change.diff.replace(/\r\n/g, '\n')
  const lines = normalized.length > 0 ? normalized.split('\n') : []
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  const output: DiffViewerLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const [index, line] of lines.entries()) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/u)
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1])
      newLine = Number(hunkMatch[2])
      output.push({
        key: `${fileChangeKey(change)}:hunk:${index}`,
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        text: line,
      })
      continue
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      output.push({
        key: `${fileChangeKey(change)}:add:${index}`,
        kind: 'add',
        oldLine: null,
        newLine,
        text: line.slice(1),
      })
      newLine += 1
      continue
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      output.push({
        key: `${fileChangeKey(change)}:remove:${index}`,
        kind: 'remove',
        oldLine,
        newLine: null,
        text: line.slice(1),
      })
      oldLine += 1
      continue
    }

    if (line.startsWith(' ')) {
      output.push({
        key: `${fileChangeKey(change)}:context:${index}`,
        kind: 'context',
        oldLine,
        newLine,
        text: line.slice(1),
      })
      oldLine += 1
      newLine += 1
      continue
    }

    output.push({
      key: `${fileChangeKey(change)}:meta:${index}`,
      kind: 'meta',
      oldLine: null,
      newLine: null,
      text: line,
    })
  }

  return output
}

export function buildDiffViewerLines(change: UiFileChange | null): DiffViewerLine[] {
  if (!change || !change.diff.trim()) return []
  if (hasStructuredUnifiedDiff(change)) {
    return buildUnifiedDiffLines(change)
  }
  return buildSyntheticDiffLines(change)
}
