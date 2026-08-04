# ADR 0005: Fluid desktop motion

## Status

Accepted for desktop interaction design. ADR 0011 removes product surfaces used
by some examples but preserves these motion, material, and accessibility
invariants for the single shelf and expanded editor.

## Context

Charon is keyboard-first and interruption-heavy. Delayed feedback, fixed
keyframes, input locks, or animations that restart from stale endpoints would
make capture and bulk editing feel slower and less trustworthy. The shared theme
package must describe motion consistently without gaining a React runtime.

## Decision

The following invariants apply to desktop motion:

- Feedback begins on pointer or key down. Visible response targets one frame and
  is never deferred to click-only acknowledgement.
- Direct manipulation tracks 1:1 and respects the grab offset. On release it may
  project momentum and hand measured velocity into a spring. Non-gesture UI
  defaults to critical damping with no decorative bounce.
- Every animation is interruptible. It retargets from the current presentation
  value, carries compatible velocity, and never restarts from a stale endpoint.
  Input is never locked while motion finishes.
- Entrances and exits use symmetric paths with an origin related to their
  trigger. Reversing the state reverses that spatial relationship.
- Rubber-banding is visual only. If a later direct gesture genuinely needs it,
  roughly 10px of hysteresis is required before the gesture changes state.
- Translucent material is reserved for navigation or transient floating layers,
  never stacked decoration. Reduced transparency and increased contrast use
  solid, clearly bounded fallbacks.
- Reduced motion preserves hierarchy through instant state changes and short
  opacity fades. It removes spatial travel, momentum, and decorative bounce.
- Only transform and opacity animate in accepted runtime patterns.

Motion's React runtime stays inside `apps/desktop`. `packages/theme` may export
CSS custom properties, semantic preference defaults, profile names, and media
query defaults only. It may not export Motion components, hooks, React helpers,
or gesture state.

Use three profiles rather than per-component magic numbers:

| Profile | Purpose | Contract |
| --- | --- | --- |
| Direct feedback | Press, key activation, drag contact | Begins immediately, follows input continuously, and has no delayed acknowledgement. |
| Surface transition | Panel, popover, editor, selection state | Critically damped, origin-aware, symmetric, interruptible, and retargeted from the live value. |
| Gesture release | A future proved drag or swipe | Inherits measured velocity, projects the endpoint, may use restrained momentum, and remains grabbable during settling. |

New interaction patterns require review in slow motion and with a mid-animation
reversal before acceptance. Review also covers reduced motion, reduced
transparency, increased contrast, keyboard activation, and input during motion.

Timers must not model gesture state. Reject `transition: all`, raw scroll
listeners, fixed keyframe timelines for interruptible behavior, animation input
locks, and React state updated on every pointer or scroll frame.

## Consequences

- Interactions remain responsive to changing intent and communicate spatial
  relationships consistently.
- The desktop owns a small motion runtime and review discipline.
- Shared tokens keep naming consistent without coupling Astro to React.
- Implementers must measure gesture velocity and preserve live presentation
  state where direct manipulation is introduced.
- Reduced-preference behavior is part of each interaction, not a later polish
  pass.

## Revisit when

Revisit when a platform-native animation primitive replaces Motion without
losing interruption and velocity handoff, when user testing rejects a profile,
or when a new input modality needs a fourth genuinely distinct behavior. Do not
add a profile only to preserve component-specific timing.
