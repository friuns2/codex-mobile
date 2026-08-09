import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFeedbackMailto,
  feedbackMailtoBase,
  installFeedbackDiagnostics,
  recordFeedbackDiagnostic,
  useFeedbackDiagnostics,
} from './useFeedbackDiagnostics'

beforeEach(() => {
  vi.stubGlobal('navigator', {
    userAgent: 'TestAgent/1.0',
    onLine: true,
    language: 'en-US',
    platform: 'TestOS',
  })
  vi.stubGlobal('window', {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    location: {
      href: 'http://127.0.0.1:4173/#/',
      pathname: '/',
      search: '',
      hash: '#/',
    },
    addEventListener: vi.fn(),
    localStorage: {
      length: 2,
      key: vi.fn((index: number) => ['codex-web-local.sidebar-chat-sort-mode.v1', 'codex-token'][index] ?? null),
      getItem: vi.fn((key: string) => ({
        'codex-web-local.sidebar-chat-sort-mode.v1': 'updated',
        'codex-token': 'super-secret-token',
      })[key] ?? null),
    },
    sessionStorage: {
      length: 1,
      key: vi.fn((index: number) => ['codex-web-local.temp'][index] ?? null),
      getItem: vi.fn((key: string) => key === 'codex-web-local.temp' ? 'open-folder-modal' : null),
    },
  })
  vi.stubGlobal('document', {
    body: {
      innerText: 'Start new thread\\nVisible failure banner\\nSend feedback',
    },
  })
  useFeedbackDiagnostics().diagnostics.value = []
})

describe('feedback diagnostics', () => {
  it('keeps feedback hidden until a diagnostic is recorded', () => {
    const state = useFeedbackDiagnostics()

    expect(state.hasFeedbackDiagnostics.value).toBe(false)

    state.recordVisibleFailure('Failed to load folders')

    expect(state.hasFeedbackDiagnostics.value).toBe(true)
  })

  it('builds a mailto with context and recent diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'api-response',
      message: 'Request failed with HTTP 500',
      url: '/codex-api/rpc',
      method: 'POST',
      status: 500,
      statusText: 'Internal Server Error',
      atIso: '2026-05-12T03:00:00.000Z',
    })

    const mailto = buildFeedbackMailto()
    const parsed = new URL(mailto)
    const body = parsed.searchParams.get('body') ?? ''

    expect(mailto.startsWith('mailto:brutalstrikedevs@gmail.com?')).toBe(true)
    expect(mailto).toContain('subject=Mobidex%20feedback%3A%20Request%20failed%20with%20HTTP%20500')
    expect(mailto).not.toContain('+')
    expect(parsed.searchParams.get('subject')).toContain('Request failed with HTTP 500')
    expect(body).toContain('URL: http://127.0.0.1:4173/#/')
    expect(body).toContain('User agent: TestAgent/1.0')
    expect(body).toContain('Viewport: 390x844 @2x')
    expect(body).toContain('Browser/app state')
    expect(body).toContain('Hash: #/')
    expect(body).toContain('Online: true')
    expect(body).toContain('codex-web-local.sidebar-chat-sort-mode.v1=updated')
    expect(body).toContain('codex-token=[omitted sensitive value, 18 chars]')
    expect(mailto).not.toContain('super-secret-token')
    expect(body).toContain('codex-web-local.temp=open-folder-modal')
    expect(body).toContain('POST | /codex-api/rpc | 500 Internal Server Error')
    expect(body).toContain('Visible page text')
    expect(body).toContain('Visible failure banner')
  })

  it('exposes a minimal mailto href for static anchors', () => {
    expect(feedbackMailtoBase()).toBe('mailto:brutalstrikedevs@gmail.com')
  })

  it('dedupes identical newest diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message: 'Failed to load folders',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:00.000Z',
    })
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message: 'Failed to load folders',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:01.000Z',
    })

    expect(useFeedbackDiagnostics().diagnostics.value).toHaveLength(1)
  })

  it('uses a single-line subject for multiline diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'window-error',
      message: 'Top level failure\n    at stack frame\n    at another frame',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:00.000Z',
    })

    const subject = new URL(buildFeedbackMailto()).searchParams.get('subject') ?? ''

    expect(subject).toBe('Mobidex feedback: Top level failure')
  })

  it('does not throw during install when fetch is unavailable', () => {
    expect(() => installFeedbackDiagnostics()).not.toThrow()

    expect(useFeedbackDiagnostics().diagnostics.value[0]?.message).toContain('window.fetch is unavailable')
  })

  it('does not throw during install when fetch cannot be patched', () => {
    Object.defineProperty(window, 'fetch', {
      value: vi.fn(),
      writable: false,
      configurable: true,
    })

    expect(() => installFeedbackDiagnostics()).not.toThrow()

    expect(useFeedbackDiagnostics().diagnostics.value[0]?.message).toContain('could not monitor fetch')
  })
})
