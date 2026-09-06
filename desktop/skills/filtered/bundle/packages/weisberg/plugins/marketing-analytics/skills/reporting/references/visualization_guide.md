# Visualization Guide

Chart type selection rules, color palettes, and accessibility standards for all
reporting skill visualizations.

## Chart Type Selection Rules

Use these rules to automatically select the most appropriate chart type based on
the data characteristics. The `scripts/generate_charts.py` script applies these
rules when `chart_type` is set to `auto`.

### Decision Matrix

| Data Characteristic | Recommended Chart | Alternatives |
|---|---|---|
| Single metric over time | Line chart | Area chart |
| Multiple metrics over time | Multi-line chart | Small multiples |
| Categorical comparison (< 8 categories) | Vertical bar chart | Horizontal bar |
| Categorical comparison (>= 8 categories) | Horizontal bar chart | Treemap |
| Part-to-whole (< 6 slices) | Donut chart | Stacked bar |
| Part-to-whole (>= 6 slices) | Stacked bar chart | Treemap |
| Conversion flow / funnel | Funnel chart | Horizontal bar |
| Additive/subtractive breakdown | Waterfall chart | Stacked bar |
| Two-variable relationship | Scatter plot | Bubble chart |
| Correlation matrix | Heatmap | Clustered bar |
| Distribution of values | Histogram | Box plot, violin |
| Comparison of distributions | Box plot | Violin plot |
| Geographic data | Choropleth map | Bubble map |
| Hierarchical data | Treemap | Sunburst |

### Time Series Specifics

- **Daily data, < 30 days**: Line chart with point markers.
- **Daily data, 30-90 days**: Line chart without markers.
- **Daily data, > 90 days**: Line chart with weekly smoothing overlay.
- **Weekly data**: Line chart or area chart.
- **Monthly data, < 12 months**: Bar chart or line chart.
- **Monthly data, >= 12 months**: Line chart.
- **Quarterly data**: Bar chart with trend line.

### Comparison Period Overlays

When a comparison period is specified (e.g., previous week, previous month):

- Use a dashed line for the comparison period on time series charts.
- Use grouped bars (current vs. comparison) on bar charts.
- Add delta annotations showing percentage change.

## Color Palettes

### Primary Palette (Brand-Aligned)

Use for the main data series in all charts. These colors are designed to be
distinguishable in sequence and under common color vision deficiencies.

```python
PRIMARY_PALETTE = [
    "#2563EB",  # Blue (primary)
    "#16A34A",  # Green
    "#DC2626",  # Red
    "#F59E0B",  # Amber
    "#7C3AED",  # Purple
    "#0891B2",  # Cyan
    "#EA580C",  # Orange
    "#4F46E5",  # Indigo
]
```

### Sequential Palette (Single Hue)

Use for heatmaps, choropleth maps, or any visualization showing magnitude on a
single dimension.

```python
SEQUENTIAL_PALETTE = {
    "blue": ["#EFF6FF", "#BFDBFE", "#60A5FA", "#2563EB", "#1E40AF", "#1E3A5F"],
    "green": ["#F0FDF4", "#BBF7D0", "#4ADE80", "#16A34A", "#166534", "#14532D"],
    "red": ["#FEF2F2", "#FECACA", "#F87171", "#DC2626", "#991B1B", "#7F1D1D"],
}
```

### Diverging Palette

Use for data with a meaningful midpoint (e.g., positive vs. negative change,
above vs. below target).

```python
DIVERGING_PALETTE = [
    "#DC2626",  # Strong negative
    "#F87171",  # Moderate negative
    "#FCA5A5",  # Slight negative
    "#E5E7EB",  # Neutral
    "#86EFAC",  # Slight positive
    "#4ADE80",  # Moderate positive
    "#16A34A",  # Strong positive
]
```

### Status Colors

Use for RAG (Red/Amber/Green) status indicators in scorecards and tables.

```python
STATUS_COLORS = {
    "on_track": "#16A34A",      # Green
    "at_risk": "#F59E0B",       # Amber
    "off_track": "#DC2626",     # Red
    "no_data": "#9CA3AF",       # Gray
    "above_target": "#2563EB",  # Blue
}
```

## Accessibility Standards

All visualizations must meet WCAG 2.1 AA accessibility guidelines.

### Color Contrast

- Text on colored backgrounds must have a contrast ratio of at least 4.5:1.
- Large text (18px+ or 14px+ bold) requires at least 3:1 contrast.
- Never rely on color alone to convey information. Use patterns, labels, or
  shapes as redundant encoding.

### Colorblind Safety

- The primary palette has been tested against protanopia, deuteranopia, and
  tritanopia simulations.
- When more than 4 series are plotted, supplement color with distinct line
  styles (solid, dashed, dotted) or marker shapes (circle, square, triangle).
- Avoid red-green as the only differentiator. The primary palette uses
  blue as the primary and red as an accent to minimize red-green conflicts.

### Alt Text Requirements

Every chart must include an `alt` attribute with a description following this
template:

```
[Chart type] showing [what is measured] for [entity/group]
from [start date] to [end date]. [Key finding in one sentence].
```

Example:
```
Line chart showing weekly ROAS by channel from 2025-01-06 to 2025-03-31.
Paid search ROAS increased 34% while display ROAS declined 12%.
```

### Screen Reader Support

- Use plotly's built-in ARIA labels.
- Provide a data table alternative for every chart (hidden by default, toggled
  by an accessible button).
- Interactive tooltips must be keyboard-navigable.

### Font Sizes

| Element | Minimum Size |
|---|---|
| Chart title | 16px |
| Axis labels | 12px |
| Tick labels | 11px |
| Annotations | 11px |
| Tooltip text | 12px |
| Legend text | 12px |

## Chart Layout Standards

### Dimensions

- Default chart width: 100% of container (responsive).
- Default chart height: 400px for standard charts, 300px for sparklines, 500px
  for complex charts (heatmaps, funnels).
- Aspect ratio: prefer 16:9 for presentation exports, flexible for HTML.

### Margins and Spacing

```python
DEFAULT_LAYOUT = {
    "margin": {"l": 60, "r": 30, "t": 50, "b": 60},
    "font": {"family": "Inter, system-ui, sans-serif", "size": 13},
    "title": {"font": {"size": 16, "color": "#111827"}},
    "paper_bgcolor": "#FFFFFF",
    "plot_bgcolor": "#FAFAFA",
    "xaxis": {"gridcolor": "#E5E7EB", "zerolinecolor": "#D1D5DB"},
    "yaxis": {"gridcolor": "#E5E7EB", "zerolinecolor": "#D1D5DB"},
}
```

### Annotations Best Practices

- Annotate the most recent data point on time series charts with its value.
- Annotate significant events (campaign launches, algorithm changes) with
  vertical reference lines and labels.
- Use callout annotations for anomalies that exceed the 2-sigma threshold.
- Keep annotation density low: maximum 5 annotations per chart.

## Export Formats

### HTML (Interactive)

- Use plotly's `to_html(full_html=False, include_plotlyjs='cdn')` for
  individual chart embeds.
- For self-contained dashboards, inline plotly.js as a single minified script.
- Enable `config={"responsive": True, "displayModeBar": False}` for clean
  presentation.

### Static Image (for PPTX/DOCX)

- Export at 2x resolution (scale=2) for crisp rendering on retina displays.
- Use PNG format with transparent background.
- Dimensions: 1920x1080 for full-slide charts, 960x540 for half-slide.
- Apply white background when transparency causes readability issues.

### Print Optimization

- Suppress interactive elements (hover, zoom) in print stylesheets.
- Ensure all charts render in grayscale without losing information.
- Add page-break-inside: avoid to prevent charts from splitting across pages.
