# Pipeline Metrics

Pipeline velocity definitions, stage conversion benchmarks, and coverage ratio
methodology.

## Pipeline Velocity

### Definition

Pipeline velocity measures the speed at which deals move through the sales
pipeline. It combines four components into a single metric:

```
Pipeline Velocity = (Number of Opportunities * Win Rate * Average Deal Size) / Average Sales Cycle Length
```

This produces a revenue-per-day throughput metric that captures the overall
health and momentum of the pipeline.

### Component Metrics

| Metric | Definition | Unit |
| :----- | :--------- | :--- |
| Number of Opportunities | Count of active deals in pipeline at measurement date | Count |
| Win Rate | Deals won / (Deals won + Deals lost) over measurement period | Percentage |
| Average Deal Size | Mean `amount` of won deals over measurement period | Currency |
| Average Sales Cycle Length | Mean days from `created_date` to `close_date` for won deals | Days |

### Calculation Notes

- Exclude deals still in progress from win rate and cycle length calculations.
- Use only closed deals (won or lost) for win rate. Do not include deals still
  in open stages.
- For cycle length, use won deals only. Lost deals may have artificially short
  or long cycles.
- Calculate metrics by segment (lead source, deal size tier, product line) for
  actionable insights.

## Stage Conversion Rates

### Definition

Stage conversion rate is the percentage of deals that advance from one pipeline
stage to the next.

```
Stage Conversion Rate = Deals entering stage N+1 / Deals entering stage N
```

### Standard Pipeline Stages

| Stage | Typical Conversion to Next Stage | Benchmark Range |
| :---- | :------------------------------- | :-------------- |
| Lead / MQL | 25-35% progress to SQL | 15-45% |
| SQL (Sales Qualified) | 40-50% progress to Opportunity | 30-60% |
| Opportunity Created | 50-60% progress to Proposal | 35-70% |
| Proposal / Quote | 60-70% progress to Negotiation | 45-80% |
| Negotiation | 70-85% progress to Closed Won | 55-90% |

These benchmarks vary significantly by industry, deal size, and sales motion
(self-serve vs. enterprise). Always calibrate to your own historical data.

### Period-over-Period Comparison

- Compare stage conversion rates month-over-month and quarter-over-quarter.
- Flag any stage where conversion drops more than 10 percentage points from the
  trailing 3-month average.
- A sudden drop at a specific stage often indicates a process bottleneck,
  pricing issue, or competitive pressure.

## Deal Cycle Time

### Definition

Deal cycle time is the number of days a deal spends in each pipeline stage and
overall from creation to close.

### Time-in-Stage Analysis

For each pipeline stage, compute:

| Metric | Definition |
| :----- | :--------- |
| Median time-in-stage | 50th percentile of days spent in stage (preferred over mean) |
| 75th percentile | Upper quartile; deals above this are "slow movers" |
| 90th percentile | Deals above this are outliers; investigate for stalled deals |
| Stage velocity trend | Month-over-month change in median time-in-stage |

### Outlier Identification

- Deals exceeding the 90th percentile time-in-stage are flagged as stalled.
- Stalled deal analysis: compare stalled deals' features to progressing deals
  to identify common blockers.
- Regulatory stages (compliance review, legal sign-off) should be tracked
  separately and excluded from velocity benchmarks when operating in financial
  services mode.

### Cycle Time Benchmarks by Deal Size

| Deal Size Tier | Typical Cycle (Days) | Benchmark Range |
| :------------- | :------------------- | :-------------- |
| SMB (<$10K) | 14-30 | 7-45 |
| Mid-Market ($10K-$100K) | 30-60 | 21-90 |
| Enterprise ($100K-$500K) | 60-120 | 45-180 |
| Strategic (>$500K) | 90-180 | 60-365 |

## Pipeline Coverage Ratio

### Definition

Pipeline coverage ratio compares the total weighted pipeline value to the
revenue target (quota) for a given period.

```
Coverage Ratio = Weighted Pipeline Value / Revenue Target
```

Where:

```
Weighted Pipeline Value = SUM(deal_amount * stage_probability)
```

### Stage Probability Weights

Assign conversion probabilities to each stage based on historical win rates
from that stage forward:

| Stage | Default Probability | Calibration Method |
| :---- | :------------------ | :----------------- |
| Lead / MQL | 5-10% | Historical conversion rate from MQL to Closed Won |
| SQL | 15-25% | Historical conversion rate from SQL to Closed Won |
| Opportunity | 25-40% | Historical conversion rate from Opportunity to Closed Won |
| Proposal | 40-60% | Historical conversion rate from Proposal to Closed Won |
| Negotiation | 60-80% | Historical conversion rate from Negotiation to Closed Won |

Always use your own historical stage-to-close rates rather than defaults.

### Coverage Ratio Benchmarks

| Coverage Ratio | Interpretation | Action |
| :------------- | :------------- | :----- |
| < 2.0x | Pipeline at risk; unlikely to meet target | Urgent: increase lead generation, accelerate deals |
| 2.0x - 3.0x | Healthy pipeline; standard buffer for expected losses | Monitor: maintain current pipeline generation |
| 3.0x - 4.0x | Strong pipeline; comfortable buffer | Optimize: focus on deal quality and velocity |
| > 4.0x | Overstuffed pipeline; may indicate stale deals | Clean: audit pipeline for stalled or dead deals |

### Gap Analysis

When coverage ratio is below target:

1. Calculate the revenue gap: `Target - Weighted Pipeline`.
2. Estimate the number of new deals needed: `Gap / (Average Deal Size * Win Rate)`.
3. Estimate the lead volume required: `New Deals Needed / Lead-to-Opportunity Rate`.
4. Project timeline: can the gap be closed within the period given current
   pipeline generation rates?

## Reporting Cadence

| Metric | Recommended Frequency | Audience |
| :----- | :-------------------- | :------- |
| Pipeline coverage ratio | Weekly | Sales leadership, RevOps |
| Stage conversion rates | Monthly | Sales management, marketing |
| Deal cycle time | Monthly | Sales ops, process improvement |
| Pipeline velocity (composite) | Quarterly | Executive team |
| Win/loss analysis | Quarterly | Product, marketing, sales leadership |

## Data Quality Requirements

- `created_date` and `close_date` must be populated for all closed deals.
- Stage history (date entered, date exited) is required for time-in-stage
  analysis. If unavailable, use stage snapshots.
- Deal `amount` should reflect the final value for won deals and the last
  known value for lost deals.
- Exclude test/sandbox deals from all calculations.
- Remove duplicate records before computing metrics.
