# Learnings — Frontend Remake

## Initial Context
- Tailwind v3.4.1 (NOT v4)
- OKLCH color system with full values in CSS vars
- Korean-first UI (SUIT Variable, Pretendard Variable, Noto Sans KR)
- Dark theme only, no light mode
- 184 occurrences of border-surface-border across 16 files
- Global a:hover underline bug in index.css line 25-27

## Task 1: shadcn/ui Foundation (completed)
- Installed: clsx, tailwind-merge, class-variance-authority, lucide-react, @types/node
- Created: src/lib/utils.ts (cn() utility), components.json
- tailwind.config.js: added darkMode: ["class"], shadcn CSS variable color tokens, borderRadius extension — all existing OKLCH tokens preserved
- index.css: expanded :root with all shadcn CSS vars mapped to OKLCH values, fixed a:hover underline bug (replaced with color: inherit, no underline)
- index.html: added class="dark" to <html> element
- Build: clean (190 modules, 0 TS errors)
- Key pattern: Use full OKLCH values directly in --variable definitions, reference via var(--token) in tailwind config
- components.json style: "new-york", rsc: false, tsx: true

## Task: Navbar Remake
- Replaced inline SVG with lucide-react GraduationCap (w-6 h-6)
- nav border-b: border-surface-border-subtle/80 → border-white/[0.05]
- All border tokens on interactive elements → border-white/[0.06]
- Logo Link: added hover:opacity-80 + transition-opacity
- No hover:underline anywhere — confirmed via grep
- Build: clean (1895 modules, 0 TS errors)

## Task: Layout.tsx Modernization (completed)
- Replaced all 6 inline SVG nav icons with lucide-react equivalents (LayoutDashboard, FolderOpen, CircleHelp, TriangleAlert, RefreshCw, Search)
- Replaced both toggle button SVGs with `<Menu className="w-4 h-4" />`
- Aside: `border-r border-surface-border-subtle/80` → `border-r border-white/[0.05]`
- Aside background: `bg-surface/80` → `bg-surface-deep/95` (shade separation from main content)
- Toggle section: `border-b border-surface-border-subtle/80` → `border-b border-white/[0.05]`
- All navItem paths, labels, collapse behavior, active/hover state classes preserved
- No hover:underline anywhere in Layout.tsx
- lucide-react was already installed (Task 1 shadcn foundation)
- Build: clean (1895 modules, 0 TS errors)

## QuizTake.tsx restyle (2026-04-02)
- `replaceAll` is reliable for bare token swaps like `border-surface-border` → `border-white/[0.07]` across the file
- MC/OX choice labels: text color must live on the *label* wrapper (not the child `<span>`); remove `text-content-primary` from span so it inherits the label's conditional color
- Post-submit correct/wrong option highlighting uses existing `answerResult.judgement` — no new state required
- Primary buttons: change `transition-colors` → `transition` when adding `hover:-translate-y-px` so the transform actually animates
- `npm run build` invokes `tsc && vite build` so a single command covers both TypeScript and bundle checks

## Admin.tsx border remediation (2026-04-02)
- `replaceAll` via Edit tool is safe for `border-surface-border` → `border-white/[0.07]` and `divide-surface-border` → `divide-white/[0.07]`
- Auth password input gets special treatment: `border-white/[0.10]` + focus ring (`focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none`)
- Tab nav redesigned from card-grid to underline style: section `border-b border-white/[0.07]`, nav `-mb-px flex overflow-x-auto`, each tab `border-b-2 border-transparent / border-brand-500`
- `-mb-px` on nav makes active tab border-b-2 overlap the section border-b (standard underline tab technique)
- Danger buttons use semantic tokens: `border-semantic-error-border/30 text-semantic-error hover:bg-semantic-error-bg/50`
- Impersonate buttons: `border-brand-500/25 text-brand-300 hover:bg-brand-500/10` (no default bg, no underline)
