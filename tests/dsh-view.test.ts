/**
 * The dsh-llm message-vocabulary boundary.
 *
 * These tests exist because the two supported dsh-llm release lines describe
 * the SAME conversation with different shapes, and only one of them can be
 * installed at a time in this repo. Pinning both shapes here means the
 * `tool-result` branch (0.1.5) and the `tool`-role branch (0.2.0) are exercised
 * on every run, whichever line `node_modules` happens to hold — a regression in
 * the other line's vocabulary cannot hide behind the install.
 *
 * The 0.2.0 fixtures are written as the plain objects that line produces
 * (`role: 'tool'`, `toolCallId`/`isError` at message level; no `tool-result`
 * content block) rather than imported types, which is exactly why they keep
 * working after an install flip.
 */

import { describe, expect, it } from 'vitest'
import {
  conversationMessages,
  normalizeMessages,
  systemTextFromMessages,
} from '../src/adapter/dsh-view.ts'

/** A 0.1.5-shaped assistant turn carrying one tool call. */
const TOOL_CALL_ASSISTANT = {
  id: 'm1',
  role: 'assistant',
  source: { kind: 'model', provider: 'agy', model: 'gemini-3.8-flash-tiered' },
  content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{"file_path":"/x"}' }],
}

describe('normalizeMessages', () => {
  it('keeps a 0.1.5 tool-result CONTENT BLOCK, correlation on the block', () => {
    const [message] = normalizeMessages([{
      id: 'm2',
      role: 'user',
      content: [
        { type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'body' }] },
      ],
    }])
    expect(message).toEqual({
      role: 'user',
      id: 'm2',
      content: [{
        type: 'tool-result',
        toolCallId: 'call-1',
        content: [{ type: 'text', text: 'body' }],
      }],
    })
  })

  it('keeps a 0.2.0 tool-ROLE message, correlation on the MESSAGE', () => {
    const [message] = normalizeMessages([{
      id: 'm2',
      role: 'tool',
      source: { kind: 'tool', callId: 'call-1' },
      toolCallId: 'call-1',
      content: [{ type: 'text', text: 'body' }],
    }])
    expect(message).toEqual({
      role: 'tool',
      id: 'm2',
      content: [{ type: 'text', text: 'body' }],
      toolCallId: 'call-1',
    })
  })

  it('carries isError from whichever level declares it', () => {
    const [blockLevel] = normalizeMessages([
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c', content: [], isError: true }] },
    ])
    expect(blockLevel!.content[0]).toMatchObject({ isError: true })

    const [messageLevel] = normalizeMessages([
      { role: 'tool', toolCallId: 'c', isError: true, content: [] },
    ])
    expect(messageLevel).toMatchObject({ isError: true })
  })

  it('accepts a 0.2.0 identity-free RequestUserInput', () => {
    const [message] = normalizeMessages([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
    expect(message).toEqual({ role: 'user', content: [{ type: 'text', text: 'hi' }] })
    expect(message!.id).toBeUndefined()
  })

  it('projects merge-extensible and unreadable blocks away instead of guessing', () => {
    const [message] = normalizeMessages([{
      role: 'developer',
      content: [
        { type: 'tool-addition', toolName: 'read' },
        { type: 'tool-removal', toolName: 'read' },
        { type: 'tool-call', name: 'missing-id', arguments: '{}' },
        { type: 'text' },
        'not-a-block',
      ],
    }])
    expect(message!.content).toEqual([])
  })

  it('drops entries that are not messages at all', () => {
    expect(normalizeMessages([null, 42, { content: [] }])).toEqual([])
  })
})

describe('conversationMessages', () => {
  it('excludes the non-turn roles so a system prompt never becomes a user turn', () => {
    const messages = normalizeMessages([
      { id: 's', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'be terse' }] },
      { id: 'd', role: 'developer', content: [{ type: 'tool-addition', toolName: 'read' }] },
      { id: 'u', role: 'user', content: [{ type: 'text', text: 'hi' }] },
      TOOL_CALL_ASSISTANT,
      { id: 't', role: 'tool', toolCallId: 'call-1', content: [{ type: 'text', text: 'ok' }] },
    ])
    expect(conversationMessages(messages).map((message) => message.role)).toEqual([
      'user', 'assistant', 'tool',
    ])
  })
})

describe('systemTextFromMessages', () => {
  it('joins the system-role text, and reports nothing when there is none', () => {
    const messages = normalizeMessages([
      { id: 's1', role: 'system', content: [{ type: 'text', text: 'first' }] },
      { id: 's2', role: 'system', content: [{ type: 'text', text: 'second' }] },
      { id: 'u', role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ])
    expect(systemTextFromMessages(messages)).toBe('first\n\nsecond')
    expect(systemTextFromMessages(normalizeMessages([{ role: 'user', content: [] }]))).toBeUndefined()
  })

  it('ignores empty system text, which 0.2.0 documents as "no prompt"', () => {
    const messages = normalizeMessages([
      { id: 's', role: 'system', content: [{ type: 'text', text: '' }] },
    ])
    expect(systemTextFromMessages(messages)).toBeUndefined()
  })
})
