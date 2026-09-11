import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dsh?: { client?: { platform?: string, inject?: string[] } }
  exports?: Record<string, { default?: string }>
}

describe('dsh-agy client package contract', () => {
  it('declares the Settings client module', () => {
    expect(manifest.exports?.['./client']?.default).toBe('./lib/client.js')
    expect(manifest.dsh?.client).toEqual({
      platform: 'web',
      inject: ['@deepseek-ai/dsh-client-ui-settings-plugins'],
    })
  })

  it('emits the client artifact after build', () => {
    expect(existsSync(new URL('../lib/client.js', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../lib/client.d.ts', import.meta.url))).toBe(true)
  })
})
