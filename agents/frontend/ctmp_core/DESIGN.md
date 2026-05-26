---
name: CTMP Core
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
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
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1440px
  gutter: 16px
  margin-desktop: 32px
  margin-mobile: 16px
  sidebar-width: 260px
  stack-gap: 24px
  table-row-height: 48px
---

## Brand & Style
The design system is engineered for Corporate Tender Management, prioritizing high-stakes procurement workflows. The brand personality is institutional, precise, and authoritative. It targets procurement officers, legal reviewers, and enterprise vendors who require a tool that minimizes cognitive load during complex data evaluation.

The visual style is **Corporate / Modern** with a strong leaning toward **Minimalism**. It avoids all decorative flourishes to focus on information density. Reliability is conveyed through a structured grid, systematic spacing, and a restricted, high-trust color palette. The UI should feel like a high-performance utility—unobtrusive, predictable, and exceptionally organized.

## Colors
The palette is rooted in "Slate" and "Navy" tones to establish a sober, enterprise-grade environment.
- **Primary (#0F172A):** Used for navigation backgrounds, primary headings, and high-level structural elements to provide a sense of stability.
- **Secondary (#2563EB):** The "Action" color. Used for primary buttons, active states, and links.
- **Neutral (#F8FAFC):** The canvas color. Provides a crisp, clean background for data-heavy tables and forms.
- **Semantic Statuses:** These are critical for the procurement lifecycle. Use these consistently for badges and progress indicators:
    - **Draft:** Slate (Inactive/Preparation)
    - **Published:** Blue (Active/Live)
    - **Evaluation:** Amber (In-Progress/Attention)
    - **Awarded:** Emerald (Success/Completed)

## Typography
Inter is the exclusive typeface for this design system, chosen for its exceptional legibility in data-dense interfaces. 

- **Hierarchy:** Use `display-lg` sparingly for dashboard overviews. `headline-sm` and `title-lg` are the primary drivers for section headers within complex forms.
- **Data Density:** `body-md` (14px) is the standard size for table cell content and form input text to maximize the information visible on-screen.
- **Labels:** `label-sm` utilizes uppercase and a bold weight for table headers and small metadata tags to distinguish them clearly from interactive data.

## Layout & Spacing
The design system employs a **Fixed Grid** approach for the main content area to maintain document readability, while the navigation structures adapt to the portal type.

- **Admin Portal:** Uses a persistent left-hand sidebar (260px) for deep nesting of procurement stages.
- **Vendor Portal:** Uses a top-navigation bar to maximize horizontal space for document uploads and bid forms.
- **Spacing Rhythm:** Based on a 4px baseline. Use 16px (gutter) for standard separation between components and 24px (stack-gap) for vertical section spacing.
- **Data Density:** Table rows are constrained to a 48px height to ensure high visibility of line items without sacrificing touch/click targets.

## Elevation & Depth
In alignment with the professional, on-premises feel, depth is created through **Tonal Layers** and **Low-contrast outlines** rather than heavy shadows.

- **Surface Levels:** The background uses `neutral-color_hex`. Content containers (cards, table bodies) use a pure white (#FFFFFF) background with a 1px solid border (#E2E8F0).
- **Separation:** Use a subtle, light-gray border to define the sidebar and header. 
- **Active State:** Elements that are "raised" (e.g., a selected tender card or a dropdown menu) use a very soft, high-diffusion shadow: `0 4px 6px -1px rgb(0 0 0 / 0.1)`. Avoid multi-layered shadows to keep the interface feeling flat and efficient.

## Shapes
The shape language is **Soft** (4px / 0.25rem). This subtle rounding takes the edge off the high-density layout while maintaining a serious, professional appearance. 

- **Buttons & Inputs:** Use the standard 4px radius.
- **Badges/Status:** Use 4px for a "pill-block" hybrid look. Avoid full pills (100px) as they appear too casual for a legal/financial platform.
- **Large Containers:** Content areas and modals may use `rounded-lg` (8px) to provide a clear visual containment of information.

## Components
- **Tables:** The core of the platform. Use "Sticky Headers" and a light-gray hover state on rows. Columns should be sortable, with a distinct treatment for "Numeric" data (right-aligned).
- **Multi-step Steppers:** Positioned at the top of tender creation flows. Use a horizontal line with numbered circles. Completed steps should show the "Awarded" emerald color; the active step uses the "Secondary" blue.
- **Split-Pane Layouts:** In the Evaluation module, use a vertical split (30/70) where the list of bidders is on the left and the detailed bid document/scoring is on the right.
- **Status Badges:** Use a "Light Background / Dark Text" variant (e.g., Light Blue background with Dark Blue text) for better readability without overwhelming the user's eye.
- **Input Fields:** Use 1px borders (#CBD5E1). On focus, use a 1px "Secondary" blue border with a subtle 2px outer glow (ring).
- **Primary Buttons:** Solid "Secondary" blue with white text. 
- **Secondary Buttons:** Ghost style (transparent background) with a 1px border matching the primary blue.