# Issues — Frontend Remake

## Known Risks
- R1: OKLCH + shadcn alpha-value incompatibility — use var(--primary) directly
- R2: Tailwind v3 vs v4 confusion — ONLY v3 patterns allowed
- R5: Build breakage during migration — Wave 1 must be atomic, verify after each step
- R7: Animation preservation — 8 keyframes + stagger delays must survive CSS restructuring
