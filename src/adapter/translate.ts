/**
 * Translate a DSH GenerateOptions into the Antigravity wrapped request.
 *
 * Envelope shape follows the actively-maintained OmniRoute wire format
 * (the archived opencode reference predates it): top-level `project`,
 * `requestId`, `model`, `userAgent`, `requestType`, with the Gemini-style
 * body under `request` (contents/systemInstruction/tools/generationConfig/
 * sessionId). `toolConfig` VALIDATED is attached when tools are present, and
 * Claude-path requests strip trailing model turns (Vertex rejects "assistant
 * message prefill").
 *
 * Thinking blocks are carried as-is (Gemini `thought` parts); nothing is
 * stripped or re-signed — that signature dance was an artifact of the
 * reference plugin's interception architecture (see docs/ARCHITECTURE.md).
 */

import { createHash } from 'node:crypto'
import type { ContentBlock, GenerateOptions, Message, ToolSchema } from '@deepseek-ai/dsh-llm'
import { generateAntigravityRequestId } from '../runtime/identity.ts'
import { getThoughtSignature, THOUGHT_SIGNATURE_SENTINEL } from '../runtime/signature-cache.ts'
import { catalogModel, isLevelThinkingModel, resolveModelAlias } from './catalog.ts'
import { isClaudeModel, supportsMultimodalFiles, type AgyResolvedMultimodalFile } from './multimodal.ts'

export { isClaudeModel, supportsMultimodalFiles }
export type { AgyResolvedMultimodalFile }

export const AGY_CLAUDE_MAX_OUTPUT_TOKENS = 64_000

export type AgyPart =
  | { text: string }
  | { thought: true; text: string }
  | { thoughtSignature: string; functionCall: { id: string; name: string; args: unknown } }
  | { functionResponse: { id?: string; name: string; response: unknown } }
  | { inlineData: { mimeType: string; data: string } }

/** Image bytes pre-resolved from the durable attachment store, keyed by attachment id. */
export interface AgyResolvedImage {
  mediaType: string
  /** Pure base64 (no data: prefix). */
  data: string
}

export interface AgyContent {
  role: 'user' | 'model'
  parts: AgyPart[]
}

export interface AgyRequestBody {
  project?: string
  requestId?: string
  model: string
  userAgent?: string
  requestType?: 'agent'
  request: {
    contents: AgyContent[]
    systemInstruction?: { parts: Array<{ text: string }> }
    tools?: Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: unknown }> }>
    toolConfig?: { functionCallingConfig: { mode: 'VALIDATED' } }
    generationConfig?: {
      temperature?: number
      maxOutputTokens?: number
      stopSequences?: string[]
      thinkingConfig?: { thinkingLevel: string; includeThoughts: boolean }
    }
    sessionId?: string
  }
}

/**
 * Vertex (the Antigravity Claude backend) rejects conversations ending on an
 * assistant/model turn ("assistant message prefill"); never strip to empty.
 */
export function stripTrailingModelTurn(contents: AgyContent[]): AgyContent[] {
  while (contents.length > 1 && contents[contents.length - 1]?.role === 'model') {
    contents.pop()
  }
  return contents
}

/**
 * The Antigravity backend parses tool `parameters` as a strict protobuf
 * schema and rejects ANY unknown keyword with 400 (verified empirically:
 * `$schema`, `propertyNames`, `pattern`, `minLength`, ... each fail in turn).
 * Denylisting is whack-a-mole, so keep only the keywords the upstream
 * accepts. Container shapes are handled distinctly: `properties` is a
 * name->schema map (keys preserved), `items`/`additionalProperties` are
 * nested schemas (additionalProperties also accepts a boolean — live-verified
 * against the Antigravity upstream), `required`/`enum` are plain arrays.
 *
 * Keyword VALUES are also constrained by the protobuf shape (verified
 * empirically): `type` must be a single enum string (union arrays like
 * `["string","number"]` are rejected) and every `enum` item must be a
 * string (booleans/numbers are rejected). Values are normalized to the
 * nearest valid form instead of being dropped wholesale.
 */
// Exported for the contract invariant test (tests/adapter.test.ts); not part of
// the package public API (translate.ts is an internal module).
export const AGY_SCHEMA_ALLOWLIST = new Set([
  'type', 'format', 'title', 'description', 'nullable',
  'items', 'enum', 'default', 'properties', 'required', 'additionalProperties',
])
const AGY_SCHEMA_MAP_KEYS = new Set(['properties'])
const AGY_SCHEMA_NESTED_KEYS = new Set(['items', 'additionalProperties'])
const AGY_SCHEMA_LIST_KEYS = new Set(['required', 'enum'])

function sanitizeToolSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map((entry) => sanitizeToolSchema(entry))

  // Normalize union types: upstream `type` is a single enum string. Pick the
  // first non-null string type (`"null"` maps to the `nullable` keyword);
  // fall back to `string` when no usable type remains.
  let normalized = schema as Record<string, unknown>
  if (Array.isArray(normalized.type)) {
    const types = normalized.type.filter((t): t is string => typeof t === 'string' && t !== 'null')
    normalized = { ...normalized, type: types[0] ?? 'string' }
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(normalized)) {
    if (!AGY_SCHEMA_ALLOWLIST.has(key)) continue
    if (AGY_SCHEMA_MAP_KEYS.has(key)) {
      const map: Record<string, unknown> = {}
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        map[name] = sanitizeToolSchema(child)
      }
      result[key] = map
      continue
    }
    if (AGY_SCHEMA_NESTED_KEYS.has(key)) {
      result[key] = sanitizeToolSchema(value)
      continue
    }
    if (AGY_SCHEMA_LIST_KEYS.has(key)) {
      // Upstream `enum` items must be strings; filter the rest and omit an
      // empty enum entirely (an empty array would be rejected too).
      if (key === 'enum' && Array.isArray(value)) {
        const filtered = value.filter((v): v is string => typeof v === 'string')
        if (filtered.length > 0) result[key] = filtered
      } else {
        result[key] = value
      }
      continue
    }
    result[key] = value
  }
  return result
}

/** Collect tool-call names by id so tool-result blocks can name their function. */
function buildToolNameIndex(messages: readonly Message[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool-call') {
        index.set(block.id, block.name)
      }
    }
  }
  return index
}

function blockToParts(
  block: ContentBlock,
  toolNames: Map<string, string>,
  images: Map<string, AgyResolvedImage>,
): AgyPart[] {
  switch (block.type) {
    case 'text':
      return [{ text: block.text }]
    case 'reasoning':
      return [{ thought: true, text: block.text }]
    case 'tool-call': {
      // Upstream parses functionCall.args as google.protobuf.Struct and
      // rejects a raw string with 400. Guarantee an object: parse the string
      // form, fall back to {} when it is truncated/malformed (the failure
      // mode for long multi-turn histories).
      let args: unknown = {}
      if (typeof block.arguments === 'object' && block.arguments !== null && !Array.isArray(block.arguments)) {
        args = block.arguments
      } else if (typeof block.arguments === 'string') {
        try {
          const parsed: unknown = JSON.parse(block.arguments)
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            args = parsed
          }
        } catch {
          // truncated/malformed JSON -> empty object
        }
      }
      // Antigravity rejects functionCall parts without a thoughtSignature
      // (400). Replay the signature captured for this tool call id on the
      // previous turn; the sentinel is the established bypass when nothing is
      // cached (both reference implementations default to it).
      const signature = getThoughtSignature(block.id) ?? THOUGHT_SIGNATURE_SENTINEL
      return [{
        thoughtSignature: signature,
        functionCall: { id: block.id, name: block.name, args },
      }]
    }
    case 'tool-result': {
      const name = toolNames.get(block.toolCallId) ?? block.toolCallId
      const text = block.content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      return [{
        functionResponse: {
          id: block.toolCallId,
          name,
          response: { result: text, is_error: block.isError === true },
        },
      }]
    }
    case 'image': {
      // Bytes are pre-resolved by the adapter before translation; a missing
      // entry breaks that invariant and must fail loudly, never silently drop.
      const resolved = images.get(block.attachment.attachmentId)
      if (!resolved) {
        throw new Error(`agy translate: unresolved image attachment "${block.attachment.attachmentId}"`)
      }
      return [{ inlineData: { mimeType: resolved.mediaType, data: resolved.data } }]
    }
    default:
      return [] // unknown block types (merge-extensible) are skipped
  }
}

function messageToContent(
  message: Message,
  toolNames: Map<string, string>,
  images: Map<string, AgyResolvedImage>,
  multimodalFiles?: Map<string, AgyResolvedMultimodalFile[]>,
  messageIndex?: number,
): AgyContent | null {
  const parts = message.content.flatMap((block) =>
    // Non-user images are out of scope by policy (docs ANTIGRAVITY-API §3.2):
    // skip them like any other untranslatable block instead of tripping the
    // unresolved-map guard, which protects only the user-image invariant.
    block.type === 'image' && message.role !== 'user'
      ? []
      : blockToParts(block, toolNames, images),
  )

  if (message.role === 'user' && multimodalFiles) {
    const files =
      (message.id ? multimodalFiles.get(message.id) : undefined) ??
      (multimodalFiles as Map<unknown, AgyResolvedMultimodalFile[]>).get(message) ??
      (messageIndex !== undefined ? multimodalFiles.get(`msg-${messageIndex}`) : undefined) ??
      (messageIndex !== undefined ? multimodalFiles.get(String(messageIndex)) : undefined)

    if (files) {
      for (const file of files) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } })
      }
    }
  }

  if (parts.length === 0) return null
  const role = message.role === 'assistant' ? 'model' : 'user'
  return { role, parts }
}

/**
 * Builtin Gemini tools must not shadow functionDeclarations names (upstream
 * treats them as native tools; verified by OmniRoute's GEMINI_BUILTIN_TOOL_NAMES).
 */
const AGY_BUILTIN_TOOL_NAMES = new Set(['google_search', 'web_search', 'search_web', 'googleSearch'])

/** Level-thinking: single id + selectable low/medium/high via thinkingLevel (catalog thinking:'level'). */
const LEVEL_THINKING_LEVELS = new Set(['low', 'medium', 'high'])

/** Upstream functionDeclarations names are `[a-zA-Z0-9_]` and ≤64 chars (OmniRoute-verified). */
const AGY_TOOL_NAME_MAX_LENGTH = 64

/** Sanitize a tool name to the upstream charset/length; dedupe via a short hash. */
export const AGY_BEHAVIOR_INSTRUCTION = `【Antigravity 协作交互规范】
1. 思考与推理（Thinking）：你的思考过程（thought / reasoning）必须与用户使用的语言保持一致（默认使用中文），请一律使用中文进行深度思考和问题拆解。
2. 边对话边执行（Crucial）：在执行任何工具操作（如 bash、edit、write 等）之前，必须先用简短自然的一两句话（中文）向用户说明你正在排查什么、发现的问题或接下来计划执行的操作，然后再调用工具。切勿在没有向用户说明的情况下默默连续调用工具！实现一边与用户对话沟通、一边高效推进任务的协作体验。
3. 持续思考：在收到工具执行结果后，若需要进一步分析或多步排查，请继续进行思考并向用户简述发现，再调用下一个工具。
4. 对话语言：与用户的所有对话交互一律使用中文。`

function sanitizeToolName(name: string, seen: Set<string>): string {
  let candidate = name.replace(/[^a-zA-Z0-9_]/g, '_') || 'tool'
  if (candidate.length > AGY_TOOL_NAME_MAX_LENGTH || seen.has(candidate)) {
    const hash = createHash('sha256').update(candidate).digest('hex').slice(0, 8)
    const prefix = candidate.slice(0, AGY_TOOL_NAME_MAX_LENGTH - hash.length - 1)
    candidate = `${prefix}_${hash}`
    let i = 2
    while (seen.has(candidate)) candidate = `${prefix}_${i++}_${hash}`
  }
  seen.add(candidate)
  return candidate
}

function toolsToDeclarations(tools: ToolSchema[] | undefined): AgyRequestBody['request']['tools'] {
  if (!tools || tools.length === 0) return undefined
  const seenNames = new Set<string>()
  const declarations = []
  for (const tool of tools) {
    if (AGY_BUILTIN_TOOL_NAMES.has(tool.name)) continue
    declarations.push({
      name: sanitizeToolName(tool.name, seenNames),
      description: tool.description,
      parameters: sanitizeToolSchema(tool.parameters),
    })
  }
  if (declarations.length === 0) return undefined
  return [{ functionDeclarations: declarations }]
}

/** Build the wrapped Antigravity request body for one call. */
export function toAgyRequestBody(
  options: GenerateOptions,
  context: {
    projectId?: string
    sessionId?: string
    images?: Map<string, AgyResolvedImage>
    appendBehaviorInstruction?: boolean
    multimodalFiles?: Map<string, AgyResolvedMultimodalFile[]>
  },
): AgyRequestBody {
  const toolNames = buildToolNameIndex(options.messages)
  const images = context.images ?? new Map<string, AgyResolvedImage>()
  const resolvedModel = resolveModelAlias(options.model)
  const isClaude = isClaudeModel(resolvedModel)
  const multimodalFiles = supportsMultimodalFiles(resolvedModel) ? context.multimodalFiles : undefined
  let contents = options.messages
    .map((message, index) => messageToContent(message, toolNames, images, multimodalFiles, index))
    .filter((c): c is AgyContent => c !== null)
  if (isClaude) {
    contents = stripTrailingModelTurn(contents)
  }

  const tools = toolsToDeclarations(options.tools)
  const generationConfig: NonNullable<AgyRequestBody['request']['generationConfig']> = {}
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature
  if (options.maxTokens !== undefined) {
    // Vertex AI caps Claude at 64,000 output tokens; larger values trigger 400 INVALID_ARGUMENT.
    generationConfig.maxOutputTokens = isClaude
      ? Math.min(options.maxTokens, 64000)
      : options.maxTokens
  }
  if (options.stop !== undefined && options.stop.length > 0) {
    if (isClaude) {
      // Anthropic on Vertex rejects stop_sequences with no non-whitespace character.
      const validStops = options.stop.filter((s: string) => /\S/.test(s))
      if (validStops.length > 0) generationConfig.stopSequences = validStops
    } else {
      generationConfig.stopSequences = options.stop
    }
  }
  // Level-thinking: map the DSH reasoning effort to thinkingConfig.
  // Id-bound models (thinking !== 'level') never emit it — default is UI hint, not wire default.
  const effort = options.reasoningEffort?.toLowerCase()
  if (isLevelThinkingModel(resolvedModel)) {
    if (options.purpose === "session-title" || effort === "none" || effort === "off") {
      generationConfig.thinkingConfig = { thinkingBudget: 0 }
    } else if (effort && LEVEL_THINKING_LEVELS.has(effort)) {
      generationConfig.thinkingConfig = { thinkingLevel: effort, includeThoughts: true }
    }
  }

  let systemText = options.system
  if (context.appendBehaviorInstruction) {
    systemText = systemText
      ? `${systemText}\n\n${AGY_BEHAVIOR_INSTRUCTION}`
      : AGY_BEHAVIOR_INSTRUCTION
  }

  return {
    project: context.projectId || undefined,
    requestId: generateAntigravityRequestId(),
    model: resolvedModel,
    userAgent: 'antigravity',
    requestType: 'agent',
    request: {
      contents,
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      ...(tools ? { tools } : {}),
      ...(tools ? { toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } } } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
    },
  }
}
