export type ChatWidthMode = 'standard' | 'wide' | 'extra-wide'

const IN_PROGRESS_SEND_MODE_KEY = 'codex-web-local.in-progress-send-mode.v1'
const DARK_MODE_KEY = 'codex-web-local.dark-mode.v1'
const CHAT_WIDTH_KEY = 'codex-web-local.chat-width.v1'

export type TerminalHeaderQuickCommand = {
  label: string
  value: string
  custom?: boolean
  usageCount: number
  lastUsedAt: number
  sourceIndex?: number
}

export type ThreadTerminalPanelExposed = {
  runQuickCommand: (command: string, custom?: boolean) => Promise<void>
}

export type DirectoryTryItemPayload = {
  kind: 'app' | 'plugin' | 'skill' | 'composio'
  name: string
  displayName: string
  skillPath?: string
  prompt?: string
  attachedSkills?: Array<{ name: string; path: string }>
}

type ChatWidthPreset = {
  label: string
  columnMax: string
  cardMax: string
}

export const CHAT_WIDTH_PRESETS: Record<ChatWidthMode, ChatWidthPreset> = {
  standard: {
    label: 'Standard',
    columnMax: '45rem',
    cardMax: '76ch',
  },
  wide: {
    label: 'Wide',
    columnMax: '72rem',
    cardMax: '88ch',
  },
  'extra-wide': {
    label: 'Extra wide',
    columnMax: '96rem',
    cardMax: '96ch',
  },
}

const WHISPER_LANGUAGES: Record<string, string> = {
  en: 'english',
  zh: 'chinese',
  de: 'german',
  es: 'spanish',
  ru: 'russian',
  ko: 'korean',
  fr: 'french',
  ja: 'japanese',
  pt: 'portuguese',
  tr: 'turkish',
  pl: 'polish',
  ca: 'catalan',
  nl: 'dutch',
  ar: 'arabic',
  sv: 'swedish',
  it: 'italian',
  id: 'indonesian',
  hi: 'hindi',
  fi: 'finnish',
  vi: 'vietnamese',
  he: 'hebrew',
  uk: 'ukrainian',
  el: 'greek',
  ms: 'malay',
  cs: 'czech',
  ro: 'romanian',
  da: 'danish',
  hu: 'hungarian',
  ta: 'tamil',
  no: 'norwegian',
  th: 'thai',
  ur: 'urdu',
  hr: 'croatian',
  bg: 'bulgarian',
  lt: 'lithuanian',
  la: 'latin',
  mi: 'maori',
  ml: 'malayalam',
  cy: 'welsh',
  sk: 'slovak',
  te: 'telugu',
  fa: 'persian',
  lv: 'latvian',
  bn: 'bengali',
  sr: 'serbian',
  az: 'azerbaijani',
  sl: 'slovenian',
  kn: 'kannada',
  et: 'estonian',
  mk: 'macedonian',
  br: 'breton',
  eu: 'basque',
  is: 'icelandic',
  hy: 'armenian',
  ne: 'nepali',
  mn: 'mongolian',
  bs: 'bosnian',
  kk: 'kazakh',
  sq: 'albanian',
  sw: 'swahili',
  gl: 'galician',
  mr: 'marathi',
  pa: 'punjabi',
  si: 'sinhala',
  km: 'khmer',
  sn: 'shona',
  yo: 'yoruba',
  so: 'somali',
  af: 'afrikaans',
  oc: 'occitan',
  ka: 'georgian',
  be: 'belarusian',
  tg: 'tajik',
  sd: 'sindhi',
  gu: 'gujarati',
  am: 'amharic',
  yi: 'yiddish',
  lo: 'lao',
  uz: 'uzbek',
  fo: 'faroese',
  ht: 'haitian creole',
  ps: 'pashto',
  tk: 'turkmen',
  nn: 'nynorsk',
  mt: 'maltese',
  sa: 'sanskrit',
  lb: 'luxembourgish',
  my: 'myanmar',
  bo: 'tibetan',
  tl: 'tagalog',
  mg: 'malagasy',
  as: 'assamese',
  tt: 'tatar',
  haw: 'hawaiian',
  ln: 'lingala',
  ha: 'hausa',
  ba: 'bashkir',
  jw: 'javanese',
  su: 'sundanese',
  yue: 'cantonese',
}

export function loadBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === null) return fallback
  return v === '1'
}

export function loadDarkModePref(): 'system' | 'light' | 'dark' {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(DARK_MODE_KEY)
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

export function loadInProgressSendModePref(): 'steer' | 'queue' {
  if (typeof window === 'undefined') return 'steer'
  const v = window.localStorage.getItem(IN_PROGRESS_SEND_MODE_KEY)
  if (v === 'steer' || v === 'queue') return v
  return 'queue'
}

export function loadChatWidthPref(): ChatWidthMode {
  if (typeof window === 'undefined') return 'standard'
  const value = window.localStorage.getItem(CHAT_WIDTH_KEY)
  return value === 'standard' || value === 'wide' || value === 'extra-wide' ? value : 'standard'
}

export function loadDictationLanguagePref(): string {
  if (typeof window === 'undefined') return 'auto'
  const value = window.localStorage.getItem('codex-web-local.dictation-language.v1')?.trim() || 'auto'
  const normalized = normalizeToWhisperLanguage(value)
  return normalized || 'auto'
}

export function buildDictationLanguageOptions(translate: (value: string) => string, currentLanguage: string, preferredLanguages: readonly string[] = []): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [{ value: 'auto', label: translate('Auto-detect') }]
  const seen = new Set<string>(['auto'])
  function formatLanguageLabel(value: string): string {
    const languageName = WHISPER_LANGUAGES[value] || value
    const title = languageName.charAt(0).toUpperCase() + languageName.slice(1)
    return `${title} (${value})`
  }

  for (const raw of preferredLanguages) {
    const value = normalizeToWhisperLanguage(raw)
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: `Preferred: ${formatLanguageLabel(value)}`,
    })
  }

  for (const value of Object.keys(WHISPER_LANGUAGES)) {
    if (seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: formatLanguageLabel(value),
    })
  }

  const current = currentLanguage.trim()
  if (current && !seen.has(current)) {
    options.push({
      value: current,
      label: formatLanguageLabel(current),
    })
  }

  return options
}

export function normalizeToWhisperLanguage(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value || value === 'auto') return ''
  if (value in WHISPER_LANGUAGES) return value
  const base = value.split('-')[0] ?? value
  if (base in WHISPER_LANGUAGES) return base
  return ''
}

export function applyDarkMode(mode: 'system' | 'light' | 'dark'): void {
  const root = document.documentElement
  if (mode === 'dark') {
    root.classList.add('dark')
  } else if (mode === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}


const TERMINAL_QUICK_COMMAND_STORAGE_KEY = 'codex-web-local.terminal-quick-commands.v1'

export function buildTerminalHeaderQuickCommands(projectCommands: Array<{ label: string; value: string }>, storedCommands: TerminalHeaderQuickCommand[]): TerminalHeaderQuickCommand[] {
  const storedByValue = new Map(storedCommands.map((command) => [command.value, command]))
  const combined: TerminalHeaderQuickCommand[] = [
    ...projectCommands.map((command, index) => ({
      label: command.label,
      value: command.value,
      usageCount: 0,
      lastUsedAt: 0,
      ...(storedByValue.get(command.value) ?? {}),
      custom: false,
      sourceIndex: index,
    })),
  ]
  return combined.sort(compareTerminalQuickCommands)
}

export function normalizeTerminalQuickCommandValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function compareTerminalQuickCommands(first: TerminalHeaderQuickCommand, second: TerminalHeaderQuickCommand): number {
  if (second.usageCount !== first.usageCount) return second.usageCount - first.usageCount
  if (second.lastUsedAt !== first.lastUsedAt) return second.lastUsedAt - first.lastUsedAt
  const firstSource = typeof first.sourceIndex === 'number' ? first.sourceIndex : Number.MAX_SAFE_INTEGER
  const secondSource = typeof second.sourceIndex === 'number' ? second.sourceIndex : Number.MAX_SAFE_INTEGER
  return firstSource - secondSource
}

export function loadTerminalStoredQuickCommands(): TerminalHeaderQuickCommand[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TERMINAL_QUICK_COMMAND_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const commands: TerminalHeaderQuickCommand[] = []
    for (const row of parsed) {
      const record = row !== null && typeof row === 'object' && !Array.isArray(row)
        ? row as Record<string, unknown>
        : null
      const value = normalizeTerminalQuickCommandValue(readTerminalString(record?.value))
      if (!value || seen.has(value)) continue
      seen.add(value)
      commands.push({
        label: readTerminalString(record?.label) || value,
        value,
        custom: record?.custom !== false,
        usageCount: readTerminalPositiveInteger(record?.usageCount),
        lastUsedAt: readTerminalPositiveInteger(record?.lastUsedAt),
      })
    }
    return commands
  } catch {
    return []
  }
}

export function saveTerminalStoredQuickCommands(commands: TerminalHeaderQuickCommand[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    TERMINAL_QUICK_COMMAND_STORAGE_KEY,
    JSON.stringify(commands.map((command) => ({
      label: command.label,
      value: command.value,
      custom: command.custom === true,
      usageCount: command.usageCount,
      lastUsedAt: command.lastUsedAt,
    }))),
  )
}

function readTerminalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readTerminalPositiveInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed))
  }
  return 0
}
