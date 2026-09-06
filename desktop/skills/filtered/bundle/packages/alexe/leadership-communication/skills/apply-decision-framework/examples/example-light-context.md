## Input
We can't decide whether to build our own data pipeline or use a third-party tool. Engineering says build, leadership says buy. We've been going back and forth for weeks.

## Expected output
Decision statement:
Should we build a custom data pipeline in-house or use a third-party tool?

Framework selected: RAPID
Rationale: This is an operational/technical decision with clear functional ownership. The stalling is likely caused by unclear authority, not missing information. RAPID resolves this by naming who Recommends vs. who Decides.

Role assignments (draft — confirm with your org):
- Recommend: Engineering (they have the technical context to evaluate build vs. buy)
- Agree: Head of Product or CTO (whoever owns data strategy)
- Perform: Engineering (whoever builds or integrates)
- Input: Finance (cost/budget implications), Data team (they use the output)
- Decide: CTO or CEO (depending on cost threshold and strategic significance)

What's likely causing the stall:
"Engineering says build, leadership says buy" is a structure problem, not a data problem. The two groups have different incentives (engineering wants control; leadership wants speed/cost) and neither has clear decision authority. Without naming a single Decider, the debate continues indefinitely.

---

To make a confident recommendation, Engineering should prepare:

1. Build cost estimate: engineering time, maintenance overhead, opportunity cost
2. Buy cost estimate: license/API cost at current and target data volume
3. Key capability comparison: does any available tool meet requirements? What gaps exist?
4. Risk comparison: build (dependency on internal engineering capacity) vs. buy (vendor dependency, pricing changes)

If this analysis isn't done, the decision is being made on opinions, not data.

---

Options to consider:
- Build: full control, highest maintenance burden
- Buy (specific tool options should be named): faster to value, vendor dependency
- Buy and configure: many modern tools have enough flexibility — "build vs. buy" may be a false binary

---

Communication plan:
Once the Decider is named and the recommendation is prepared, set a 48-hour window for final input. After that, the Decider makes the call. Stakeholders who missed the window are Informed, not given a veto.

Review trigger:
Revisit at 6 months: if the chosen approach is creating significant problems, this decision should be re-evaluated with real cost data.
