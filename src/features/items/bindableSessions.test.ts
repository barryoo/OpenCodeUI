/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { ApiSession } from '../../api'
import type { ThinSessionSummary } from '../../api/thinServer'
import { getBindableSessions } from './bindableSessions'

function makeSession(overrides: Partial<ApiSession> = {}): ApiSession {
  return {
    id: 'session-1',
    projectID: 'proj-1',
    directory: '/tmp/proj',
    title: 'New Chat',
    time: { created: 1700000000000, updated: 1700000000000 },
    ...overrides,
  }
}

function makeSummary(overrides: Partial<ThinSessionSummary> = {}): ThinSessionSummary {
  return {
    id: 'summary-1',
    projectPath: '/tmp/proj',
    externalSessionId: 'session-1',
    itemId: null,
    variant: null,
    titleSnapshot: 'New Chat',
    statusSnapshot: 'in_progress',
    activityAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('getBindableSessions', () => {
  test('已绑定到当前事项 -> 隐藏', () => {
    const sessions = [makeSession({ id: 's1' })]
    const summaries = [makeSummary({ externalSessionId: 's1', itemId: 'item-a' })]
    const result = getBindableSessions(sessions, summaries, 'item-a')

    expect(result.bindableSessions).toHaveLength(0)
    expect(result.reusableSummaryByExternalId.size).toBe(0)
  })

  test('已绑定到其他事项 -> 隐藏', () => {
    const sessions = [makeSession({ id: 's1' })]
    const summaries = [makeSummary({ externalSessionId: 's1', itemId: 'item-other' })]
    const result = getBindableSessions(sessions, summaries, 'item-a')

    expect(result.bindableSessions).toHaveLength(0)
    expect(result.reusableSummaryByExternalId.size).toBe(0)
  })

  test('未绑定且有 summary -> 显示，放入可复用 map', () => {
    const sessions = [makeSession({ id: 's1' })]
    const summary = makeSummary({ externalSessionId: 's1', itemId: null })
    const result = getBindableSessions(sessions, [summary], 'item-a')

    expect(result.bindableSessions).toHaveLength(1)
    expect(result.bindableSessions[0].id).toBe('s1')
    expect(result.reusableSummaryByExternalId.size).toBe(1)
    expect(result.reusableSummaryByExternalId.get('s1')).toEqual(summary)
  })

  test('无 summary 的全新会话 -> 显示', () => {
    const sessions = [makeSession({ id: 's1' })]
    const result = getBindableSessions(sessions, [], 'item-a')

    expect(result.bindableSessions).toHaveLength(1)
    expect(result.bindableSessions[0].id).toBe('s1')
    expect(result.reusableSummaryByExternalId.size).toBe(0)
  })

  test('混合场景：已绑定 + 未绑定 + 全新', () => {
    const sessions = [
      makeSession({ id: 'bound-to-current' }),
      makeSession({ id: 'bound-to-other' }),
      makeSession({ id: 'unbound-with-summary' }),
      makeSession({ id: 'brand-new' }),
    ]
    const summaries = [
      makeSummary({ id: 'sum-1', externalSessionId: 'bound-to-current', itemId: 'item-a' }),
      makeSummary({ id: 'sum-2', externalSessionId: 'bound-to-other', itemId: 'item-b' }),
      makeSummary({ id: 'sum-3', externalSessionId: 'unbound-with-summary', itemId: null }),
    ]
    const result = getBindableSessions(sessions, summaries, 'item-a')

    expect(result.bindableSessions).toHaveLength(2)
    expect(result.bindableSessions.map(s => s.id).sort()).toEqual(['brand-new', 'unbound-with-summary'].sort())
    expect(result.reusableSummaryByExternalId.size).toBe(1)
    expect(result.reusableSummaryByExternalId.has('unbound-with-summary')).toBe(true)
  })

  test('空输入 -> 空结果', () => {
    const result = getBindableSessions([], [], 'item-a')

    expect(result.bindableSessions).toHaveLength(0)
    expect(result.reusableSummaryByExternalId.size).toBe(0)
  })
})
