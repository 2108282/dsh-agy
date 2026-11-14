import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import {
  AGY_PUBLIC_MODELS,
  catalogModel,
  isUnifiedThinkingFamily,
  levelThinkingEffortsFor,
  registerDiscoveredTieredModels,
  resetDiscoveredTieredModels,
} from '../src/adapter/catalog.ts'
import { catalogModelList, mergeModelCatalog, resolveAgyModel } from '../src/adapter/models.ts'
import { resolveWireModel, toAgyRequestBody } from '../src/adapter/translate.ts'

const HYDROGEN = 'gemini-4-hydrogen'

function discoverVariants(base: string, levels: readonly string[]) {
  return mergeModelCatalog({
    models: Object.fromEntries(levels.map((level) => [`${base}-${level}`, {}])),
  })
}

function request(model: string, effort?: string, context: Parameters<typeof toAgyRequestBody>[1] = {}) {
  return toAgyRequestBody({
    provider: 'agy',
    model,
    messages: [{ id: 'user', role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  } as GenerateOptions, context)
}

beforeEach(() => resetDiscoveredTieredModels())
afterEach(() => resetDiscoveredTieredModels())

describe('discovered discrete thinking variants', () => {
  it('unifies all four Hydrogen variants once while keeping Argon and Orchestrator separate', () => {
    const merged = mergeModelCatalog({
      models: {
        'gemini-4-hydrogen-xhigh': {},
        'gemini-4-hydrogen-medium': {},
        'gemini-4-hydrogen-low': {},
        'gemini-4-hydrogen-high': {},
        'gemini-4-argon-high': {},
        'gemini-4-argon-low': {},
        'gemini-4-argon-medium': {},
        'gemini-pro-orchestrator-g1-pro': {},
      },
    })
    expect(merged.map((model) => model.id).sort()).toEqual([
      'gemini-4-argon', HYDROGEN, 'gemini-pro-orchestrator-g1-pro',
    ].sort())
    expect(merged.find((model) => model.id === HYDROGEN)?.name).toBe('Gemini 4 Hydrogen')
    expect(merged.find((model) => model.id === HYDROGEN)?.context).toBeUndefined()
    expect(isUnifiedThinkingFamily('gemini-pro-orchestrator-g1-pro')).toBe(false)
    expect(resolveWireModel('gemini-pro-orchestrator-g1-pro', 'high')).toBe('gemini-pro-orchestrator-g1-pro')
  })

  it('exposes the discovered Hydrogen xhigh effort and resolves its exact wire id', () => {
    discoverVariants(HYDROGEN, ['xhigh', 'high', 'low', 'medium'])
    const resolved = resolveAgyModel('agy', HYDROGEN)
    expect(levelThinkingEffortsFor(HYDROGEN)).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(resolved.reasoning?.efforts.map((effort) => String(effort.id))).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(resolved.reasoning?.defaultEffort).toBeUndefined()
    expect(resolveWireModel(HYDROGEN, 'xhigh')).toBe(`${HYDROGEN}-xhigh`)
    expect(request(HYDROGEN, 'XHIGH').model).toBe(`${HYDROGEN}-xhigh`)
    expect(resolveWireModel(HYDROGEN)).toBe(`${HYDROGEN}-medium`)
  })

  it('adds no static Hydrogen id or guessed context and output limit', () => {
    discoverVariants(HYDROGEN, ['low', 'medium', 'high', 'xhigh'])
    expect(catalogModel(HYDROGEN)).toBeUndefined()
    expect(AGY_PUBLIC_MODELS.some((model) => model.id.startsWith(HYDROGEN))).toBe(false)
    expect(catalogModelList().some((model) => model.id.startsWith(HYDROGEN))).toBe(false)
    const resolved = resolveAgyModel('agy', HYDROGEN)
    expect(resolved.context).toBeUndefined()
    expect(resolved.defaultMaxTokens).toBeUndefined()
  })

  it.each([
    ['high', 'xhigh'],
    ['low', 'high'],
    ['xhigh', 'max'],
  ])('uses only published levels when medium is absent (%s, %s)', (first, second) => {
    discoverVariants(HYDROGEN, [second, first])
    expect(levelThinkingEffortsFor(HYDROGEN)).toEqual([first, second])
    expect(resolveAgyModel('agy', HYDROGEN).reasoning?.efforts.map((effort) => String(effort.id))).toEqual([first, second])
    expect(resolveWireModel(HYDROGEN)).toBe(`${HYDROGEN}-${first}`)
    expect(resolveWireModel(HYDROGEN, 'medium')).toBe(`${HYDROGEN}-${first}`)
    expect(resolveWireModel(HYDROGEN, second)).toBe(`${HYDROGEN}-${second}`)
  })

  it('replaces a discovered family level set when a new payload advertises fewer variants', () => {
    discoverVariants(HYDROGEN, ['low', 'medium', 'high', 'xhigh'])
    expect(discoverVariants(HYDROGEN, ['xhigh']).map((model) => model.id)).toEqual([HYDROGEN])
    expect(levelThinkingEffortsFor(HYDROGEN)).toEqual(['xhigh'])
    expect(resolveWireModel(HYDROGEN)).toBe(`${HYDROGEN}-xhigh`)
    expect(resolveWireModel(HYDROGEN, 'high')).toBe(`${HYDROGEN}-xhigh`)
  })

  it('keeps an isolated unknown split id callable without inventing a family', () => {
    expect(discoverVariants(HYDROGEN, ['xhigh']).map((model) => model.id)).toEqual([`${HYDROGEN}-xhigh`])
    expect(isUnifiedThinkingFamily(HYDROGEN)).toBe(false)
  })

  it('sends no thinkingLevel for any dynamically unified family and preserves configured budgets', () => {
    discoverVariants(HYDROGEN, ['low', 'medium', 'high', 'xhigh'])
    for (const effort of ['low', 'medium', 'high', 'xhigh']) {
      const body = request(HYDROGEN, effort)
      expect(body.model).toBe(`${HYDROGEN}-${effort}`)
      expect(body.request.generationConfig?.thinkingConfig).toBeUndefined()
    }
    const configured = request(HYDROGEN, 'xhigh', { thinkingBudgetFor: () => 4096 })
    expect(configured.model).toBe(`${HYDROGEN}-xhigh`)
    expect(configured.request.generationConfig?.thinkingConfig).toEqual({ thinkingBudget: 4096, includeThoughts: true })
    expect(request(HYDROGEN, undefined, { tieredBudgetFor: () => 8192 }).request.generationConfig?.thinkingConfig)
      .toEqual({ thinkingBudget: 8192, includeThoughts: true })
  })

  it('lets actual Argon discovery override its offline levels without adding unavailable wire ids', () => {
    discoverVariants('gemini-4-argon', ['high', 'low'])
    expect(levelThinkingEffortsFor('gemini-4-argon')).toEqual(['low', 'high'])
    expect(resolveWireModel('gemini-4-argon')).toBe('gemini-4-argon-low')
    expect(resolveWireModel('gemini-4-argon', 'xhigh')).toBe('gemini-4-argon-low')
  })

  it('preserves known Argon and Claude offline fallback levels and metadata', () => {
    for (const model of ['gemini-4-argon', 'claude-opus-5-5', 'claude-sonnet-5-5']) {
      expect(levelThinkingEffortsFor(model)).toEqual(['low', 'medium', 'high'])
      expect(resolveWireModel(model)).toBe(`${model}-medium`)
      expect(resolveWireModel(model, 'high')).toBe(`${model}-high`)
      expect(request(model, 'high').request.generationConfig?.thinkingConfig).toBeUndefined()
      expect(resolveAgyModel('agy', model).context).toBeDefined()
      expect(catalogModelList().some((entry) => entry.id === model)).toBe(true)
    }
  })

  it('preserves legacy tiered ids, capability metadata, and thinkingLevel translation', () => {
    const model = 'gemini-3.8-flash-tiered'
    const merged = mergeModelCatalog({
      models: {
        [model]: {},
        'gemini-3.8-flash-low': {},
        'gemini-3.8-flash-medium': {},
        'gemini-3.8-flash-high': {},
        'gemini-3.8-flash-xhigh': {},
      },
    })
    expect(merged.map((entry) => entry.id)).toEqual([model])
    expect(levelThinkingEffortsFor(model)).toEqual(['low', 'medium', 'high'])
    expect(resolveAgyModel('agy', model).context?.contextWindow).toBe(1048576)
    expect(resolveWireModel(model, 'high')).toBe(model)
    expect(request(model, 'high').request.generationConfig?.thinkingConfig)
      .toEqual({ thinkingLevel: 'high', includeThoughts: true })
    expect(request(model).request.generationConfig?.thinkingConfig).toBeUndefined()
    expect(request('gemini-3.1-pro-low', 'medium').request.generationConfig?.thinkingConfig).toBeUndefined()
    expect(levelThinkingEffortsFor('gemini-3.1-pro-low')).toEqual(['low', 'high'])
    registerDiscoveredTieredModels({ pro: ['gemini-custom-pro-id'] })
    expect(resolveAgyModel('agy', 'gemini-custom-pro-id').context?.contextWindow).toBe(1048576)
    expect(resolveAgyModel('agy', 'gemini-custom-pro-id').defaultMaxTokens).toBe(65536)
  })
})
