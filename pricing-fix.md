# Pricing Page Design Report & Fix Guidance

## 1. Design Report

The current pricing page suffers from **layout collisions** (header overlapping content) and **weak visual rhythm**. While the dark theme and teal accents align with the brand, the information density is too high, and the "Standard" plan—the primary conversion target—doesn't feel sufficiently distinguished. The "Credit Purchase" cards also lack stylistic cohesion with the main pricing table, creating a fragmented user experience.

---

## 2. Full Fix Guidance

### **PROBLEM**
1.  **Header Collision:** The fixed navigation bar overlaps the pricing table, obscuring content and making the interface feel broken.
2.  **Dense Information Architecture:** The pricing table is cramped, with tight vertical spacing that makes comparing features difficult.
3.  **Inconsistent CTA Hierarchy:** "Lite" and "Standard" plans use different button styles and labels, diluting the primary action.
4.  **Style Fragmentation:** The "Credit Purchase" section at the bottom uses thin-outline cards that don't match the solid, professional feel of the main pricing section.
5.  **Flat Hierarchy:** The "Standard" (Most Popular) plan is highlighted with a simple border but lacks the "pop" needed to drive conversions.

### **FIX**
1.  **Header Integration:**
    *   Apply a `backdrop-filter: blur(12px)` and a subtle bottom border (`oklch(0.28 0.01 250)`) to the header.
    *   Ensure the main content has sufficient `padding-top` to clear the fixed header.
2.  **Table Refinement:**
    *   Increase row padding to `1.5rem` or `2rem` for better breathing room.
    *   Use `oklch` for subtle alternating row backgrounds: `oklch(0.18 0.01 250)` for odd rows.
    *   Standardize all CTAs to a single verb (e.g., "시작하기") but use the solid teal button (`oklch(0.65 0.15 175)`) exclusively for the "Standard" plan.
3.  **Elevation & Focus:**
    *   Lift the "Standard" column with a slight scale (`scale: 1.02`) and a more prominent badge using the `Success` color (`oklch(0.72 0.18 160)`).
    *   Apply a subtle outer glow (box-shadow) to the Standard plan using the primary teal color at low opacity.
4.  **Cohesive Credit Cards:**
    *   Transform the Credit Purchase cards into "Surface" cards (`oklch(0.20 0.01 250)`) with the same corner radius and padding as the pricing table.
    *   Use the `Light` teal (`oklch(0.75 0.12 175)`) for the price highlights.
5.  **Fluid Typography:**
    *   Use `clamp(1.5rem, 4vw, 2.5rem)` for the main heading to ensure it feels "heroic" on desktop while remaining readable on mobile.

### **WHY**
*   **Reduced Cognitive Load:** Increased spacing and clear hierarchy allow users to process pricing tiers faster without feeling overwhelmed.
*   **Improved Conversion:** By visually elevating the "Standard" plan, we nudge users toward the target tier through "Environmental Design" rather than just a "Popular" tag.
*   **Brand Trust:** Fixes like the header overlap and stylistic cohesion signal professional quality, which is critical when asking users for payment.
*   **Learning Focus:** Aligning with the "Calm" brand personality, the refined UI reduces visual noise, helping learners make a quick, stress-free decision before getting back to their studies.
