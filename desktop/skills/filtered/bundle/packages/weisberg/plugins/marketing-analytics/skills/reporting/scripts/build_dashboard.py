"""Assemble HTML dashboard from charts, tables, and insight narratives."""

from __future__ import annotations

import html
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

logger = logging.getLogger(__name__)


DEFAULT_TEMPLATES = {
    "weekly_snapshot": {
        "template_id": "weekly_snapshot",
        "display_name": "Weekly Marketing Performance Snapshot",
        "sections": [
            {"id": "executive_summary", "title": "Executive Summary", "type": "narrative"},
            {"id": "kpi_scorecard", "title": "KPI Scorecard", "type": "table"},
            {
                "id": "channel_performance",
                "title": "Channel Performance",
                "type": "chart_group",
                "charts": [{"chart_type": "time_series", "metrics": ["spend"], "group_by": "channel"}],
            },
            {"id": "top_insights", "title": "Key Insights & Recommended Actions", "type": "narrative_list"},
        ],
    },
    "monthly_deep_dive": {
        "template_id": "monthly_deep_dive",
        "display_name": "Monthly Marketing Deep-Dive",
        "sections": [
            {"id": "executive_summary", "title": "Executive Summary", "type": "narrative"},
            {"id": "kpi_scorecard", "title": "KPI Scorecard", "type": "table"},
            {
                "id": "attribution_analysis",
                "title": "Channel Attribution & MMM Results",
                "type": "chart_group",
                "charts": [{"chart_type": "waterfall", "metrics": ["attributed_revenue"], "group_by": "channel"}],
            },
            {"id": "recommendations", "title": "Strategic Recommendations", "type": "narrative_list"},
        ],
    },
    "quarterly_business_review": {
        "template_id": "quarterly_business_review",
        "display_name": "Quarterly Business Review",
        "sections": [
            {"id": "executive_summary", "title": "Quarter in Review", "type": "narrative"},
            {"id": "kpi_scorecard", "title": "Financial Summary", "type": "table"},
        ],
    },
    "ad_hoc_analysis": {
        "template_id": "ad_hoc_analysis",
        "display_name": "Ad Hoc Marketing Analysis",
        "sections": [
            {"id": "executive_summary", "title": "Summary", "type": "narrative"},
            {"id": "details", "title": "Details", "type": "table"},
        ],
    },
}


def load_report_template(
    template_id: str,
    templates_dir: str | Path | None = None,
) -> dict[str, Any]:
    del templates_dir
    if template_id not in DEFAULT_TEMPLATES:
        raise ValueError(f"Unknown template_id: {template_id}")
    return DEFAULT_TEMPLATES[template_id]


def build_kpi_scorecard(
    metrics: list[dict[str, Any]],
    targets: dict[str, float] | None = None,
    comparison_values: dict[str, float] | None = None,
) -> str:
    targets = targets or {}
    comparison_values = comparison_values or {}
    rows = []
    for metric in metrics:
        name = metric["name"]
        value = metric.get("value")
        target = targets.get(name)
        comparison = comparison_values.get(name)
        status = "no_data"
        if value is not None and target:
            status = "on_track" if float(value) >= target else "at_risk"
        delta = None
        if value is not None and comparison is not None and comparison != 0:
            delta = ((float(value) - comparison) / comparison) * 100
        rows.append(
            f"<tr><td>{html.escape(name)}</td><td>{html.escape(str(value))}</td><td>{html.escape(str(target) if target is not None else '-')}</td><td>{delta:.1f}%</td><td class='{status}'>{status.replace('_', ' ').title()}</td></tr>"
            if delta is not None
            else f"<tr><td>{html.escape(name)}</td><td>{html.escape(str(value))}</td><td>{html.escape(str(target) if target is not None else '-')}</td><td>-</td><td class='{status}'>{status.replace('_', ' ').title()}</td></tr>"
        )
    return (
        "<table class='scorecard'><thead><tr><th>Metric</th><th>Value</th><th>Target</th><th>Delta</th><th>Status</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def build_narrative_section(
    title: str,
    content: str,
    section_type: Literal["executive_summary", "insight_list", "methodology", "recommendations"] = "executive_summary",
) -> str:
    return f"<section class='narrative {section_type}'><h2>{html.escape(title)}</h2><div>{content}</div></section>"


def build_data_table(
    data: list[dict[str, Any]],
    columns: list[dict[str, str]],
    title: str | None = None,
    sortable: bool = True,
    max_rows: int = 100,
) -> str:
    del sortable
    displayed = data[:max_rows]
    header = "".join(f"<th>{html.escape(column['label'])}</th>" for column in columns)
    rows = []
    for row in displayed:
        cells = []
        for column in columns:
            value = row.get(column["key"], "")
            align = column.get("align", "left")
            cells.append(f"<td style='text-align:{align}'>{html.escape(str(value))}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    title_html = f"<h3>{html.escape(title)}</h3>" if title else ""
    return (
        title_html
        + "<table class='data-table'><thead><tr>"
        + header
        + "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def build_chart_section(
    chart_html: str,
    title: str,
    alt_text: str,
    caption: str | None = None,
) -> str:
    caption_html = f"<p class='caption'>{html.escape(caption)}</p>" if caption else ""
    return f"<section class='chart-section' aria-label='{html.escape(alt_text)}'><h2>{html.escape(title)}</h2>{chart_html}{caption_html}</section>"


def build_layout(
    template: dict[str, Any],
    chart_manifest: list[dict[str, Any]],
    insights: dict[str, Any],
    scorecard_data: list[dict[str, Any]] | None = None,
    data_tables: dict[str, list[dict[str, Any]]] | None = None,
    targets: dict[str, float] | None = None,
    comparison_values: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    scorecard_data = scorecard_data or []
    data_tables = data_tables or {}
    chart_lookup = {}
    for chart in chart_manifest:
        chart_lookup.setdefault(chart["section_id"], []).append(chart)
    sections = []
    for section in template["sections"]:
        section_type = section["type"]
        section_id = section["id"]
        if section_type == "narrative":
            html_fragment = build_narrative_section(section["title"], insights.get("executive_summary", ""))
        elif section_type == "narrative_list":
            html_fragment = build_narrative_section(
                section["title"], insights.get("insight_list_html", ""), section_type="insight_list"
            )
        elif section_type == "table":
            html_fragment = build_kpi_scorecard(scorecard_data, targets=targets, comparison_values=comparison_values)
        elif section_type == "chart_group":
            fragments = []
            for chart in chart_lookup.get(section_id, []):
                fragments.append(
                    build_chart_section(
                        Path(chart["html_path"]).read_text(encoding="utf-8"), chart["title"], chart["alt_text"]
                    )
                )
            html_fragment = "".join(fragments)
        else:
            table_rows = data_tables.get(section_id, [])
            columns = [
                {"key": key, "label": key.replace("_", " ").title()}
                for key in (table_rows[0].keys() if table_rows else [])
            ]
            html_fragment = build_data_table(table_rows, columns, title=section["title"])
        sections.append(
            {"section_id": section_id, "title": section["title"], "html": html_fragment, "type": section_type}
        )
    return sections


def generate_css() -> str:
    return """
    body { font-family: Georgia, 'Times New Roman', serif; margin: 0; background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); color: #0f172a; }
    header { padding: 32px; background: #0f172a; color: white; }
    main { padding: 24px; display: grid; gap: 20px; }
    section { background: rgba(255,255,255,0.9); border-radius: 18px; padding: 20px; box-shadow: 0 12px 30px rgba(15,23,42,0.08); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    th { text-align: left; background: #f8fafc; }
    .on_track { color: #166534; font-weight: 600; }
    .at_risk { color: #b45309; font-weight: 600; }
    .off_track { color: #b91c1c; font-weight: 600; }
    nav { position: sticky; top: 0; background: rgba(255,255,255,0.85); padding: 12px 24px; backdrop-filter: blur(8px); border-bottom: 1px solid #e2e8f0; }
    nav a { margin-right: 12px; color: #1d4ed8; text-decoration: none; }
    """


def generate_js() -> str:
    return """
    document.querySelectorAll('nav a').forEach(function(anchor) {
      anchor.addEventListener('click', function(event) {
        event.preventDefault();
        const id = anchor.getAttribute('href').slice(1);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
    """


def render_html(
    sections: list[dict[str, Any]],
    title: str,
    subtitle: str | None = None,
    generated_at: str | None = None,
    include_nav: bool = True,
    financial_services_mode: bool = False,
    disclaimer_text: str | None = None,
) -> str:
    generated_at = generated_at or datetime.utcnow().isoformat() + "Z"
    disclaimer_text = (
        disclaimer_text or "This dashboard is generated for analytical review and may require human validation."
    )
    nav = ""
    if include_nav:
        nav = (
            "<nav>"
            + "".join(f"<a href='#{section['section_id']}'>{html.escape(section['title'])}</a>" for section in sections)
            + "</nav>"
        )
    section_html = "".join(f"<div id='{section['section_id']}'>{section['html']}</div>" for section in sections)
    disclaimer = f"<footer><p>{html.escape(disclaimer_text)}</p></footer>" if financial_services_mode else ""
    subtitle_html = f"<p>{html.escape(subtitle)}</p>" if subtitle else ""
    return f"""<!doctype html>
<html>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>{html.escape(title)}</title>
  <style>{generate_css()}</style>
</head>
<body>
  <header><h1>{html.escape(title)}</h1>{subtitle_html}<p>Generated at {html.escape(generated_at)}</p></header>
  {nav}
  <main>{section_html}</main>
  {disclaimer}
  <script>{generate_js()}</script>
</body>
</html>"""


def write_dashboard(
    html_content: str,
    output_path: str | Path,
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html_content, encoding="utf-8")
    return output_path


def run_dashboard_pipeline(
    unified_dataset: dict[str, Any],
    insight_results: dict[str, Any],
    chart_manifest: list[dict[str, Any]],
    template_id: str = "weekly_snapshot",
    output_dir: str | Path = "workspace/reports",
    targets: dict[str, float] | None = None,
    financial_services_mode: bool = False,
) -> dict[str, Any]:
    start = time.time()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    template = load_report_template(template_id)
    scorecard_data = []
    if unified_dataset.get("data"):
        latest = unified_dataset["data"][-1]
        for metric in unified_dataset.get("metrics", [])[:8]:
            scorecard_data.append({"name": metric["name"], "value": latest.get(metric["name"])})
    sections = build_layout(template, chart_manifest, insight_results, scorecard_data=scorecard_data, targets=targets)
    html_content = render_html(
        sections,
        title=template["display_name"],
        subtitle=f"{unified_dataset.get('date_range', {}).get('start')} to {unified_dataset.get('date_range', {}).get('end')}",
        financial_services_mode=financial_services_mode,
    )
    html_path = write_dashboard(html_content, output_dir / f"{template_id}.html")
    duration = time.time() - start
    summary = {
        "html_path": str(html_path),
        "title": template["display_name"],
        "section_count": len(sections),
        "chart_count": len(chart_manifest),
        "generation_time_seconds": duration,
    }
    (output_dir / f"{template_id}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
