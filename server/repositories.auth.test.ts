/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDatabaseContext } from './db'
import { ThinServerRepository } from './repositories'

describe('ThinServerRepository auth users', () => {
  let databasePath: string
  let repository: ThinServerRepository

  beforeEach(() => {
    databasePath = join(tmpdir(), `opencodeui-auth-${Date.now()}-${Math.random()}.sqlite`)
    repository = new ThinServerRepository(createDatabaseContext(databasePath))
    repository.migrate()
  })

  afterEach(() => {
    rmSync(databasePath, { force: true })
  })

  test('creates email user with normalized email', () => {
    const user = repository.createEmailUser({
      email: '  USER@Example.com ',
      passwordHash: 'hash',
    })

    expect(user.email).toBe('user@example.com')
    expect(user.passwordHash).toBe('hash')
    expect(user.login).toBe('user@example.com')
  })

  test('finds user by normalized email', () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash' })

    const user = repository.findUserByEmail('  USER@example.com ')

    expect(user?.email).toBe('user@example.com')
  })

  test('merges github profile into existing email user', () => {
    const existing = repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash' })

    const merged = repository.upsertUserByGithubProfile({
      githubId: 'gh-1',
      login: 'octocat',
      email: 'USER@example.com',
      name: 'Octo Cat',
      avatarUrl: 'https://example.com/avatar.png',
    })

    expect(merged.id).toBe(existing.id)
    expect(merged.githubId).toBe('gh-1')
    expect(merged.email).toBe('user@example.com')
    expect(merged.passwordHash).toBe('hash')
    expect(merged.login).toBe('octocat')
  })

  test('returns existing github user on repeated github login', () => {
    const first = repository.upsertUserByGithubProfile({
      githubId: 'gh-1',
      login: 'octocat',
      email: 'user@example.com',
    })

    const second = repository.upsertUserByGithubProfile({
      githubId: 'gh-1',
      login: 'octocat-2',
      email: 'other@example.com',
    })

    expect(second.id).toBe(first.id)
    expect(second.githubId).toBe('gh-1')
    expect(second.login).toBe('octocat-2')
  })

  test('throws when github user tries to claim another users email', () => {
    repository.createEmailUser({ email: 'owner@example.com', passwordHash: 'hash-1' })
    repository.upsertUserByGithubProfile({
      githubId: 'gh-1',
      login: 'octocat',
      email: 'user@example.com',
    })

    expect(() => repository.upsertUserByGithubProfile({
      githubId: 'gh-1',
      login: 'octocat',
      email: 'owner@example.com',
    })).toThrow('GITHUB_EMAIL_CONFLICT')
  })
})
