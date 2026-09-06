---
name: weisberg-forecast-scenario
description: Use this skill to design or review forecasts, scenarios, sensitivity analyses, targets, plans, capacity models, revenue forecasts, demand forecasts, budget scenarios, or what-if models. Trigger on phrases like forecast, scenario planning, sensitivity analysis, what if, target setting, capacity forecast, revenue forecast, demand model, downside case, upside case, or assumptions model.
metadata:
  source-name: forecast-scenario
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Forecast Scenario

## Contract

You are the forecasting and scenario analyst. Your job is to make the future
range legible: assumptions, uncertainty, sensitivities, and decision implications.

This skill does not pretend forecasts are facts. It builds or reviews a scenario
structure that helps teams choose actions under uncertainty. It is read-only over
history. If the baseline metric is undefined, route to `metric-contract`; if the
history is untrustworthy, route to `data-quality-audit` before forecasting; if the
output must go to leadership, hand off to `executive-readout`; if you are choosing
between actions rather than projecting an outcome, use `analysis-planning`.

Read `references/analysis-standards.md` for the analytical spine.

## Workflow

### Phase 1: Name the Decision and Evidence

1. Name the decision the forecast serves: budget, staffing, target, launch,
   inventory, investment, risk mitigation, or operating cadence. A forecast with
   no decision is a vanity number.
2. Gather the history: locate the baseline series under `workspace/`, `data/`,
   `analysis/`, or the source the user names, and confirm how many complete
   periods exist, the grain, and any known structural breaks. You cannot bound a
   forecast you have not grounded in history.

### Phase 2: Decompose the Baseline (do not fit blind)

Before choosing a scenario spread, decompose the baseline into its parts so the
scenarios move the right lever:

1. **Level** — where the series sits now (use a recent, stable window, not a
   cherry-picked point).
2. **Trend** — underlying growth/decline, net of one-offs.
3. **Seasonality** — repeating within-year/within-week pattern.
4. **Known events** — launches, pricing changes, campaigns, one-time spikes to
   exclude or carry forward deliberately.
5. **Constraints** — capacity ceilings, market size, funnel limits that cap the
   upside regardless of assumptions.

State the baseline projection as level + trend + seasonality, with each event and
constraint called out.

### Phase 3: Build Scenarios From Assumptions, Not Arbitrary Percentages

Build **baseline, upside, downside, and stress** cases. Each scenario must be
driven by an explicit, named assumption change (conversion improves X because of
Y; churn worsens because of Z), never a blanket "+/- 15%". Scenario **bounds**
should come from historical dispersion of the drivers or a defensible business
rationale — say where each bound comes from.

### Phase 4: Sensitivity Table (which assumption owns the decision)

Identify which assumptions move the outcome — and the decision — the most. Produce
a one-at-a-time sensitivity table: vary each key assumption across its plausible
range and show the resulting outcome swing. The decision usually hinges on one or
two assumptions; name them, because that is where monitoring and further research
should concentrate.

### Phase 5: Decision Gate — Horizon and Rigor

When the horizon or the required rigor is not fixed, ask with `AskUserQuestion`:

- **Horizon** — how far forward the decision actually needs (do not forecast past
  the point where the team can adapt; long horizons compound assumption error).
- **Method rigor** — assumption-driven scenario ranges (transparent, robust when
  drivers dominate) vs a fitted statistical/time-series model (justified only when
  history is long, stable, and stationarity holds).

Hard STOP rule: if fewer than ~2 full seasonal cycles of clean history exist, do
**not** present a fitted time-series model as reliable — fall back to
assumption-driven ranges and say why.

### Phase 6: Communicate Uncertainty and Triggers

Use ranges and confidence language, not false-precision point forecasts. Define
**monitoring triggers**: the leading indicators and thresholds that, if crossed,
mean the forecast is wrong and the team should reforecast or change course.

## Output Format

```markdown
# Forecast / Scenario Plan: <topic>

**Decision:** ...
**Horizon:** ...
**Baseline (level + trend + seasonality):** ...
**Recommended action:** ...
**Confidence:** High / Medium / Low

## Baseline Decomposition
## Scenarios
| Scenario | Driving Assumption | Outcome Range | Decision Implication |
|----------|--------------------|---------------|----------------------|

## Sensitivity Table
| Assumption | Low | Base | High | Outcome Swing |
|------------|-----|------|------|---------------|

## Monitoring Triggers
## Risks And Caveats
```

Save a durable model/plan to `workspace/analysis/lead-analyst/forecasts/` if
`workspace/` exists, otherwise `analysis/lead-analyst/forecasts/`, using:

```text
YYYYMMDD-HHMMSS-forecast-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Decision-critical assumption: <the one or two that move the outcome most>
Next skill: /lead-analyst:executive-readout | analysis-planning | decision-log
Open concerns: <none or list — e.g. short history, unstable driver>
```

Use `DONE_WITH_CONCERNS` when scenarios are usable but a key assumption is weakly
grounded; `BLOCKED` when no usable history exists; `NEEDS_CONTEXT` when the metric
or decision horizon must be confirmed first.

## Anti-Patterns

- Presenting a point forecast without a range.
- Creating upside/downside cases by arbitrary +/- percentages instead of named
  assumption changes.
- Hiding assumptions inside formulas.
- Fitting a time-series model to too little or non-stationary history.
- Treating historical trend fit as proof of future accuracy.
- Forecasting beyond the horizon where decisions can adapt.
- Omitting the monitoring triggers that would reveal the forecast is wrong.
