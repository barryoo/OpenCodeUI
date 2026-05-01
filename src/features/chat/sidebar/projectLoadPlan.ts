export interface ProjectLoadPlanInput {
  expanded: boolean
  projectLoading: boolean
  sessionLoading: boolean
  hasProjectState: boolean
  loadedLimit: number
  targetLimit: number
  failedSessionLimit: number | null
}

export interface ProjectLoadPlan {
  shouldLoadProject: boolean
  shouldLoadSessions: boolean
  nextSessionLimit: number | null
}

export function buildProjectLoadPlan(input: ProjectLoadPlanInput): ProjectLoadPlan {
  if (!input.expanded) {
    return {
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    }
  }

  const shouldLoadProject = !input.hasProjectState && !input.projectLoading

  const sessionsNotLoaded = input.loadedLimit < input.targetLimit
  const notAlreadyFailedAtSameLimit = input.failedSessionLimit !== input.targetLimit
  const shouldLoadSessions = !input.sessionLoading && sessionsNotLoaded && notAlreadyFailedAtSameLimit

  return {
    shouldLoadProject,
    shouldLoadSessions,
    nextSessionLimit: shouldLoadSessions ? input.targetLimit : null,
  }
}
