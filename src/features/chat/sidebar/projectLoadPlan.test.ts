/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import { buildProjectLoadPlan } from './projectLoadPlan'

describe('buildProjectLoadPlan', () => {
  const nullFailedLimit = null

  test('loads project metadata when not yet loaded', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: false,
      sessionLoading: false,
      hasProjectState: false,
      loadedLimit: 0,
      targetLimit: 20,
      failedSessionLimit: nullFailedLimit,
    })).toEqual({
      shouldLoadProject: true,
      shouldLoadSessions: true,
      nextSessionLimit: 20,
    })
  })

  test('does not reload project while project is already loading', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: true,
      sessionLoading: false,
      hasProjectState: false,
      loadedLimit: 0,
      targetLimit: 20,
      failedSessionLimit: nullFailedLimit,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: true,
      nextSessionLimit: 20,
    })
  })

  test('does not reload sessions while sessions are already loading', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: false,
      sessionLoading: true,
      hasProjectState: true,
      loadedLimit: 0,
      targetLimit: 20,
      failedSessionLimit: nullFailedLimit,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    })
  })

  test('skips sessions when loaded limit already covers target', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: false,
      sessionLoading: false,
      hasProjectState: true,
      loadedLimit: 40,
      targetLimit: 20,
      failedSessionLimit: nullFailedLimit,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    })
  })

  test('does nothing for collapsed projects', () => {
    expect(buildProjectLoadPlan({
      expanded: false,
      projectLoading: false,
      sessionLoading: false,
      hasProjectState: false,
      loadedLimit: 0,
      targetLimit: 20,
      failedSessionLimit: nullFailedLimit,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    })
  })

  test('loads sessions on first attempt when no prior load exists', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: false,
      sessionLoading: false,
      hasProjectState: true,
      loadedLimit: 0,
      targetLimit: 20,
      failedSessionLimit: nullFailedLimit,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: true,
      nextSessionLimit: 20,
    })
  })

  test('suppresses session retry when last attempt failed at same targetLimit', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: false,
      sessionLoading: false,
      hasProjectState: true,
      loadedLimit: 0,
      targetLimit: 20,
      failedSessionLimit: 20,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    })
  })

  test('retries session when targetLimit increases beyond previously failed limit', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      projectLoading: false,
      sessionLoading: false,
      hasProjectState: true,
      loadedLimit: 0,
      targetLimit: 40,
      failedSessionLimit: 20,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: true,
      nextSessionLimit: 40,
    })
  })
})
