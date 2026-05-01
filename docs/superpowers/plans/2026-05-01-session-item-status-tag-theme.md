# Session / Item Status Tag Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make session and item status tags readable in both light and dark themes by replacing hard-coded tag colors with theme tokens, while keeping the current status-color semantics.

**Architecture:** Keep the existing `ThinWorkflowStatus` model and current UI structure, but move tag color definitions into CSS theme tokens. Add one shared sidebar utility for mapping a status to token-based classes, then reuse it in both `SessionListItem` and the inline item tag rendering in `MultiProjectSidePanel`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Bun test, Vite

---

## File map

- **Modify:** `src/index.css`
  - Add light-mode defaults and dark-mode overrides for status tag background/text tokens.
  - Keep tokens outside the dynamic theme preset injection path so they can still react to `data-mode` / system dark mode.

- **Create:** `src/features/chat/sidebar/statusTag.ts`
  - Own the single source of truth for `ThinWorkflowStatus -> token-based class names`.
  - Export a small helper that both session tags and item tags can reuse.

- **Modify:** `src/features/chat/sidebar/SessionListItem.tsx`
  - Remove its local hard-coded status color mapping.
  - Reuse the shared `statusTag.ts` helper.

- **Modify:** `src/features/chat/sidebar/MultiProjectSidePanel.tsx`
  - Replace the inline hard-coded item tag colors with the same shared helper.

- **Create:** `src/features/chat/sidebar/statusTag.test.ts`
  - Verify each workflow status maps to the expected token-based classes.
  - Verify the fallback class remains readable when status is missing.

## Implementation notes before coding

- Development must happen in a dedicated worktree, not in the current workspace.
- Do **not** commit during implementation unless the user explicitly asks for a commit.
- Validation must include:
  - `bun test src/features/chat/sidebar/statusTag.test.ts`
  - `bun run build`
  - `npm run lint`
  - local preview via `npx vite --port 5174`

### Task 1: Create the isolated worktree

**Files:**
- Modify: none

- [ ] **Step 1: Verify the target parent directory exists**

Run:

```bash
ls "/Users/chen/workspace/OpenCodeUI-feat"
```

Expected: the parent directory exists, or you confirm the correct sibling location before creating the worktree.

- [ ] **Step 2: Create the feature worktree and branch**

Run:

```bash
git worktree add ../OpenCodeUI-feat/session-item-status-tag-theme -b feat/session-item-status-tag-theme
```

Expected: Git reports a new worktree checked out on `feat/session-item-status-tag-theme`.

- [ ] **Step 3: Confirm you are working inside the new worktree**

Run:

```bash
git status --short --branch
```

Expected: output shows branch `feat/session-item-status-tag-theme` and a clean working tree.

### Task 2: Add theme tokens for status tags

**Files:**
- Modify: `src/index.css`
- Test: `src/features/chat/sidebar/statusTag.test.ts`

- [ ] **Step 1: Write the failing test for token-based class mapping**

Create `src/features/chat/sidebar/statusTag.test.ts` with this content:

```ts
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
```

- [ ] **Step 2: Run the test to confirm it fails before implementation**

Run:

```bash
bun test src/features/chat/sidebar/statusTag.test.ts
```

Expected: FAIL because `./statusTag` does not exist yet.

- [ ] **Step 3: Add the light and dark theme token values**

Update `src/index.css` in three places:

1. Inside the top-level `:root { ... }` block near `--sidebar-bg`, add light-mode defaults:

```css
  --status-tag-not-started-bg: 268 100% 96%;
  --status-tag-not-started-text: 269 58% 32%;
  --status-tag-in-progress-bg: 204 100% 94%;
  --status-tag-in-progress-text: 212 78% 34%;
  --status-tag-completed-bg: 146 55% 93%;
  --status-tag-completed-text: 146 62% 28%;
  --status-tag-abandoned-bg: 220 14% 92%;
  --status-tag-abandoned-text: 220 10% 34%;
```

2. Inside `:root[data-mode='dark']`, add explicit dark-mode overrides:

```css
  --status-tag-not-started-bg: 269 48% 24% / 0.9;
  --status-tag-not-started-text: 270 100% 82%;
  --status-tag-in-progress-bg: 209 58% 24% / 0.9;
  --status-tag-in-progress-text: 204 100% 82%;
  --status-tag-completed-bg: 146 42% 22% / 0.92;
  --status-tag-completed-text: 146 72% 78%;
  --status-tag-abandoned-bg: 220 10% 28% / 0.9;
  --status-tag-abandoned-text: 220 12% 72%;
```

3. Inside `@media (prefers-color-scheme: dark) { :root:not([data-mode='light']) { ... } }`, duplicate the same dark token overrides so system-dark mode also gets the dark tag palette:

```css
    --status-tag-not-started-bg: 269 48% 24% / 0.9;
    --status-tag-not-started-text: 270 100% 82%;
    --status-tag-in-progress-bg: 209 58% 24% / 0.9;
    --status-tag-in-progress-text: 204 100% 82%;
    --status-tag-completed-bg: 146 42% 22% / 0.92;
    --status-tag-completed-text: 146 72% 78%;
    --status-tag-abandoned-bg: 220 10% 28% / 0.9;
    --status-tag-abandoned-text: 220 12% 72%;
```

- [ ] **Step 4: Add the shared status-tag utility**

Create `src/features/chat/sidebar/statusTag.ts` with this content:

```ts
import type { ThinWorkflowStatus } from '../../../api/thinServer'

const STATUS_TAG_BASE_CLASS = 'shrink-0 rounded px-1.5 py-0.5 text-[9px] leading-none'
const STATUS_TAG_FALLBACK_CLASS = 'bg-bg-200 text-text-400'

const STATUS_TAG_TONE_CLASS: Record<ThinWorkflowStatus, string> = {
  not_started: 'bg-[hsl(var(--status-tag-not-started-bg))] text-[hsl(var(--status-tag-not-started-text))]',
  in_progress: 'bg-[hsl(var(--status-tag-in-progress-bg))] text-[hsl(var(--status-tag-in-progress-text))]',
  completed: 'bg-[hsl(var(--status-tag-completed-bg))] text-[hsl(var(--status-tag-completed-text))]',
  abandoned: 'bg-[hsl(var(--status-tag-abandoned-bg))] text-[hsl(var(--status-tag-abandoned-text))]',
}

export function getStatusTagClass(status?: ThinWorkflowStatus): string {
  return `${STATUS_TAG_BASE_CLASS} ${status ? STATUS_TAG_TONE_CLASS[status] ?? STATUS_TAG_FALLBACK_CLASS : STATUS_TAG_FALLBACK_CLASS}`
}
```

- [ ] **Step 5: Run the new test and make sure it passes**

Run:

```bash
bun test src/features/chat/sidebar/statusTag.test.ts
```

Expected: PASS with 2 passing tests.

### Task 3: Migrate session and item tags to the shared helper

**Files:**
- Modify: `src/features/chat/sidebar/SessionListItem.tsx`
- Modify: `src/features/chat/sidebar/MultiProjectSidePanel.tsx`
- Test: `src/features/chat/sidebar/statusTag.test.ts`

- [ ] **Step 1: Remove the hard-coded mapping from `SessionListItem`**

Update `src/features/chat/sidebar/SessionListItem.tsx`:

1. Delete the local `getStatusTagClass(status?: ThinWorkflowStatus)` function.
2. Delete the now-unused `ThinWorkflowStatus` import that only existed for that function if TypeScript no longer needs it locally.
3. Import the shared helper.

The top of the file should become:

```ts
import { createPortal } from 'react-dom'
import type { MouseEvent, ReactNode, RefObject, TouchEventHandler } from 'react'
import { MoreHorizontalIcon, PinIcon } from '../../../components/Icons'
import { formatRelativeTime } from '../../../utils/dateUtils'
import type { ThinWorkflowStatus } from '../../../api/thinServer'
import { getStatusTagClass } from './statusTag'
```

- [ ] **Step 2: Replace the tag span class in `SessionListItem`**

In `src/features/chat/sidebar/SessionListItem.tsx`, replace:

```tsx
<span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] leading-none ${getStatusTagClass(tagStatus)}`}>
  {tagLabel}
</span>
```

with:

```tsx
<span className={getStatusTagClass(tagStatus)}>
  {tagLabel}
</span>
```

- [ ] **Step 3: Reuse the same helper for inline item tags**

Update `src/features/chat/sidebar/MultiProjectSidePanel.tsx`:

1. Add the import:

```ts
import { getStatusTagClass } from './statusTag'
```

2. Replace the inline hard-coded item tag at the current `entry.status === ...` branch with:

```tsx
<span className={getStatusTagClass(entry.status)}>
  {getItemTypeLabel(entry.item.type)}
</span>
```

This removes the last duplicated hard-coded status color mapping in the sidebar UI.

- [ ] **Step 4: Run the focused test again after the refactor**

Run:

```bash
bun test src/features/chat/sidebar/statusTag.test.ts
```

Expected: PASS. This confirms the shared helper still exposes the expected class contract after both components adopt it.

### Task 4: Verify build, lint, and manual preview

**Files:**
- Modify: none

- [ ] **Step 1: Run the production build**

Run:

```bash
bun run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 2: Run ESLint**

Run:

```bash
npm run lint
```

Expected: lint passes with no errors.

- [ ] **Step 3: Start the preview dev server for user acceptance**

Run from the worktree root:

```bash
npx vite --port 5174
```

Expected: Vite prints a local URL such as `http://localhost:5174`.

- [ ] **Step 4: Manually verify both themes before handing off**

Check these exact scenarios in the browser preview:

1. Light mode:
   - project panel session tags are readable on white/light backgrounds
   - project panel item tags are readable on white/light backgrounds
   - item detail linked-session tags are readable on white/light backgrounds
2. Dark mode:
   - the same three locations still show distinct status colors
   - tags do not look washed out or gray
3. Regression checks:
   - list item hover state still works
   - selected session state still works
   - title text color is unchanged

- [ ] **Step 5: Stop and wait for the user before any commit**

After preview is ready, report the preview URL to the user and wait. Do not commit, push, or merge unless the user explicitly requests it.

## Spec coverage check

- **Retain status-based color semantics:** covered by Task 2 Step 4 and Task 3 Step 3.
- **Use light/dark-specific palettes:** covered by Task 2 Step 3.
- **Remove hard-coded component colors:** covered by Task 3 Steps 1-3.
- **Cover project panel session list, item list, and item detail linked sessions:** covered by Task 3 Steps 2-3 and Task 4 Step 4.
- **Avoid changing hover / selected / title styles:** covered by Task 4 Step 4 regression checks.

## Placeholder scan

- No TBD/TODO placeholders remain.
- Every file path is explicit.
- Every command is explicit.
- Every code-changing step contains the exact snippet to add or replace.
