import { describe, expect, it } from 'vitest'
import { formatHttpUrl, getLocalServerUrl } from './listenHost'

describe('CLI listener URLs', () => {
  it.each([
    ['127.0.0.1', 'http://127.0.0.1:5900'],
    ['192.0.2.10', 'http://192.0.2.10:5900'],
    ['localhost', 'http://localhost:5900'],
    ['::1', 'http://[::1]:5900'],
    ['2001:db8::1', 'http://[2001:db8::1]:5900'],
  ])('uses a valid URL for %s', (host, expected) => {
    expect(formatHttpUrl(host, 5900)).toBe(expected)
    expect(getLocalServerUrl(host, 5900)).toBe(expected)
    expect(new URL(expected).port).toBe('5900')
  })

  it('maps wildcard bind addresses to reachable browser/tunnel targets', () => {
    expect(getLocalServerUrl('0.0.0.0', 5900)).toBe('http://127.0.0.1:5900')
    expect(getLocalServerUrl('::', 5900)).toBe('http://[::1]:5900')
    expect(formatHttpUrl('::', 5900)).toBe('http://[::]:5900')
  })
})
