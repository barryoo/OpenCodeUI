/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { ApiSession } from '../api'
import type { ThinSessionSummary } from '../api/thinServer'
import { buildSummaryUpsertInputs } from './sessionSummarySync'

const projectPath = '/tmp/project-a'

function makeSession(id: string, title = 'Chat', updated = 1714557600000): ApiSession {
  return {
    id,
    title,
    directory: projectPath,
    projectID: 'proj-1',
    time: {
      created: updated,
      updated,
    },
  }
}

function makeSummary(id: string, externalSessionId: string, overrides: Partial<ThinSessionSummary> = {}): ThinSessionSummary {
  return {
    id,
    projectPath,
    externalSessionId,
    itemId: null,
    variant: null,
    titleSnapshot: 'Chat',
    statusSnapshot: 'in_progress',
    activityAt: '2024-05-01T10:00:00.000Z',
    updatedAt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('buildSummaryUpsertInputs', () => {
  test('returns empty array when nothing changed', () => {
    const sessions = [makeSession('s1')]
    const existing = [makeSummary('sum-1', 's1')]

    expect(buildSummaryUpsertInputs({
      projectPath,
      sessions,
      existing,
    })).toEqual([])
  })

  test('returns new session when summary missing', () => {
    const sessions = [makeSession('s2')]

    expect(buildSummaryUpsertInputs({
      projectPath,
      sessions,
      existing: [],
    })).toHaveLength(1)
  })

  test('returns input when title changed', () => {
    const sessions = [makeSession('s1', 'New Title')]
    const existing = [makeSummary('sum-1', 's1')]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toHaveLength(1)
    expect(result[0].titleSnapshot).toBe('New Title')
  })

  test('preserves existing statusSnapshot when title changes', () => {
    const sessions = [makeSession('s1', 'New Title')]
    const existing = [makeSummary('sum-1', 's1', { statusSnapshot: 'completed' })]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toHaveLength(1)
    expect(result[0].titleSnapshot).toBe('New Title')
    expect(result[0].statusSnapshot).toBe('completed')
  })

  test('returns input when activityAt changed', () => {
    const sessions = [makeSession('s1', 'Chat', 1714644000000)]
    const existing = [makeSummary('sum-1', 's1')]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toHaveLength(1)
    expect(result[0].activityAt).toBe('2024-05-02T10:00:00.000Z')
  })

  test('preserves existing statusSnapshot when activityAt changes', () => {
    const sessions = [makeSession('s1', 'Chat', 1714644000000)]
    const existing = [makeSummary('sum-1', 's1', { statusSnapshot: 'abandoned' })]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toHaveLength(1)
    expect(result[0].statusSnapshot).toBe('abandoned')
  })

  test('returns empty when title and activityAt unchanged (status diff ignored)', () => {
    const sessions = [makeSession('s1')]
    const existing = [makeSummary('sum-1', 's1', { statusSnapshot: 'completed' })]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toEqual([])
  })

  test('new session defaults statusSnapshot to in_progress', () => {
    const sessions = [makeSession('s1')]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing: [] })
    expect(result).toHaveLength(1)
    expect(result[0].statusSnapshot).toBe('in_progress')
  })

  test('preserves existing itemId and variant when updating', () => {
    const sessions = [makeSession('s1', 'New Title')]
    const existing = [makeSummary('sum-1', 's1', { itemId: 'item-1', variant: 'plan' })]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toHaveLength(1)
    expect(result[0].itemId).toBe('item-1')
    expect(result[0].variant).toBe('plan')
  })

  test('returns empty array when inputs.length is 0 (empty sessions)', () => {
    const result = buildSummaryUpsertInputs({
      projectPath,
      sessions: [],
      existing: [],
    })
    expect(result).toEqual([])
  })

  test('only returns changed sessions when mixed', () => {
    const sessions = [
      makeSession('s1'),                           // unchanged
      makeSession('s2', 'Changed'),                // changed
      makeSession('s3'),                           // new (no existing summary)
    ]
    const existing = [
      makeSummary('sum-1', 's1'),
      makeSummary('sum-2', 's2'),
    ]

    const result = buildSummaryUpsertInputs({ projectPath, sessions, existing })
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.externalSessionId).sort()).toEqual(['s2', 's3'])
  })
})
