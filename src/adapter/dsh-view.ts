/**
 * The adapter's canonical view of a DSH message, normalized at the seam.
 *
 * WHY THIS FILE EXISTS. `@deepseek-ai/dsh-llm` changed its message vocabulary
 * between the release lines this plugin supports, and the change is not a
 * superset — the SAME tool result is described by a different shape:
 *
 *   - 0.1.5: a tool result is a `tool-result` CONTENT BLOCK, carried inside a
 *     `user` message (`ContentBlockMap['tool-result']`), and `Message['role']`
 *     is `'system' | 'user' | 'assistant'`.
 *   - 0.2.0: `ContentBlockMap` has NO `tool-result` entry; the result is
 *     promoted to a first-class `tool`-ROLE message (`ToolResultMessage`) that
 *     carries `toolCallId`/`isError` at message level, and `role` gains
 *     `'developer'`. `GenerateOptions.messages` becomes `RequestMessage[]`
 *     (`Message | RequestUserInput`), where `RequestUserInput` is an
 *     identity-free user turn.
 *
 * Neither union is assignable to the other, so the adapter cannot switch on the
 * harness type directly: on 0.1.5 a `tool-result` case narrows fine, and on
 * 0.2.0 that same case is a type error against a union that no longer has it.
 *
 * The fix is a boundary, not a cast scattered through the translator: the raw
 * harness list is projected ONCE into the union below, which keeps BOTH
 * vocabularies as separate, explicitly handled cases. Downstream code then has
 * one vocabulary to reason about, and `pnpm run verify:dsh-llm-compat` pins
 * that `src/` still compiles against each supported line's published types.
 *
 * The projection is deliberately tolerant: an unreadable or unknown block is
 * dropped rather than guessed at, which matches the translator's existing
 * "unknown block types are skipped" policy for merge-extensible content.
 */

/** A text part of a message. */
export interface AgyTextBlockView {
  type: 'text'
  text: string
}

/** A reasoning/thinking part of a message. */
export interface AgyReasoningBlockView {
  type: 'reasoning'
  text: string
}

/** An image reference; bytes are resolved separately through the attachment store. */
export interface AgyImageBlockView {
  type: 'image'
  attachment: { attachmentId: string }
}

/** A file reference; handled by the multimodal path, not by the translator. */
export interface AgyFileBlockView {
  type: 'file'
  attachment: { attachmentId: string }
}

/** A tool invocation requested by the model. */
export interface AgyToolCallBlockView {
  type: 'tool-call'
  id: string
  name: string
  arguments: unknown
}

/**
 * A tool result in the 0.1.5 shape: a content block inside a `user` message.
 *
 * Still modelled even on the 0.2.0 line, because the shape is what the
 * translator's shared `functionResponse` builder consumes — see
 * `normalizeMessages` for how a 0.2.0 `tool`-role message is kept distinct.
 */
export interface AgyToolResultBlockView {
  type: 'tool-result'
  toolCallId: string
  content: AgyBlockView[]
  isError?: boolean
}

/** One content block, in the union of both supported vocabularies. */
export type AgyBlockView =
  | AgyTextBlockView
  | AgyReasoningBlockView
  | AgyImageBlockView
  | AgyFileBlockView
  | AgyToolCallBlockView
  | AgyToolResultBlockView

/**
 * One message.
 *
 * `role` stays `string` rather than a closed union: 0.2.0 introduced
 * `'developer'`, and the harness declares the role maps merge-extensible, so a
 * future role must degrade to "no parts" instead of failing a cast. Comparison
 * against the roles this adapter understands happens at each use site.
 */
export interface AgyMessageView {
  readonly role: string
  /** Durable identity; absent on 0.2.0's `RequestUserInput`. */
  readonly id?: string
  readonly content: AgyBlockView[]
  /**
   * 0.2.0 `ToolResultMessage` correlation, carried at MESSAGE level.
   *
   * Set only on a `tool`-role message; the 0.1.5 shape carries the same fact on
   * the `tool-result` block instead.
   */
  readonly toolCallId?: string
  /** 0.2.0 `ToolResultMessage`: whether the tool invocation failed. */
  readonly isError?: boolean
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function normalizeBlocks(raw: unknown): AgyBlockView[] {
  if (!Array.isArray(raw)) return []
  const blocks: AgyBlockView[] = []
  for (const entry of raw) {
    const block = asRecord(entry)
    if (!block) continue
    switch (block.type) {
      case 'text':
      case 'reasoning': {
        const text = asString(block.text)
        if (text !== undefined) blocks.push({ type: block.type, text })
        break
      }
      case 'image':
      case 'file': {
        const attachment = asRecord(block.attachment)
        const attachmentId = attachment ? asString(attachment.attachmentId) : undefined
        if (attachmentId !== undefined) blocks.push({ type: block.type, attachment: { attachmentId } })
        break
      }
      case 'tool-call': {
        const id = asString(block.id)
        const name = asString(block.name)
        if (id !== undefined && name !== undefined) {
          blocks.push({ type: 'tool-call', id, name, arguments: block.arguments })
        }
        break
      }
      case 'tool-result': {
        const toolCallId = asString(block.toolCallId)
        if (toolCallId !== undefined) {
          blocks.push({
            type: 'tool-result',
            toolCallId,
            content: normalizeBlocks(block.content),
            ...(block.isError === true ? { isError: true } : {}),
          })
        }
        break
      }
      default:
        // Merge-extensible: tool-addition/tool-removal and any future block are
        // projected away here, exactly as the translator's `default` case
        // already skipped them on the wire.
        break
    }
  }
  return blocks
}

/**
 * Project a raw harness message list into {@link AgyMessageView}s.
 *
 * Both vocabularies survive the projection as their own shapes — a 0.1.5
 * `tool-result` block and a 0.2.0 `tool`-role message each keep the fields the
 * translator needs — so the wire shape is decided in ONE place (`toolResultPart`
 * in `translate.ts`) rather than duplicated per release line.
 *
 * @param raw - the harness's `GenerateOptions.messages` (or any list of them).
 * @returns one normalized view per readable message, in order.
 */
export function normalizeMessages(raw: readonly unknown[]): AgyMessageView[] {
  const messages: AgyMessageView[] = []
  for (const entry of raw) {
    const message = asRecord(entry)
    if (!message) continue
    const role = asString(message.role)
    if (role === undefined) continue
    const id = asString(message.id)
    const toolCallId = asString(message.toolCallId)
    messages.push({
      role,
      ...(id === undefined ? {} : { id }),
      content: normalizeBlocks(message.content),
      ...(toolCallId === undefined ? {} : { toolCallId }),
      ...(message.isError === true ? { isError: true } : {}),
    })
  }
  return messages
}

/**
 * Messages that project to a wire turn.
 *
 * `system` and `developer` are excluded because they are not conversation
 * turns: the system prompt becomes `systemInstruction` and a developer message
 * carries tool-addition/removal bookkeeping, which this channel expresses
 * through the tool declarations themselves.
 */
export function conversationMessages(messages: readonly AgyMessageView[]): AgyMessageView[] {
  return messages.filter((message) => message.role !== 'system' && message.role !== 'developer')
}

/**
 * The system prompt text carried by `system`-role messages, in order.
 *
 * `GenerateOptions.system` is documented as the one-shot channel and is
 * undefined for loop-built requests, whose derived history carries the prompt
 * as a leading `system`-role message on BOTH supported lines. Reading only
 * `options.system` therefore sent no system prompt at all for a real agent
 * turn, and mapping the message through the conversation path sent it as a USER
 * turn instead — this is the text that belongs in `systemInstruction`.
 */
export function systemTextFromMessages(messages: readonly AgyMessageView[]): string | undefined {
  const parts: string[] = []
  for (const message of messages) {
    if (message.role !== 'system') continue
    for (const block of message.content) {
      if (block.type === 'text' && block.text !== '') parts.push(block.text)
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}
