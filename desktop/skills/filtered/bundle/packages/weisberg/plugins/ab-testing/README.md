# A/B Testing Plugin

Design, analyze, and review A/B tests with statistical rigor.

## Scope — when to use this plugin

This plugin owns the **hands-on experiment lifecycle**: designing a test, calculating
sample size and duration, analyzing results, reviewing implementation code, and writing
the readout. Reach for it whenever the work is running an actual A/B test end to end.

For neighboring intents, use a different surface instead:

- **Regulated or high-trust governance** — decision reviews beyond significance, compliance
  and conduct-risk review, experimentation operating models, program design, and calibrated
  executive/board evidence briefs — use the **experimentation** plugin. It governs; it does
  not run the sample-size or analysis math (it defers those here).
- **Scripted marketing-workspace statistics** — CUPED, SRM, sequential tests wired to the
  `workspace/` data contracts — use **marketing-analytics/experimentation**.

So: "how long should I run this test", "is B significant", "review my bucketing code",
"write the readout" → this plugin. "Is this test compliant / should we ship given the
risk / stand up our experimentation program" → the experimentation plugin.

## Installation

```
/plugin install ab-testing@agile-agentic-analytics
```

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| Design Experiment | `/ab-testing:design-experiment` | Create a structured experiment design with hypothesis, metrics, and guardrails |
| Sample Size | `/ab-testing:sample-size` | Calculate required sample size and duration |
| Analyze Results | `/ab-testing:analyze-results` | Run statistical analysis on experiment data |
| Experiment Report | `/ab-testing:experiment-report` | Generate a stakeholder-ready report |
| Review Experiment | `/ab-testing:review-experiment` | Code review focused on experimentation pitfalls |

## Agents

| Agent | Description |
|-------|-------------|
| `statistician` | Statistical analysis specialist — handles hypothesis testing, power analysis, confidence intervals, Bayesian methods |
| `experiment-auditor` | Systematic auditor — reviews design, implementation, analysis, and decisions against a comprehensive checklist |

## Typical Workflow

1. **Design** — `/ab-testing:design-experiment new checkout button color`
2. **Size** — `/ab-testing:sample-size baseline 3.2% mde 10% relative traffic 50000/day`
3. **Review** — `/ab-testing:review-experiment src/experiments/checkout_button.py`
4. _(run the experiment)_
5. **Analyze** — `/ab-testing:analyze-results` (paste data or provide file path)
6. **Report** — `/ab-testing:experiment-report`

## Built-In Defaults

The plugin uses these defaults in its skill instructions unless the user or experiment plan specifies otherwise:

| Setting | Default | Description |
|---------|---------|-------------|
| `significance_level` | 0.05 | Alpha for hypothesis tests |
| `statistical_power` | 0.80 | 1 - beta for power analysis |
| `test_sidedness` | two-sided | Default test directionality |
| `default_language` | python | Language for generated code |
| `report_audience` | technical | Report detail level (technical or executive) |

## License

MIT
