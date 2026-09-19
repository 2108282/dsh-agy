declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface ClientContext {
    effect(fn: () => void, label?: string): void
    slots: {
      inject(slot: string, factory: () => unknown): void
      register(meta: unknown, component: unknown): unknown
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-settings-plugins/client' {}
