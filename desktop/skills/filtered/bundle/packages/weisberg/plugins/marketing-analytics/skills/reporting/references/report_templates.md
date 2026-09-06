# Report Template Configurations

Template definitions for recurring and ad-hoc marketing analytics reports.
Each template specifies layout, required sections, data sources, and output
format options.

## Template Schema

Every template follows this structure:

```yaml
template_id: string          # Unique identifier
display_name: string         # Human-readable name
cadence: weekly | monthly | quarterly | ad-hoc
default_format: html | xlsx | pptx | docx
sections: list[Section]      # Ordered list of report sections
data_sources: list[string]   # Skill output files to consume
time_range: RelativeRange    # Default lookback window
comparison: string           # Default comparison period (e.g., "previous_period")
```

## Weekly Performance Snapshot

```yaml
template_id: weekly_snapshot
display_name: "Weekly Marketing Performance Snapshot"
cadence: weekly
default_format: html
time_range:
  lookback_days: 7
  granularity: daily
comparison: previous_week
sections:
  - id: executive_summary
    title: "Executive Summary"
    type: narrative
    description: >
      3-5 sentence overview of the week's performance, highlighting the top
      positive and negative movers. Auto-generated from insight engine.
    data_sources:
      - scripts/generate_insights.py

  - id: kpi_scorecard
    title: "KPI Scorecard"
    type: table
    description: >
      Top-line KPIs with current value, week-over-week change, and
      target attainment percentage. Color-coded red/amber/green.
    metrics:
      - total_spend
      - blended_roas
      - total_conversions
      - cost_per_acquisition
      - website_sessions
      - email_engagement_rate
      - pipeline_value
    data_sources:
      - workspace/analysis/paid_media_summary.json
      - workspace/analysis/web_analytics_summary.json
      - workspace/analysis/email_analytics_summary.json
      - workspace/analysis/crm_summary.json

  - id: channel_performance
    title: "Channel Performance"
    type: chart_group
    description: >
      Daily spend and ROAS by channel as a time series, plus a bar chart
      of channel-level conversion volume.
    charts:
      - chart_type: time_series
        metrics: [spend, roas]
        group_by: channel
      - chart_type: bar
        metrics: [conversions]
        group_by: channel
    data_sources:
      - workspace/analysis/paid_media_summary.json

  - id: experiment_updates
    title: "Experiment Updates"
    type: table_with_narrative
    description: >
      Status of active experiments with sample sizes, observed lift,
      and statistical significance. Narrative note for any experiments
      that reached significance this week.
    data_sources:
      - workspace/analysis/experiment_results.json

  - id: top_insights
    title: "Key Insights & Recommended Actions"
    type: narrative_list
    description: >
      Priority-ranked list of 5-7 insights with recommended next steps.
      Each insight cites the specific metric, change magnitude, and time frame.
    data_sources:
      - scripts/generate_insights.py

data_sources:
  - workspace/analysis/paid_media_summary.json
  - workspace/analysis/web_analytics_summary.json
  - workspace/analysis/email_analytics_summary.json
  - workspace/analysis/crm_summary.json
  - workspace/analysis/experiment_results.json
```

## Monthly Deep-Dive

```yaml
template_id: monthly_deep_dive
display_name: "Monthly Marketing Deep-Dive"
cadence: monthly
default_format: html
time_range:
  lookback_days: 30
  granularity: daily
comparison: previous_month
sections:
  - id: executive_summary
    title: "Executive Summary"
    type: narrative
    description: >
      One-page narrative summarizing the month's performance against targets,
      budget utilization, and strategic progress. Includes YTD context.

  - id: kpi_scorecard
    title: "KPI Scorecard"
    type: table
    description: >
      Full KPI table with MTD actuals, targets, variance, and MoM trend.
    metrics:
      - total_spend
      - blended_roas
      - total_conversions
      - cost_per_acquisition
      - website_sessions
      - bounce_rate
      - email_engagement_rate
      - pipeline_value
      - customer_lifetime_value
      - nps_score

  - id: attribution_analysis
    title: "Channel Attribution & MMM Results"
    type: chart_group
    description: >
      MMM contribution decomposition waterfall, channel-level marginal ROAS
      curves, and budget allocation recommendations.
    charts:
      - chart_type: waterfall
        metrics: [attributed_revenue]
        group_by: channel
      - chart_type: scatter
        metrics: [spend, incremental_revenue]
        group_by: channel
    data_sources:
      - workspace/analysis/attribution_results.json

  - id: funnel_analysis
    title: "Conversion Funnel Analysis"
    type: chart_group
    description: >
      End-to-end funnel visualization with stage-by-stage conversion rates
      and drop-off analysis. Month-over-month comparison overlay.
    charts:
      - chart_type: funnel
        metrics: [stage_volume, conversion_rate]
    data_sources:
      - workspace/analysis/funnel_analysis.json

  - id: audience_segments
    title: "Audience Segment Performance"
    type: table_with_charts
    description: >
      Segment-level performance table with CLV distribution box plots
      and migration heatmap.
    charts:
      - chart_type: heatmap
        metrics: [segment_migration_rate]
      - chart_type: box
        metrics: [predicted_clv]
        group_by: segment
    data_sources:
      - workspace/analysis/segmentation_results.json
      - workspace/analysis/clv_model_output.json

  - id: competitive_landscape
    title: "Competitive Landscape"
    type: narrative_with_charts
    description: >
      Share of voice trends, competitor benchmark comparisons, and market
      positioning changes.
    data_sources:
      - workspace/analysis/competitive_intel.json

  - id: experiment_portfolio
    title: "Experiment Portfolio Review"
    type: table_with_narrative
    description: >
      All experiments run during the month with outcomes, learnings,
      and pipeline of upcoming tests.
    data_sources:
      - workspace/analysis/experiment_results.json

  - id: recommendations
    title: "Strategic Recommendations"
    type: narrative_list
    description: >
      Prioritized list of 8-12 recommendations with expected impact
      estimates and suggested owners.

data_sources:
  - workspace/analysis/*.json
```

## Quarterly Business Review

```yaml
template_id: quarterly_business_review
display_name: "Quarterly Business Review (QBR)"
cadence: quarterly
default_format: pptx
time_range:
  lookback_days: 90
  granularity: weekly
comparison: previous_quarter
sections:
  - id: title_slide
    title: "Marketing QBR"
    type: title
    description: >
      Title slide with quarter label, date range, and prepared-by attribution.

  - id: executive_summary
    title: "Quarter in Review"
    type: narrative
    description: >
      2-3 slide executive summary covering performance against OKRs,
      budget efficiency, and strategic milestones achieved.

  - id: financial_summary
    title: "Financial Summary"
    type: table_with_charts
    description: >
      Budget vs. actuals table, spend by channel waterfall, and ROAS
      trend across the quarter.
    charts:
      - chart_type: waterfall
        metrics: [budget, actual_spend]
        group_by: channel
      - chart_type: time_series
        metrics: [blended_roas]
        granularity: weekly

  - id: channel_deep_dives
    title: "Channel Deep-Dives"
    type: repeating_section
    repeat_by: channel
    description: >
      One slide per major channel with performance metrics, key wins,
      and optimization opportunities.

  - id: clv_cohort_analysis
    title: "Customer Lifetime Value & Cohort Trends"
    type: chart_group
    description: >
      CLV distribution shifts, cohort retention curves, and segment
      migration analysis.
    data_sources:
      - workspace/analysis/clv_model_output.json
      - workspace/analysis/segmentation_results.json

  - id: experiment_learnings
    title: "Experiment Learnings"
    type: narrative_list
    description: >
      Summary of all experiments completed in the quarter with key
      learnings and cumulative incremental impact.

  - id: next_quarter_plan
    title: "Next Quarter Plan"
    type: narrative
    description: >
      Proposed budget allocation, planned experiments, and strategic
      priorities for the upcoming quarter.

  - id: appendix
    title: "Appendix"
    type: data_tables
    description: >
      Detailed data tables for all metrics referenced in the presentation.

data_sources:
  - workspace/analysis/*.json
```

## Ad-Hoc Analysis Report

```yaml
template_id: ad_hoc_analysis
display_name: "Ad-Hoc Analysis Report"
cadence: ad-hoc
default_format: html
time_range:
  lookback_days: null  # Specified at runtime
  granularity: null    # Specified at runtime
comparison: null       # Specified at runtime
sections:
  - id: context
    title: "Analysis Context"
    type: narrative
    description: >
      Brief description of the question being investigated, the hypothesis,
      and the analytical approach taken.

  - id: methodology
    title: "Methodology"
    type: narrative
    description: >
      Description of analytical methods, data sources used, and any
      assumptions or limitations.

  - id: findings
    title: "Findings"
    type: chart_group_with_narrative
    description: >
      Dynamic section: charts and narratives are populated based on the
      specific analysis performed. The template adapts to the content.

  - id: conclusions
    title: "Conclusions & Recommendations"
    type: narrative_list
    description: >
      Prioritized findings with actionable recommendations.

data_sources: []  # Specified at runtime
```

## Section Type Reference

| Type | Description |
|---|---|
| `narrative` | Free-form text generated by the insight engine |
| `table` | Structured data table with conditional formatting |
| `chart_group` | One or more charts rendered together |
| `narrative_list` | Ordered list of insight bullets |
| `table_with_narrative` | Data table accompanied by explanatory text |
| `table_with_charts` | Data table alongside supporting visualizations |
| `narrative_with_charts` | Text narrative with inline chart references |
| `chart_group_with_narrative` | Charts with interleaved explanatory text |
| `title` | Title/cover slide (PPTX only) |
| `repeating_section` | Section repeated per group (e.g., per channel) |
| `data_tables` | Raw data tables for appendix/reference |

## Extending Templates

To add a new report template:

1. Define a new YAML block following the schema above.
2. Assign a unique `template_id`.
3. List the required `data_sources` from `workspace/analysis/`.
4. Define `sections` in the order they should appear.
5. No changes to core scripts are required; `build_dashboard.py` reads template
   definitions dynamically.
