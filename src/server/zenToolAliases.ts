import { Transform } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

/** Restore executable tool names in either protocol's SSE events. Schemas/arguments stay identical. */
export function createZenToolAliasStream(aliases: Map<string, string>): Transform {
  let buffer = ''
  const decoder = new StringDecoder('utf8')
  const restore = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(restore); return }
    const row = value as Record<string, unknown>
    if (typeof row.name === 'string' && aliases.has(row.name)) row.name = aliases.get(row.name)
    Object.values(row).forEach(restore)
  }
  const rewrite = (frame: string) => frame.split('\n').map(line => {
    if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') return line
    const payload = JSON.parse(line.slice(5))
    restore(payload)
    return `data: ${JSON.stringify(payload)}`
  }).join('\n')
  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        buffer += decoder.write(chunk)
        let match: RegExpExecArray | null
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          this.push(`${rewrite(buffer.slice(0, match.index))}\n\n`)
          buffer = buffer.slice(match.index + match[0].length)
        }
        if (buffer.length > 4 * 1024 * 1024) throw new Error('Zen SSE frame exceeded 4 MiB')
        callback()
      } catch (error) { callback(error as Error) }
    },
    flush(callback) {
      try { buffer += decoder.end(); if (buffer.trim()) this.push(`${rewrite(buffer)}\n\n`); callback() }
      catch (error) { callback(error as Error) }
    },
  })
}
