# Frontend Remake — Modern SaaS Overhaul

## TL;DR

> **Quick Summary**: Complete visual remake of the quiz-manager frontend from a rough custom Tailwind UI to a polished Modern SaaS aesthetic (Linear/Vercel/Notion-style), introducing shadcn/ui as the component foundation while preserving all existing logic, routing, and API integration.
>
> **Deliverables**:
> - `tailwind.config.js` — updated with shadcn tokens + darkMode class
> - `src/index.css` — shadcn CSS variables, fixed global hover underline, preserved animations
> - `src/lib/utils.ts` — cn() utility (required by shadcn)
> - All 8 components remade: Layout, Navbar, Modal, EmptyState, StatusBadge, Pagination, LoadingSpinner, AdminBanner
> - All 12 pages remade: Dashboard, Files, QuizNew, QuizTake, QuizResults, WrongNotes, Retry, Search, Login, Signup, PasswordReset, Admin
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 7 waves
> **Critical Path**: Task 1 (Foundation) → Task 5+6 (Shell) → Task 7-13 (Components) → Task 14-17 (Auth) → Task 18-20 (Core pages) → Task 21-22 (Quiz flow) → Task 23-26 (Utility pages) → F1-F4

---

## Context

### Original Request
"ulw completely remake frontend. feels suck."

### Interview Summary

**Key Discussions**:
- Visual direction: Modern SaaS (Linear/Vercel/Notion) — precise spacing, subtle glass effects, confident dark theme
- Component library: Add shadcn/ui as foundation
- Scope: All pages (full remake)

**Design Contract (NON-NEGOTIABLE)**:

| # | Rule | Detail |
|---|------|--------|
| D1 | Seamless dark surfaces | Adjacent dark elements must blend through shade differences. Max border opacity ≤10%. Never harsh white/light dividers. |
| D2 | Show don't tell | Short label (2-4 words) + optional one-line subtitle (max 15 words). Never verbose. Never zero context. |
| D3 | Intentional hover states | Underlines ONLY on actual navigable `<a>` prose links. Badges, timestamps, status tags, metadata: hover = bg shift or opacity change ONLY. |
| D4 | Visual hierarchy through weight | Font-weight, size, color contrast. NOT underlines, NOT borders everywhere. |

**Anti-patterns (MUST NOT)**:

| # | Violation |
|---|-----------|
| X1 | White/light separator lines on dark backgrounds |
| X2 | Verbose explanatory text on every element |
| X3 | Zero-context minimalism (removing ALL copy) |
| X4 | Blanket hover:underline on non-link elements |
| X5 | Decorative borders/outlines as primary visual structure |

**Research Findings**:
- Root underline bug: `index.css` line 25-27 `a:hover { text-decoration: underline }` — global rule affecting ALL anchor content including badges, timestamps inside Link components
- Sidebar harsh border: `border-r border-surface-border-subtle/80`
- Navbar harsh border: `border-b border-surface-border-subtle/80`
- 184 occurrences of `border-surface-border` across 16 files — must remediate per-wave
- No `darkMode: ["class"]` in tailwind.config.js — required by shadcn/ui
- No `src/lib/` directory — must create for shadcn's `cn()` utility
- OKLCH + shadcn CSS variables: use `var(--primary)` directly, NOT HSL decomposition
- Tailwind version: 3.4.1 (NOT v4 — all v4 patterns are forbidden)
- Icons: inline SVGs everywhere → migrate to Lucide React

### Metis Review

**Identified Gaps (addressed)**:
- OKLCH + shadcn alpha-value incompatibility: use full OKLCH values in CSS vars, reference via `var(--token)`
- `darkMode: ["class"]` missing — add to tailwind.config.js, set `class="dark"` on `<html>`
- `cn()` utility missing — create `src/lib/utils.ts` as first action
- Auth pages use `.auth-*` custom CSS (~200 lines) — migrate to Tailwind utilities in Wave 4, clean up CSS
- Border remediation is per-wave, not a single task — each wave handles its files
- Preserve: 8 animation keyframes, stagger delays, prefers-reduced-motion, Korean font stack, scrollbar styling
- Sidebar collapsed state (5.5rem) must work with new design
- shadcn components installed incrementally per wave, not all at once
- AdminBanner z-index stacking above Navbar must be preserved

---

## Work Objectives

### Core Objective
Remake every visible surface of the frontend to Modern SaaS quality: seamless dark surfaces, intentional hierarchy, no visual noise — while keeping all logic, routing, and API calls unchanged.

### Concrete Deliverables
- `frontend/src/lib/utils.ts` — cn() utility
- `frontend/tailwind.config.js` — shadcn tokens + darkMode
- `frontend/src/index.css` — shadcn CSS vars, fixed hover bug, preserved animations
- `frontend/index.html` — dark class on html element
- `frontend/src/components/` — all 8 components remade
- `frontend/src/pages/` — all 12 pages remade

### Definition of Done
- [ ] `npm run build` exits 0 with no errors or warnings
- [ ] `npx tsc --noEmit` exits 0
- [ ] `grep -r "hover:underline" frontend/src/` returns 0 matches
- [ ] `grep -r "a:hover" frontend/src/index.css | grep "underline"` returns 0 matches
- [ ] `grep -c "border-surface-border[^-/]" frontend/src/ -r` is ≤5 (near zero, only justified uses)

### Must Have
- shadcn/ui installed and configured with OKLCH color mapping
- `cn()` utility available at `@/lib/utils`
- Global hover underline bug eliminated
- Navbar and Sidebar: no harsh dividers (D1)
- All hover states on non-link elements: bg shift only, never underline (D3)
- Lucide React icons in Navbar and Sidebar
- Each page remade: modern layout, correct copy density (D2), hierarchy (D4)
- Build passes after every wave

### Must NOT Have (Guardrails)
- No Tailwind v4 patterns (`@theme inline`, `@import "tailwindcss"`)
- No decomposition of monolithic pages into sub-components (restyle only)
- No light mode or theme toggle
- No changes to API calls, Zustand stores, TanStack Query patterns, React Router guards
- No changes to `src/types/` or `src/api/`
- No `hover:underline` on any element
- No `border-surface-border` without at minimum `/10` opacity modifier
- No verbose explanatory text (X2)
- No icon-only interactive elements without aria-label (X3)
- No react-hook-form or other new architectural dependencies (besides shadcn)
- No `border-b`/`border-r` on Navbar/Sidebar without opacity ≤8%

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no test framework)
- **Automated tests**: None (pure visual remake — no logic changes)
- **Build verification**: MANDATORY after every wave — `npm run build` + `npx tsc --noEmit`

### QA Policy
Every task ends with:
1. `cd frontend && npm run build` — must exit 0
2. `npx tsc --noEmit` — must exit 0
3. Pattern-specific grep checks per task

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — MUST complete before anything else):
└── Task 1: shadcn/ui install + tailwind config + index.css + index.html [sequential sub-tasks]

Wave 2 (Shell — after Wave 1):
├── Task 2: Remake Navbar (Lucide icons, no harsh border-b)
└── Task 3: Remake Layout + Sidebar (no harsh border-r, collapsed state preserved)

Wave 3 (Shared Components — after Wave 2):
├── Task 4: Install shadcn component batch (button, badge, dialog, skeleton, scroll-area)
├── Task 5: Remake StatusBadge (shadcn Badge, no hover underline)
├── Task 6: Remake Modal → shadcn Dialog
├── Task 7: Remake EmptyState
├── Task 8: Remake LoadingSpinner
├── Task 9: Remake Pagination
└── Task 10: Remake AdminBanner

Wave 4 (Auth Pages — after Wave 3):
├── Task 11: Remake Login
├── Task 12: Remake Signup
├── Task 13: Remake PasswordReset
└── Task 14: Remove dead .auth-* CSS from index.css

Wave 5 (Core App Pages — after Wave 4):
├── Task 15: Remake Dashboard
├── Task 16: Remake Files
└── Task 17: Remake QuizNew

Wave 6 (Quiz Flow — after Wave 5, Task 15+17):
├── Task 18: Remake QuizTake (preserve animations)
└── Task 19: Remake QuizResults

Wave 7 (Utility Pages — after Wave 4, parallel with Wave 6):
├── Task 20: Remake WrongNotes
├── Task 21: Remake Retry
├── Task 22: Remake Search
└── Task 23: Remake Admin

Wave FINAL (after ALL above):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Agent Dispatch Summary
- **Wave 1**: 1 task → `unspecified-high` (complex multi-step foundation)
- **Wave 2**: 2 tasks → `visual-engineering` each
- **Wave 3**: 6 tasks → `quick` (install), `visual-engineering` (components)
- **Wave 4**: 4 tasks → `visual-engineering` (pages), `quick` (CSS cleanup)
- **Wave 5**: 3 tasks → `visual-engineering`
- **Wave 6**: 2 tasks → `visual-engineering`
- **Wave 7**: 4 tasks → `visual-engineering`
- **Final**: 4 tasks → `oracle`, `unspecified-high` ×2, `deep`

---

## TODOs

---

- [x] 1. Foundation — shadcn/ui install, tailwind config, index.css overhaul, index.html

  **What to do**:

  **Step 1 — Install dependencies** (run in `frontend/`):
  ```bash
  npm install lucide-react clsx tailwind-merge
  npm install @radix-ui/react-dialog @radix-ui/react-slot class-variance-authority
  npx shadcn@latest init
  ```
  shadcn init answers: style=`new-york`, rsc=`no`, tsx=`yes`, tailwind config=`tailwind.config.js`, css=`src/index.css`, baseColor=`neutral`, cssVariables=`yes`, components alias=`@/components`, utils alias=`@/lib/utils`.

  **Step 2 — Create `src/lib/utils.ts`**:
  ```ts
  import { clsx, type ClassValue } from "clsx"
  import { twMerge } from "tailwind-merge"
  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  }
  ```

  **Step 3 — Update `tailwind.config.js`**:
  - Add `darkMode: ["class"]` at top level
  - Keep ALL existing `brand-*`, `surface-*`, `content-*`, `semantic-*` color tokens
  - Add shadcn semantic tokens mapped to existing OKLCH values:
    ```js
    // shadcn tokens (mapped to existing OKLCH palette)
    background: 'var(--background)',
    foreground: 'var(--foreground)',
    primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
    secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
    muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
    accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
    destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
    border: 'var(--border)',
    input: 'var(--input)',
    ring: 'var(--ring)',
    card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
    popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
    ```
  - Add `borderRadius` extension: `lg: 'var(--radius)'`, `md: 'calc(var(--radius) - 2px)'`, `sm: 'calc(var(--radius) - 4px)'`

  **Step 4 — Overhaul `src/index.css`**:
  - Keep `@tailwind base/components/utilities` directives
  - Add CSS variables to `:root` (OKLCH values mapped to shadcn semantic names):
    ```css
    :root {
      --background: oklch(0.13 0.01 250);
      --foreground: oklch(0.94 0.005 250);
      --card: oklch(0.20 0.01 250);
      --card-foreground: oklch(0.94 0.005 250);
      --popover: oklch(0.18 0.01 250);
      --popover-foreground: oklch(0.94 0.005 250);
      --primary: oklch(0.65 0.15 175);
      --primary-foreground: oklch(0.14 0.01 250);
      --secondary: oklch(0.24 0.01 250);
      --secondary-foreground: oklch(0.94 0.005 250);
      --muted: oklch(0.24 0.01 250);
      --muted-foreground: oklch(0.55 0.01 250);
      --accent: oklch(0.24 0.01 250);
      --accent-foreground: oklch(0.94 0.005 250);
      --destructive: oklch(0.68 0.18 15);
      --destructive-foreground: oklch(0.97 0.01 250);
      --border: oklch(1 0 0 / 0.07);
      --input: oklch(0.20 0.01 250);
      --ring: oklch(0.65 0.15 175);
      --radius: 0.75rem;
    }
    ```
  - **REMOVE lines 20-28** (`a { color: ... }` + `a:hover { text-decoration: underline }`) — replace with:
    ```css
    a { color: inherit; text-decoration: none; }
    ```
  - Keep everything else: font stack, body gradient, input styles, scrollbar styles, focus-visible styles
  - Keep ALL animation keyframes and `.animate-*` classes verbatim
  - Keep ALL stagger delays and prefers-reduced-motion
  - **REMOVE** all `.auth-*` classes (will be replaced by Tailwind utilities in Wave 4) — but do NOT remove in this step; wait until Wave 4 cleanup task

  **Step 5 — Update `index.html`**:
  - Add `class="dark"` to the `<html>` element

  **Step 6 — Verify**:
  ```bash
  cd frontend && npm run build
  npx tsc --noEmit
  grep "text-decoration: underline" src/index.css  # must be 0
  grep -r "hover:underline" src/  # must be 0
  ```

  **Must NOT do**:
  - Do NOT remove existing `brand-*`, `surface-*`, `content-*`, `semantic-*` tokens from tailwind.config.js
  - Do NOT use Tailwind v4 syntax (`@theme inline`, etc.)
  - Do NOT remove animation keyframes or .animate-* classes
  - Do NOT touch `src/api/`, `src/stores/`, `src/types/`
  - Do NOT remove `.auth-*` CSS yet (that's Task 14)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step foundation setup requiring precise configuration order, dependency installation, and build verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sole task — must complete before ALL others)
  - **Blocks**: ALL other tasks (2-23)
  - **Blocked By**: None (start immediately)

  **References**:
  - `frontend/tailwind.config.js` — existing color tokens to preserve
  - `frontend/src/index.css:1-28` — global styles + underline bug location
  - `frontend/index.html` — add dark class
  - `frontend/package.json` — verify dependencies added correctly

  **Acceptance Criteria**:
  - [ ] `frontend/src/lib/utils.ts` exists with `cn()` function
  - [ ] `frontend/tailwind.config.js` has `darkMode: ["class"]`
  - [ ] `frontend/tailwind.config.js` has shadcn CSS variable tokens AND keeps existing OKLCH tokens
  - [ ] `frontend/src/index.css` has CSS variables block in `:root`
  - [ ] `frontend/src/index.css` does NOT contain `text-decoration: underline` in `a:hover`
  - [ ] `frontend/index.html` has `class="dark"` on `<html>`
  - [ ] `cd frontend && npm run build` exits 0
  - [ ] `cd frontend && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Build succeeds after foundation changes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build
      2. Assert exit code = 0
      3. Assert no "ERROR" lines in output
    Expected Result: Clean build output, dist/ folder created
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: Underline bug is eliminated
    Tool: Bash
    Steps:
      1. grep "text-decoration: underline" frontend/src/index.css
      2. Assert 0 matches returned
      3. grep -r "hover:underline" frontend/src/
      4. Assert 0 matches returned
    Expected Result: Zero underline occurrences
    Evidence: .sisyphus/evidence/task-1-underline-check.txt

  Scenario: cn() utility is importable
    Tool: Bash
    Steps:
      1. cd frontend && node -e "import('@/lib/utils').then(m => { console.log(m.cn('foo', 'bar')); process.exit(0); })" 2>&1 || echo "use tsc check"
      2. npx tsc --noEmit (must be 0 errors)
    Expected Result: TypeScript compiles without errors
    Evidence: .sisyphus/evidence/task-1-tsc.txt
  ```

  **Commit**: YES
  - Message: `feat: install shadcn/ui foundation — cn() utility, CSS vars, underline fix, darkMode`
  - Files: `src/lib/utils.ts`, `tailwind.config.js`, `src/index.css`, `index.html`, `package.json`, `package-lock.json`

---

- [x] 2. Remake Navbar

  **What to do**:
  - Replace `border-b border-surface-border-subtle/80` with either NO border or `border-b border-white/[0.05]` (max 5% opacity — nearly invisible)
  - Alternative: use a subtle `box-shadow: 0 1px 0 oklch(1 0 0 / 0.06)` instead of a border
  - Replace inline SVG logo icon with Lucide React `<GraduationCap>` icon
  - Username display: keep the box but simplify — remove the explicit `border border-surface-border-subtle` box OR reduce to `border-white/[0.06]`
  - Logout and admin buttons: use shadcn `<Button variant="ghost">` — bg shift on hover, never underline
  - Logo link (`<Link to="/">`): must NOT underline on hover — use `hover:opacity-80` or `hover:text-brand-300`
  - Ensure `AdminBanner` above Navbar still renders correctly (don't break the `<>` wrapper)
  - Import from `lucide-react`: `GraduationCap`
  - Keep all logic: `useAuthStore`, user display, admin check, logout

  **Must NOT do**:
  - Do NOT add `hover:underline` to any element
  - Do NOT use a visible border-b (max opacity 5%)
  - Do NOT change routing or auth logic
  - Do NOT remove the AdminBanner rendering

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Pure UI component remake — layout, styling, hover states, icon migration
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 3
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 4-23
  - **Blocked By**: Task 1

  **References**:
  - `frontend/src/components/Navbar.tsx` — full current implementation
  - `frontend/src/components/AdminBanner.tsx` — rendered above Navbar, must preserve
  - Pattern reference: Linear's navbar uses backdrop-blur + barely-there border, logo hover = opacity shift

  **Acceptance Criteria**:
  - [ ] `cd frontend && npm run build` exits 0
  - [ ] Navbar file has NO `border-b border-surface-border-subtle` (check: `grep "border-b border-surface-border-subtle" src/components/Navbar.tsx` → 0 results)
  - [ ] Navbar file has NO `hover:underline` (check: `grep "hover:underline" src/components/Navbar.tsx` → 0 results)
  - [ ] Lucide React icon used (check: `grep "lucide-react" src/components/Navbar.tsx` → 1+ results)

  **QA Scenarios**:
  ```
  Scenario: No harsh navbar border
    Tool: Bash
    Steps:
      1. grep "border-b border-surface-border-subtle" frontend/src/components/Navbar.tsx
      2. Assert 0 matches (line must not exist OR must have opacity ≤5%)
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-2-border-check.txt

  Scenario: No hover underline in navbar
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/components/Navbar.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-2-underline-check.txt

  Scenario: Build still passes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `refactor: remake navbar — subtle border, lucide icons, no hover underline`

---

- [x] 3. Remake Layout + Sidebar

  **What to do**:
  - Replace `border-r border-surface-border-subtle/80` on the `<aside>` with either NO border or `border-r border-white/[0.05]`
  - Alternative for separation: set sidebar `bg-surface-deep/90` and main `bg-transparent` — shade difference conveys separation without a border
  - Replace inline SVG nav icons (6 icons) with Lucide React equivalents:
    - 대시보드: `LayoutDashboard`
    - 자료 관리: `FolderOpen`
    - 퀴즈 생성: `CircleHelp`
    - 오답노트: `TriangleAlert`
    - 재도전: `RefreshCw`
    - 검색: `Search`
  - Menu toggle button: replace inline SVGs with Lucide `<Menu>` / `<X>` or just `<Menu>`
  - The `border-b border-surface-border-subtle/80` on the toggle button section: replace with `border-b border-white/[0.05]`
  - Active nav item styling: keep `bg-brand-500/12 shadow-[inset_0_0_0_1px_rgba(113,239,211,0.16)]` — this is subtle and correct
  - Nav item hover: `hover:bg-surface-hover hover:text-content-primary` — keep, this is correct (bg shift, not underline)
  - **CRITICAL**: Nav items are `<Link>` components. They must NOT get underline on hover. The global CSS fix in Task 1 handles this, but verify the Link className has NO hover:underline
  - Preserve sidebar collapse behavior: `sidebarOpen` state, width `18rem` / `5.5rem`, icon-only mode
  - Keep `sticky top-16 min-h-[calc(100vh-4rem)]` positioning

  **Must NOT do**:
  - Do NOT break sidebar collapse/expand behavior
  - Do NOT add `hover:underline` to nav items
  - Do NOT change routing (navItems paths are sacred)
  - Do NOT use visible border-r (max opacity 5%)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 2
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 4-23
  - **Blocked By**: Task 1

  **References**:
  - `frontend/src/components/Layout.tsx` — full current implementation (136 lines)
  - `frontend/src/components/Navbar.tsx` — top-16 offset the sidebar depends on
  - Lucide React icon docs: `import { LayoutDashboard, FolderOpen, CircleHelp, TriangleAlert, RefreshCw, Search } from 'lucide-react'`

  **Acceptance Criteria**:
  - [ ] `grep "border-r border-surface-border" frontend/src/components/Layout.tsx` → 0 results
  - [ ] `grep "hover:underline" frontend/src/components/Layout.tsx` → 0 results
  - [ ] `grep "lucide-react" frontend/src/components/Layout.tsx` → 1+ results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` → exit 0

  **QA Scenarios**:
  ```
  Scenario: Sidebar border eliminated
    Tool: Bash
    Steps:
      1. grep "border-r border-surface-border" frontend/src/components/Layout.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-3-border-check.txt

  Scenario: Lucide icons replacing inline SVGs
    Tool: Bash
    Steps:
      1. grep "lucide-react" frontend/src/components/Layout.tsx
      2. Assert 1+ matches (icons imported)
      3. grep "<svg" frontend/src/components/Layout.tsx
      4. Assert 0 matches (all inline SVGs removed)
    Expected Result: Only Lucide icons, no inline SVGs
    Evidence: .sisyphus/evidence/task-3-icons.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `refactor: remake layout/sidebar — subtle border, lucide icons, collapse preserved`

---

- [x] 4. Install shadcn component batch

  **What to do**:
  Run in `frontend/` directory:
  ```bash
  npx shadcn@latest add button
  npx shadcn@latest add badge
  npx shadcn@latest add dialog
  npx shadcn@latest add skeleton
  npx shadcn@latest add scroll-area
  npx shadcn@latest add separator
  npx shadcn@latest add input
  npx shadcn@latest add label
  npx shadcn@latest add select
  npx shadcn@latest add card
  npx shadcn@latest add tabs
  ```
  After installation, customize each component to use the design contract:
  - `button.tsx`: verify variants use `bg-primary text-primary-foreground` (already mapped to OKLCH). Ensure no `underline` decoration in any variant.
  - `badge.tsx`: verify no hover underline behavior. Badge is display-only, not interactive.
  - `separator.tsx`: use `bg-white/[0.07]` color — this is the D1-compliant divider color.
  - `input.tsx`: verify uses `bg-input border-border` which map to OKLCH values from CSS vars.
  
  Verify build passes after all installs:
  ```bash
  cd frontend && npm run build && npx tsc --noEmit
  ```

  **Must NOT do**:
  - Do NOT install all shadcn components blindly — only these specific ones needed
  - Do NOT change the OKLCH CSS variables defined in Task 1
  - Do NOT add hover:underline to badge or button

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI installation commands + minimal customization verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO with Tasks 5-10 (must install before others use components)
  - **Parallel Group**: Wave 3 (first step)
  - **Blocks**: Tasks 5-10
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `frontend/src/index.css` — CSS variables from Task 1 that shadcn components reference
  - `frontend/tailwind.config.js` — shadcn token mappings from Task 1

  **Acceptance Criteria**:
  - [ ] `frontend/src/components/ui/` directory exists with button.tsx, badge.tsx, dialog.tsx, skeleton.tsx, scroll-area.tsx, separator.tsx, input.tsx, label.tsx, select.tsx, card.tsx, tabs.tsx
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0
  - [ ] `grep "hover:underline" frontend/src/components/ui/badge.tsx` → 0 results

  **QA Scenarios**:
  ```
  Scenario: shadcn components installed
    Tool: Bash
    Steps:
      1. ls frontend/src/components/ui/
      2. Assert: button.tsx, badge.tsx, dialog.tsx, skeleton.tsx exist
    Expected Result: All files present
    Evidence: .sisyphus/evidence/task-4-components.txt

  Scenario: Build passes after installs
    Tool: Bash
    Steps:
      1. cd frontend && npm run build
      2. Assert exit code = 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Commit**: YES
  - Message: `feat: add shadcn/ui component batch (button, badge, dialog, skeleton, input, etc.)`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] 5. Remake StatusBadge

  **What to do**:
  - Replace the hand-rolled badge with shadcn `<Badge>` primitive as the base
  - Keep ALL existing status mappings (44+ statuses) and Korean labels in `labelMap` and `statusConfigMap`
  - The badge renders INSIDE `<Link>` elements in some pages — ensure it never gets underline on hover (the `a { text-decoration: none }` fix in Task 1 handles this globally, but badge itself must also use `pointer-events: none` or simply rely on the parent link)
  - Keep dot + pulse pattern for in-progress states
  - Apply D3: badge is display-only, never interactive, never underlines
  - Improve styling: use shadcn Badge as wrapper `<Badge className={cn("inline-flex items-center gap-2 ...", statusConfig.className)}>` with variant="outline" or custom variant
  - The badge `className` values in statusConfigMap reference existing semantic tokens (`border-semantic-success-border bg-semantic-success-bg text-semantic-success`) — keep these references, they're correct

  **Must NOT do**:
  - Do NOT remove any status from labelMap or statusConfigMap
  - Do NOT change the StatusBadge props interface `{ status: string }`
  - Do NOT add hover:underline
  - Do NOT make badge interactive (it's display-only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 6-10 (after Task 4 completes)
  - **Parallel Group**: Wave 3
  - **Blocks**: Nothing directly (used by pages)
  - **Blocked By**: Task 4

  **References**:
  - `frontend/src/components/StatusBadge.tsx` — full implementation (238 lines)
  - `frontend/src/components/ui/badge.tsx` — shadcn Badge component installed in Task 4

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/components/StatusBadge.tsx` → 0 results
  - [ ] Component exports default `StatusBadge` with same props interface
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: All status types map correctly
    Tool: Bash
    Steps:
      1. npx tsc --noEmit (TypeScript catches missing keys)
      2. grep -c "statusConfigMap" frontend/src/components/StatusBadge.tsx
      3. Assert 1+ (map still defined)
    Expected Result: No TypeScript errors, map intact
    Evidence: .sisyphus/evidence/task-5-tsc.txt

  Scenario: No hover underline on badge
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/components/StatusBadge.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-5-underline.txt
  ```

  **Commit**: NO (groups with Tasks 6-10 in Wave 3 commit)

---

- [x] 6. Remake Modal → shadcn Dialog

  **What to do**:
  - Replace the hand-built Modal with shadcn `<Dialog>` from Radix UI
  - Keep the same props interface: `{ isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' }`
  - shadcn Dialog already handles: focus trap, Escape key, backdrop click, body scroll lock — remove all hand-built equivalents
  - Apply D1 to dialog: `bg-card border-border` (maps to OKLCH values from CSS vars) — subtle border
  - Dialog overlay: `bg-black/60 backdrop-blur-sm`
  - Close button (X): Lucide `<X>` icon, `hover:bg-surface-hover` — never underline
  - Internal structure: `<Dialog><DialogContent><DialogHeader><DialogTitle>` etc.
  - Ensure portal rendering doesn't break React Router `<Link>` context (Radix Dialog uses portal but Link context is provided by Router at app root — this is fine)

  **Must NOT do**:
  - Do NOT change the Modal props interface (pages use it as-is)
  - Do NOT add hover:underline to close button
  - Do NOT remove keyboard accessibility (Dialog provides it automatically)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 5, 7-10
  - **Parallel Group**: Wave 3
  - **Blocked By**: Task 4

  **References**:
  - `frontend/src/components/Modal.tsx` — current implementation
  - `frontend/src/components/ui/dialog.tsx` — shadcn Dialog installed in Task 4
  - Pages using Modal: Files.tsx, QuizNew.tsx, Admin.tsx (use `lsp_find_references` to find all usages)

  **Acceptance Criteria**:
  - [ ] Modal uses shadcn Dialog internally
  - [ ] Props interface unchanged: `{ isOpen, onClose, title?, children, size? }`
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Modal props interface preserved
    Tool: Bash
    Steps:
      1. grep "isOpen" frontend/src/components/Modal.tsx
      2. Assert 1+ matches (prop still accepted)
      3. npx tsc --noEmit from frontend/
      4. Assert 0 errors
    Expected Result: Interface intact, TypeScript clean
    Evidence: .sisyphus/evidence/task-6-interface.txt
  ```

  **Commit**: NO (groups with Wave 3 commit)

---

- [x] 7. Remake EmptyState

  **What to do**:
  - Current: icon + title + message + action buttons
  - Keep same props interface: `{ icon?, title, message, actions? }`
  - Replace inline SVG in the component with Lucide icon (if icon prop is not provided, use `<Inbox>` as default)
  - Apply D2: title is the main message (2-4 words), message is one-line subtitle (≤15 words). Do NOT add verbose explanatory text.
  - Improve visual: subtle background `bg-surface-raised/50 rounded-2xl`, no harsh border (use `border border-white/[0.07]` or NO border)
  - Action buttons: use shadcn `<Button>` variant="outline" or default

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 5, 6, 8-10
  - **Parallel Group**: Wave 3
  - **Blocked By**: Task 4

  **References**:
  - `frontend/src/components/EmptyState.tsx`

  **Acceptance Criteria**:
  - [ ] Props interface preserved
  - [ ] No inline SVG (unless icon prop provides one)
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Build passes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-7-build.txt
  ```

  **Commit**: NO (groups with Wave 3 commit)

---

- [x] 8. Remake LoadingSpinner

  **What to do**:
  - Current: custom rotating border animation + cycling Korean status messages
  - Keep the cycling status messages (they're good UX context — D2 compliant)
  - Improve the spinner visual: use a more polished spinner style
    - Option A: Keep CSS ring but refine — `border-4 border-brand-500/20 border-t-brand-500 rounded-full w-10 h-10 animate-spin`
    - Option B: Use shadcn skeleton pulsing with a spinner SVG
  - Prefer Option A — simpler, keeps existing animation
  - The message cycling animation should remain smooth
  - Message text: `text-content-secondary text-sm` — fits D2 (short, informative)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 5-7, 9-10
  - **Parallel Group**: Wave 3
  - **Blocked By**: Task 4

  **References**:
  - `frontend/src/components/LoadingSpinner.tsx`

  **Acceptance Criteria**:
  - [ ] Korean cycling messages preserved
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Build passes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-8-build.txt
  ```

  **Commit**: NO (groups with Wave 3 commit)

---

- [x] 9. Remake Pagination

  **What to do**:
  - Current: page window calculation, prev/next buttons, page number buttons
  - Keep all pagination logic (the page window algorithm is correct — don't touch it)
  - Restyle: use shadcn `<Button>` for page buttons with `variant="ghost"` for inactive, `variant="secondary"` for active
  - Active page: `bg-brand-500/15 text-brand-300` — subtle, not harsh
  - Prev/Next: Lucide `<ChevronLeft>` / `<ChevronRight>` icons with text
  - Ellipsis: `...` text in `text-content-muted`
  - No hover:underline on any page button
  - Keep props interface: `{ page, totalPages, onPageChange }`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 5-8, 10
  - **Parallel Group**: Wave 3
  - **Blocked By**: Task 4

  **References**:
  - `frontend/src/components/Pagination.tsx`

  **Acceptance Criteria**:
  - [ ] Props interface preserved: `{ page, totalPages, onPageChange }`
  - [ ] `grep "hover:underline" frontend/src/components/Pagination.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underline on pagination
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/components/Pagination.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-9-underline.txt
  ```

  **Commit**: NO (groups with Wave 3 commit)

---

- [x] 10. Remake AdminBanner

  **What to do**:
  - Current: full-width warning banner above Navbar showing admin impersonation mode
  - Keep same layout: renders above Navbar (the `<>` fragment in Navbar.tsx)
  - Restyle: make it feel intentional, not jarring. Use `bg-semantic-warning-bg border-b border-semantic-warning-border/30 text-semantic-warning`
  - Remove harsh border-b if any, use subtle `border-b border-semantic-warning-border/20`
  - Exit button: Lucide `<X>` icon, `hover:bg-semantic-warning-bg/50` — never underline
  - Keep all logic: impersonation state from authStore, exit handler
  - D2: banner text should be concise — "관리자 가장 모드: {username}" + exit button. No verbose explanations.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 5-9
  - **Parallel Group**: Wave 3
  - **Blocked By**: Task 4

  **References**:
  - `frontend/src/components/AdminBanner.tsx`
  - `frontend/src/stores/authStore.ts` — impersonation state

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/components/AdminBanner.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Build passes after Wave 3 complete
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean build after all Wave 3 changes
    Evidence: .sisyphus/evidence/task-10-build.txt
  ```

  **Commit**: YES (groups all Wave 3 tasks)
  - Message: `refactor: remake shared components (StatusBadge, Modal, EmptyState, Spinner, Pagination, AdminBanner)`
  - Files: `src/components/StatusBadge.tsx`, `src/components/Modal.tsx`, `src/components/EmptyState.tsx`, `src/components/LoadingSpinner.tsx`, `src/components/Pagination.tsx`, `src/components/AdminBanner.tsx`

---

- [x] 11. Remake Login page

  **What to do**:
  - Remove all `.auth-*` class dependencies (will be replaced with Tailwind utilities)
  - New layout: full-height centered container → two-column card (hero panel left, form right on desktop — same structure as current, but using Tailwind utilities instead of `.auth-card`, `.auth-panel` etc.)
  - Use shadcn `<Card>`, `<Input>`, `<Label>`, `<Button>` components
  - Hero panel (desktop only): Brand teal accent area, logo, tagline "AI 기반 퀴즈 매니저". Keep it minimal. One sentence of context.
  - Form panel: Login title, email/password fields, primary button, links to signup + password reset
  - Error state: use shadcn's error styling — `text-destructive text-sm` below the field or in an alert box
  - Apply D2: form title "로그인" (2 words max), one-line description "퀴즈 매니저에 로그인하세요." Links labeled clearly.
  - Separator between hero and form: use `border-r border-white/[0.06]` — barely visible (D1)
  - Keep all form logic: `useState` for fields, API call, error handling, navigate on success
  - The form should have no `hover:underline` on any element. Links use `hover:text-brand-300`.

  **Must NOT do**:
  - Do NOT change form submission logic or API calls
  - Do NOT add react-hook-form
  - Do NOT make verbose labels or help text (X2)
  - Do NOT add hover:underline anywhere

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 12, 13
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 14 (CSS cleanup)
  - **Blocked By**: Tasks 5-10 (Wave 3 must complete)

  **References**:
  - `frontend/src/pages/Login.tsx` — current implementation
  - `frontend/src/index.css:99-317` — `.auth-*` CSS classes to understand the structure
  - `frontend/src/components/ui/` — card.tsx, input.tsx, label.tsx, button.tsx

  **Acceptance Criteria**:
  - [ ] No `.auth-` classes used in Login.tsx
  - [ ] Uses shadcn Input, Label, Button
  - [ ] `grep "hover:underline" frontend/src/pages/Login.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No legacy auth CSS classes
    Tool: Bash
    Steps:
      1. grep "auth-" frontend/src/pages/Login.tsx
      2. Assert 0 matches
    Expected Result: No .auth-* class references
    Evidence: .sisyphus/evidence/task-11-auth-classes.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-11-build.txt
  ```

  **Commit**: NO (groups with Tasks 12-14)

---

- [x] 12. Remake Signup page

  **What to do**:
  - Same approach as Task 11 (Login)
  - Replace `.auth-*` classes with Tailwind utilities + shadcn components
  - Fields: username, email, password, password confirm
  - Validation errors: `text-destructive text-sm` below field
  - Hero panel: same brand panel as Login (keep consistent across auth pages)
  - D2: title "회원가입", brief tagline on hero panel
  - Keep all form logic: useState, API call, error handling, navigate on success
  - Password strength or help text: ONE line max (D2)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 11, 13
  - **Parallel Group**: Wave 4
  - **Blocked By**: Tasks 5-10

  **References**:
  - `frontend/src/pages/Signup.tsx`
  - Task 11 output (Login) — for consistent auth card structure

  **Acceptance Criteria**:
  - [ ] No `.auth-` classes in Signup.tsx
  - [ ] `grep "hover:underline" frontend/src/pages/Signup.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No legacy auth CSS classes
    Tool: Bash
    Steps:
      1. grep "auth-" frontend/src/pages/Signup.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-12-auth-classes.txt
  ```

  **Commit**: NO (groups with Tasks 11, 13, 14)

---

- [x] 13. Remake PasswordReset page

  **What to do**:
  - Same approach as Tasks 11-12
  - Two states: request state (email input) and success state (confirmation message)
  - D2: success state message concise — "이메일을 확인하세요." + link back to login
  - No `.auth-*` classes
  - Keep all logic: email submission, success state, API call

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 11, 12
  - **Parallel Group**: Wave 4
  - **Blocked By**: Tasks 5-10

  **References**:
  - `frontend/src/pages/PasswordReset.tsx`

  **Acceptance Criteria**:
  - [ ] No `.auth-` classes in PasswordReset.tsx
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No legacy auth CSS classes
    Tool: Bash
    Steps:
      1. grep "auth-" frontend/src/pages/PasswordReset.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-13-auth-classes.txt
  ```

  **Commit**: NO (groups with Tasks 11, 12, 14)

---

- [x] 14. Remove dead `.auth-*` CSS from index.css

  **What to do**:
  - After Tasks 11-13 are complete and none of the auth pages use `.auth-*` classes, remove all `.auth-*` CSS blocks from `index.css`
  - Lines to remove: approximately lines 99-317 (`.auth-shell` through `.auth-footnote`, including the `@media (min-width: 960px)` block for auth layout)
  - Before removing, verify: `grep -r "auth-" frontend/src/pages/` → 0 results (all pages cleaned)
  - Also verify: `grep -r "auth-" frontend/src/components/` → 0 results
  - After removal, verify build still passes

  **Must NOT do**:
  - Do NOT remove the animation keyframes (they come after the .auth-* section)
  - Do NOT remove global styles (`:root`, `body`, `input`, `a`, scrollbar styles)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple search-and-delete with build verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must run AFTER Tasks 11-13
  - **Parallel Group**: Wave 4 (final step)
  - **Blocked By**: Tasks 11, 12, 13

  **References**:
  - `frontend/src/index.css:99-317` — the .auth-* CSS block to remove

  **Acceptance Criteria**:
  - [ ] `grep "auth-" frontend/src/index.css` → 0 results
  - [ ] `grep -r "auth-" frontend/src/pages/` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: All auth CSS removed and build clean
    Tool: Bash
    Steps:
      1. grep "auth-" frontend/src/index.css
      2. Assert 0 matches
      3. cd frontend && npm run build
      4. Assert exit code = 0
    Expected Result: No dead CSS, clean build
    Evidence: .sisyphus/evidence/task-14-css-cleanup.txt
  ```

  **Commit**: YES (groups Tasks 11-14)
  - Message: `refactor: remake auth pages with shadcn, remove legacy .auth-* CSS`
  - Files: `src/pages/Login.tsx`, `src/pages/Signup.tsx`, `src/pages/PasswordReset.tsx`, `src/index.css`

---

- [x] 15. Remake Dashboard page

  **What to do**:
  - The Dashboard has TWO states: empty state (no data) and data state
  - **Empty state**: Two CTA cards. Apply D1 (no harsh border on cards — use `border border-white/[0.07]`). Apply D2 (current text is already well-balanced, keep it). Apply D3 (Link cards: hover = `hover:bg-brand-500/15` and `hover:bg-surface-hover` — already correct, just verify no underline added by hover)
  - **Data state**: Multiple sections — hero stats, coaching message, retry recommendations, wrong notes, detailed metrics
  - Hero stats row (문제 풀이, 정답률, 점수율): keep the `border-t border-surface-border/50` but reduce to `border-t border-white/[0.07]` (D1)
  - Action panel (aside): `border border-surface-border border-l-4 border-l-brand-500` — the `border-l-4 border-l-brand-500` accent is good and intentional (keep). But the regular `border border-surface-border` → change to `border border-white/[0.07]`
  - Retry recommendations: the `divide-y divide-surface-border` on the list container → change to `divide-y divide-white/[0.07]`
  - Link elements in the data state (e.g., "재도전 보기", "재도전" link in weak concepts) — these ARE navigation links (they go to /retry, /wrong-notes). They should NOT underline on hover. Use `hover:text-brand-400` or `hover:opacity-80`. Global CSS fix handles this but verify.
  - The quick links in the top header (retry count badge, wrong notes badge): `<Link>` elements. No underline. `hover:bg-brand-500/15` is already correct — verify.
  - Date range buttons and filter selects: keep existing logic, just restyle selects to use `border-white/[0.07]`
  - Bottom section cards (취약 개념 상위, 문제 유형별 흐름, 자료별 정확도): use `border border-white/[0.07]` — subtle

  **Must NOT do**:
  - Do NOT change any data fetching logic (useQuery, dashboardApi)
  - Do NOT change the `getCoachingMessage`, `getPrimaryAction`, `formatPercent`, `formatDateTime` functions
  - Do NOT change range state or filter state
  - Do NOT add verbose text (X2)
  - Do NOT underline link labels (X4)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 16, 17
  - **Parallel Group**: Wave 5
  - **Blocked By**: Tasks 11-14 (Wave 4 complete)

  **References**:
  - `frontend/src/pages/Dashboard.tsx` — full 460-line implementation
  - `frontend/src/types/` — DashboardResponse type

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/Dashboard.tsx` → 0 results
  - [ ] `grep "border-surface-border[^-/]" frontend/src/pages/Dashboard.tsx` → 0 results (all borders have opacity or are removed)
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No harsh borders in Dashboard
    Tool: Bash
    Steps:
      1. grep -n "border-surface-border[^-/]" frontend/src/pages/Dashboard.tsx
      2. Assert 0 matches (all borders have opacity modifier or are removed)
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-15-borders.txt

  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/Dashboard.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-15-underline.txt
  ```

  **Commit**: NO (groups with Tasks 16, 17)

---

- [x] 16. Remake Files page

  **What to do**:
  - Files page has: upload zone, filter tabs, file list with status badges, retry/delete actions
  - Upload zone: make it more visually inviting. Dashed border `border-2 border-dashed border-white/[0.12]` with `hover:border-brand-500/40 hover:bg-brand-500/5` transition. Lucide `<Upload>` icon. D2: "파일 업로드" title + "PDF, DOCX, PPTX, TXT, MD, PNG, JPG 지원" one-liner.
  - Filter tabs: use shadcn `<Tabs>` or style pill buttons. No hover:underline. `hover:bg-surface-hover`.
  - File list items: each file row. Use `border-b border-white/[0.06]` between items (not harsh). StatusBadge already remade (Task 5). Filename, type, upload date: D2 — show info but not verbose.
  - Retry button: `hover:bg-surface-hover` or `hover:bg-semantic-warning-bg/50`. Never underline.
  - Delete button: `hover:bg-semantic-error-bg/50`. Never underline.
  - Empty state: use remade EmptyState component (Task 7)
  - LoadingSpinner: use remade component (Task 8)
  - Keep all logic: file upload, status polling, retry, delete, filter state, TanStack Query

  **Must NOT do**:
  - Do NOT change file upload logic, status polling, or API calls
  - Do NOT add hover:underline to any interactive element
  - Do NOT add verbose labels on file rows

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15, 17
  - **Parallel Group**: Wave 5
  - **Blocked By**: Tasks 11-14

  **References**:
  - `frontend/src/pages/Files.tsx`
  - `frontend/src/components/StatusBadge.tsx` (Task 5 output)
  - `frontend/src/components/EmptyState.tsx` (Task 7 output)

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/Files.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/Files.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-16-underline.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-16-build.txt
  ```

  **Commit**: NO (groups with Tasks 15, 17)

---

- [x] 17. Remake QuizNew page

  **What to do**:
  - QuizNew has: source selection (file list or no-source), mode toggle (normal/exam), difficulty, question count, question type
  - Source selection list: file items are shown with status. These are selectable, NOT navigable links. Use `cursor-pointer` with `hover:bg-surface-hover` — never underline. Selected item: `bg-brand-500/12 border-brand-500/25` (subtle brand highlight)
  - Mode toggle (일반/시험): make it visually distinct — a clean segmented control using shadcn `<Tabs>` with two tabs, or styled toggle buttons. No underline.
  - Difficulty pills and question type checkboxes: keep existing behavior. Style pills: `hover:bg-surface-hover border-white/[0.07]`. Selected: `bg-brand-500/12 text-brand-300`.
  - Question count input: use shadcn `<Input>` with `<Label>`
  - "퀴즈 생성" button at bottom: shadcn `<Button>` primary — `bg-brand-500 text-content-inverse hover:bg-brand-600`
  - Warning modal (no source): uses Modal component (Task 6). Keep logic.
  - Keep all state: source selection, mode, difficulty, count, types, loading state, submit handler

  **Must NOT do**:
  - Do NOT change quiz creation logic or API calls
  - Do NOT add hover:underline to file items or buttons
  - Do NOT decompose into sub-components

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15, 16
  - **Parallel Group**: Wave 5
  - **Blocked By**: Tasks 11-14

  **References**:
  - `frontend/src/pages/QuizNew.tsx`
  - `frontend/src/components/Modal.tsx` (Task 6 output)

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/QuizNew.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/QuizNew.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-17-underline.txt
  ```

  **Commit**: YES (groups Tasks 15-17)
  - Message: `refactor: remake Dashboard, Files, QuizNew pages`

---

- [x] 18. Remake QuizTake page

  **What to do**:
  - QuizTake is the most complex page (662 lines). Restyle ONLY — do NOT decompose.
  - Has: loading state (uses LoadingSpinner), question display, answer inputs by type (multiple choice, OX, short answer, fill-in-blank, essay), navigation, progress, exam mode handling
  - Progress bar: keep `animate-progress-fill` animation. Style: `bg-brand-500 rounded-full`. Track: `bg-surface-raised/50 rounded-full`
  - Question card: `bg-surface-raised/80 rounded-2xl border border-white/[0.07]` — subtle border
  - Multiple choice options: `hover:bg-surface-hover border border-white/[0.07]`. Selected: `bg-brand-500/12 border-brand-500/30 text-content-primary`. Correct: `animate-answer-correct bg-semantic-success-bg/50 border-semantic-success/30`. Wrong: `animate-answer-wrong bg-semantic-error-bg/50 border-semantic-error/30`
  - **CRITICAL**: Keep `animate-answer-correct` and `animate-answer-wrong` animations — these are in index.css and must work
  - OX buttons: large, prominent. O button green hover, X button red hover
  - Text inputs (short answer, fill-in-blank, essay): use shadcn `<Input>` / `<textarea>` with `bg-input border-border`
  - Navigation buttons (이전, 다음, 제출): shadcn `<Button>`. Primary for main action, ghost for secondary.
  - Exam mode: slightly different UI (answers hidden). Keep this conditional logic.
  - No hover:underline on ANYTHING in this page — nothing navigates by link here

  **Must NOT do**:
  - Do NOT change answer submission logic, grading logic, exam mode logic
  - Do NOT change TanStack Query polling behavior
  - Do NOT remove `animate-answer-correct` or `animate-answer-wrong` classes
  - Do NOT decompose into sub-components
  - Do NOT add hover:underline anywhere

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 19 (they don't share state)
  - **Parallel Group**: Wave 6
  - **Blocked By**: Tasks 15-17 (Wave 5)

  **References**:
  - `frontend/src/pages/QuizTake.tsx`
  - `frontend/src/index.css:374-419` — `animate-answer-correct` and `animate-answer-wrong` keyframes to preserve

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/QuizTake.tsx` → 0 results
  - [ ] `grep "animate-answer-correct\|animate-answer-wrong" frontend/src/pages/QuizTake.tsx` → 1+ results (animations preserved)
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Answer animations preserved
    Tool: Bash
    Steps:
      1. grep "animate-answer-correct" frontend/src/pages/QuizTake.tsx
      2. Assert 1+ matches
      3. grep "animate-answer-wrong" frontend/src/pages/QuizTake.tsx
      4. Assert 1+ matches
    Expected Result: Both animations still used
    Evidence: .sisyphus/evidence/task-18-animations.txt

  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/QuizTake.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-18-underline.txt
  ```

  **Commit**: NO (groups with Task 19)

---

- [x] 19. Remake QuizResults page

  **What to do**:
  - Results page shows: score ring/number, score rate, session info, navigation buttons
  - Score display: the `animate-ring-reveal` animation is good — keep it. Make the ring more prominent: larger `w-32 h-32` or similar, `stroke-brand-500` for the filled arc.
  - Score percentage: large `text-5xl font-bold text-content-primary`
  - Session info: StatusBadge (Task 5 output) for status. Dates, counts: `text-content-secondary text-sm` — no underlines.
  - Navigation buttons (오답 확인, 재도전, 새 퀴즈): shadcn `<Button>` with appropriate variants. These ARE navigation links — render as `<Button asChild><Link to="...">text</Link></Button>` so routing works.
  - No hover:underline on any element
  - Keep all logic: score calculation, navigation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 18
  - **Parallel Group**: Wave 6
  - **Blocked By**: Tasks 15-17

  **References**:
  - `frontend/src/pages/QuizResults.tsx`
  - `frontend/src/index.css:407-411` — `animate-ring-reveal` keyframe

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/QuizResults.tsx` → 0 results
  - [ ] `grep "animate-ring-reveal" frontend/src/pages/QuizResults.tsx` → 1+ results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: Ring animation preserved
    Tool: Bash
    Steps:
      1. grep "animate-ring-reveal" frontend/src/pages/QuizResults.tsx
      2. Assert 1+ matches
    Expected Result: Animation class still used
    Evidence: .sisyphus/evidence/task-19-animation.txt
  ```

  **Commit**: YES (groups Tasks 18-19)
  - Message: `refactor: remake quiz flow pages (QuizTake, QuizResults)`

---

- [x] 20. Remake WrongNotes page

  **What to do**:
  - WrongNotes shows: sort/filter controls, list of wrong note cards, pagination, note detail expand
  - Sort/filter row: dropdowns → use shadcn `<Select>`. Pills → style as `hover:bg-surface-hover border border-white/[0.07]`
  - Wrong note cards: `bg-surface-raised rounded-2xl border border-white/[0.07]`. Content: question text (primary), concept label (secondary), judgement badge (StatusBadge). No hover:underline on card.
  - If card is clickable/expandable: `hover:bg-surface-hover` — never underline
  - "재도전" button on each card: shadcn `<Button variant="outline">` — never underline
  - Pagination: use remade Pagination component (Task 9)
  - EmptyState: use Task 7 output
  - Keep all logic: sort state, filter state, pagination, TanStack Query

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 21, 22, 23
  - **Parallel Group**: Wave 7
  - **Blocked By**: Tasks 14 (Wave 4 complete) — Wave 7 can run parallel to Wave 6

  **References**:
  - `frontend/src/pages/WrongNotes.tsx`
  - `frontend/src/components/Pagination.tsx` (Task 9 output)

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/WrongNotes.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/WrongNotes.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-20-underline.txt
  ```

  **Commit**: NO (groups with Tasks 21-23)

---

- [x] 21. Remake Retry page

  **What to do**:
  - Retry page: shows recommendation cards from dashboard OR custom selection from wrong notes. Has question count setting, submit to create quiz.
  - Recommendation cards: `bg-surface-raised rounded-2xl border border-white/[0.07]`. Selectable: `hover:bg-surface-hover` when selecting. Selected: `bg-brand-500/10 border-brand-500/20`.
  - Count input: shadcn `<Input>` with min/max controls
  - "퀴즈 생성" button: shadcn `<Button>` primary
  - Tab/toggle between recommendation mode and wrong-note mode: shadcn `<Tabs>` or styled buttons
  - No hover:underline anywhere
  - Keep all logic: recommendation fetching, quiz creation, navigation to quiz

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 20, 22, 23
  - **Parallel Group**: Wave 7
  - **Blocked By**: Tasks 11-14

  **References**:
  - `frontend/src/pages/Retry.tsx`

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/Retry.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/Retry.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-21-underline.txt
  ```

  **Commit**: NO (groups with Tasks 20, 22, 23)

---

- [x] 22. Remake Search page

  **What to do**:
  - Search page: search input, scope filter (전체/자료/오답노트/퀴즈), results list
  - Search input: large, prominent. shadcn `<Input>` with Lucide `<Search>` icon inside. `bg-surface-raised/80 border-white/[0.08] focus:border-brand-500/50`
  - Scope filter: pill buttons. `hover:bg-surface-hover border border-white/[0.07]`. Active: `bg-brand-500/12 text-brand-300 border-brand-500/20`.
  - Results: grouped by type. Section headers: `text-content-secondary text-xs uppercase tracking-widest` — D2 compliant.
  - Result items: card-like. Content preview, source badge. `hover:bg-surface-hover` on click. Never underline.
  - Empty/no-results state: use EmptyState component
  - Keep all logic: hybrid search API, debounced queries, scope state

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 20, 21, 23
  - **Parallel Group**: Wave 7
  - **Blocked By**: Tasks 11-14

  **References**:
  - `frontend/src/pages/Search.tsx`

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/Search.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underlines in search
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/Search.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-22-underline.txt
  ```

  **Commit**: NO (groups with Tasks 20, 21, 23)

---

- [x] 23. Remake Admin page

  **What to do**:
  - Admin page: master password auth, user list, system logs, model usage, audit logs
  - Uses shadcn `<Tabs>` for the 4 sections (user management, logs, model usage, audit logs) if not already — clean tab navigation
  - Table-style lists: `bg-surface-raised rounded-xl` with rows `border-b border-white/[0.06]` — subtle row dividers
  - Headers: `text-content-muted text-xs uppercase tracking-widest` — lightweight headers
  - StatusBadge: use remade component (Task 5)
  - Pagination: use remade component (Task 9) if present
  - Auth form (master password): use shadcn `<Input>` + `<Button>`
  - No hover:underline anywhere
  - D1: no harsh borders. Table row hover: `hover:bg-surface-hover`
  - Keep all logic: master password auth, user impersonation, log fetching, model usage fetching

  **Must NOT do**:
  - Do NOT change admin authentication logic
  - Do NOT change impersonation functionality
  - Do NOT add hover:underline

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 20, 21, 22
  - **Parallel Group**: Wave 7
  - **Blocked By**: Tasks 11-14

  **References**:
  - `frontend/src/pages/Admin.tsx`
  - `frontend/src/components/ui/tabs.tsx` (installed in Task 4)

  **Acceptance Criteria**:
  - [ ] `grep "hover:underline" frontend/src/pages/Admin.tsx` → 0 results
  - [ ] `cd frontend && npm run build && npx tsc --noEmit` exits 0

  **QA Scenarios**:
  ```
  Scenario: No hover underlines
    Tool: Bash
    Steps:
      1. grep "hover:underline" frontend/src/pages/Admin.tsx
      2. Assert 0 matches
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-23-underline.txt

  Scenario: Final full build passes
    Tool: Bash
    Steps:
      1. cd frontend && npm run build && npx tsc --noEmit
      2. Assert exit code = 0
    Expected Result: Clean final build
    Evidence: .sisyphus/evidence/task-23-final-build.txt
  ```

  **Commit**: YES (groups Tasks 20-23)
  - Message: `refactor: remake utility pages (WrongNotes, Retry, Search, Admin)`

---

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. Verify every "Must Have" is implemented (grep + build). Verify every "Must NOT Have" is absent (grep for hover:underline, border-surface-border without opacity, a:hover underline). Check evidence files exist. Compare deliverables to plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cd frontend && npm run build && npx tsc --noEmit`. Review all changed files for: `as any`, `@ts-ignore`, empty catches, console.log, unused imports. Check for AI slop: excessive comments, generic variable names, unused shadcn components imported.
  Output: `Build [PASS/FAIL] | TSC [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start dev server. Verify every page loads without JS errors. Check: no underlines on hover for badges/timestamps/metadata. Check: no harsh borders on Navbar/Sidebar. Check: sidebar collapses correctly. Check: all Korean text readable. Check: auth pages render correctly. Save terminal output to `.sisyphus/evidence/final-qa/dev-server.txt`.
  Output: `Pages [N/N load] | Design Contract [D1/D2/D3/D4 PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual git diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Verify: no API changes, no store changes, no router changes, no type changes. Flag unaccounted modifications.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- Wave 1: `feat: install shadcn/ui and configure foundation`
- Wave 2: `refactor: remake navbar and layout shell`
- Wave 3: `refactor: remake shared components with shadcn primitives`
- Wave 4: `refactor: remake auth pages and clean legacy CSS`
- Wave 5: `refactor: remake core app pages`
- Wave 6: `refactor: remake quiz flow pages`
- Wave 7: `refactor: remake utility pages`

---

## Success Criteria

### Verification Commands
```bash
cd frontend && npm run build    # Expected: exit 0, no errors
cd frontend && npx tsc --noEmit # Expected: exit 0
grep -r "hover:underline" frontend/src/  # Expected: 0 matches
grep "text-decoration: underline" frontend/src/index.css  # Expected: 0 matches
grep -c "border-surface-border[^-/]" frontend/src/ -r 2>/dev/null || echo "0"  # Expected: ≤5
```

### Final Checklist
- [ ] shadcn/ui installed and functional
- [ ] OKLCH color mapping complete
- [ ] No hover underline anywhere in codebase
- [ ] No harsh separator lines in Navbar/Sidebar
- [ ] All 8 components remade
- [ ] All 12 pages remade
- [ ] Build and TSC pass clean
- [ ] Korean fonts preserved
- [ ] All animations preserved
- [ ] Sidebar collapse behavior preserved
- [ ] No API/store/router logic changes
