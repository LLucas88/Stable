"""Cross-sell campaign analysis — reference implementation.

Reads a treated list, an optional holdout list, a product-opens file, and
optionally a prior-holdings file, and produces:

- engagement metrics (sent / delivered / opens / CTR) when those columns exist
- conversion rate (account open rate) per eligible customer, per arm
- value-per-eligible and value-per-converter metrics when funded balance is present
- holdout comparison: two-proportion z-test + Fisher's exact + Newcombe-style CI
  on absolute lift via bootstrap; Mann-Whitney U on value per eligible
- segment breakdown if columns prefixed `segment_` exist on the treated/holdout
  files
- a summary.json, a report.md, and segments.csv written to --out

This is a starting point. If the data shape doesn't match, adapt rather than
coerce — the eligibility logic in particular has to match the user's reality.
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
    out = {"treated_count_raw": int(len(treated))}
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


def apply_eligibility(
    arm_df: pd.DataFrame, prior_holdings: Optional[pd.DataFrame], target_product: str
) -> tuple[pd.DataFrame, int]:
    if prior_holdings is None:
        return arm_df, 0
    missing = {"customer_id", "product_code"} - set(prior_holdings.columns)
    if missing:
        raise ValueError(
            f"prior_holdings file missing required columns: {sorted(missing)}. "
            "Expected at least: customer_id, product_code."
        )
    holders = set(prior_holdings.loc[prior_holdings["product_code"] == target_product, "customer_id"])
    before = len(arm_df)
    eligible = arm_df[~arm_df["customer_id"].isin(holders)].copy()
    return eligible, before - len(eligible)


def attach_conversion(
    arm_df: pd.DataFrame,
    product_opens: pd.DataFrame,
    target_product: str,
    attribution_window_days: int,
    campaign_anchor_date: Optional[pd.Timestamp],
) -> pd.DataFrame:
    """Flag each eligible customer with conversion + funded value, if any."""
    opens = product_opens[product_opens["product_code"] == target_product].copy()
    opens["open_date"] = pd.to_datetime(opens["open_date"])

    arm = arm_df.copy()
    if "treatment_date" in arm.columns:
        arm["anchor_date"] = pd.to_datetime(arm["treatment_date"])
    else:
        if campaign_anchor_date is None:
            raise ValueError("holdout has no treatment_date; pass --campaign-start to anchor the window")
        arm["anchor_date"] = campaign_anchor_date

    merged = arm.merge(opens, on="customer_id", how="left")
    delta = (merged["open_date"] - merged["anchor_date"]).dt.days
    in_window = delta.between(0, attribution_window_days)
    merged["converted"] = in_window.fillna(False)

    funded_col = (
        "funded_balance"
        if "funded_balance" in merged.columns
        else ("first_period_revenue" if "first_period_revenue" in merged.columns else None)
    )
    if funded_col:
        merged["funded_value"] = np.where(merged["converted"], merged[funded_col].fillna(0), 0.0)
    else:
        merged["funded_value"] = np.nan

    # one row per customer — take max (handles duplicate open rows safely)
    grouped = merged.groupby("customer_id", as_index=False).agg(
        converted=("converted", "max"), funded_value=("funded_value", "max")
    )
    # re-attach segment columns from the arm file
    seg_cols = [c for c in arm.columns if c.startswith("segment_")]
    keep = ["customer_id"] + seg_cols
    return grouped.merge(arm[keep].drop_duplicates("customer_id"), on="customer_id", how="left")


def wilson_ci(k: int, n: int, alpha: float = 0.05) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    z = stats.norm.ppf(1 - alpha / 2)
    phat = k / n
    denom = 1 + z**2 / n
    center = (phat + z**2 / (2 * n)) / denom
    half = (z * np.sqrt(phat * (1 - phat) / n + z**2 / (4 * n**2))) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def bootstrap_diff_rate(
    t_conv: np.ndarray, h_conv: np.ndarray, n_boot: int = 5000, seed: int = 7
) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    nt, nh = len(t_conv), len(h_conv)
    diffs = np.empty(n_boot)
    for i in range(n_boot):
        diffs[i] = t_conv[rng.integers(0, nt, nt)].mean() - h_conv[rng.integers(0, nh, nh)].mean()
    return float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975))


def bootstrap_diff_mean(t: np.ndarray, h: np.ndarray, n_boot: int = 5000, seed: int = 7) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    nt, nh = len(t), len(h)
    diffs = np.empty(n_boot)
    for i in range(n_boot):
        diffs[i] = t[rng.integers(0, nt, nt)].mean() - h[rng.integers(0, nh, nh)].mean()
    return float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975))


def arm_summary(arm_label: str, df: pd.DataFrame) -> dict:
    n = int(len(df))
    conv = int(df["converted"].sum())
    rate = conv / n if n else 0.0
    ci_low, ci_high = wilson_ci(conv, n)
    out = {
        "arm": arm_label,
        "eligible": n,
        "converters": conv,
        "conversion_rate": rate,
        "conversion_rate_ci_95": [ci_low, ci_high],
    }
    if df["funded_value"].notna().any():
        per_elig = df["funded_value"].fillna(0).to_numpy()
        converters = df.loc[df["converted"], "funded_value"].dropna().to_numpy()
        out["value_per_eligible_mean"] = float(per_elig.mean())
        out["total_funded_value"] = float(per_elig.sum())
        if len(converters):
            out["funded_value_per_converter_mean"] = float(converters.mean())
            out["funded_value_per_converter_median"] = float(np.median(converters))
    return out


def holdout_tests(t_df: pd.DataFrame, h_df: pd.DataFrame) -> dict:
    t_conv = t_df["converted"].astype(int).to_numpy()
    h_conv = h_df["converted"].astype(int).to_numpy()
    nt, nh = len(t_conv), len(h_conv)
    kt, kh = int(t_conv.sum()), int(h_conv.sum())

    if nt == 0 or nh == 0:
        return {
            "skipped": True,
            "reason": (f"insufficient sample for statistical testing — treated eligible={nt}, holdout eligible={nh}"),
        }

    # two-proportion z (pooled)
    p_pool = (kt + kh) / (nt + nh) if (nt + nh) else 0
    se = np.sqrt(p_pool * (1 - p_pool) * (1 / nt + 1 / nh)) if p_pool and (nt and nh) else np.nan
    z = ((kt / nt) - (kh / nh)) / se if se and not np.isnan(se) else np.nan
    p_z = float(2 * (1 - stats.norm.cdf(abs(z)))) if not np.isnan(z) else None

    # Fisher's exact
    fisher_p = float(stats.fisher_exact([[kt, nt - kt], [kh, nh - kh]])[1])

    ci_low, ci_high = bootstrap_diff_rate(t_conv, h_conv)
    abs_lift = (kt / nt) - (kh / nh)
    incremental_opens = abs_lift * nt
    out = {
        "absolute_lift_pp": abs_lift,
        "absolute_lift_ci_95": [ci_low, ci_high],
        "relative_lift": (abs_lift / (kh / nh)) if kh and nh else None,
        "two_proportion_z_pvalue": p_z,
        "fisher_exact_pvalue": fisher_p,
        "incremental_opens_estimated": incremental_opens,
        "significant_at_0_05": (p_z is not None and p_z < 0.05) or fisher_p < 0.05,
    }

    if t_df["funded_value"].notna().any() and h_df["funded_value"].notna().any():
        t_val = t_df["funded_value"].fillna(0).to_numpy()
        h_val = h_df["funded_value"].fillna(0).to_numpy()
        welch = stats.ttest_ind(t_val, h_val, equal_var=False, nan_policy="omit")
        mw = stats.mannwhitneyu(t_val, h_val, alternative="two-sided")
        ci_v_low, ci_v_high = bootstrap_diff_mean(t_val, h_val)
        out["value_per_eligible_lift"] = float(t_val.mean() - h_val.mean())
        out["value_per_eligible_lift_ci_95"] = [ci_v_low, ci_v_high]
        out["value_welch_t_pvalue"] = float(welch.pvalue)
        out["value_mann_whitney_pvalue"] = float(mw.pvalue)
    return out


def segment_breakdown(treated_df: pd.DataFrame, holdout_df: Optional[pd.DataFrame]) -> pd.DataFrame:
    seg_cols = [c for c in treated_df.columns if c.startswith("segment_")]
    if not seg_cols:
        return pd.DataFrame()
    rows = []
    for col in seg_cols:
        values = set(treated_df[col].dropna().unique())
        if holdout_df is not None:
            values |= set(holdout_df[col].dropna().unique())
        for value in sorted(values):
            t = treated_df[treated_df[col] == value]
            kt, nt = int(t["converted"].sum()), int(len(t))
            row = {
                "segment_field": col,
                "segment_value": value,
                "treated_eligible": nt,
                "treated_conv_rate": (kt / nt) if nt else None,
            }
            if holdout_df is not None:
                h = holdout_df[holdout_df[col] == value]
                kh, nh = int(h["converted"].sum()), int(len(h))
                row.update(
                    {
                        "holdout_eligible": nh,
                        "holdout_conv_rate": (kh / nh) if nh else None,
                        "absolute_lift_pp": ((kt / nt) - (kh / nh)) if nt and nh else None,
                    }
                )
            rows.append(row)
    return pd.DataFrame(rows)


def build_report(summary: dict) -> str:
    e = summary["engagement"]
    t = summary["treated_summary"]
    h = summary.get("holdout_summary")
    tests = summary.get("holdout_tests")
    lines = [
        f"# Cross-Sell Campaign Analysis — {summary.get('campaign_name', 'unnamed')}",
        "",
        f"**Target product:** {summary['target_product']}",
        f"**Attribution window:** {summary['attribution_window_days']} days",
        f"**Eligible treated:** {t['eligible']:,} (excluded {summary['treated_excluded_prior_holders']:,} prior holders)",
        f"**Design:** {'Holdout-controlled' if h else 'No holdout (descriptive only)'}",
        "",
        "## 1. Reach and engagement",
        f"- Treated (raw): {e['treated_count_raw']:,}",
    ]
    for k in ("sent", "delivered", "opened", "clicked"):
        if k in e:
            lines.append(f"- {k.capitalize()}: {e[k]:,}")
    for k in ("delivery_rate", "open_rate", "ctr"):
        if k in e:
            lines.append(f"- {k.replace('_', ' ').title()}: {e[k]:.2%}")
    lines += [
        "",
        "## 2. Conversion (account open rate)",
        f"- Treated: {t['converters']:,} of {t['eligible']:,} ({t['conversion_rate']:.2%}), "
        f"95% CI [{t['conversion_rate_ci_95'][0]:.2%}, {t['conversion_rate_ci_95'][1]:.2%}]",
    ]
    if h:
        lines.append(
            f"- Holdout: {h['converters']:,} of {h['eligible']:,} ({h['conversion_rate']:.2%}), "
            f"95% CI [{h['conversion_rate_ci_95'][0]:.2%}, {h['conversion_rate_ci_95'][1]:.2%}]"
        )
        if tests and not tests.get("skipped"):
            lines.append(
                f"- Absolute lift: {tests['absolute_lift_pp'] * 100:.2f} pp, "
                f"95% CI [{tests['absolute_lift_ci_95'][0] * 100:.2f}, {tests['absolute_lift_ci_95'][1] * 100:.2f}] pp"
            )
            if tests.get("relative_lift") is not None:
                lines.append(f"- Relative lift: {tests['relative_lift']:.1%}")
            lines.append(f"- Incremental opens (estimated): {tests['incremental_opens_estimated']:,.0f}")
        elif tests and tests.get("skipped"):
            lines.append(f"- Tests skipped: {tests['reason']}")

    lines += ["", "## 3. Value"]
    if "value_per_eligible_mean" in t:
        lines.append(f"- Value per eligible (treated): {t['value_per_eligible_mean']:,.2f}")
        if "funded_value_per_converter_mean" in t:
            lines.append(f"- Mean funded per converter (treated): {t['funded_value_per_converter_mean']:,.2f}")
            lines.append(f"- Median funded per converter (treated): {t['funded_value_per_converter_median']:,.2f}")
        lines.append(f"- Total funded (treated): {t['total_funded_value']:,.2f}")
        if h and "value_per_eligible_mean" in h:
            lines.append(f"- Value per eligible (holdout): {h['value_per_eligible_mean']:,.2f}")
    else:
        lines.append("- Funded value data not provided; conversion rate only.")

    lines += ["", "## 4. Causal read"]
    if tests and not tests.get("skipped"):
        lines += [
            f"- Two-proportion z p-value: {tests.get('two_proportion_z_pvalue')}",
            f"- Fisher's exact p-value: {tests['fisher_exact_pvalue']:.4f}",
            f"- Significant at α=0.05: {tests['significant_at_0_05']}",
        ]
        if "value_mann_whitney_pvalue" in tests:
            lines += [
                f"- Value per eligible lift: {tests['value_per_eligible_lift']:,.2f}, "
                f"95% CI [{tests['value_per_eligible_lift_ci_95'][0]:,.2f}, "
                f"{tests['value_per_eligible_lift_ci_95'][1]:,.2f}]",
                f"- Value Welch's t p-value: {tests['value_welch_t_pvalue']:.4f}",
                f"- Value Mann-Whitney p-value: {tests['value_mann_whitney_pvalue']:.4f}",
            ]
    else:
        lines += [
            "- No holdout was provided. The conversion rate above includes opens",
            "  that would have happened organically and is NOT a causal estimate of",
            "  the campaign's effect. Recommend a randomized holdout (10–20%) for",
            "  the next campaign.",
        ]

    lines += ["", "## 5. Segment breakdown", "See segments.csv."]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description="Cross-sell campaign analysis")
    ap.add_argument("--treated", required=True, type=Path)
    ap.add_argument("--holdout", type=Path, default=None)
    ap.add_argument("--product-opens", required=True, type=Path)
    ap.add_argument("--prior-holdings", type=Path, default=None)
    ap.add_argument("--target-product", required=True)
    ap.add_argument("--attribution-window", type=int, default=30)
    ap.add_argument("--campaign-start", default=None, help="ISO date for anchoring holdout window")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--campaign-name", default="campaign")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    treated_raw = load_csv(args.treated)
    product_opens = load_csv(args.product_opens)
    holdout_raw = load_csv(args.holdout) if args.holdout else None
    prior = load_csv(args.prior_holdings) if args.prior_holdings else None
    anchor = pd.Timestamp(args.campaign_start) if args.campaign_start else None

    if holdout_raw is not None:
        overlap = set(treated_raw["customer_id"]) & set(holdout_raw["customer_id"])
        if overlap:
            raise ValueError(f"{len(overlap)} customers appear in both treated and holdout — fix the input data")

    treated_elig, t_excl = apply_eligibility(treated_raw, prior, args.target_product)
    if holdout_raw is not None:
        holdout_elig, h_excl = apply_eligibility(holdout_raw, prior, args.target_product)
    else:
        holdout_elig, h_excl = None, 0

    treated_conv = attach_conversion(treated_elig, product_opens, args.target_product, args.attribution_window, anchor)
    holdout_conv = (
        attach_conversion(holdout_elig, product_opens, args.target_product, args.attribution_window, anchor)
        if holdout_elig is not None
        else None
    )

    summary: dict = {
        "campaign_name": args.campaign_name,
        "target_product": args.target_product,
        "attribution_window_days": args.attribution_window,
        "treated_excluded_prior_holders": t_excl,
        "holdout_excluded_prior_holders": h_excl,
        "engagement": engagement_metrics(treated_raw),
        "treated_summary": arm_summary("treated", treated_conv),
    }
    if holdout_conv is not None:
        summary["holdout_summary"] = arm_summary("holdout", holdout_conv)
        summary["holdout_tests"] = holdout_tests(treated_conv, holdout_conv)

    seg = segment_breakdown(treated_conv, holdout_conv)
    if not seg.empty:
        seg.to_csv(args.out / "segments.csv", index=False)

    (args.out / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    (args.out / "report.md").write_text(build_report(summary))

    print(build_report(summary))


if __name__ == "__main__":
    main()
