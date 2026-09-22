import { describe, it, expect } from 'vitest'
import { catalogModel, resolveModelAlias, isChatCallableModelId } from '../src/adapter/catalog.ts'
import { toAgyRequestBody } from '../src/adapter/translate.ts'
import { mergeModelCatalog, resolveAgyModel } from '../src/adapter/models.ts'

describe('live verification & contract invariants', () => {
  it('correctly sets claude maxOutputTokens to 64000 in catalog and resolver', () => {
    const sonnet = catalogModel('claude-sonnet-4-6')
    expect(sonnet?.maxOutputTokens).toBe(64000)

    const opus = catalogModel('claude-opus-4-6-thinking')
    expect(opus?.maxOutputTokens).toBe(64000)

    const resolved = resolveAgyModel('agy', 'claude-sonnet-4-6')
    expect(resolved.defaultMaxTokens).toBe(64000)
  })

  it('clamps Claude maxOutputTokens in toAgyRequestBody', () => {
    const body = toAgyRequestBody({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      maxTokens: 65536,
    }, {})
    expect(body.request.generationConfig?.maxOutputTokens).toBe(64000)
  })

  it('filters out chat_* and isInternal models and maps gemini-3.1-pro-high', () => {
    expect(isChatCallableModelId('chat_20706')).toBe(false)
    expect(isChatCallableModelId('chat_23310')).toBe(false)
    expect(isChatCallableModelId('tab_flash')).toBe(false)
    expect(isChatCallableModelId('gemini-3-flash')).toBe(true)

    expect(resolveModelAlias('gemini-3.1-pro-high')).toBe('gemini-pro-agent')

    const merged = mergeModelCatalog({
      models: {
        'chat_20706': { displayName: 'Chat 20706' },
        'chat_23310': { displayName: 'Chat 23310' },
        'gemini-3.1-pro-high': { displayName: 'Gemini 3.1 Pro (High)' },
        'gemini-pro-agent': { displayName: 'Gemini 3.1 Pro (High)' },
        'claude-sonnet-4-6': { displayName: 'Claude Sonnet 4.6' },
      },
      deprecatedModelIds: {
        'gemini-3.1-pro-high': { newModelId: 'gemini-pro-agent' },
      },
    })
    const ids = merged.map(m => m.id)
    expect(ids).not.toContain('chat_20706')
    expect(ids).not.toContain('chat_23310')
    expect(ids).not.toContain('gemini-3.1-pro-high')
    expect(ids).toContain('gemini-pro-agent')
    expect(ids).toContain('claude-sonnet-4-6')
    expect(ids.filter(id => id === 'gemini-pro-agent').length).toBe(1)
  })
})
