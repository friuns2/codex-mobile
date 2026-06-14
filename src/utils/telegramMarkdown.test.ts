import { describe, expect, it } from 'vitest'

import { buildTelegramMarkdownChunks, renderTelegramMarkdown } from './telegramMarkdown'

describe('renderTelegramMarkdown', () => {
  it('keeps markdown structure while degrading local file links to bold text', () => {
    const rendered = renderTelegramMarkdown([
      '# Release notes',
      '',
      '- [README](./README.md)',
      '- [Docs](https://example.com/docs)',
      '- `/tmp/project/src/index.ts:42`',
    ].join('\n'))

    expect(rendered).toContain('# Release notes')
    expect(rendered).toContain('- **README**')
    expect(rendered).toContain('- [Docs](https://example.com/docs)')
    expect(rendered).toContain('- **/tmp/project/src/index\\.ts:42**')
  })

  it('preserves tables and quoted sections', () => {
    const rendered = renderTelegramMarkdown([
      '> review this first',
      '',
      '| file | status |',
      '| --- | ---: |',
      '| [Spec](./PROJECT_SPEC.md) | done |',
    ].join('\n'))

    expect(rendered).toContain('> review this first')
    expect(rendered).toContain('| file | status |')
    expect(rendered).toContain('| **Spec** | done |')
  })
})

describe('buildTelegramMarkdownChunks', () => {
  it('splits on block boundaries before falling back to plain slicing', () => {
    const chunks = buildTelegramMarkdownChunks([
      '# One',
      '',
      'First paragraph.',
      '',
      '# Two',
      '',
      'Second paragraph.',
    ].join('\n'), 24)

    expect(chunks).toEqual([
      '# One\n\nFirst paragraph.',
      '# Two\n\nSecond paragraph.',
    ])
  })
})
