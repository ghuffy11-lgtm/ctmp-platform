---
name: Corporate Tender Management Design System
colors:
  surface: '#faf9fc'
  surface-dim: '#dad9dd'
  surface-bright: '#faf9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f7'
  surface-container: '#eeedf1'
  surface-container-high: '#e9e7eb'
  surface-container-highest: '#e3e2e6'
  on-surface: '#1a1c1e'
  on-surface-variant: '#43474e'
  inverse-surface: '#2f3033'
  inverse-on-surface: '#f1f0f4'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#455f87'
  primary: '#022448'
  on-primary: '#ffffff'
  primary-container: '#1e3a5f'
  on-primary-container: '#8aa4cf'
  inverse-primary: '#adc8f5'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#341f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#503300'
  on-tertiary-container: '#c69b5f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#adc8f5'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#2d486d'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#ffddb2'
  tertiary-fixed-dim: '#edbf7f'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#60410c'
  background: '#faf9fc'
  on-background: '#1a1c1e'
  surface-variant: '#e3e2e6'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 260px
  container-padding: 2rem
  gutter: 1.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 1.5rem
---

## Brand & Style
The design system is engineered for the Corporate Tender Management Platform (CTMP), prioritizing high-density information architecture, institutional trust, and procedural clarity. The brand personality is authoritative yet enabling, designed to support procurement professionals through complex, multi-stage workflows.

The visual style follows a **Corporate / Modern** aesthetic. It utilizes a structured layout, a restrained but purposeful color palette, and refined micro-interactions to manage cognitive load. The interface emphasizes functional utility, ensuring that critical data points—such as tender deadlines, evaluation scores, and compliance statuses—are immediately legible and organized.

## Colors
The palette is anchored by a deep **Navy Primary** used for structural elements like the sidebar to provide a sense of stability and permanence. The **Blue Accent** is reserved for primary actions, active states, and interactive focal points.

A neutral foundation of **Light Gray Backgrounds** and **White Surfaces** creates a layered environment that distinguishes navigation from content. To support enterprise decision-making, a rigorous semantic color system is employed for status-based coding (e.g., "Under Review," "Awarded," "Disqualified"), ensuring consistency across all tender stages.

## Typography
This design system utilizes **Inter** for its exceptional legibility in data-heavy environments and its neutral, professional character. The type scale is optimized for high-density layouts, favoring slightly smaller base sizes (14px/13px) to maximize the visible data in tables and dashboards without sacrificing readability.

Hierarchy is established through weight and color rather than excessive size. Headlines use a tighter letter-spacing for a more modern, "locked-in" feel, while labels use subtle uppercase styling to differentiate metadata from primary content.

## Layout & Spacing
The layout follows a **Fixed-Fluid model**. A fixed 260px sidebar provides persistent navigation, while the main content area utilizes a fluid 12-column grid. This allows the platform to adapt to various screen widths while maintaining a structured alignment for complex forms and data tables.

Spacing is based on an 8px (0.5rem) linear scale. High-density views (like Technical Evaluation tables) should utilize the smaller end of the scale (8px-12px) to minimize scrolling, while landing dashboards use more generous margins (24px-32px) to provide visual breathing room between metric cards.

## Elevation & Depth
Visual hierarchy is achieved through **Tonal Layers** and **Ambient Shadows**. The sidebar sits at the lowest elevation, acting as a grounding element. Main content cards use a "Surface" elevation—defined by a white fill, a subtle 1px border (#e2e8f0), and a soft, low-opacity shadow to indicate interactability.

- **Level 0 (Background):** #f8fafc - No shadow.
- **Level 1 (Cards/Tables):** White - 1px border, 4px blur, 2% opacity black shadow.
- **Level 2 (Dropdowns/Modals):** White - 1px border, 12px blur, 8% opacity black shadow.

Avoid heavy blurs or vibrant glows to maintain the professional, institutional tone.

## Shapes
The design system employs a **Rounded** shape language with a base radius of 8px (0.5rem). This softening of corners balances the rigid, grid-heavy nature of enterprise software, making the platform feel modern and accessible without losing its professional edge.

- **Components (Buttons, Inputs, Cards):** 8px (0.5rem)
- **Status Chips & Tags:** 16px (1rem) for a distinct pill shape that separates status indicators from interactive buttons.
- **Containers:** Large surface areas (like the main content container) may use 12px (0.75rem) for a more pronounced "frame" effect.

## Components

### Sidebar & Navigation
The sidebar uses the Primary Navy (#1e3a5f) background. Nav items feature refined, 20px stroke icons (2px weight) with a 12px gap between icon and text. The active state is indicated by a subtle blue vertical bar on the left edge and a low-opacity white background overlay.

### Data Tables
Tables are the core of this design system. They must feature:
- Sticky headers for long tender lists.
- 12px font size for row data to increase density.
- Subtle row borders (#f1f5f9) rather than Zebra striping.
- Status chips with high-contrast text and low-opacity backgrounds.

### Buttons & Actions
- **Primary:** Solid Blue (#2563eb) with white text.
- **Secondary:** White surface with Navy border and text.
- **Ghost:** For low-priority sidebar actions (e.g., "Collapse").

### Input Fields
Inputs use a white background with a 1px border (#cbd5e1). The active state triggers a 2px Blue (#2563eb) ring. Labels are consistently placed above the input field using the `label-md` typography style.

### Status Indicators
Status chips use semantic coloring for immediate recognition:
- **Success (Awarded):** Green background (10% opacity) + Green text.
- **Warning (Pending):** Amber background (10% opacity) + Amber text.
- **Error (Rejected):** Red background (10% opacity) + Red text.