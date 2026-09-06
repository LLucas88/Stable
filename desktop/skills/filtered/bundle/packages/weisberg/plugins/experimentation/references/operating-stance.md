# Operating Stance — Three-Layer "Search Before Building"

This is the plugin-local statement of the three-layer stance that every
experimentation skill's operating loop refers to. It exists so the citation
resolves inside the installed plugin (the repo's `docs/` tree is not shipped
with a marketplace install).

The stance governs how a skill sources a method, tool, or process before
inventing one. Prefer the earliest layer that answers the question, and move
outward only when the prior layer genuinely does not.

## Layer 1 — Tried and true (start here)

Reach first for local artifacts and established practice:

- Local material: existing experiment plans, prior readouts, the notebook source
  map, decision logs, and workspace contracts already in the repo.
- Established statistical methods and existing platform primitives (the
  experimentation platform's assignment, logging, power, and analysis features).
- Built-in tooling and vetted scripts over bespoke process.

Use established experiment infrastructure over custom work whenever it meets the
requirement.

## Layer 2 — Current common practice (scrutinize)

When Layer 1 does not answer the question, adopt current common practice — but
scrutinize it for hype and footguns before relying on it. Name the assumption
you are importing and why it fits this decision.

## Layer 3 — First principles (justify)

When convention fails or contradicts the situation, reason from first
principles: state the causal, statistical, or operational reason the
conventional answer is wrong here. When first-principles reasoning overturns
convention for a specific reason, flag the insight as a "eureka" and record it
so future sessions inherit it.

## Applied posture

Evidence-first and calibrated: ground conclusions in inspected artifacts before
asserting them, prefer the least-custom option that satisfies the requirement,
and pause at real decision gates rather than guessing.
