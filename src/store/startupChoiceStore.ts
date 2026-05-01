type Resolver = () => void

class StartupChoiceStore {
  private resolved = false
  private waitPromise: Promise<void> | null = null
  private resolver: Resolver | null = null

  isResolved(): boolean {
    return this.resolved
  }

  reset(): void {
    this.resolved = false
    this.waitPromise = null
    this.resolver = null
  }

  resolve(): void {
    if (this.resolved) return
    this.resolved = true
    this.resolver?.()
    this.waitPromise = null
    this.resolver = null
  }

  waitUntilResolved(): Promise<void> {
    if (this.resolved) return Promise.resolve()
    if (this.waitPromise) return this.waitPromise

    this.waitPromise = new Promise<void>((resolve) => {
      this.resolver = resolve
    })

    return this.waitPromise
  }
}

export const startupChoiceStore = new StartupChoiceStore()
