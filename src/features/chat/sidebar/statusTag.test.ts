/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import { getStatusTagClass } from './statusTag'

describe('getStatusTagClass', () => {
  test('maps each workflow status to token-based classes', () => {
    expect(getStatusTagClass('not_started')).toContain('bg-[hsl(var(--status-tag-not-started-bg))]')
    expect(getStatusTagClass('not_started')).toContain('text-[hsl(var(--status-tag-not-started-text))]')

    expect(getStatusTagClass('in_progress')).toContain('bg-[hsl(var(--status-tag-in-progress-bg))]')
    expect(getStatusTagClass('in_progress')).toContain('text-[hsl(var(--status-tag-in-progress-text))]')

    expect(getStatusTagClass('completed')).toContain('bg-[hsl(var(--status-tag-completed-bg))]')
    expect(getStatusTagClass('completed')).toContain('text-[hsl(var(--status-tag-completed-text))]')

    expect(getStatusTagClass('abandoned')).toContain('bg-[hsl(var(--status-tag-abandoned-bg))]')
    expect(getStatusTagClass('abandoned')).toContain('text-[hsl(var(--status-tag-abandoned-text))]')
  })

  test('falls back to readable neutral classes when status is missing', () => {
    const classes = getStatusTagClass(undefined)

    expect(classes).toContain('bg-bg-200')
    expect(classes).toContain('text-text-400')
    expect(classes).toContain('rounded')
    expect(classes).toContain('text-[9px]')
  })
})
