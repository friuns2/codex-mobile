import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

type SessionRecoveryCommandDeps = {
  runCommand: (command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }) => Promise<void>
  runCommandCapture: (command: string, args: string[], options?: { cwd?: string }) => Promise<string>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

export type SessionRecoveredFileChange = {
  path: string
  operation: 'add' | 'delete' | 'update'
  movedToPath: string | null
  diff: string
  addedLineCount: number
  removedLineCount: number
}

export type SessionRecoveredTurnFileChanges = {
  turnId: string
  turnIndex: number
  fileChanges: SessionRecoveredFileChange[]
}

function countRecoveredContentLines(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function countRecoveredPatchLines(value: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0
  let removedLineCount = 0

  for (const line of value.replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      addedLineCount += 1
      continue
    }
    if (line.startsWith('-')) {
      removedLineCount += 1
    }
  }

  return { addedLineCount, removedLineCount }
}

function mergeRecoveredDiff(first: string, second: string): string {
  if (!first) return second
  if (!second || first === second) return first
  return `${first}\n${second}`.trim()
}

function mergeRecoveredFileChange(first: SessionRecoveredFileChange, second: SessionRecoveredFileChange): SessionRecoveredFileChange {
  const operation = first.operation === 'add' || second.operation === 'add'
    ? 'add'
    : first.operation === 'delete' || second.operation === 'delete'
      ? 'delete'
      : 'update'

  return {
    path: second.path || first.path,
    operation,
    movedToPath: second.movedToPath ?? first.movedToPath ?? null,
    diff: mergeRecoveredDiff(first.diff, second.diff),
    addedLineCount: first.addedLineCount + second.addedLineCount,
    removedLineCount: first.removedLineCount + second.removedLineCount,
  }
}

function isApplyPatchSectionBoundary(value: string): boolean {
  return value.startsWith('*** Update File: ')
    || value.startsWith('*** Add File: ')
    || value.startsWith('*** Delete File: ')
    || value === '*** End Patch'
}

function parseApplyPatchInput(input: string): SessionRecoveredFileChange[] {
  const normalized = input.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const changes: SessionRecoveredFileChange[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''

    if (line.startsWith('*** Add File: ')) {
      const path = line.slice('*** Add File: '.length).trim()
      const contentLines: string[] = []
      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        contentLines.push(nextLine.startsWith('+') ? nextLine.slice(1) : nextLine)
      }
      const diff = contentLines.join('\n').trimEnd()
      if (path) {
        changes.push({
          path,
          operation: 'add',
          movedToPath: null,
          diff,
          addedLineCount: countRecoveredContentLines(diff),
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const path = line.slice('*** Delete File: '.length).trim()
      if (path) {
        changes.push({
          path,
          operation: 'delete',
          movedToPath: null,
          diff: '',
          addedLineCount: 0,
          removedLineCount: 0,
        })
      }
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const path = line.slice('*** Update File: '.length).trim()
      let movedToPath: string | null = null
      const diffLines: string[] = []

      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? ''
        if (nextLine.startsWith('*** Move to: ')) {
          const moved = nextLine.slice('*** Move to: '.length).trim()
          movedToPath = moved || null
          continue
        }
        if (isApplyPatchSectionBoundary(nextLine)) {
          index -= 1
          break
        }
        diffLines.push(nextLine)
      }

      const diff = diffLines.join('\n').trimEnd()
      const counts = countRecoveredPatchLines(diff)
      if (path) {
        changes.push({
          path,
          operation: 'update',
          movedToPath,
          diff,
          ...counts,
        })
      }
    }
  }

  return changes
}

export function buildSessionFileChangeFallback(threadReadPayload: unknown, sessionLogRaw: string): SessionRecoveredTurnFileChanges[] {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const turnIndexById = new Map<string, number>()

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turnRecord = asRecord(turns[turnIndex])
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) {
      turnIndexById.set(turnId, turnIndex)
    }
  }

  const collectedByTurnId = new Map<string, SessionRecoveredFileChange[]>()
  let currentTurnId = ''

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const payloadRecord = asRecord(row.payload)
      currentTurnId = readNonEmptyString(payloadRecord?.turn_id) || currentTurnId
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIndexById.has(currentTurnId)) {
      continue
    }

    const payloadRecord = asRecord(row.payload)
    if (
      payloadRecord?.type !== 'custom_tool_call'
      || payloadRecord.name !== 'apply_patch'
      || payloadRecord.status !== 'completed'
    ) {
      continue
    }

    const input = readNonEmptyString(payloadRecord.input)
    if (!input) continue

    const parsedChanges = parseApplyPatchInput(input)
    if (parsedChanges.length === 0) continue

    const previous = collectedByTurnId.get(currentTurnId) ?? []
    previous.push(...parsedChanges)
    collectedByTurnId.set(currentTurnId, previous)
  }

  const recovered: SessionRecoveredTurnFileChanges[] = []
  for (const [turnId, fileChanges] of collectedByTurnId.entries()) {
    const turnIndex = turnIndexById.get(turnId)
    if (typeof turnIndex !== 'number' || fileChanges.length === 0) continue

    const mergedByPath = new Map<string, SessionRecoveredFileChange>()
    for (const fileChange of fileChanges) {
      const key = `${fileChange.path}\u0000${fileChange.movedToPath ?? ''}`
      const previous = mergedByPath.get(key)
      mergedByPath.set(key, previous ? mergeRecoveredFileChange(previous, fileChange) : { ...fileChange })
    }

    recovered.push({
      turnId,
      turnIndex,
      fileChanges: Array.from(mergedByPath.values()),
    })
  }

  return recovered.sort((first, second) => first.turnIndex - second.turnIndex)
}

type SessionRecoveredCommand = {
  id: string
  type: 'commandExecution'
  command: string
  cwd: string | null
  status: 'completed' | 'failed'
  aggregatedOutput: string
  exitCode: number | null
  durationMs: number | null
}

function parseExecCommandOutput(output: string): { exitCode: number | null; wallTime: number | null; cleanOutput: string } {
  let exitCode: number | null = null
  let wallTime: number | null = null
  const outputLines: string[] = []
  let pastHeader = false

  for (const line of output.split('\n')) {
    if (!pastHeader) {
      const exitMatch = line.match(/^Process exited with code (\d+)/)
      if (exitMatch) {
        exitCode = Number.parseInt(exitMatch[1]!, 10)
        continue
      }
      const wallMatch = line.match(/^Wall time:\s+([\d.]+)\s+seconds/)
      if (wallMatch) {
        wallTime = Math.round(Number.parseFloat(wallMatch[1]!) * 1000)
        continue
      }
      if (line.startsWith('Command:') || line.startsWith('Chunk ID:') || line.startsWith('Original token count:')) {
        continue
      }
      if (line === 'Output:') {
        pastHeader = true
        continue
      }
    }
    outputLines.push(line)
  }

  return { exitCode, wallTime, cleanOutput: outputLines.join('\n').trimEnd() }
}

export type SessionRecoveredFileChangeItem = {
  id: string
  type: 'fileChange'
  status: 'completed'
  changes: Record<string, unknown>[]
}

type SessionItemSlot = {
  type: 'agentMessage' | 'commandExecution' | 'fileChange'
  command?: SessionRecoveredCommand
  fileChange?: SessionRecoveredFileChangeItem
}

function buildSessionItemOrder(sessionLogRaw: string, turnIds: Set<string>): Map<string, SessionItemSlot[]> {
  let currentTurnId = ''
  const orderByTurnId = new Map<string, SessionItemSlot[]>()
  const callIdToCommand = new Map<string, SessionRecoveredCommand>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIds.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let slots = orderByTurnId.get(currentTurnId)
    if (!slots) {
      slots = []
      orderByTurnId.set(currentTurnId, slots)
    }

    if (payload.type === 'message' && payload.role === 'assistant') {
      slots.push({ type: 'agentMessage' })
      continue
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      const command: SessionRecoveredCommand = {
        id: `session-cmd-${callId}`,
        type: 'commandExecution',
        command: cmd,
        cwd: null,
        status: 'completed',
        aggregatedOutput: '',
        exitCode: null,
        durationMs: null,
      }
      callIdToCommand.set(callId, command)
      slots.push({ type: 'commandExecution', command })
      continue
    }

    if (payload.type === 'function_call_output') {
      const callId = readNonEmptyString(payload.call_id)
      if (!callId) continue
      const existing = callIdToCommand.get(callId)
      if (!existing) continue
      const rawOutput = typeof payload.output === 'string' ? payload.output : ''
      const parsed = parseExecCommandOutput(rawOutput)
      existing.aggregatedOutput = parsed.cleanOutput
      existing.exitCode = parsed.exitCode
      existing.durationMs = parsed.wallTime
      existing.status = parsed.exitCode === 0 || parsed.exitCode === null ? 'completed' : 'failed'
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (!input || !callId) continue
      const parsedChanges = parseApplyPatchInput(input)
      if (parsedChanges.length === 0) continue
      const fcItem: SessionRecoveredFileChangeItem = {
        id: `session-fc-${callId}`,
        type: 'fileChange',
        status: 'completed',
        changes: parsedChanges.map((fc) => ({
          ...fc,
          kind: { type: fc.operation, ...(fc.movedToPath ? { move_path: fc.movedToPath } : {}) },
        })),
      }
      slots.push({ type: 'fileChange', fileChange: fcItem })
    }
  }

  return orderByTurnId
}

function extractFilePathsFromCommand(cmd: string, cwd: string): string[] {
  const paths: string[] = []
  const absPathPattern = /(?:^|\s|>>|>|<)(\/?(?:Users|home|tmp|var|etc|root)\/[^\s;|&><"']+)/g
  let match: RegExpExecArray | null
  while ((match = absPathPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.endsWith('/') && !p.startsWith('-')) paths.push(p)
  }

  const redirectPattern = /(?:>>?|cat\s*>\s*)([^\s;|&><"']+)/g
  while ((match = redirectPattern.exec(cmd)) !== null) {
    const p = match[1]?.trim()
    if (p && !p.startsWith('-') && !p.startsWith('/dev/')) {
      paths.push(isAbsolute(p) ? p : join(cwd, p))
    }
  }

  return [...new Set(paths)]
}

export type CollectedTurnFileInfo = {
  patchInputs: { callId: string; input: string }[]
  commandFilePaths: string[]
}

export function collectFileChangesForTurns(
  sessionLogRaw: string,
  turnIdsToRevert: Set<string>,
  cwd: string,
): Map<string, CollectedTurnFileInfo> {
  let currentTurnId = ''
  const infoByTurnId = new Map<string, CollectedTurnFileInfo>()

  for (const line of sessionLogRaw.split('\n')) {
    if (!line.trim()) continue
    let row: Record<string, unknown> | null = null
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (row.type === 'turn_context') {
      const p = asRecord(row.payload)
      currentTurnId = readNonEmptyString(p?.turn_id) || currentTurnId
      continue
    }
    if (row.type === 'event_msg') {
      const p = asRecord(row.payload)
      if (p?.type === 'task_started') {
        currentTurnId = readNonEmptyString(p.turn_id) || currentTurnId
      }
      continue
    }

    if (row.type !== 'response_item' || !currentTurnId || !turnIdsToRevert.has(currentTurnId)) continue
    const payload = asRecord(row.payload)
    if (!payload) continue

    let info = infoByTurnId.get(currentTurnId)
    if (!info) {
      info = { patchInputs: [], commandFilePaths: [] }
      infoByTurnId.set(currentTurnId, info)
    }

    if (payload.type === 'custom_tool_call' && payload.name === 'apply_patch' && payload.status === 'completed') {
      const input = typeof payload.input === 'string' ? payload.input : ''
      const callId = readNonEmptyString(payload.call_id)
      if (input && callId) {
        info.patchInputs.push({ callId, input })
      }
    }

    if (payload.type === 'function_call' && payload.name === 'exec_command') {
      let cmd = ''
      try {
        const args = JSON.parse(payload.arguments as string) as Record<string, unknown>
        cmd = typeof args.cmd === 'string' ? args.cmd : ''
      } catch { /* empty */ }
      if (cmd) {
        const extracted = extractFilePathsFromCommand(cmd, cwd)
        for (const p of extracted) {
          if (!info.commandFilePaths.includes(p)) info.commandFilePaths.push(p)
        }
      }
    }
  }

  return infoByTurnId
}

function reverseV4aDiff(fileContent: string, diffText: string): string | null {
  const fileLines = fileContent.split('\n')
  const rawDiffLines = diffText.split('\n')
  while (rawDiffLines.length > 0 && rawDiffLines[rawDiffLines.length - 1]?.trim() === '') rawDiffLines.pop()
  const diffLines = rawDiffLines
  const result = [...fileLines]

  type DiffEntry = { type: 'context' | 'add' | 'remove'; text: string }
  const hunks: DiffEntry[][] = []
  let currentHunk: DiffEntry[] | null = null

  for (const dl of diffLines) {
    if (dl.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = []
      continue
    }
    if (!currentHunk) continue
    if (dl.startsWith('+')) {
      currentHunk.push({ type: 'add', text: dl.slice(1) })
    } else if (dl.startsWith('-')) {
      currentHunk.push({ type: 'remove', text: dl.slice(1) })
    } else if (dl.startsWith(' ')) {
      currentHunk.push({ type: 'context', text: dl.slice(1) })
    } else {
      currentHunk.push({ type: 'context', text: dl })
    }
  }
  if (currentHunk) hunks.push(currentHunk)

  for (let hi = hunks.length - 1; hi >= 0; hi--) {
    const hunk = hunks[hi]!
    const expectedSequence = hunk
      .filter((e) => e.type === 'context' || e.type === 'add')
      .map((e) => e.text)

    if (expectedSequence.length === 0) continue

    let seqStart = -1
    outer: for (let ri = result.length - expectedSequence.length; ri >= 0; ri--) {
      for (let si = 0; si < expectedSequence.length; si++) {
        if (result[ri + si] !== expectedSequence[si]) continue outer
      }
      seqStart = ri
      break
    }

    if (seqStart < 0) return null

    const newLines: string[] = []
    let seqIdx = 0
    for (const entry of hunk) {
      if (entry.type === 'context') {
        newLines.push(result[seqStart + seqIdx]!)
        seqIdx++
      } else if (entry.type === 'add') {
        seqIdx++
      } else if (entry.type === 'remove') {
        newLines.push(entry.text)
      }
    }

    result.splice(seqStart, expectedSequence.length, ...newLines)
  }

  return result.join('\n')
}

export async function revertTurnFileChanges(
  cwd: string,
  turnInfos: Map<string, CollectedTurnFileInfo>,
  deps: SessionRecoveryCommandDeps,
): Promise<{ reverted: number; errors: string[] }> {
  if (turnInfos.size === 0) return { reverted: 0, errors: [] }

  let reverted = 0
  const errors: string[] = []

  const allEntries = [...turnInfos.values()]
  const allPatchInputs = allEntries.flatMap((info) => info.patchInputs).reverse()
  const allCommandPaths = new Set(allEntries.flatMap((info) => info.commandFilePaths))

  let isGitRepo = false
  let gitRoot = ''
  try {
    gitRoot = await deps.runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
    isGitRepo = !!gitRoot
  } catch { /* not a git repo */ }

  const trackedFiles = new Set<string>()
  if (isGitRepo) {
    try {
      const tracked = await deps.runCommandCapture('git', ['ls-files', '--full-name'], { cwd: gitRoot })
      for (const f of tracked.split('\n')) {
        if (f.trim()) trackedFiles.add(join(gitRoot, f.trim()))
      }
    } catch { /* empty */ }
  }

  const patchRevertedPaths = new Set<string>()

  for (const patch of allPatchInputs) {
    const changes = parseApplyPatchInput(patch.input)
    for (let ci = changes.length - 1; ci >= 0; ci--) {
      const change = changes[ci]!
      const filePath = isAbsolute(change.path) ? change.path : join(cwd, change.path)

      try {
        if (change.operation === 'add') {
          const fileStat = await stat(filePath).catch(() => null)
          if (fileStat) {
            await rm(filePath, { force: true })
            reverted++
            patchRevertedPaths.add(filePath)
          }
        } else if (change.operation === 'update' && change.diff) {
          let reversed = false
          try {
            const currentContent = await readFile(filePath, 'utf8')
            const newContent = reverseV4aDiff(currentContent, change.diff)
            if (newContent !== null && newContent !== currentContent) {
              const { writeFile } = await import('node:fs/promises')
              await writeFile(filePath, newContent)
              reverted++
              patchRevertedPaths.add(filePath)
              reversed = true
            }
          } catch { /* file read/write failed */ }

          if (!reversed) {
            const isTracked = trackedFiles.has(filePath)
            if (isTracked && isGitRepo) {
              const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
              try {
                await deps.runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
                reverted++
                patchRevertedPaths.add(filePath)
              } catch {
                errors.push(`Could not revert: ${filePath}`)
              }
            } else {
              errors.push(`Could not reverse patch for untracked file: ${filePath}`)
            }
          }
        } else if (change.operation === 'delete') {
          const isTracked = trackedFiles.has(filePath)
          if (isTracked && isGitRepo) {
            const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
            try {
              await deps.runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
              reverted++
              patchRevertedPaths.add(filePath)
            } catch {
              errors.push(`Could not restore deleted file: ${filePath}`)
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to revert patch for ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  for (const filePath of allCommandPaths) {
    if (patchRevertedPaths.has(filePath)) continue
    const isTracked = trackedFiles.has(filePath)
    if (isTracked && isGitRepo) {
      const relativePath = filePath.startsWith(gitRoot + '/') ? filePath.slice(gitRoot.length + 1) : filePath
      try {
        await deps.runCommand('git', ['checkout', 'HEAD', '--', relativePath], { cwd: gitRoot })
        reverted++
      } catch {
        errors.push(`Could not restore command-modified file: ${filePath}`)
      }
    }
  }

  return { reverted, errors }
}

export function mergeSessionCommandsIntoTurns(turns: unknown[], sessionLogRaw: string): unknown[] {
  const turnIds = new Set<string>()
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    if (turnId) turnIds.add(turnId)
  }

  if (turnIds.size === 0) return turns

  const orderByTurnId = buildSessionItemOrder(sessionLogRaw, turnIds)
  if (orderByTurnId.size === 0) return turns

  return turns.map((turn) => {
    const turnRecord = asRecord(turn)
    if (!turnRecord) return turn
    const turnId = readNonEmptyString(turnRecord.id)
    if (!turnId) return turn

    const slots = orderByTurnId.get(turnId)
    if (!slots || slots.length === 0) return turn

    const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
    const alreadyHasRecoveredItems = existingItems.some((it) => it.type === 'commandExecution' || it.type === 'fileChange')
    if (alreadyHasRecoveredItems) return turn

    const agentMessages = existingItems.filter((it) => it.type === 'agentMessage')
    const nonAgentNonUserItems = existingItems.filter((it) => it.type !== 'agentMessage' && it.type !== 'userMessage')
    const userMessages = existingItems.filter((it) => it.type === 'userMessage')

    let agentIdx = 0
    const interleaved: Record<string, unknown>[] = [...userMessages]

    for (const slot of slots) {
      if (slot.type === 'agentMessage') {
        if (agentIdx < agentMessages.length) {
          interleaved.push(agentMessages[agentIdx]!)
          agentIdx++
        }
      } else if (slot.type === 'commandExecution' && slot.command) {
        interleaved.push(slot.command as unknown as Record<string, unknown>)
      } else if (slot.type === 'fileChange' && slot.fileChange) {
        interleaved.push(slot.fileChange as unknown as Record<string, unknown>)
      }
    }

    while (agentIdx < agentMessages.length) {
      interleaved.push(agentMessages[agentIdx]!)
      agentIdx++
    }

    interleaved.push(...nonAgentNonUserItems)

    return {
      ...turnRecord,
      items: interleaved,
    }
  })
}
