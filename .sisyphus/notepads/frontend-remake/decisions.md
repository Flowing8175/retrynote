# Decisions — Frontend Remake

## Color Strategy
- Approach A: Map existing tokens to shadcn semantics, keep both during migration
- OKLCH values stored as full values in CSS vars, referenced via var(--token)

## Auth Pages
- Migrate .auth-* CSS to Tailwind utilities (Tasks 11-13), then delete dead CSS (Task 14)

## Page Decomposition
- Restyle only — no sub-component extraction from monolithic pages

## Icons
- Migrate inline SVGs to Lucide React (shadcn standard)

## Forms
- Keep manual useState, no react-hook-form
