# ADR 0020: Paint-only feedback transitions and virtualized motion

## Status

Accepted on 2026-09-23 by operator decision; amends ADR 0005 only where stated.

## Context

ADR 0005 allows only transform and opacity to animate. Direct-feedback states
therefore snap: hover, pressed, selected, and done colours change in one frame,
which reads as abrupt next to the transform-based press scale. Plan 041 applies
the Lavender foundation to buttons, rows, chips, and toggles, and those states
need a short, interruptible colour change to feel continuous. A colour
transition does not move anything, changes no layout, and retargets from the
current presented colour when interrupted.

## Decision

1. Only transform and opacity animate spatially. Direct-feedback state changes
   (hover, pressed, selected, done) may transition `background-color`,
   `border-color`, and `color` with `--motion-duration-direct` and
   `--motion-easing-direct`. Such transitions never use `transition: all`, are
   never combined with layout properties, and are instant under keyboard
   modality and reduced motion.
2. A one-row new-Note acknowledgement may fade an opacity-only tint over the
   surface duration.
3. Per-frame React state stays rejected for animation and gesture state. List
   virtualization owns row placement and is exempt from the motion profiles.
4. Row height snaps on expansion by design; animating it needs a new ADR.

Every other ADR 0005 invariant remains authoritative: feedback begins on
pointer or key down, motion is interruptible and never locks input, and
reduced motion removes spatial travel.

## Consequences

- Buttons, rows, Tag chips, Attachment counts, toggles, and status dots may
  blend their feedback colours; keyboard activation stays instant.
- Tests reject `transition-all` rather than any colour transition.
- A future layout animation, including editor height, still needs its own ADR.

## Revisit when

Revisit if a paint transition measurably delays perceived feedback on a
supported platform, or if the motion tokens change their direct-feedback
duration.
