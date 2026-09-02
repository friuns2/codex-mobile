import { describe, expect, it } from 'vitest'
import { extractCodexDeviceAuthDetails, stripTerminalFormatting } from './codexDeviceAuth'

describe('Codex device authentication output', () => {
  it('extracts the verification URL and code from formatted CLI output', () => {
    const output = [
      'Follow these steps to sign in with ChatGPT using device code authorization:',
      '1. Open this link in your browser',
      '   \u001B[94mhttps://auth.openai.com/codex/device\u001B[0m',
      '2. Enter this one-time code \u001B[90m(expires in 15 minutes)\u001B[0m',
      '   \u001B[94mMURW-13CB8\u001B[0m',
    ].join('\n')

    expect(extractCodexDeviceAuthDetails(output)).toEqual({
      verificationUrl: 'https://auth.openai.com/codex/device',
      userCode: 'MURW-13CB8',
    })
  })

  it('waits until both device authentication values are present', () => {
    expect(extractCodexDeviceAuthDetails('https://auth.openai.com/codex/device')).toBeNull()
    expect(extractCodexDeviceAuthDetails('ABCD-12345')).toBeNull()
  })

  it('removes terminal formatting without changing plain text', () => {
    expect(stripTerminalFormatting('\u001B[94mABCD-12345\u001B[0m')).toBe('ABCD-12345')
  })
})
