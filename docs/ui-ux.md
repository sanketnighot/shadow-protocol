## UI/UX Design For SHADOW Protocol

This document describes the **current** design language and UX direction for the repo as it exists today, not an abstract future concept.

---

## Design Principles

The product is optimized for a desktop-native operating environment, not a lightweight browser dapp aesthetic.

### Core principles

1. **Privacy-first by feel**  
   The interface should feel controlled, local, and deliberate.

2. **Clarity over spectacle**  
   Finance, approvals, and execution state should be easy to parse quickly.

3. **Human-in-the-loop trust**  
   The user should always understand what the agent wants to do and what has or has not actually executed.

4. **Compact desktop density**  
   The UI should stay tight, efficient, and information-rich without becoming noisy.

5. **Shared system patterns over one-off screens**  
   Reuse shell behavior, spacing, approval patterns, and card treatments across features.

---

## Actual App Shell

The current application shell is centered around:

- a **minimal top bar**
- a **scrolling content area**
- a **fixed bottom dock**
- floating overlays for activity, approvals, command palette, onboarding, and modals

### Layout model

```text
Top Bar
  -> SHADOW mark
  -> session indicator
  -> command palette trigger

Main Content
  -> routed page content
  -> agent page gets full-height treatment

Bottom Dock
  -> primary app navigation

Global Overlays
  -> activity bell
  -> toasts
  -> approval modal
  -> unlock dialog
  -> onboarding
  -> Ollama setup
```

### Navigation pattern

Primary navigation lives in the **bottom dock**, not a persistent left sidebar.

Current top-level destinations:

- Home
- Agent
- Auto AI
- Builder
- Auto
- Apps
- Market
- Portfolio
- Account

There is still a legacy `Sidebar` component in the repo, but the main application chrome is dock-first.

---

## Visual Language

The current styling system is dark-first, sharp-edged, and compact.

### Tone

- understated
- operator-like
- minimal
- slightly futuristic
- not playful or cartoonish

### Surface treatment

- dark backgrounds
- subtle glass panels
- low-contrast thin borders
- restrained blur
- minimal shadow usage
- high text contrast

### Component shape

- mostly **small radii**
- tight paddings
- compact tool and action controls
- strong preference for flat, low-noise composition

---

## Color System

The active token system is defined in `src/styles/design-tokens.css`.

### Dark theme

```css
--bg-primary: #000000;
--bg-secondary: #09090b;
--bg-tertiary: #18181b;
--bg-elevated: rgba(9, 9, 11, 0.9);

--accent-purple: #8b5cf6;
--accent-blue: #3b82f6;
--accent-green: #059669;
--accent-amber: #d97706;
--accent-red: #dc2626;

--text-primary: #f8fafc;
--text-secondary: #94a3b8;
--text-tertiary: #64748b;
```

### Light theme

The app also supports a light theme through `html[data-theme="light"]`, but dark remains the dominant design mode and should remain the reference when designing new surfaces.

### Usage guidance

- use **purple** as the primary identity/action accent
- use **green** for positive/confirmed states
- use **amber** for warning/caution states
- use **red** for destructive/failure states
- avoid adding bright accent colors that compete with the purple system

---

## Typography

The active token file currently uses:

- **Manrope** for primary UI text
- **JetBrains Mono** for mono text, numbers, and technical values

### Typography behavior

- large headings should stay reserved for page anchors and important status panels
- body text should remain compact
- meta text and labels often use mono or uppercase tracking for an operator-console feel
- addresses, balances, and machine-like values benefit from mono styling

---

## Motion And Interaction

Motion exists to support clarity, not decoration.

### Current interaction patterns

- route transitions use short fade/translate motion
- sheets and drawers slide in with controlled spring motion
- success feedback is brief and localized
- toasts are lightweight and non-blocking

### Rules

- keep motion short and responsive
- avoid cinematic transitions
- use animation to reinforce state changes, not to entertain
- prefer subtle reveal and confirmation patterns over looping effects

---

## Key UX Surfaces

## 1. Top Bar

The top bar should remain minimal and utility-focused.

### Current contents

- SHADOW mark
- session indicator
- command/search trigger

### Behavior

- drag area support for Tauri desktop windowing
- command palette shortcut hint
- no crowded action row

## 2. Bottom Dock

The dock is the primary navigation control.

### Design requirements

- fixed near the bottom center
- clearly highlights the active destination
- compact icon + label format
- should feel stable and always available

## 3. Agent Workspace

The agent page is one of the most important UX surfaces.

### Current structure

- optional thread sidebar/drawer
- full-height chat workspace
- bottom-anchored chat input
- inline cards for approvals, tool results, decisions, and strategy proposals

### UX goals

- keep the input anchored
- let messages scroll independently
- make agent state understandable without reading long paragraphs
- never hide approval-critical information

## 4. Portfolio

The portfolio pages should feel operational, not decorative.

### Important patterns

- filters and wallet selectors should be easy to scan
- asset rows should prioritize symbol, chain, value, and action affordances
- actions like send/swap/bridge must visually distinguish between real and preview-only flows where relevant

## 5. Strategy Builder

The strategy builder uses a pipeline-style mental model rather than a sprawling node-graph experience.

### Goals

- reduce visual chaos
- make sequence and guardrails easy to understand
- keep inspection and simulation close to the draft

## 6. Autonomous Dashboard

This surface behaves like an operations console.

### Current sections

- tasks
- health
- opportunities
- guardrails
- control panel

### UX goals

- emphasize system state and risk
- make approval bottlenecks obvious
- separate monitoring from actual execution

---

## Approval UX

Approval design is one of the most important trust surfaces in the app.

### Principles

- approvals must be explicit
- reason, action, amount, chain, and timing should be visible
- the UI must not imply execution already happened if it did not
- rejection must feel safe and normal, not hidden

### Current pattern

- agent or signal produces a pending approval
- UI opens the approval modal or inline approval surface
- user approves or rejects
- the app then shows outcome feedback

### Documentation rule

When a flow is only preview-capable, the UI copy and docs should not overstate it as fully executed.

---

## Notifications And Feedback

Current notification behavior is intentionally lightweight.

### Surfaces

- toast notifications
- floating activity bell
- approval success feedback
- panic/critical modal for severe alerts

### Guidelines

- notify users about real status transitions
- prefer route-linked notifications for actionable follow-up
- keep wording direct and specific
- avoid spammy background chatter

---

## Empty States And First-Run Experience

The app includes onboarding and setup-oriented flows rather than dropping the user into a blank shell.

### Current expectations

- onboarding helps establish agent memory/persona/setup
- Ollama setup is surfaced when the local AI environment is incomplete
- wallet empty states should point clearly to create/import actions

### Guidance

- empty states should be helpful, not verbose
- they should reduce confusion without inventing fake capability

---

## Accessibility And Usability

### Baseline expectations

- keyboard access should remain functional
- `Cmd+K` / `Ctrl+K` command palette behavior should stay reliable
- focus states should remain visible
- information should not depend on color alone
- text density should remain readable despite the compact design

### Desktop-specific considerations

- drag regions must not interfere with interactive controls
- modal and sheet interactions should feel native in a desktop app context

---

## Component Guidance

### Preferred base

- shadcn/ui primitives
- Tailwind utility styling
- shared app tokens from `design-tokens.css`

### Custom components that define the brand

- `Dock`
- `MinimalTopBar`
- `ApprovalModal`
- `ActivityBell`
- `SessionIndicator`
- `AgentMessage`
- `ThreadSidebar`
- `StrategyPipelineView`
- `PortfolioChart`

### Rules for new components

- keep responsibilities narrow
- prefer composition over giant all-in-one panels
- avoid introducing alternate visual systems for a single page
- match the compact spacing and radius system already in use

---

## What To Avoid

- large rounded consumer-fintech cards that clash with the current shell
- bright multi-accent color systems
- oversized typography
- floating controls that duplicate dock or top-bar responsibilities
- buried approval details
- UI copy that implies unsupported execution capability
- page-specific themes that break the global app identity

---

## Current UX Direction In One Sentence

SHADOW should feel like a compact, trustworthy desktop operations console for privacy-first DeFi, where the user always knows what the system is thinking, what is actually possible, and what still requires their approval.

