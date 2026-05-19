---
name: Enterprise Tender Interface
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
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fd'
  on-secondary-container: '#57657b'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d5e3fd'
  secondary-fixed-dim: '#b9c7e0'
  on-secondary-fixed: '#0d1c2f'
  on-secondary-fixed-variant: '#3a485c'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Work Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Work Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Work Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Work Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Work Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  gutter: 1rem
  container-padding: 2rem
  table-row-height: 48px
  split-pane-min: 400px
---

## Brand & Style

This design system is engineered for high-stakes procurement and vendor management. The brand personality is **authoritative, precise, and transparent**, prioritizing data density and functional efficiency over decorative flair. 

The aesthetic follows a **Corporate / Modern** movement, utilizing a structured layout that conveys institutional trust. It balances the "heavy" navy tones of executive reporting with a "light" and airy workspace for data entry and audit trails. The emotional response should be one of focused productivity and total oversight.

## Colors

The palette is anchored by a deep **Navy Primary**, used exclusively for navigation and primary actions to establish a clear hierarchy. 

*   **Primary (Navy):** Used for the sidebar and high-level headers.
*   **Secondary (Slate):** Used for secondary actions and iconography.
*   **Neutral:** A cool-toned gray scale for backgrounds and table borders to reduce eye strain during long sessions.
*   **Semantic Colors:** Specifically tuned for tender status:
    *   **Approved:** Vibrant green for high visibility.
    *   **Pending:** Amber to signify "caution" or "waiting."
    *   **Suspended:** High-alert red for immediate attention.
    *   **Blacklisted:** A muted, dark charcoal to signify a "dead" or inactive state, distinguishing it from active alerts.

## Typography

We use **Work Sans** across the entire system for its exceptional legibility in data-heavy environments. The typeface is grounded and professional, with a neutral tone that does not distract from technical content.

To maximize data density, the baseline body text is set to **14px**. We utilize a bold, all-caps label style for table headers and status badges to ensure clear scanning even at small sizes. Mobile typography scales down headers slightly, but preserves body sizes to maintain readability of complex tender documents.

## Layout & Spacing

The design system employs a **Fixed Sidebar / Fluid Content** model. The sidebar remains anchored at 260px to provide a consistent navigation pillar.

For Vendor Profiles, a **Split-Pane Layout** is mandatory:
1.  **Left Pane (Master):** A scrollable list or summary card of vendor vitals.
2.  **Right Pane (Detail):** A comprehensive view containing tabs for history, compliance, and active tenders.

Grid logic follows an 8px rhythm. Data tables should maintain a high-density vertical rhythm with 48px row heights to ensure a large number of records can be viewed above the fold without sacrificing click targets.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** rather than dramatic shadows. 

*   **Level 0 (Background):** The main application canvas uses a cool neutral gray.
*   **Level 1 (Surface):** White cards and table containers. Use a subtle 1px border (#E2E8F0) to define boundaries.
*   **Level 2 (Floating):** Only used for dropdowns and tooltips. Use an ambient shadow: `0px 4px 6px -1px rgba(0, 0, 0, 0.1)`.

The sidebar is treated as a "negative" depth layer, using the dark Primary Navy to pull the user's focus toward the bright, information-rich content area.

## Shapes

The shape language is **Soft (0.25rem)**. This subtle rounding maintains the "serious" architectural feel of an enterprise tool while avoiding the aggressive sharpness of legacy software. 

Buttons and input fields use the base 4px (0.25rem) radius. Status badges use a slightly higher radius (8px) to distinguish them from interactive buttons, giving them a more "pill-like" appearance without becoming fully circular.

## Components

### Status Badges
Status badges must use a subtle background tint with high-contrast text:
*   **APPROVED:** Light emerald background / Dark emerald text.
*   **PENDING:** Light amber background / Dark amber text.
*   **SUSPENDED:** Light red background / Dark red text.
*   **BLACKLISTED:** Slate-800 background / White text (High contrast, signifies finality).

### Data Tables
Tables should feature a "sticky" header row. Hover states on rows should use a very pale blue tint (#F1F5F9) to assist eye-tracking. Use vertical dividers only when data is exceptionally dense; otherwise, rely on horizontal lines.

### Inputs & Fields
Use a "Filled" style for input fields with a 1px bottom border that thickens and changes to Navy on focus. This provides a clear affordance for data entry in long forms.

### Vendor Split-Pane
The divider between panes should be draggable where possible, with a minimum width of 400px for the detail view to prevent layout breakage in complex data visualizations.