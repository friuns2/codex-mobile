type TableAlignment = 'left' | 'center' | 'right' | null

type TaskListItem = {
  text: string
  checked: boolean
}

type ListItem = {
  paragraphs: string[]
  children?: MarkdownBlock[]
}

type MarkdownBlock =
  | { kind: 'paragraph'; value: string }
  | { kind: 'heading'; level: number; value: string }
  | { kind: 'blockquote'; value: string }
  | { kind: 'unorderedList'; items: ListItem[] }
  | { kind: 'taskList'; items: TaskListItem[] }
  | { kind: 'orderedList'; items: ListItem[]; start: number }
  | { kind: 'table'; headers: string[]; rows: string[][]; alignments: TableAlignment[] }
  | { kind: 'codeBlock'; language: string; value: string }
  | { kind: 'thematicBreak' }
  | { kind: 'image'; url: string; alt: string; markdown: string }

function normalizeMarkdownText(text: string): string {
  return text.replace(/\r\n/gu, '\n')
}

function leadingIndentWidth(line: string): number {
  const leadingWhitespace = line.match(/^\s*/u)?.[0] ?? ''
  return leadingWhitespace.replace(/\t/gu, '    ').length
}

function stripIndentedContent(line: string, baseIndent: number): string {
  let width = 0
  let index = 0
  while (index < line.length && width < baseIndent) {
    const character = line[index]
    width += character === '\t' ? 4 : 1
    index += 1
  }
  return line.slice(index)
}

function isBlankMarkdownLine(line: string): boolean {
  return line.trim().length === 0
}

function readHeading(line: string): { level: number; value: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/u)
  if (!match) return null
  return {
    level: match[1].length,
    value: match[2].trim(),
  }
}

function readBlockquoteLine(line: string): string | null {
  const match = line.match(/^\s{0,3}>\s?(.*)$/u)
  if (!match) return null
  return match[1] ?? ''
}

function readUnorderedListItem(line: string): string | null {
  const match = line.match(/^\s*[-*+]\s+(.+)$/u)
  return match?.[1]?.trim() ?? null
}

function readUnorderedListItemMatch(line: string): { indent: number; text: string } | null {
  const match = line.match(/^(\s*)[-*+]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    text: match[2]?.trim() ?? '',
  }
}

function readTaskListItem(line: string): TaskListItem | null {
  const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/u)
  if (!match) return null
  return {
    checked: (match[1] ?? ' ').toLowerCase() === 'x',
    text: match[2]?.trim() ?? '',
  }
}

function readTaskListItemMatch(line: string): { indent: number; item: TaskListItem } | null {
  const match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    item: {
      checked: (match[2] ?? ' ').toLowerCase() === 'x',
      text: match[3]?.trim() ?? '',
    },
  }
}

function readOrderedListItemData(line: string): { indent: number; text: string; start: number } | null {
  const match = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/u)
  if (!match) return null
  return {
    indent: leadingIndentWidth(match[1] ?? ''),
    start: Number.parseInt(match[2] ?? '1', 10) || 1,
    text: match[3]?.trim() ?? '',
  }
}

function readOrderedListItem(line: string): string | null {
  return readOrderedListItemData(line)?.text ?? null
}

function readOrderedListItemMatch(line: string): { indent: number; text: string; start: number } | null {
  return readOrderedListItemData(line)
}

function splitMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return null

  let content = trimmed
  if (content.startsWith('|')) content = content.slice(1)
  if (content.endsWith('|')) content = content.slice(0, -1)

  const cells: string[] = []
  let current = ''
  let codeFenceLength = 0

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]

    if (character === '\\' && content[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }

    if (character === '`') {
      let runLength = 1
      while (content[index + runLength] === '`') runLength += 1
      current += content.slice(index, index + runLength)
      if (codeFenceLength === 0) codeFenceLength = runLength
      else if (codeFenceLength === runLength) codeFenceLength = 0
      index += runLength - 1
      continue
    }

    if (character === '|' && codeFenceLength === 0) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells.some((cell) => cell.length > 0) ? cells : null
}

function readTableAlignmentRow(line: string): TableAlignment[] | null {
  const cells = splitMarkdownTableRow(line)
  if (!cells || cells.length === 0) return null

  const alignments = cells.map((cell) => {
    const trimmed = cell.replace(/\s+/gu, '')
    if (!/^:?-{3,}:?$/u.test(trimmed)) return null
    const startsWithColon = trimmed.startsWith(':')
    const endsWithColon = trimmed.endsWith(':')
    if (startsWithColon && endsWithColon) return 'center'
    if (endsWithColon) return 'right'
    if (startsWithColon) return 'left'
    return null
  })

  return alignments.every((alignment, index) => alignment !== null || /^-+$/u.test(cells[index].replace(/\s+/gu, '')))
    ? alignments
    : null
}

function normalizeTableCells(cells: string[], width: number): string[] {
  if (cells.length === width) return cells
  if (cells.length > width) return cells.slice(0, width)
  return [...cells, ...Array.from({ length: width - cells.length }, () => '')]
}

function readTableBlock(lines: string[], startIndex: number): Extract<MarkdownBlock, { kind: 'table' }> | null {
  if (startIndex + 1 >= lines.length) return null

  const headerLine = lines[startIndex]
  const separatorLine = lines[startIndex + 1]
  const headers = splitMarkdownTableRow(headerLine)
  const alignments = readTableAlignmentRow(separatorLine)
  if (!headers || !alignments) return null
  if (headers.length !== alignments.length) return null

  const trimmedHeader = headerLine.trim()
  if (!trimmedHeader.startsWith('|') && (trimmedHeader.match(/\|/gu)?.length ?? 0) < 2) return null

  const width = headers.length
  const rows: string[][] = []
  let index = startIndex + 2
  while (index < lines.length) {
    if (isBlankMarkdownLine(lines[index])) break
    const row = splitMarkdownTableRow(lines[index])
    if (!row) break
    rows.push(normalizeTableCells(row, width))
    index += 1
  }

  return {
    kind: 'table',
    headers: normalizeTableCells(headers, width),
    rows,
    alignments,
  }
}

function isParagraphBreakingLine(line: string): boolean {
  return (
    isBlankMarkdownLine(line) ||
    readFenceStart(line) !== null ||
    isThematicBreakLine(line) ||
    readHeading(line) !== null ||
    readBlockquoteLine(line) !== null ||
    readTaskListItem(line) !== null ||
    readUnorderedListItem(line) !== null ||
    readOrderedListItem(line) !== null
  )
}

function readListParagraph(
  lines: string[],
  startIndex: number,
  baseIndent = -1,
): { value: string; nextIndex: number } | null {
  const paragraphLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    if (isParagraphBreakingLine(lines[index])) break
    if (baseIndent >= 0 && leadingIndentWidth(lines[index]) <= baseIndent) break

    paragraphLines.push(baseIndent >= 0 ? stripIndentedContent(lines[index], baseIndent + 1) : lines[index])
    index += 1
  }

  const value = paragraphLines.join('\n').trim()
  return value ? { value, nextIndex: index } : null
}

function findNextNonBlankLineIndex(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!isBlankMarkdownLine(lines[index])) return index
  }
  return -1
}

function readNestedListBlocks(
  lines: string[],
  startIndex: number,
  parentIndent: number,
  stopAtItem: ((line: string) => { indent: number; text: string } | null) | null = null,
  allowLooseChildLists = false,
): { blocks: MarkdownBlock[]; nextIndex: number } | null {
  const nestedLines: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    if (isBlankMarkdownLine(line)) {
      const nextNonBlankIndex = findNextNonBlankLineIndex(lines, index + 1)
      if (nextNonBlankIndex === -1) {
        nestedLines.push('')
        index = lines.length
        break
      }
      const nextStopItem = stopAtItem?.(lines[nextNonBlankIndex])
      if (nextStopItem && nextStopItem.indent === parentIndent) break
      if (leadingIndentWidth(lines[nextNonBlankIndex]) <= parentIndent) break
      nestedLines.push('')
      index += 1
      continue
    }

    const stopItem = stopAtItem?.(line)
    if (stopItem && stopItem.indent === parentIndent) break

    const lineIndent = leadingIndentWidth(line)
    const isLooseChildList = allowLooseChildLists && (
      readTaskListItem(line) !== null ||
      readUnorderedListItem(line) !== null
    )
    if (lineIndent <= parentIndent && !isLooseChildList) break

    nestedLines.push(
      lineIndent > parentIndent
        ? stripIndentedContent(line, parentIndent + 1)
        : line.trimStart(),
    )
    index += 1
  }

  while (nestedLines.length > 0 && isBlankMarkdownLine(nestedLines[0])) nestedLines.shift()
  while (nestedLines.length > 0 && isBlankMarkdownLine(nestedLines[nestedLines.length - 1])) nestedLines.pop()

  if (nestedLines.length === 0) return null

  return {
    blocks: parseTextBlocks(nestedLines.join('\n')),
    nextIndex: index,
  }
}

function readListItems(
  lines: string[],
  startIndex: number,
  readItem: (line: string) => { indent: number; text: string } | null,
  allowLooseChildLists = false,
): { items: ListItem[]; nextIndex: number } | null {
  const items: ListItem[] = []
  let index = startIndex
  const firstItem = readItem(lines[startIndex])
  if (!firstItem) return null
  const baseIndent = firstItem.indent

  while (index < lines.length) {
    const itemValue = readItem(lines[index])
    if (itemValue === null || itemValue.indent !== baseIndent) break

    const paragraphs = [itemValue.text]
    const children: MarkdownBlock[] = []
    index += 1

    while (index < lines.length) {
      if (isBlankMarkdownLine(lines[index])) {
        const nextNonBlankIndex = findNextNonBlankLineIndex(lines, index + 1)
        if (nextNonBlankIndex === -1) {
          index = lines.length
          break
        }
        const nextSameLevelItem = readItem(lines[nextNonBlankIndex])
        if (nextSameLevelItem && nextSameLevelItem.indent === baseIndent) {
          index = nextNonBlankIndex
          break
        }
        if (leadingIndentWidth(lines[nextNonBlankIndex]) <= baseIndent) {
          index = nextNonBlankIndex
          break
        }
        index += 1
        continue
      }

      const nextSameLevelItem = readItem(lines[index])
      if (nextSameLevelItem && nextSameLevelItem.indent === baseIndent) break

      const hasIndentedChildren = leadingIndentWidth(lines[index]) > baseIndent
      const hasLooseChildList = allowLooseChildLists && (
        readTaskListItem(lines[index]) !== null ||
        readUnorderedListItem(lines[index]) !== null
      )
      if (hasIndentedChildren || hasLooseChildList) {
        const nestedBlocks = readNestedListBlocks(lines, index, baseIndent, readItem, allowLooseChildLists)
        if (nestedBlocks) {
          children.push(...nestedBlocks.blocks)
          index = nestedBlocks.nextIndex
          continue
        }
      }

      if (leadingIndentWidth(lines[index]) <= baseIndent) break

      const continuation = readListParagraph(lines, index, baseIndent)
      if (!continuation) break
      paragraphs.push(continuation.value)
      index = continuation.nextIndex
    }

    items.push(children.length > 0 ? { paragraphs, children } : { paragraphs })
  }

  return items.length > 0 ? { items, nextIndex: index } : null
}

function isThematicBreakLine(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line.trim())
}

function readFenceStart(line: string): { marker: string; language: string } | null {
  const match = line.match(/^\s{0,3}(```+|~~~+)\s*([^\s`~][^`]*)?\s*$/u)
  if (!match) return null
  return {
    marker: match[1],
    language: (match[2] ?? '').trim(),
  }
}

function parseTextBlocks(text: string): MarkdownBlock[] {
  const normalizedText = normalizeMarkdownText(text)
  const lines = normalizedText.split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    if (isBlankMarkdownLine(lines[index])) {
      index += 1
      continue
    }

    const fence = readFenceStart(lines[index])
    if (fence) {
      index += 1
      const codeLines: string[] = []
      while (index < lines.length) {
        if (lines[index].trim() === fence.marker) {
          index += 1
          break
        }
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({
        kind: 'codeBlock',
        language: fence.language,
        value: codeLines.join('\n'),
      })
      continue
    }

    if (isThematicBreakLine(lines[index])) {
      blocks.push({ kind: 'thematicBreak' })
      index += 1
      continue
    }

    const heading = readHeading(lines[index])
    if (heading) {
      blocks.push({ kind: 'heading', level: heading.level, value: heading.value })
      index += 1
      continue
    }

    const quoteLine = readBlockquoteLine(lines[index])
    if (quoteLine !== null) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const nextQuoteLine = readBlockquoteLine(lines[index])
        if (nextQuoteLine === null) break
        quoteLines.push(nextQuoteLine)
        index += 1
      }
      blocks.push({ kind: 'blockquote', value: quoteLines.join('\n').trim() })
      continue
    }

    const table = readTableBlock(lines, index)
    if (table) {
      blocks.push(table)
      index += 2 + table.rows.length
      continue
    }

    const taskItem = readTaskListItem(lines[index])
    if (taskItem !== null) {
      const items: TaskListItem[] = []
      const baseIndent = readTaskListItemMatch(lines[index])?.indent ?? 0
      while (index < lines.length) {
        const nextItem = readTaskListItemMatch(lines[index])
        if (nextItem === null || nextItem.indent !== baseIndent) break
        items.push(nextItem.item)
        index += 1
      }
      if (items.length > 0) {
        blocks.push({ kind: 'taskList', items })
        continue
      }
    }

    const unorderedItem = readUnorderedListItem(lines[index])
    if (unorderedItem !== null) {
      const parsedList = readListItems(lines, index, readUnorderedListItemMatch)
      if (parsedList) {
        blocks.push({ kind: 'unorderedList', items: parsedList.items })
        index = parsedList.nextIndex
        continue
      }
      if (unorderedItem.length > 0) {
        blocks.push({ kind: 'unorderedList', items: [{ paragraphs: [unorderedItem] }] })
        index += 1
        continue
      }
    }

    const orderedItem = readOrderedListItem(lines[index])
    if (orderedItem !== null) {
      const orderedItemMatch = readOrderedListItemMatch(lines[index])
      const parsedList = readListItems(lines, index, readOrderedListItemMatch, true)
      if (parsedList) {
        blocks.push({
          kind: 'orderedList',
          items: parsedList.items,
          start: orderedItemMatch?.start ?? 1,
        })
        index = parsedList.nextIndex
        continue
      }
      if (orderedItem.length > 0) {
        blocks.push({
          kind: 'orderedList',
          items: [{ paragraphs: [orderedItem] }],
          start: orderedItemMatch?.start ?? 1,
        })
        index += 1
        continue
      }
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      if (isBlankMarkdownLine(lines[index])) break
      if (
        readFenceStart(lines[index]) ||
        isThematicBreakLine(lines[index]) ||
        readHeading(lines[index]) ||
        readTableBlock(lines, index) ||
        readBlockquoteLine(lines[index]) !== null ||
        readTaskListItem(lines[index]) !== null ||
        readUnorderedListItem(lines[index]) !== null ||
        readOrderedListItem(lines[index]) !== null
      ) break
      paragraphLines.push(lines[index])
      index += 1
    }

    const value = paragraphLines.join('\n').trim()
    if (value) {
      blocks.push({ kind: 'paragraph', value })
    }
  }

  return blocks
}

function parseNonCodeMessageBlocks(text: string): MarkdownBlock[] {
  if (!text.includes('![') || !text.includes('](')) {
    return parseTextBlocks(text)
  }

  const blocks: MarkdownBlock[] = []
  const imagePattern = /!\[([^\]]*)\]\(([^)\n]+)\)/gu
  let cursor = 0

  for (const match of text.matchAll(imagePattern)) {
    const [fullMatch, altRaw, urlRaw] = match
    if (typeof match.index !== 'number') continue

    const start = match.index
    const end = start + fullMatch.length
    const imageUrl = urlRaw.trim()
    if (!imageUrl) continue

    if (start > cursor) {
      blocks.push(...parseTextBlocks(text.slice(cursor, start)))
    }

    blocks.push({ kind: 'image', url: imageUrl, alt: altRaw.trim(), markdown: fullMatch })
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push(...parseTextBlocks(text.slice(cursor)))
  }

  return blocks
}

function parseMessageBlocks(text: string): MarkdownBlock[] {
  const normalizedText = normalizeMarkdownText(text)
  const lines = normalizedText.split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0
  let chunkStart = 0

  const flushChunk = (endExclusive: number): void => {
    if (endExclusive <= chunkStart) return
    const chunk = lines.slice(chunkStart, endExclusive).join('\n')
    blocks.push(...parseNonCodeMessageBlocks(chunk))
  }

  while (index < lines.length) {
    const fence = readFenceStart(lines[index])
    if (!fence) {
      index += 1
      continue
    }

    flushChunk(index)

    index += 1
    const codeLines: string[] = []
    while (index < lines.length) {
      if (lines[index].trim() === fence.marker) {
        index += 1
        break
      }
      codeLines.push(lines[index])
      index += 1
    }

    blocks.push({
      kind: 'codeBlock',
      language: fence.language,
      value: codeLines.join('\n'),
    })
    chunkStart = index
  }

  flushChunk(lines.length)
  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', value: text }]
}

function isFilePath(value: string): boolean {
  if (!value || /[\r\n]/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value) && !value.startsWith('file://') && !value.startsWith('codex://')) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  const looksLikeFileUrl = value.startsWith('file://')
  const looksLikeCodexThread = value.startsWith('codex://threads/')
  if (looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative || looksLikeFileUrl || looksLikeCodexThread) return true

  const looksLikeBareFilename = /^[A-Za-z0-9._@() -]+\.[A-Za-z0-9]{1,12}$/u.test(value)
  if (looksLikeBareFilename) return true

  return /^[A-Za-z0-9._@() -]+(?:[\\/][A-Za-z0-9._@() -]+)+$/u.test(value)
}

function normalizeFileUrlToPath(pathValue: string): string {
  if (!pathValue.startsWith('file://')) return pathValue
  let stripped = pathValue.replace(/^file:\/\//u, '')
  try {
    stripped = decodeURIComponent(stripped)
  } catch {
    // Keep best-effort path if decoding fails.
  }
  if (/^\/[A-Za-z]:\//u.test(stripped)) {
    stripped = stripped.slice(1)
  }
  return stripped
}

function trimLinkWrappers(value: string): { core: string; leading: string; trailing: string } {
  let core = value
  let leading = ''
  let trailing = ''

  const wrapperPairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
    '"': '"',
    '\'': '\'',
    '`': '`',
    '“': '”',
    '‘': '’',
  }

  while (core.length > 0) {
    const opening = core[0]
    const closing = Object.prototype.hasOwnProperty.call(wrapperPairs, opening) ? wrapperPairs[opening] : ''
    if (!closing || !core.endsWith(closing)) break
    leading += opening
    trailing += closing
    core = core.slice(1, -1)
  }

  return { core, leading, trailing }
}

function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value.trim()
  const wrapped = trimLinkWrappers(pathValue)
  pathValue = wrapped.core.trim()
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  pathValue = normalizeFileUrlToPath(pathValue)
  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

function parseMarkdownLinkToken(value: string): { label: string; target: string } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(')')) return null
  const labelCloseIndex = trimmed.indexOf(']')
  if (labelCloseIndex <= 1) return null
  if (trimmed[labelCloseIndex + 1] !== '(') return null
  const labelRaw = trimmed.slice(1, labelCloseIndex).trim()
  const targetRaw = trimmed.slice(labelCloseIndex + 2, -1).trim()
  if (labelRaw.includes('\n') || targetRaw.includes('\n')) return null
  const label = trimLinkWrappers(labelRaw).core.trim() || labelRaw
  const target = trimLinkWrappers(targetRaw).core.trim()
  if (!target) return null
  return { label, target }
}

function escapeInsertedMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>~])/gu, '\\$1')
}

function isExternalLinkTarget(target: string): boolean {
  return /^https?:\/\//u.test(target) || /^tg:\/\//u.test(target) || /^mailto:/u.test(target)
}

function toBoldLiteral(value: string): string {
  const normalized = value.trim()
  return normalized ? `**${escapeInsertedMarkdownText(normalized)}**` : ''
}

function readCodeSpan(source: string, startIndex: number): { raw: string; content: string; end: number } | null {
  if (source[startIndex] !== '`') return null
  let openLength = 1
  while (source[startIndex + openLength] === '`') openLength += 1
  const delimiter = '`'.repeat(openLength)

  let searchFrom = startIndex + openLength
  let closingStart = -1
  while (searchFrom < source.length) {
    const candidate = source.indexOf(delimiter, searchFrom)
    if (candidate < 0) break

    const hasBacktickBefore = candidate > 0 && source[candidate - 1] === '`'
    const hasBacktickAfter = candidate + openLength < source.length && source[candidate + openLength] === '`'
    const hasNewLineInside = source.slice(startIndex + openLength, candidate).includes('\n')

    if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
      closingStart = candidate
      break
    }
    searchFrom = candidate + 1
  }

  if (closingStart < 0) return null

  return {
    raw: source.slice(startIndex, closingStart + openLength),
    content: source.slice(startIndex + openLength, closingStart),
    end: closingStart + openLength,
  }
}

function findNextMarkdownLink(
  source: string,
  fromIndex: number,
): { start: number; end: number; token: string } | null {
  let linkStart = source.indexOf('[', fromIndex)
  while (linkStart >= 0) {
    const labelEnd = source.indexOf(']', linkStart + 1)
    if (labelEnd < 0) return null
    if (source[labelEnd + 1] !== '(') {
      linkStart = source.indexOf('[', linkStart + 1)
      continue
    }

    let depth = 1
    let index = labelEnd + 2
    let hasNewLine = false
    while (index < source.length) {
      const char = source[index]
      if (char === '\n') {
        hasNewLine = true
        break
      }
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth === 0) {
          const token = source.slice(linkStart, index + 1)
          if (parseMarkdownLinkToken(token)) {
            return { start: linkStart, end: index + 1, token }
          }
          break
        }
      }
      index += 1
    }

    if (hasNewLine) {
      linkStart = source.indexOf('[', linkStart + 1)
      continue
    }
    linkStart = source.indexOf('[', linkStart + 1)
  }
  return null
}

function replaceMarkdownLinksWithTelegramText(source: string): string {
  let cursor = 0
  let output = ''

  while (cursor < source.length) {
    const match = findNextMarkdownLink(source, cursor)
    if (!match) {
      output += source.slice(cursor)
      break
    }

    output += source.slice(cursor, match.start)
    const parsed = parseMarkdownLinkToken(match.token)
    if (!parsed) {
      output += match.token
      cursor = match.end
      continue
    }

    if (isExternalLinkTarget(parsed.target)) {
      output += match.token
      cursor = match.end
      continue
    }

    const label = parsed.label || parsed.target
    const fileRef = parseFileReference(parsed.target)
    output += toBoldLiteral(fileRef ? `${label}` : label)
    cursor = match.end
  }

  return output
}

function replaceBareLocalPaths(source: string): string {
  const pattern = /(?:^|[\s(>])((?:file:\/\/|~\/|\.{1,2}\/|\/|[A-Za-z]:[\\/])[^\s<>"'`]+)/gu
  let cursor = 0
  let output = ''

  for (const match of source.matchAll(pattern)) {
    if (typeof match.index !== 'number') continue
    const fullMatch = match[0]
    const candidate = match[1] ?? ''
    const start = match.index + fullMatch.indexOf(candidate)
    const end = start + candidate.length
    const trimmedCandidate = candidate.replace(/[.,;:!?，。；：！？、]+$/u, '')
    const trailing = candidate.slice(trimmedCandidate.length)
    if (!trimmedCandidate) continue

    const ref = parseFileReference(trimmedCandidate)
    if (!ref) continue

    output += source.slice(cursor, start)
    output += toBoldLiteral(trimmedCandidate)
    output += trailing
    cursor = end
  }

  if (cursor < source.length) {
    output += source.slice(cursor)
  }

  return output || source
}

function sanitizeInlineMarkdownForTelegram(text: string): string {
  let cursor = 0
  let output = ''

  while (cursor < text.length) {
    const nextCodeIndex = text.indexOf('`', cursor)
    if (nextCodeIndex < 0) {
      const plain = text.slice(cursor)
      output += replaceBareLocalPaths(replaceMarkdownLinksWithTelegramText(plain))
      break
    }

    const plain = text.slice(cursor, nextCodeIndex)
    output += replaceBareLocalPaths(replaceMarkdownLinksWithTelegramText(plain))

    const codeSpan = readCodeSpan(text, nextCodeIndex)
    if (!codeSpan) {
      output += '`'
      cursor = nextCodeIndex + 1
      continue
    }

    const codeContent = codeSpan.content.trim()
    const codeLink = parseMarkdownLinkToken(codeContent)
    if (codeLink && !isExternalLinkTarget(codeLink.target)) {
      output += toBoldLiteral(codeLink.label || codeLink.target)
    } else {
      const fileRef = parseFileReference(codeContent)
      output += fileRef ? toBoldLiteral(fileRef.line ? `${fileRef.path}:${String(fileRef.line)}` : fileRef.path) : codeSpan.raw
    }

    cursor = codeSpan.end
  }

  return output
}

function renderListItems(items: ListItem[], indent: string, orderedStart: number | null): string {
  return items
    .map((item, index) => renderListItem(item, indent, orderedStart === null ? '- ' : `${String(orderedStart + index)}. `))
    .join('\n')
}

function indentMultiline(value: string, indent: string): string {
  return value
    .split('\n')
    .map((line) => (line.length > 0 ? `${indent}${line}` : indent.trimEnd()))
    .join('\n')
}

function renderListItem(item: ListItem, indent: string, marker: string): string {
  const lines: string[] = []
  const paragraphs = item.paragraphs.length > 0 ? item.paragraphs : ['']
  lines.push(`${indent}${marker}${sanitizeInlineMarkdownForTelegram(paragraphs[0])}`)
  for (const paragraph of paragraphs.slice(1)) {
    lines.push(`${indent}  ${sanitizeInlineMarkdownForTelegram(paragraph)}`)
  }
  if (item.children && item.children.length > 0) {
    const childMarkdown = renderBlocksToTelegramMarkdown(item.children, `${indent}  `)
    if (childMarkdown.trim()) {
      lines.push(indentMultiline(childMarkdown, ''))
    }
  }
  return lines.join('\n')
}

function renderTable(block: Extract<MarkdownBlock, { kind: 'table' }>): string {
  const headerLine = `| ${block.headers.map((cell) => sanitizeInlineMarkdownForTelegram(cell)).join(' | ')} |`
  const separatorLine = `| ${block.alignments.map((alignment) => {
    if (alignment === 'left') return ':---'
    if (alignment === 'center') return ':---:'
    if (alignment === 'right') return '---:'
    return '---'
  }).join(' | ')} |`
  const rowLines = block.rows.map((row) => `| ${row.map((cell) => sanitizeInlineMarkdownForTelegram(cell)).join(' | ')} |`)
  return [headerLine, separatorLine, ...rowLines].join('\n')
}

function renderBlockToTelegramMarkdown(block: MarkdownBlock, indent = ''): string {
  if (block.kind === 'paragraph') {
    return indentMultiline(sanitizeInlineMarkdownForTelegram(block.value), indent)
  }
  if (block.kind === 'heading') {
    const level = Math.min(6, Math.max(1, Math.trunc(block.level)))
    return `${indent}${'#'.repeat(level)} ${sanitizeInlineMarkdownForTelegram(block.value)}`
  }
  if (block.kind === 'blockquote') {
    const nested = renderTelegramMarkdown(block.value)
    return nested
      .split('\n')
      .map((line) => `${indent}>${line ? ` ${line}` : ''}`)
      .join('\n')
  }
  if (block.kind === 'unorderedList') {
    return renderListItems(block.items, indent, null)
  }
  if (block.kind === 'taskList') {
    return block.items
      .map((item) => `${indent}- [${item.checked ? 'x' : ' '}] ${sanitizeInlineMarkdownForTelegram(item.text)}`)
      .join('\n')
  }
  if (block.kind === 'orderedList') {
    return renderListItems(block.items, indent, block.start)
  }
  if (block.kind === 'table') {
    return indentMultiline(renderTable(block), indent)
  }
  if (block.kind === 'codeBlock') {
    const language = block.language.trim()
    const lines = [`${indent}\`\`\`${language}`.trimEnd()]
    for (const line of block.value.split('\n')) {
      lines.push(line.length > 0 ? `${indent}${line}` : '')
    }
    lines.push(`${indent}\`\`\``)
    return lines.join('\n')
  }
  if (block.kind === 'thematicBreak') {
    return `${indent}---`
  }

  const label = block.alt.trim() ? `Image: ${block.alt.trim()}` : 'Image'
  return isExternalLinkTarget(block.url)
    ? `${indent}[${escapeInsertedMarkdownText(label)}](${block.url})`
    : `${indent}${toBoldLiteral(label)}`
}

function renderBlocksToTelegramMarkdown(blocks: MarkdownBlock[], indent = ''): string {
  return blocks
    .map((block) => renderBlockToTelegramMarkdown(block, indent).trimEnd())
    .filter((block) => block.length > 0)
    .join('\n\n')
    .trim()
}

function splitPlainText(text: string, maxLength: number): string[] {
  const normalized = normalizeMarkdownText(text).trim()
  if (!normalized) return []
  if (normalized.length <= maxLength) return [normalized]

  const chunks: string[] = []
  let remaining = normalized

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf('\n\n', maxLength)
    if (splitIndex < Math.floor(maxLength * 0.5)) {
      splitIndex = remaining.lastIndexOf('\n', maxLength)
    }
    if (splitIndex < Math.floor(maxLength * 0.5)) {
      splitIndex = remaining.lastIndexOf(' ', maxLength)
    }
    if (splitIndex <= 0) {
      splitIndex = maxLength
    }

    const chunk = remaining.slice(0, splitIndex).trim()
    if (chunk) chunks.push(chunk)
    remaining = remaining.slice(splitIndex).trim()
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

export function renderTelegramMarkdown(text: string): string {
  const blocks = parseMessageBlocks(text)
  return renderBlocksToTelegramMarkdown(blocks)
}

export function buildTelegramMarkdownChunks(text: string, maxLength = 12000): string[] {
  const blocks = parseMessageBlocks(text)
  const renderedBlocks = blocks
    .map((block) => renderBlockToTelegramMarkdown(block).trim())
    .filter((block) => block.length > 0)

  if (renderedBlocks.length === 0) return []

  const chunks: string[] = []
  let current = ''

  for (const blockText of renderedBlocks) {
    if (!current) {
      if (blockText.length <= maxLength) {
        current = blockText
        continue
      }
      chunks.push(...splitPlainText(blockText, maxLength))
      continue
    }

    const candidate = `${current}\n\n${blockText}`
    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }

    chunks.push(current)
    if (blockText.length <= maxLength) {
      current = blockText
      continue
    }
    chunks.push(...splitPlainText(blockText, maxLength))
    current = ''
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}
