import { ContentBlock } from '../../../../components'
import type { ToolRendererProps } from '../types'

export function BashRenderer({ part, data }: ToolRendererProps) {
  const { state } = part
  const isActive = state.status === 'running' || state.status === 'pending'
  const hasError = !!data.error

  const content = buildTranscript(data.input, data.output, data.error)

  return (
    <ContentBlock
      label="Terminal"
      content={content}
      language="bash"
      variant={hasError ? 'error' : 'default'}
      stats={data.exitCode !== undefined ? { exit: data.exitCode } : undefined}
      isLoading={isActive}
      loadingText="Running..."
    />
  )
}

function buildTranscript(input?: string, output?: string, error?: string): string | undefined {
  const blocks: string[] = []

  const command = input?.trim()
  if (command) {
    const normalized = command.startsWith('{') || command.startsWith('[')
      ? command
      : `$ ${command}`
    blocks.push(normalized)
  }

  const out = output?.trim()
  if (out) {
    blocks.push(out)
  }

  const err = error?.trim()
  if (err) {
    blocks.push(err)
  }

  if (blocks.length === 0) return undefined
  return blocks.join('\n')
}
