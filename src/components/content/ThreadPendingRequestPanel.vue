<template>
  <section v-if="request" class="thread-pending-request">
    <article
      class="thread-pending-request-shell"
      :class="{ 'thread-pending-request-shell--no-top-radius': hasQueueAbove }"
    >
      <template v-if="isApprovalRequest(request)">
        <p class="thread-pending-request-title">{{ requestPanelPrompt(request) }}</p>
        <p
          v-if="requestPreview(request)"
          class="thread-pending-request-command-line"
          :title="requestPreview(request)"
        >
          {{ requestPreview(request) }}
        </p>

        <section class="thread-pending-request-approval">
          <div class="thread-pending-request-options" role="radiogroup" :aria-label="t('Approval choices')">
            <button
              v-for="(option, index) in approvalOptions"
              :key="option.id"
              type="button"
              class="thread-pending-request-option"
              :class="{ 'is-selected': selectedApprovalDecision === option.id }"
              :aria-pressed="selectedApprovalDecision === option.id"
              @click="onSelectApprovalOption(option.id)"
            >
              <span class="thread-pending-request-option-index">{{ index + 1 }}.</span>
              <span class="thread-pending-request-option-label">{{ option.label }}</span>
            </button>
          </div>

          <footer class="thread-pending-request-footer thread-pending-request-footer--approval">
            <label
              class="thread-pending-request-inline-input"
              :class="{ 'is-active': selectedApprovalDecision === 'decline' || approvalFreeformText.length > 0 }"
            >
              <span class="thread-pending-request-option-index">3.</span>
              <input
                class="thread-pending-request-inline-control"
                type="text"
                :value="approvalFreeformText"
                :placeholder="t('No, and tell Codex what to do differently')"
                @focus="onFocusApprovalOther"
                @input="onApprovalOtherInput"
                @keydown.enter.prevent="onSubmitApproval(request)"
              />
            </label>

            <button type="button" class="thread-pending-request-secondary" @click="onRespondApproval(request, 'cancel')">
              {{ t('Skip') }}
            </button>
            <button type="button" class="thread-pending-request-primary" @click="onSubmitApproval(request)">
              {{ t('Send') }}
            </button>
          </footer>
        </section>
      </template>

      <template v-else>
        <header class="thread-pending-request-header">
          <div class="thread-pending-request-heading">
            <p class="thread-pending-request-eyebrow">{{ requestPanelTitle(request) }}</p>
            <p class="thread-pending-request-title">{{ requestPanelPrompt(request) }}</p>
          </div>
          <span v-if="(requestCount ?? 0) > 1" class="thread-pending-request-counter">{{ requestCount ?? 0 }} pending</span>
        </header>

        <div v-if="requestPreview(request)" class="thread-pending-request-preview">
          <code class="thread-pending-request-preview-code">{{ requestPreview(request) }}</code>
        </div>

        <section v-if="request.method === 'mcpServer/elicitation/request'" class="thread-pending-request-user-input">
          <p v-if="readMcpElicitationServerName(request)" class="thread-pending-request-question-description">
            {{ t('Server') }}: {{ readMcpElicitationServerName(request) }}
          </p>

          <a
            v-if="readMcpElicitationUrl(request)"
            class="thread-pending-request-link"
            :href="readMcpElicitationUrl(request)"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('Open authorization link') }}
          </a>

          <div
            v-for="field in readMcpElicitationFields(request)"
            :key="`${request.id}:${field.key}`"
            class="thread-pending-request-question"
          >
            <p class="thread-pending-request-question-title">
              {{ field.label }}<span v-if="field.required"> *</span>
            </p>
            <p v-if="field.description" class="thread-pending-request-question-text">{{ field.description }}</p>

            <label v-if="field.kind === 'string' || field.kind === 'number'" class="thread-pending-request-input-wrap">
              <span class="thread-pending-request-select-label">{{ t('Value') }}</span>
              <input
                class="thread-pending-request-input"
                :type="field.inputType"
                :value="String(readMcpElicitationFieldValue(request.id, field) ?? '')"
                @input="onMcpElicitationFieldInput(request.id, field, $event)"
              />
            </label>

            <div v-else-if="field.kind === 'boolean'" class="thread-pending-request-select-wrap">
              <span class="thread-pending-request-select-label">{{ t('Choice') }}</span>
              <ComposerDropdown
                class="thread-pending-request-dropdown"
                :model-value="serializeMcpBooleanValue(readMcpElicitationFieldValue(request.id, field))"
                :options="mcpBooleanOptions(field)"
                :placeholder="t('Select true or false')"
                @update:model-value="onMcpElicitationBooleanChange(request.id, field, $event)"
              />
            </div>

            <div v-else-if="field.kind === 'singleEnum'" class="thread-pending-request-select-wrap">
              <span class="thread-pending-request-select-label">{{ t('Choice') }}</span>
              <ComposerDropdown
                class="thread-pending-request-dropdown"
                :model-value="String(readMcpElicitationFieldValue(request.id, field) ?? '')"
                :options="mcpSingleEnumOptions(field)"
                :placeholder="t('Select an option')"
                enable-search
                :search-placeholder="t('Search options...')"
                @update:model-value="onMcpElicitationFieldValueChange(request.id, field, $event)"
              />
            </div>

            <div v-else class="thread-pending-request-question-options">
              <label
                v-for="option in field.options"
                :key="`${request.id}:${field.key}:${option.value}`"
                class="thread-pending-request-checkbox-row"
              >
                <input
                  class="thread-pending-request-checkbox"
                  type="checkbox"
                  :checked="readMcpElicitationMultiValue(request.id, field).includes(option.value)"
                  @change="onMcpElicitationMultiToggle(request.id, field, option.value, $event)"
                />
                <span class="thread-pending-request-checkbox-label">{{ option.label }}</span>
              </label>
            </div>
          </div>

          <p v-if="mcpElicitationValidationError" class="thread-pending-request-validation-error">
            {{ mcpElicitationValidationError }}
          </p>

          <footer class="thread-pending-request-footer">
            <button type="button" class="thread-pending-request-secondary" @click="onRespondMcpElicitation(request, 'cancel')">
              {{ t('Cancel') }}
            </button>
            <button type="button" class="thread-pending-request-secondary" @click="onRespondMcpElicitation(request, 'decline')">
              {{ t('Decline') }}
            </button>
            <button type="button" class="thread-pending-request-primary" @click="onRespondMcpElicitation(request, 'accept')">
              {{ t('Continue') }}
            </button>
          </footer>
        </section>

        <section v-else-if="request.method === 'item/tool/requestUserInput'" class="thread-pending-request-user-input">
          <div
            v-for="question in readToolQuestions(request)"
            :key="`${request.id}:${question.id}`"
            class="thread-pending-request-question"
          >
            <p class="thread-pending-request-question-title">{{ question.header || question.question }}</p>
            <p v-if="question.question" class="thread-pending-request-question-text">{{ question.question }}</p>

            <div v-if="question.options.length > 0" class="thread-pending-request-question-options">
              <div class="thread-pending-request-select-wrap">
                <span class="thread-pending-request-select-label">{{ t('Choice') }}</span>
                <ComposerDropdown
                  class="thread-pending-request-dropdown"
                  :model-value="readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')"
                  :options="toolQuestionOptions(question)"
                  :placeholder="t('Choice')"
                  @update:model-value="onQuestionAnswerChange(request.id, question.id, $event)"
                />
              </div>

              <p
                v-if="selectedOptionDescription(request.id, question.id, question.options)"
                class="thread-pending-request-question-description"
              >
                {{ selectedOptionDescription(request.id, question.id, question.options) }}
              </p>
            </div>

            <label v-if="question.isOther" class="thread-pending-request-input-wrap">
              <span class="thread-pending-request-select-label">{{ t('Other answer') }}</span>
              <input
                class="thread-pending-request-input"
                type="text"
                :value="readQuestionOtherAnswer(request.id, question.id)"
                :placeholder="t('Other answer')"
                @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
              />
            </label>
          </div>

          <footer class="thread-pending-request-footer">
            <button type="button" class="thread-pending-request-primary" @click="onRespondToolRequestUserInput(request)">
              {{ t('Send') }}
            </button>
          </footer>
        </section>

        <section v-else-if="request.method === 'item/tool/call'" class="thread-pending-request-actions">
          <button type="button" class="thread-pending-request-primary" @click="onRespondToolCallFailure(request)">
            {{ t('Fail Tool Call') }}
          </button>
          <button type="button" class="thread-pending-request-secondary" @click="onRespondToolCallSuccess(request)">
            {{ t('Success (Empty)') }}
          </button>
        </section>

        <section v-else class="thread-pending-request-actions">
          <button type="button" class="thread-pending-request-primary" @click="onRespondEmptyResult(request)">
            {{ t('Return Empty Result') }}
          </button>
          <button type="button" class="thread-pending-request-secondary" @click="onRejectUnknownRequest(request)">
            {{ t('Reject Request') }}
          </button>
        </section>
      </template>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UiServerRequest, UiServerRequestReply } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import ComposerDropdown from './ComposerDropdown.vue'

type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

type ApprovalOption = {
  id: Exclude<ApprovalDecision, 'cancel' | 'decline'>
  label: string
}

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: Array<{ label: string; description: string }>
}

type McpElicitationFieldOption = {
  value: string
  label: string
}

type McpElicitationField = {
  key: string
  label: string
  description: string
  required: boolean
  kind: 'string' | 'number' | 'boolean' | 'singleEnum' | 'multiEnum'
  inputType: string
  options: McpElicitationFieldOption[]
  defaultValue: string | number | boolean | string[] | null
  hasExplicitDefault: boolean
}

const props = defineProps<{
  request: UiServerRequest | null
  requestCount?: number
  hasQueueAbove?: boolean
}>()

const emit = defineEmits<{
  respondServerRequest: [payload: UiServerRequestReply]
}>()

const selectedApprovalDecision = ref<ApprovalDecision>('accept')
const approvalFreeformText = ref('')
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const mcpElicitationAnswers = ref<Record<string, string | number | boolean | string[] | null>>({})
const mcpElicitationValidationError = ref('')
const { t } = useUiLanguage()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function formatCommandToken(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : JSON.stringify(value)
}

function readCommandPreview(params: Record<string, unknown>): string {
  const commandActions = Array.isArray(params.commandActions) ? params.commandActions : []
  const actionCommand = commandActions
    .map((action) => asRecord(action))
    .map((action) => readString(action?.command))
    .find((value) => value.length > 0)
  if (actionCommand) return actionCommand.replace(/\s+/g, ' ').trim()

  if (Array.isArray(params.command)) {
    const parts = params.command
      .filter((part): part is string => typeof part === 'string')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    if (parts.length > 0) {
      return parts.map((part) => formatCommandToken(part)).join(' ')
    }
  }

  return unwrapApprovalCommand(readString(params.command))
}

function isCommandApprovalRequest(request: UiServerRequest): boolean {
  return request.method === 'item/commandExecution/requestApproval' || request.method === 'execCommandApproval'
}

function isFileApprovalRequest(request: UiServerRequest): boolean {
  return request.method === 'item/fileChange/requestApproval' || request.method === 'applyPatchApproval'
}

function isPermissionsApprovalRequest(request: UiServerRequest): boolean {
  return request.method === 'item/permissions/requestApproval'
}

function isApprovalRequest(request: UiServerRequest): boolean {
  return isCommandApprovalRequest(request) || isFileApprovalRequest(request) || isPermissionsApprovalRequest(request)
}

function isMcpElicitationRequest(request: UiServerRequest): boolean {
  return request.method === 'mcpServer/elicitation/request'
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return readString(params?.reason) || readString(params?.prompt) || readString(params?.message)
}

function requestPanelTitle(request: UiServerRequest): string {
  if (isApprovalRequest(request)) return 'Awaiting approval'
  if (isMcpElicitationRequest(request)) return 'MCP server input required'
  if (request.method === 'item/tool/requestUserInput') return 'Awaiting response'
  if (request.method === 'item/tool/call') return 'Tool call waiting for response'
  return request.method
}

function requestPanelPrompt(request: UiServerRequest): string {
  const explicit = readRequestReason(request)
  if (explicit) return explicit
  if (isCommandApprovalRequest(request)) return 'Do you want to run this command?'
  if (isFileApprovalRequest(request)) return 'Do you want to make these changes?'
  if (isPermissionsApprovalRequest(request)) return 'Do you want to grant these permissions?'
  if (isMcpElicitationRequest(request)) return 'An MCP server needs your input before Codex can continue.'
  if (request.method === 'item/tool/requestUserInput') return 'Codex needs your answer before it can continue.'
  return 'Codex is waiting for a response before it can continue.'
}

function unwrapApprovalCommand(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const powershellMatch = trimmed.match(/-Command\s+(.+)$/i)
  const rawCommand = powershellMatch?.[1]?.trim() ?? trimmed
  const unquoted = rawCommand.startsWith('"') && rawCommand.endsWith('"')
    ? rawCommand.slice(1, -1)
    : rawCommand

  return unquoted
    .replace(/\\"/g, '"')
    .replace(/`"/g, '"')
    .replace(/""/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function requestPreview(request: UiServerRequest): string {
  const params = asRecord(request.params)
  if (!params) return ''

  if (isCommandApprovalRequest(request)) {
    return readCommandPreview(params)
  }

  if (isFileApprovalRequest(request)) {
    const grantRoot = readString(params.grantRoot) || readString(params.grant_root)
    if (grantRoot) return grantRoot.replace(/\s+/g, ' ').trim()

    const fileChanges = asRecord(params.fileChanges) ?? asRecord(params.changes)
    if (!fileChanges) return ''

    const paths = Object.keys(fileChanges).map((path) => path.trim()).filter((path) => path.length > 0)
    if (paths.length === 0) return ''
    return paths.slice(0, 3).join(', ')
  }

  if (isPermissionsApprovalRequest(request)) {
    return formatPermissionsPreview(params.permissions)
  }

  if (isMcpElicitationRequest(request)) {
    return readString(params.serverName) || readString(params.url)
  }

  return ''
}

function formatPermissionsPreview(value: unknown): string {
  const permissions = asRecord(value)
  if (!permissions) return ''
  const parts: string[] = []
  const fileSystem = asRecord(permissions.fileSystem)
  const network = asRecord(permissions.network)

  const readPaths = Array.isArray(fileSystem?.read) ? fileSystem.read.filter((entry): entry is string => typeof entry === 'string') : []
  const writePaths = Array.isArray(fileSystem?.write) ? fileSystem.write.filter((entry): entry is string => typeof entry === 'string') : []
  if (readPaths.length > 0) parts.push(`Read: ${readPaths.join(', ')}`)
  if (writePaths.length > 0) parts.push(`Write: ${writePaths.join(', ')}`)
  if (network?.enabled === true) parts.push('Network access')

  return parts.join(' • ')
}

function approvalOptionsForRequest(request: UiServerRequest | null): ApprovalOption[] {
  if (!request || !isApprovalRequest(request)) return []
  return [
    { id: 'accept', label: 'Yes' },
    { id: 'acceptForSession', label: 'Yes for Session' },
  ]
}

const approvalOptions = computed(() => approvalOptionsForRequest(props.request))

watch(
  () => props.request?.id ?? 0,
  () => {
    approvalFreeformText.value = ''
    toolQuestionAnswers.value = {}
    toolQuestionOtherAnswers.value = {}
    mcpElicitationAnswers.value = {}
    mcpElicitationValidationError.value = ''
    selectedApprovalDecision.value = approvalOptions.value[0]?.id ?? 'accept'
  },
  { immediate: true },
)

watch(
  approvalOptions,
  (nextOptions) => {
    if (selectedApprovalDecision.value === 'decline') return
    if (!nextOptions.some((option) => option.id === selectedApprovalDecision.value)) {
      selectedApprovalDecision.value = nextOptions[0]?.id ?? 'accept'
    }
  },
  { immediate: true },
)

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue

    const id = readString(question.id)
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => ({
          label: readString(option?.label),
          description: readString(option?.description),
        }))
        .filter((option) => option.label.length > 0)
      : []

    parsed.push({
      id,
      header: readString(question.header),
      question: readString(question.question),
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  return toolQuestionOtherAnswers.value[toolQuestionKey(requestId, questionId)] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, value: string): void {
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: value,
  }
}

function toolQuestionOptions(question: ParsedToolQuestion): Array<{ value: string; label: string }> {
  return question.options.map((option) => ({ value: option.label, label: option.label }))
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function selectedOptionDescription(
  requestId: number,
  questionId: string,
  options: Array<{ label: string; description: string }>,
): string {
  const selected = readQuestionAnswer(requestId, questionId, options[0]?.label || '')
  return options.find((option) => option.label === selected)?.description ?? ''
}

function mcpElicitationAnswerKey(requestId: number, fieldKey: string): string {
  return `${String(requestId)}:${fieldKey}`
}

function readMcpElicitationServerName(request: UiServerRequest): string {
  return readString(asRecord(request.params)?.serverName)
}

function readMcpElicitationUrl(request: UiServerRequest): string {
  const rawUrl = readString(asRecord(request.params)?.url)
  if (!rawUrl) return ''

  try {
    const parsed = new URL(rawUrl)
    const protocol = parsed.protocol.toLowerCase()
    return protocol === 'https:' || protocol === 'http:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function readMcpElicitationFields(request: UiServerRequest): McpElicitationField[] {
  const params = asRecord(request.params)
  const requestedSchema = asRecord(params?.requestedSchema)
  const properties = asRecord(requestedSchema?.properties)
  if (!properties) return []

  const required = new Set(
    Array.isArray(requestedSchema?.required)
      ? requestedSchema.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  )

  return Object.entries(properties)
    .map(([key, value]) => parseMcpElicitationField(key, asRecord(value), required.has(key)))
    .filter((field): field is McpElicitationField => field !== null)
}

function parseMcpElicitationField(
  key: string,
  schema: Record<string, unknown> | null,
  required: boolean,
): McpElicitationField | null {
  if (!schema) return null

  const label = readString(schema.title) || key
  const description = readString(schema.description)
  const type = readString(schema.type)

  if (type === 'boolean') {
    return {
      key,
      label,
      description,
      required,
      kind: 'boolean',
      inputType: 'checkbox',
      options: [],
      defaultValue: typeof schema.default === 'boolean' ? schema.default : null,
      hasExplicitDefault: typeof schema.default === 'boolean',
    }
  }

  if (type === 'number' || type === 'integer') {
    return {
      key,
      label,
      description,
      required,
      kind: 'number',
      inputType: 'number',
      options: [],
      defaultValue: typeof schema.default === 'number' ? schema.default : null,
      hasExplicitDefault: typeof schema.default === 'number',
    }
  }

  const options = readMcpElicitationOptions(schema)
  if (type === 'array') {
    return {
      key,
      label,
      description,
      required,
      kind: 'multiEnum',
      inputType: 'checkbox',
      options,
      defaultValue: Array.isArray(schema.default)
        ? schema.default.filter((entry): entry is string => typeof entry === 'string')
        : [],
      hasExplicitDefault: Array.isArray(schema.default),
    }
  }

  const stringDefault = readOptionalString(schema.default)
  if (options.length > 0) {
    return {
      key,
      label,
      description,
      required,
      kind: 'singleEnum',
      inputType: 'select',
      options,
      defaultValue: stringDefault,
      hasExplicitDefault: stringDefault !== null,
    }
  }

  return {
    key,
    label,
    description,
    required,
    kind: 'string',
    inputType: readMcpElicitationInputType(schema),
    options: [],
    defaultValue: stringDefault,
    hasExplicitDefault: stringDefault !== null,
  }
}

function readMcpElicitationOptions(schema: Record<string, unknown>): McpElicitationFieldOption[] {
  const titled = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : []
  const titledOptions = titled
    .map((option) => asRecord(option))
    .map((option) => ({
      value: readString(option?.const),
      label: readString(option?.title) || readString(option?.const),
    }))
    .filter((option) => option.value.length > 0)
  if (titledOptions.length > 0) return titledOptions

  const items = asRecord(schema.items)
  if (items) {
    const nested = readMcpElicitationOptions(items)
    if (nested.length > 0) return nested
  }

  const values = Array.isArray(schema.enum) ? schema.enum.filter((entry): entry is string => typeof entry === 'string') : []
  const names = Array.isArray(schema.enumNames) ? schema.enumNames.filter((entry): entry is string => typeof entry === 'string') : []
  return values.map((value, index) => ({ value, label: names[index] || value }))
}

function readMcpElicitationInputType(schema: Record<string, unknown>): string {
  const format = readString(schema.format)
  if (format === 'email') return 'email'
  if (format === 'uri') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime-local'
  return 'text'
}

function readMcpElicitationFieldValue(requestId: number, field: McpElicitationField): string | number | boolean | string[] | null {
  const saved = mcpElicitationAnswers.value[mcpElicitationAnswerKey(requestId, field.key)]
  if (saved !== undefined) return saved
  return field.defaultValue
}

function readMcpElicitationMultiValue(requestId: number, field: McpElicitationField): string[] {
  const value = readMcpElicitationFieldValue(requestId, field)
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function onMcpElicitationFieldInput(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return

  onMcpElicitationFieldValueChange(requestId, field, target.value)
}

function onMcpElicitationFieldValueChange(requestId: number, field: McpElicitationField, rawValue: string): void {
  const nextValue =
    field.kind === 'number'
      ? rawValue
      : rawValue

  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: rawValue.length > 0 ? nextValue : null,
  }
  mcpElicitationValidationError.value = ''
}

function onMcpElicitationBooleanChange(requestId: number, field: McpElicitationField, value: string): void {
  let nextValue: boolean | null = null
  if (value === 'true') nextValue = true
  else if (value === 'false') nextValue = false

  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: nextValue,
  }
  mcpElicitationValidationError.value = ''
}

function onMcpElicitationMultiToggle(
  requestId: number,
  field: McpElicitationField,
  optionValue: string,
  event: Event,
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const current = new Set(readMcpElicitationMultiValue(requestId, field))
  if (target.checked) current.add(optionValue)
  else current.delete(optionValue)
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: Array.from(current),
  }
  mcpElicitationValidationError.value = ''
}

function serializeMcpBooleanValue(value: string | number | boolean | string[] | null): string {
  if (value === true) return 'true'
  if (value === false) return 'false'
  return ''
}

function mcpBooleanOptions(field: McpElicitationField): Array<{ value: string; label: string }> {
  const options = [
    { value: 'true', label: t('True') },
    { value: 'false', label: t('False') },
  ]
  if (!field.hasExplicitDefault) {
    options.unshift({ value: '', label: t('Select true or false') })
  }
  return options
}

function mcpSingleEnumOptions(field: McpElicitationField): Array<{ value: string; label: string }> {
  const options = field.options.map((option) => ({ value: option.value, label: option.label }))
  if (!field.hasExplicitDefault) {
    options.unshift({ value: '', label: t('Select an option') })
  }
  return options
}

function isMcpElicitationFieldAnswered(requestId: number, field: McpElicitationField): boolean {
  const value = readMcpElicitationFieldValue(requestId, field)
  if (field.kind === 'multiEnum') {
    return Array.isArray(value) && value.length > 0
  }
  if (field.kind === 'boolean') {
    return typeof value === 'boolean'
  }
  if (field.kind === 'number') {
    if (typeof value === 'number') return true
    return typeof value === 'string' && value.trim().length > 0
  }
  return typeof value === 'string' && value.trim().length > 0
}

function validateMcpElicitationRequest(request: UiServerRequest): string {
  const missingLabels = readMcpElicitationFields(request)
    .filter((field) => field.required && !isMcpElicitationFieldAnswered(request.id, field))
    .map((field) => field.label)

  if (missingLabels.length === 0) return ''
  if (missingLabels.length === 1) return `Answer the required field: ${missingLabels[0]}.`
  return `Answer the required fields: ${missingLabels.join(', ')}.`
}

function buildMcpElicitationContent(request: UiServerRequest): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const field of readMcpElicitationFields(request)) {
    const value = readMcpElicitationFieldValue(request.id, field)
    if (field.kind === 'multiEnum') {
      const arrayValue = Array.isArray(value) ? value : []
      if (arrayValue.length > 0 || field.required) content[field.key] = arrayValue
      continue
    }
    if (field.kind === 'boolean') {
      if (typeof value === 'boolean') content[field.key] = value
      continue
    }
    if (field.kind === 'number') {
      const numberValue = typeof value === 'number' ? value : Number(String(value).trim())
      if (!Number.isNaN(numberValue)) content[field.key] = numberValue
      continue
    }
    const textValue = String(value ?? '').trim()
    if (textValue.length > 0 || field.required) content[field.key] = textValue
  }
  return content
}

function onSelectApprovalOption(decision: ApprovalOption['id']): void {
  selectedApprovalDecision.value = decision
}

function onFocusApprovalOther(): void {
  selectedApprovalDecision.value = 'decline'
}

function onApprovalOtherInput(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  approvalFreeformText.value = target.value
  selectedApprovalDecision.value = 'decline'
}

function onRespondApproval(request: UiServerRequest, decision: ApprovalDecision): void {
  if (isPermissionsApprovalRequest(request)) {
    if (decision === 'decline' || decision === 'cancel') {
      emit('respondServerRequest', {
        id: request.id,
        error: {
          code: -32000,
          message: decision === 'cancel' ? 'Cancelled from CodexUI.' : 'Declined from CodexUI.',
        },
      })
      return
    }

    const permissions = asRecord(asRecord(request.params)?.permissions) ?? {}
    emit('respondServerRequest', {
      id: request.id,
      result: {
        permissions,
        scope: decision === 'acceptForSession' ? 'session' : 'turn',
      },
    })
    return
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { decision },
  })
}

function onSubmitApproval(request: UiServerRequest): void {
  const note = approvalFreeformText.value.trim()
  const decision: ApprovalDecision = note.length > 0 ? 'decline' : selectedApprovalDecision.value

  if (isPermissionsApprovalRequest(request)) {
    onRespondApproval(request, decision)
    return
  }

  emit('respondServerRequest', {
    id: request.id,
    result: {
      decision,
    },
    followUpMessageText: note || undefined,
  })
}

function onRespondMcpElicitation(request: UiServerRequest, action: 'accept' | 'decline' | 'cancel'): void {
  const params = asRecord(request.params)
  const result: Record<string, unknown> = { action }

  if (action === 'accept' && readString(params?.mode) === 'form') {
    const validationError = validateMcpElicitationRequest(request)
    if (validationError) {
      mcpElicitationValidationError.value = validationError
      return
    }
    result.content = buildMcpElicitationContent(request)
  }

  emit('respondServerRequest', {
    id: request.id,
    result,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from CodexUI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    result: {},
  })
}

function onRejectUnknownRequest(request: UiServerRequest): void {
  emit('respondServerRequest', {
    id: request.id,
    error: {
      code: -32000,
      message: 'Rejected from CodexUI.',
    },
  })
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-pending-request {
  @apply w-full max-w-[min(var(--chat-column-max,45rem),100%)] mx-auto;
}

.thread-pending-request-shell {
  @apply w-full rounded-[1.75rem] border border-zinc-700 bg-zinc-900 px-4 py-4 sm:px-5 sm:py-4 text-zinc-100 shadow-xl;
}

.thread-pending-request-shell--no-top-radius {
  @apply rounded-t-none border-t-0;
}

.thread-pending-request-header {
  @apply flex items-start justify-between gap-3;
}

.thread-pending-request-heading {
  @apply min-w-0 flex-1 flex flex-col gap-1;
}

.thread-pending-request-eyebrow {
  @apply m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400;
}

.thread-pending-request-title {
  @apply m-0 text-[clamp(0.94rem,2vw,1.2rem)] leading-relaxed text-zinc-50 whitespace-pre-wrap break-words;
}

.thread-pending-request-counter {
  @apply shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400;
}

.thread-pending-request-command-line,
.thread-pending-request-preview {
  @apply mt-3 rounded-xl bg-zinc-800/85 px-4 py-3 text-sm font-medium text-zinc-100;
}

.thread-pending-request-preview-code {
  @apply block truncate whitespace-nowrap font-mono;
}

.thread-pending-request-approval,
.thread-pending-request-user-input {
  @apply mt-3 flex flex-col gap-2.5;
}

.thread-pending-request-options {
  @apply flex flex-col gap-1.5;
}

.thread-pending-request-option {
  @apply flex h-12 w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-transparent px-4 text-left transition hover:border-zinc-600 hover:bg-zinc-800/70;
}

.thread-pending-request-option.is-selected {
  @apply border-zinc-500 bg-zinc-800/95;
  box-shadow: inset 0 0 0 1px rgba(244, 244, 245, 0.14);
}

.thread-pending-request-option-index {
  @apply shrink-0 text-base font-medium leading-none text-zinc-500;
}

.thread-pending-request-option-label {
  @apply min-w-0 truncate text-sm leading-none text-zinc-50;
}

.thread-pending-request-inline-input {
  @apply flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-800/70 px-4 text-sm text-zinc-400 transition focus-within:border-zinc-500 focus-within:bg-zinc-800/90;
}

.thread-pending-request-inline-input.is-active {
  @apply text-zinc-100;
}

.thread-pending-request-inline-control {
  @apply w-full min-w-0 border-none bg-transparent p-0 text-sm leading-none text-zinc-100 outline-none placeholder:text-zinc-500;
}

.thread-pending-request-question {
  @apply rounded-2xl border border-zinc-800 bg-zinc-900/75 px-3 py-3;
}

.thread-pending-request-question-title {
  @apply m-0 text-sm font-medium leading-relaxed text-zinc-50;
}

.thread-pending-request-question-text,
.thread-pending-request-question-description {
  @apply m-0 mt-1 text-xs leading-relaxed text-zinc-400;
}

.thread-pending-request-validation-error {
  @apply m-0 mt-3 text-sm leading-relaxed text-rose-300;
}

.thread-pending-request-question-options,
.thread-pending-request-input-wrap {
  @apply mt-3 flex flex-col gap-1.5;
}

.thread-pending-request-link {
  @apply inline-flex w-fit items-center rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800;
}

.thread-pending-request-select-wrap {
  @apply flex flex-col gap-1.5;
}

.thread-pending-request-select-label {
  @apply text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500;
}

.thread-pending-request-input {
  @apply h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none;
}

.thread-pending-request-input:focus {
  @apply border-zinc-500;
  box-shadow: 0 0 0 1px rgba(244, 244, 245, 0.18);
}

.thread-pending-request-dropdown :deep(.composer-dropdown-trigger) {
  @apply h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100;
}

.thread-pending-request-dropdown :deep(.composer-dropdown-value) {
  @apply min-w-0 flex-1 text-left;
}

.thread-pending-request-input::placeholder {
  @apply text-zinc-500;
}

.thread-pending-request-checkbox-row {
  @apply flex items-center gap-2 text-sm text-zinc-200;
}

.thread-pending-request-checkbox {
  @apply h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-zinc-100;
}

.thread-pending-request-checkbox-label {
  @apply leading-relaxed;
}

.thread-pending-request-actions,
.thread-pending-request-footer {
  @apply mt-3 flex items-center justify-end gap-2;
}

.thread-pending-request-footer--approval {
  @apply mt-0 items-stretch gap-2.5;
}

.thread-pending-request-primary,
.thread-pending-request-secondary {
  @apply h-12 shrink-0 rounded-full border px-5 text-sm font-medium transition;
}

.thread-pending-request-primary {
  @apply border-zinc-100 bg-zinc-100 text-zinc-950 hover:bg-white;
}

.thread-pending-request-secondary {
  @apply border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800;
}

@media (max-width: 640px) {
  .thread-pending-request-shell {
    @apply rounded-[1.5rem] px-3 py-3;
  }

  .thread-pending-request-footer--approval {
    @apply flex-wrap;
  }

  .thread-pending-request-inline-input {
    @apply basis-full;
  }
}
</style>
