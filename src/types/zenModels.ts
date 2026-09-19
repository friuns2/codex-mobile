export type ZenModelMetadata = {
  id: string
  name: string
  upstreamApi: 'responses' | 'chat-completions' | 'unknown'
  routingSource: 'sdk-metadata'
  supportsTools: boolean | null
  inputModalities: string[] | null
  reasoningOptions: unknown[]
  free: boolean
  discoveredAt: string
}
