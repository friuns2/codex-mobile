import { onBeforeUnmount, ref } from 'vue'

export type DictationState = 'idle' | 'recording' | 'transcribing'
const DICTATION_SILENCE_THRESHOLD = 0.0025
const DICTATION_BAR_WIDTH = 3
const DICTATION_BAR_GAP = 2
const MAX_WAVEFORM_SAMPLES = 256

export function useDictation(options: {
  onTranscript: (text: string) => void
  getLanguage?: () => string
  onEmpty?: () => void
  onError?: (error: unknown) => void
}) {
  const state = ref<DictationState>('idle')
  const isSupported = ref(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
  const recordingDurationMs = ref(0)
  const waveformCanvasRef = ref<HTMLCanvasElement | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let mediaStream: MediaStream | null = null
  let chunks: Blob[] = []
  let audioContext: AudioContext | null = null
  let mediaStreamSource: MediaStreamAudioSourceNode | null = null
  let processorNode: ScriptProcessorNode | null = null
  let recordingStartedAt: number | null = null
  let waveformSamples: number[] = []
  let isStartingRecording = false
  let stopRequestedBeforeStart = false
  let recordingCancelled = false
  let transcribeAbortController: AbortController | null = null

  function cancelTranscription(): void {
    if (transcribeAbortController) {
      transcribeAbortController.abort()
      transcribeAbortController = null
    }
    if (state.value === 'transcribing') {
      state.value = 'idle'
    }
  }

  function drawWaveform(): void {
    const canvas = waveformCanvasRef.value
    if (!canvas || typeof window === 'undefined') return
    const context = canvas.getContext('2d')
    if (!context) return

    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth))
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight || 36))
    const dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr))
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr))

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, cssWidth, cssHeight)

    const maxBars = Math.max(12, Math.floor(cssWidth / (DICTATION_BAR_WIDTH + DICTATION_BAR_GAP)))
    const recentSamples = waveformSamples.slice(-maxBars)
    const leadingBars = Math.max(0, maxBars - recentSamples.length)
    const centerY = cssHeight / 2
    const fill = getComputedStyle(canvas).color || '#000000'

    for (let index = 0; index < maxBars; index += 1) {
      const value = recentSamples[index - leadingBars] ?? 0
      const heightRatio = Math.max(0.08, Math.min(1, value * 18))
      const barHeight = heightRatio * centerY
      const x = index * (DICTATION_BAR_WIDTH + DICTATION_BAR_GAP)

      context.globalAlpha = value <= DICTATION_SILENCE_THRESHOLD ? 0.35 : 1
      context.fillStyle = fill
      context.fillRect(x, centerY - barHeight, DICTATION_BAR_WIDTH, barHeight * 2)
    }

    context.globalAlpha = 1
  }

  function resetWaveformDisplay(): void {
    waveformSamples = []
    recordingDurationMs.value = 0
    drawWaveform()
  }

  function stopWaveformCapture(): void {
    if (processorNode) {
      processorNode.disconnect()
      processorNode.onaudioprocess = null
      processorNode = null
    }
    if (mediaStreamSource) {
      mediaStreamSource.disconnect()
      mediaStreamSource = null
    }
    if (audioContext) {
      void audioContext.close()
      audioContext = null
    }
    recordingStartedAt = null
  }

  function startWaveformCapture(stream: MediaStream): void {
    if (typeof window === 'undefined') return

    const fallbackAudioContext = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    const AudioContextCtor = window.AudioContext ?? fallbackAudioContext
    if (!AudioContextCtor) return

    stopWaveformCapture()
    resetWaveformDisplay()

    audioContext = new AudioContextCtor()
    mediaStreamSource = audioContext.createMediaStreamSource(stream)
    processorNode = audioContext.createScriptProcessor(2048, 1, 1)
    recordingStartedAt = performance.now()

    processorNode.onaudioprocess = (event) => {
      const channelData = event.inputBuffer.getChannelData(0)
      let total = 0
      for (let index = 0; index < channelData.length; index += 1) {
        const amplitude = Math.abs(channelData[index] ?? 0)
        total += amplitude < DICTATION_SILENCE_THRESHOLD ? 0 : amplitude
      }

      waveformSamples.push(total / channelData.length)
      if (waveformSamples.length > MAX_WAVEFORM_SAMPLES) {
        waveformSamples.shift()
      }

      if (recordingStartedAt !== null) {
        recordingDurationMs.value = Math.max(0, performance.now() - recordingStartedAt)
      }

      drawWaveform()
    }

    mediaStreamSource.connect(processorNode)
    processorNode.connect(audioContext.destination)
    drawWaveform()
  }

  async function startRecording() {
    if (state.value === 'transcribing') {
      cancelTranscription()
    }
    if (state.value !== 'idle' || !isSupported.value || isStartingRecording) return
    isStartingRecording = true
    recordingCancelled = false
    stopRequestedBeforeStart = false

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
      if (recordingCancelled) {
        cleanup()
        state.value = 'idle'
        return
      }
      chunks = []
      mediaRecorder = new MediaRecorder(mediaStream)
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.onstop = () => {
        const recordedChunks = chunks
        const recordedMimeType = mediaRecorder?.mimeType || recordedChunks[0]?.type || 'audio/webm'
        cleanup()
        void transcribe(recordedChunks, recordedMimeType)
      }
      startWaveformCapture(mediaStream)
      mediaRecorder.start(250)
      state.value = 'recording'
      if (stopRequestedBeforeStart) {
        stopRecording()
      }
    } catch (error) {
      cleanup()
      state.value = 'idle'
      options.onError?.(error)
    } finally {
      isStartingRecording = false
    }
  }

  function stopRecording() {
    if (isStartingRecording && state.value === 'idle') {
      stopRequestedBeforeStart = true
      return
    }
    if (state.value !== 'recording' || !mediaRecorder) return
    if (mediaRecorder.state !== 'inactive') {
      state.value = 'transcribing'
      try {
        mediaRecorder.requestData()
      } catch {
        // Some browsers do not allow requestData in every recorder state.
      }
      mediaRecorder.stop()
    }
  }

  function cancel() {
    recordingCancelled = true
    stopRequestedBeforeStart = false
    cancelTranscription()
    cleanup()
    state.value = 'idle'
  }

  async function transcribe(recordedChunks: Blob[], mimeType: string) {
    if (recordedChunks.length === 0) {
      options.onEmpty?.()
      state.value = 'idle'
      return
    }

    const blob = new Blob(recordedChunks, { type: mimeType })
    state.value = 'transcribing'
    let requestAbortController: AbortController | null = null

    try {
      const ext = mimeType.split(/[/;]/)[1] ?? 'webm'
      const formData = new FormData()
      formData.append('file', blob, `codex.${ext}`)
      const selectedLanguage = options.getLanguage?.().trim() ?? ''
      if (selectedLanguage && selectedLanguage.toLowerCase() !== 'auto') {
        formData.append('language', selectedLanguage)
      }
      requestAbortController = new AbortController()
      transcribeAbortController = requestAbortController

      const response = await fetch('/codex-api/transcribe', {
        method: 'POST',
        body: formData,
        signal: requestAbortController.signal,
      })

      const responseText = await response.text()
      let data: { text?: string; error?: string } | null = null
      try {
        data = responseText.trim() ? (JSON.parse(responseText) as { text?: string; error?: string }) : null
      } catch {
        data = null
      }

      if (!response.ok) {
        const jsonError = data?.error?.trim()
        const textError = responseText.trim()
        throw new Error(jsonError || textError || `Transcription failed: ${response.status}`)
      }

      const text = (data?.text ?? '').trim()
      if (text.length > 0) {
        options.onTranscript(text)
      } else {
        options.onEmpty?.()
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      options.onError?.(error)
    } finally {
      if (requestAbortController && transcribeAbortController === requestAbortController) {
        transcribeAbortController = null
      }
      if (state.value === 'transcribing') {
        state.value = 'idle'
      }
    }
  }

  function cleanup() {
    stopWaveformCapture()
    resetWaveformDisplay()
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null
      mediaRecorder.onstop = null
      mediaRecorder = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop())
      mediaStream = null
    }
    chunks = []
  }

  onBeforeUnmount(() => {
    cancel()
  })

  function toggleRecording() {
    if (state.value === 'recording') {
      stopRecording()
      return
    }
    if (state.value === 'idle' || state.value === 'transcribing') {
      void startRecording()
    }
  }

  return {
    state,
    isSupported,
    recordingDurationMs,
    waveformCanvasRef,
    startRecording,
    stopRecording,
    toggleRecording,
    cancel,
  }
}
