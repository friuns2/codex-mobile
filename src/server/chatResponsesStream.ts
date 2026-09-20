import type { ServerResponse } from 'node:http'
import type { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

/** Translate one upstream chat stream without buffering the entire HTTP response. */
export async function forwardChatResponsesStream(upstream: Readable, res: ServerResponse, model: string): Promise<void> {
  const id = `resp_${randomUUID()}`
  const output: Array<Record<string, any>> = []
  const calls = new Map<number, { item: Record<string, any>; index: number }>()
  let message: Record<string, any> | undefined
  let reasoning: Record<string, any> | undefined
  let usage: Record<string, number> | undefined
  let finish: string | undefined
  let done = false
  let buffer = ''
  let bytes = 0
  let sequence = 0
  const decoder = new StringDecoder('utf8')
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  const emit = (type: string, fields: Record<string, unknown>) => {
    if (!res.destroyed) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...fields })}\n\n`)
  }
  const add = (item: Record<string, any>) => {
    const index = output.push(item) - 1
    emit('response.output_item.added', { output_index: index, item })
    return index
  }
  const processFrame = (frame: string) => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) return
    if (data.trim() === '[DONE]') { done = true; return }
    const event = JSON.parse(data)
    if (event.error) throw new Error(event.error.message || 'Upstream streaming error')
    if (event.usage) usage = event.usage
    const choice = event.choices?.find((row: { index?: number }) => (row.index ?? 0) === 0)
    if (choice?.finish_reason) finish = choice.finish_reason
    const delta = choice?.delta
    if (!delta) return
    if (delta.reasoning_content) {
      if (!reasoning) {
        reasoning = { id: `rs_${randomUUID()}`, type: 'reasoning', summary: [{ type: 'summary_text', text: '' }] }
        const index = add(reasoning)
        emit('response.reasoning_summary_part.added', { item_id: reasoning.id, output_index: index, summary_index: 0, part: reasoning.summary[0] })
      }
      reasoning.summary[0].text += delta.reasoning_content
      emit('response.reasoning_summary_text.delta', { item_id: reasoning.id, output_index: output.indexOf(reasoning), summary_index: 0, delta: delta.reasoning_content })
    }
    if (delta.content) {
      if (!message) {
        message = { id: `msg_${randomUUID()}`, type: 'message', role: 'assistant', status: 'in_progress', content: [{ type: 'output_text', text: '', annotations: [] }] }
        const index = add(message)
        emit('response.content_part.added', { item_id: message.id, output_index: index, content_index: 0, part: message.content[0] })
      }
      message.content[0].text += delta.content
      emit('response.output_text.delta', { item_id: message.id, output_index: output.indexOf(message), content_index: 0, delta: delta.content })
    }
    for (const call of delta.tool_calls ?? []) {
      if (!Number.isInteger(call.index)) throw new Error('Missing streamed tool-call index')
      let state = calls.get(call.index)
      if (!state) {
        if (!call.id || !call.function?.name) throw new Error('Missing streamed tool-call ID or name')
        const item = { id: `fc_${randomUUID()}`, type: 'function_call', call_id: call.id, name: call.function.name, arguments: '', status: 'in_progress' }
        state = { item, index: add(item) }
        calls.set(call.index, state)
      }
      if (call.function?.arguments) {
        state.item.arguments += call.function.arguments
        emit('response.function_call_arguments.delta', { item_id: state.item.id, output_index: state.index, delta: call.function.arguments })
      }
    }
  }
  emit('response.created', { response: { id, object: 'response', status: 'in_progress', model, output: [] } })
  try {
    for await (const chunk of upstream) {
      if (res.destroyed) return
      bytes += Buffer.byteLength(chunk)
      if (bytes > 32 * 1024 * 1024) throw new Error('Upstream stream exceeded 32 MiB safety limit')
      buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      let match: RegExpExecArray | null
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        processFrame(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
      }
      if (res.writableNeedDrain) await new Promise<void>(resolve => {
        const release = () => { res.off('drain', release); res.off('close', release); resolve() }
        res.once('drain', release); res.once('close', release)
      })
    }
    buffer += decoder.end()
    if (buffer.trim()) processFrame(buffer)
    if (!finish) throw new Error(done ? 'Upstream ended without a finish reason' : 'Upstream stream ended prematurely')
    const incomplete = finish === 'length' || finish === 'content_filter'
    for (const [index, item] of output.entries()) {
      if (item.type === 'function_call') emit('response.function_call_arguments.done', { item_id: item.id, output_index: index, arguments: item.arguments })
      if (item.type === 'message') {
        emit('response.output_text.done', { item_id: item.id, output_index: index, content_index: 0, text: item.content[0].text })
        emit('response.content_part.done', { item_id: item.id, output_index: index, content_index: 0, part: item.content[0] })
      }
      if (item.type === 'reasoning') {
        emit('response.reasoning_summary_text.done', { item_id: item.id, output_index: index, summary_index: 0, text: item.summary[0].text })
        emit('response.reasoning_summary_part.done', { item_id: item.id, output_index: index, summary_index: 0, part: item.summary[0] })
      } else item.status = incomplete ? 'incomplete' : 'completed'
      emit('response.output_item.done', { output_index: index, item })
    }
    const status = incomplete ? 'incomplete' : 'completed'
    emit(`response.${status}`, { response: {
      id, object: 'response', model, status, output,
      ...(incomplete ? { incomplete_details: { reason: finish === 'length' ? 'max_output_tokens' : 'content_filter' } } : {}),
      ...(usage ? { usage: { input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0, total_tokens: usage.total_tokens ?? 0 } } : {}),
    } })
  } catch (error) {
    emit('response.failed', { response: { id, object: 'response', model, status: 'failed', error: { code: 'upstream_stream_error', message: error instanceof Error ? error.message : String(error) }, output } })
    upstream.destroy()
  } finally { if (!res.destroyed) res.end() }
}
