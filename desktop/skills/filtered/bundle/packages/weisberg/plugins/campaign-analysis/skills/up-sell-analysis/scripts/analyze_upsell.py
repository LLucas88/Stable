"""Up-sell campaign analysis — reference implementation.

Reads a treated list, an optional holdout list, and a per-customer metric file
(pre and post values), and produces:

- engagement metrics (sent / delivered / opens / CTR) when those columns exist
- treated-group value lift (mean, median, percent, total)
- if a holdout is provided: incremental lift per customer, bootstrap 95% CI,
  Welch's t-test p-value, and Mann-Whitney U p-value
- segment breakdown if columns prefixed `segment_` exist
- a summary.json, a report.md, and segments.csv written to --out

This is a starting point. If the data shape doesn't match (e.g., panel data, no
pre/post columns, multiple metrics), adapt rather than coerce.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats


def load_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"missing input file: {path}")
    return pd.read_csv(path)


def engagement_metrics(treated: pd.DataFrame) -> dict:
    out = {"treated_count": int(len(treated))}
    for col in ("sent", "delivered", "opened", "clicked"):
        if col in treated.columns:
            out[col] = int(treated[col].fillna(0).sum())
    if "delivered" in out and "sent" in out and out["sent"]:
        out["delivery_rate"] = out["delivered"] / out["sent"]
    if "opened" in out and "delivered" in out and out["delivered"]:
        out["open_rate"] = out["opened"] / out["delivered"]
    if "clicked" in out and "delivered" in out and out["delivered"]:
        out["ctr"] = out["clicked"] / out["delivered"]
    return out


def value_lift(deltas: np.ndarray, pre_mean: float) -> dict:
    deltas = np.asarray(deltas, dtype=float)
    deltas = deltas[~np.isnan(deltas)]
    if len(deltas) == 0:
        return {"n": 0}
    pct_lift = float(deltas.mean() / pre_mean) if (pre_mean and np.isfinite(pre_mean)) else None
    return {
        "n": int(len(deltas)),
        "mean_delta": float(deltas.mean()),
        "median_delta": float(np.median(deltas)),
        "total_absolute_lift": float(deltas.sum()),
        "percent_lift_vs_pre_mean": pct_lift,
    }


def bootstrap_ci_diff(
    treated: np.ndarray, holdout: np.ndarray, n_boot: int = 5000, alpha: float = 0.05, seed: int = 7
) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    diffs = np.empty(n_boot)
    nt, nh = len(treated), len(holdout)
    for i in range(n_boot):
        t = treated[rng.integers(0, nt, nt)]
        h = holdout[rng.integers(0, nh, nh)]
        diffs[i] = t.mean() - h.mean()
    return float(np.quantile(diffs, alpha / 2)), float(np.quantile(diffs, 1 - alpha / 2))


def holdout_comparison(treated: np.ndarray, holdout: np.ndarray) -> dict:
    incremental = float(treated.mean() - holdout.mean())
    ci_low, ci_high = bootstrap_ci_diff(treated, holdout)
    welch = stats.ttest_ind(treated, holdout, equal_var=False, nan_policy="omit")
    mw = stats.mannwhitneyu(treated, holdout, alternative="two-sided")
    # Separate flags per test. The skill guidance is to treat Mann-Whitney as
    # primary when the metric is skewed (most balance/AUM cases). Keep both
    # flags so the report can speak to whichever the analyst chooses.
    return {
        "incremental_per_customer": incremental,
        "incremental_total_estimate": incremental * len(treated),
        "ci_95": [ci_low, ci_high],
        "welch_t_pvalue": float(welch.pvalue),
        "mann_whitney_pvalue": float(mw.pvalue),
        "welch_significant_at_0_05": bool(welch.pvalue < 0.05),
        "mann_whitney_significant_at_0_05": bool(mw.pvalue < 0.05),
        "n_treated": int(len(treated)),
        "n_holdout": int(len(holdout)),
    }


def segment_breakdown(metric_df: pd.DataFrame, holdout_ids: Optional[set]) -> pd.DataFrame:
    seg_cols = [c for c in metric_df.columns if c.startswith("segment_")]
    if not seg_cols:
        return pd.DataFrame()
    rows = []
    for col in seg_cols:
        for value, group in metric_df.groupby(col):
            t = group[group["arm"] == "treated"]["delta"].dropna().to_numpy()
            h = group[group["arm"] == "holdout"]["delta"].dropna().to_numpy()
            row = {
                "segment_field": col,
                "segment_value": value,
                "treated_n": int(len(t)),
                "treated_mean_delta": float(t.mean()) if len(t) else None,
            }
            if holdout_ids is not None and len(h):
                row.update(
                    {
                        "holdout_n": int(len(h)),
                        "holdout_mean_delta": float(h.mean()),
                        "incremental": float(t.mean() - h.mean()) if len(t) else None,
                    }
                )
            rows.append(row)
    return pd.DataFrame(rows)


def build_report(summary: dict, has_holdout: bool) -> str:
    e = summary["engagement"]
    v = summary["value_lift_treated"]
    lines = [
        f"# Up-Sell Campaign Analysis — {summary.get('campaign_name', 'unnamed')}",
        "",
        f"**Treated population:** {e['treated_count']:,}",
        f"**Design:** {'Holdout-controlled' if has_holdout else 'Pre/post only (no holdout)'}",
        "",
        "## 1. Reach and engagement",
    ]
    for k in ("sent", "delivered", "opened", "clicked"):
        if k in e:
            lines.append(f"- {k.capitalize()}: {e[k]:,}")
    for k in ("delivery_rate", "open_rate", "ctr"):
        if k in e:
            lines.append(f"- {k.replace('_', ' ').title()}: {e[k]:.2%}")
    lines += [
        "",
        "## 2. Value lift (treated)",
        f"- N with pre/post values: {v.get('n', 0):,}",
        f"- Mean delta: {v.get('mean_delta', 0):,.2f}",
        f"- Median delta: {v.get('median_delta', 0):,.2f}",
        f"- Total absolute lift: {v.get('total_absolute_lift', 0):,.2f}",
    ]
    if v.get("percent_lift_vs_pre_mean") is not None:
        lines.append(f"- Percent lift vs. pre-period mean: {v['percent_lift_vs_pre_mean']:.2%}")
    lines += ["", "## 3. Causal read"]
    if has_holdout:
        h = summary["holdout_comparison"]
        lines += [
            f"- Incremental per customer: {h['incremental_per_customer']:,.2f}",
            f"- 95% CI: [{h['ci_95'][0]:,.2f}, {h['ci_95'][1]:,.2f}]",
            f"- Welch's t p-value: {h['welch_t_pvalue']:.4f} (significant: {h['welch_significant_at_0_05']})",
            f"- Mann-Whitney U p-value: {h['mann_whitney_pvalue']:.4f} (significant: {h['mann_whitney_significant_at_0_05']})",
            f"- Estimated total incremental lift: {h['incremental_total_estimate']:,.2f}",
        ]
    else:
        lines += [
            "- No holdout was provided. The lift above is descriptive and is not",
            "  attributable to the campaign — market movement, seasonality, and",
            "  concurrent campaigns could explain it. Recommend a randomized holdout",
            "  (10–20% of eligible) for the next campaign so this analysis can be causal.",
        ]
    lines += ["", "## 4. Segment breakdown", "See segments.csv."]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description="Up-sell campaign analysis")
    ap.add_argument("--treated", required=True, type=Path)
    ap.add_argument("--metric", required=True, type=Path)
    ap.add_argument("--holdout", type=Path, default=None)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--campaign-name", default="campaign")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    treated = load_csv(args.treated)
    metric = load_csv(args.metric)
    holdout = load_csv(args.holdout) if args.holdout else None

    for col in ("customer_id", "metric_pre", "metric_post"):
        if col not in metric.columns:
            raise ValueError(f"metric file missing required column: {col}")

    metric["delta"] = metric["metric_post"] - metric["metric_pre"]

    treated_ids = set(treated["customer_id"])
    holdout_ids = set(holdout["customer_id"]) if holdout is not None else None

    if holdout_ids is not None:
        overlap = treated_ids & holdout_ids
        if overlap:
            raise ValueError(
                f"{len(overlap)} customers appear in BOTH treated and holdout — fix the input data before continuing"
            )

    metric["arm"] = np.where(
        metric["customer_id"].isin(treated_ids),
        "treated",
        np.where(metric["customer_id"].isin(holdout_ids or set()), "holdout", "other"),
    )

    # Merge segment_* columns from treated/holdout onto the metric frame so
    # segment_breakdown can find them. Per the documented input schema,
    # segment_* columns live on the treated/holdout files, not on the metric.
    seg_sources: list[pd.DataFrame] = []
    for arm_df in (treated, holdout):
        if arm_df is None:
            continue
        seg_cols = [c for c in arm_df.columns if c.startswith("segment_")]
        if seg_cols:
            seg_sources.append(arm_df[["customer_id", *seg_cols]])
    if seg_sources:
        seg_lookup = pd.concat(seg_sources, ignore_index=True).drop_duplicates("customer_id")
        metric = metric.merge(seg_lookup, on="customer_id", how="left")

    treated_metric = metric[metric["arm"] == "treated"]
    pre_mean = float(treated_metric["metric_pre"].mean())

    summary: dict = {
        "campaign_name": args.campaign_name,
        "engagement": engagement_metrics(treated),
        "value_lift_treated": value_lift(treated_metric["delta"].to_numpy(), pre_mean),
    }

    has_holdout = holdout_ids is not None
    if has_holdout:
        t = treated_metric["delta"].dropna().to_numpy()
        h = metric[metric["arm"] == "holdout"]["delta"].dropna().to_numpy()
        if len(t) and len(h):
            summary["holdout_comparison"] = holdout_comparison(t, h)

    seg = segment_breakdown(metric, holdout_ids)
    if not seg.empty:
        seg.to_csv(args.out / "segments.csv", index=False)

    (args.out / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    (args.out / "report.md").write_text(build_report(summary, has_holdout))

    print(build_report(summary, has_holdout))


if __name__ == "__main__":
    main()
