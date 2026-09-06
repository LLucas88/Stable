"""Plotly chart generation with automated type selection."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Literal

logger = logging.getLogger(__name__)

PRIMARY_PALETTE = ["#2563EB", "#16A34A", "#DC2626", "#F59E0B", "#7C3AED", "#0891B2", "#EA580C", "#4F46E5"]
SEQUENTIAL_PALETTES = {
    "blue": ["#EFF6FF", "#BFDBFE", "#60A5FA", "#2563EB", "#1E40AF", "#1E3A5F"],
    "green": ["#F0FDF4", "#BBF7D0", "#4ADE80", "#16A34A", "#166534", "#14532D"],
    "red": ["#FEF2F2", "#FECACA", "#F87171", "#DC2626", "#991B1B", "#7F1D1D"],
}
DIVERGING_PALETTE = ["#DC2626", "#F87171", "#FCA5A5", "#E5E7EB", "#86EFAC", "#4ADE80", "#16A34A"]
STATUS_COLORS = {
    "on_track": "#16A34A",
    "at_risk": "#F59E0B",
    "off_track": "#DC2626",
    "no_data": "#9CA3AF",
    "above_target": "#2563EB",
}

ChartType = Literal[
    "line",
    "area",
    "bar",
    "grouped_bar",
    "stacked_bar",
    "horizontal_bar",
    "waterfall",
    "funnel",
    "scatter",
    "bubble",
    "heatmap",
    "histogram",
    "box",
    "violin",
    "donut",
    "treemap",
    "choropleth",
]


def _plotly():
    try:  # pragma: no cover - optional dependency path
        import plotly.graph_objects as go

        return go
    except Exception:
        return None


def select_chart_type(
    metric_metadata: dict[str, Any],
    data_characteristics: dict[str, Any],
) -> ChartType:
    if data_characteristics.get("has_time_dimension"):
        return "line"
    comparison_type = metric_metadata.get("comparison_type")
    if comparison_type == "part_to_whole":
        return "stacked_bar"
    if data_characteristics.get("num_categories", 0) > 10:
        return "horizontal_bar"
    if data_characteristics.get("num_series", 1) > 1:
        return "grouped_bar"
    return "bar"


def build_chart_config(
    chart_type: ChartType,
    title: str,
    x_label: str | None = None,
    y_label: str | None = None,
    color_palette: list[str] | None = None,
    show_legend: bool = True,
    height: int = 400,
    comparison_period: str | None = None,
    annotations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "chart_type": chart_type,
        "layout": {
            "title": title,
            "height": height,
            "showlegend": show_legend,
            "xaxis_title": x_label,
            "yaxis_title": y_label,
            "colorway": color_palette or PRIMARY_PALETTE,
            "annotations": annotations or [],
            "comparison_period": comparison_period,
        },
        "trace_defaults": {"mode": "lines+markers"},
    }


def render_time_series(
    data: list[dict[str, Any]],
    x_col: str,
    y_cols: list[str],
    config: dict[str, Any],
    group_by: str | None = None,
    comparison_data: list[dict[str, Any]] | None = None,
) -> Any:
    go = _plotly()
    if go is None:
        return {
            "type": "time_series",
            "data": data,
            "x_col": x_col,
            "y_cols": y_cols,
            "group_by": group_by,
            "comparison_data": comparison_data,
            "config": config,
        }
    figure = go.Figure()
    if group_by:
        groups = sorted({row.get(group_by) for row in data})
        for group in groups:
            subset = [row for row in data if row.get(group_by) == group]
            for y_col in y_cols:
                figure.add_trace(
                    go.Scatter(
                        x=[row.get(x_col) for row in subset],
                        y=[row.get(y_col) for row in subset],
                        mode="lines+markers",
                        name=f"{group} {y_col}",
                    )
                )
    else:
        for y_col in y_cols:
            figure.add_trace(
                go.Scatter(
                    x=[row.get(x_col) for row in data],
                    y=[row.get(y_col) for row in data],
                    mode="lines+markers",
                    name=y_col,
                )
            )
    figure.update_layout(**config["layout"])
    return figure


def render_bar_chart(
    data: list[dict[str, Any]],
    category_col: str,
    value_cols: list[str],
    config: dict[str, Any],
    orientation: Literal["vertical", "horizontal"] = "vertical",
    bar_mode: Literal["group", "stack"] = "group",
) -> Any:
    go = _plotly()
    if go is None:
        return {
            "type": "bar",
            "data": data,
            "category_col": category_col,
            "value_cols": value_cols,
            "orientation": orientation,
            "bar_mode": bar_mode,
            "config": config,
        }
    figure = go.Figure()
    for value_col in value_cols:
        figure.add_trace(
            go.Bar(
                x=[row.get(category_col) for row in data]
                if orientation == "vertical"
                else [row.get(value_col) for row in data],
                y=[row.get(value_col) for row in data]
                if orientation == "vertical"
                else [row.get(category_col) for row in data],
                name=value_col,
                orientation="h" if orientation == "horizontal" else "v",
            )
        )
    figure.update_layout(barmode=bar_mode, **config["layout"])
    return figure


def render_waterfall(
    data: list[dict[str, Any]],
    category_col: str,
    value_col: str,
    config: dict[str, Any],
    base_value: float | None = None,
) -> Any:
    go = _plotly()
    if go is None:
        return {
            "type": "waterfall",
            "data": data,
            "category_col": category_col,
            "value_col": value_col,
            "base_value": base_value,
            "config": config,
        }
    figure = go.Figure(
        go.Waterfall(
            x=[row.get(category_col) for row in data],
            y=[row.get(value_col) for row in data],
            base=base_value or 0,
        )
    )
    figure.update_layout(**config["layout"])
    return figure


def render_funnel(
    data: list[dict[str, Any]],
    stage_col: str,
    value_col: str,
    config: dict[str, Any],
    show_conversion_rates: bool = True,
) -> Any:
    del show_conversion_rates
    go = _plotly()
    if go is None:
        return {"type": "funnel", "data": data, "stage_col": stage_col, "value_col": value_col, "config": config}
    figure = go.Figure(go.Funnel(y=[row.get(stage_col) for row in data], x=[row.get(value_col) for row in data]))
    figure.update_layout(**config["layout"])
    return figure


def render_scatter(
    data: list[dict[str, Any]],
    x_col: str,
    y_col: str,
    config: dict[str, Any],
    size_col: str | None = None,
    color_col: str | None = None,
    trendline: bool = False,
) -> Any:
    del trendline
    go = _plotly()
    if go is None:
        return {
            "type": "scatter",
            "data": data,
            "x_col": x_col,
            "y_col": y_col,
            "size_col": size_col,
            "color_col": color_col,
            "config": config,
        }
    marker = {}
    if size_col:
        marker["size"] = [row.get(size_col, 10) for row in data]
    if color_col:
        marker["color"] = [row.get(color_col) for row in data]
    figure = go.Figure(
        go.Scatter(
            x=[row.get(x_col) for row in data], y=[row.get(y_col) for row in data], mode="markers", marker=marker
        )
    )
    figure.update_layout(**config["layout"])
    return figure


def render_heatmap(
    data: list[dict[str, Any]],
    x_col: str,
    y_col: str,
    value_col: str,
    config: dict[str, Any],
    color_scale: str = "blue",
) -> Any:
    go = _plotly()
    if go is None:
        return {
            "type": "heatmap",
            "data": data,
            "x_col": x_col,
            "y_col": y_col,
            "value_col": value_col,
            "color_scale": color_scale,
            "config": config,
        }
    x_values = sorted({row.get(x_col) for row in data})
    y_values = sorted({row.get(y_col) for row in data})
    matrix = []
    for y_value in y_values:
        matrix.append(
            [
                next((row.get(value_col) for row in data if row.get(x_col) == x_value and row.get(y_col) == y_value), 0)
                for x_value in x_values
            ]
        )
    figure = go.Figure(
        go.Heatmap(
            x=x_values,
            y=y_values,
            z=matrix,
            colorscale=SEQUENTIAL_PALETTES.get(color_scale, SEQUENTIAL_PALETTES["blue"]),
        )
    )
    figure.update_layout(**config["layout"])
    return figure


def generate_alt_text(
    chart_type: ChartType,
    title: str,
    data_summary: dict[str, Any],
    key_finding: str,
) -> str:
    entity = data_summary.get("entity", "the selected KPI set")
    start = data_summary.get("start_date", "the start of the period")
    end = data_summary.get("end_date", "the end of the period")
    metric = data_summary.get("metric_name", "metric")
    return f"{chart_type.title()} chart titled '{title}' showing {metric} for {entity} from {start} to {end}. {key_finding}"


def render_chart(
    chart_type: ChartType,
    data: list[dict[str, Any]],
    config: dict[str, Any],
    **kwargs: Any,
) -> Any:
    if chart_type in {"line", "area"}:
        return render_time_series(data, kwargs["x_col"], kwargs["y_cols"], config, group_by=kwargs.get("group_by"))
    if chart_type in {"bar", "grouped_bar", "stacked_bar", "horizontal_bar"}:
        orientation = "horizontal" if chart_type == "horizontal_bar" else "vertical"
        bar_mode = "stack" if chart_type == "stacked_bar" else "group"
        return render_bar_chart(
            data, kwargs["category_col"], kwargs["value_cols"], config, orientation=orientation, bar_mode=bar_mode
        )
    if chart_type == "waterfall":
        return render_waterfall(data, kwargs["category_col"], kwargs["value_col"], config)
    if chart_type == "funnel":
        return render_funnel(data, kwargs["stage_col"], kwargs["value_col"], config)
    if chart_type in {"scatter", "bubble"}:
        return render_scatter(
            data,
            kwargs["x_col"],
            kwargs["y_col"],
            config,
            size_col=kwargs.get("size_col"),
            color_col=kwargs.get("color_col"),
        )
    if chart_type == "heatmap":
        return render_heatmap(data, kwargs["x_col"], kwargs["y_col"], kwargs["value_col"], config)
    raise ValueError(f"Unsupported chart type: {chart_type}")


def export_chart_html(
    figure: Any,
    full_html: bool = False,
    include_plotlyjs: str | bool = "cdn",
) -> str:
    del include_plotlyjs
    if hasattr(figure, "to_html"):  # pragma: no branch
        return figure.to_html(full_html=full_html, include_plotlyjs="cdn")
    payload = json.dumps(figure, indent=2)
    if full_html:
        return f"<html><body><pre>{payload}</pre></body></html>"
    return f"<div class='chart-fallback'><pre>{payload}</pre></div>"


def export_chart_image(
    figure: Any,
    output_path: str | Path,
    format: Literal["png", "svg", "pdf"] = "png",
    width: int = 1920,
    height: int = 1080,
    scale: int = 2,
) -> Path:
    del width, height, scale
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(figure, "write_image"):  # pragma: no branch
        try:
            figure.write_image(str(output_path), format=format)
            return output_path
        except Exception:
            pass
    output_path.write_text(json.dumps({"format": format, "figure": figure}, indent=2), encoding="utf-8")
    return output_path


def generate_all_charts(
    unified_dataset: dict[str, Any],
    template_sections: list[dict[str, Any]],
    output_dir: str | Path,
) -> list[dict[str, Any]]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = unified_dataset.get("data", [])
    manifest: list[dict[str, Any]] = []
    for section in template_sections:
        for chart_index, chart_spec in enumerate(section.get("charts", []), start=1):
            metrics = chart_spec.get("metrics", [])
            chart_type = chart_spec.get("chart_type", "bar")
            if chart_type == "time_series":
                resolved_type = "line"
                config = build_chart_config("line", section["title"], x_label="Date", y_label=", ".join(metrics))
                figure = render_chart(
                    "line", rows, config, x_col="date", y_cols=metrics, group_by=chart_spec.get("group_by")
                )
            elif chart_type == "bar":
                resolved_type = "bar"
                category_col = chart_spec.get("group_by", "date")
                config = build_chart_config("bar", section["title"], x_label=category_col, y_label=", ".join(metrics))
                figure = render_chart("bar", rows, config, category_col=category_col, value_cols=metrics)
            elif chart_type == "waterfall":
                resolved_type = "waterfall"
                config = build_chart_config(
                    "waterfall", section["title"], x_label="Component", y_label=metrics[0] if metrics else "value"
                )
                figure = render_chart(
                    "waterfall",
                    rows,
                    config,
                    category_col=chart_spec.get("group_by", "date"),
                    value_col=metrics[0] if metrics else "value",
                )
            elif chart_type == "funnel":
                resolved_type = "funnel"
                config = build_chart_config("funnel", section["title"])
                figure = render_chart(
                    "funnel",
                    rows,
                    config,
                    stage_col=chart_spec.get("group_by", "stage"),
                    value_col=metrics[0] if metrics else "value",
                )
            elif chart_type == "scatter":
                resolved_type = "scatter"
                config = build_chart_config("scatter", section["title"])
                figure = render_chart(
                    "scatter",
                    rows,
                    config,
                    x_col=metrics[0],
                    y_col=metrics[1] if len(metrics) > 1 else metrics[0],
                    color_col=chart_spec.get("group_by"),
                )
            else:
                resolved_type = "bar"
                config = build_chart_config("bar", section["title"])
                figure = render_chart("bar", rows, config, category_col="date", value_cols=metrics[:1] or ["value"])

            html_path = output_dir / f"{section['id']}_{chart_index}.html"
            image_path = output_dir / f"{section['id']}_{chart_index}.json"
            html_path.write_text(export_chart_html(figure), encoding="utf-8")
            export_chart_image(figure, image_path)
            alt_text = generate_alt_text(
                resolved_type,
                section["title"],
                {
                    "entity": section["title"],
                    "start_date": unified_dataset.get("date_range", {}).get("start"),
                    "end_date": unified_dataset.get("date_range", {}).get("end"),
                    "metric_name": ", ".join(metrics),
                },
                key_finding=f"Rendered from section {section['id']}.",
            )
            manifest.append(
                {
                    "section_id": section["id"],
                    "chart_type": resolved_type,
                    "html_path": str(html_path),
                    "image_path": str(image_path),
                    "alt_text": alt_text,
                    "title": section["title"],
                }
            )
    return manifest
