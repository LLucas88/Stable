"""Creative fatigue detection for paid media campaigns."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover
    pd = None  # type: ignore[assignment]


MIN_DAYS_FOR_SCORING = 7
SMOOTHING_WINDOW = 3
FATIGUE_THRESHOLD_ROTATE = 60
FATIGUE_THRESHOLD_IMMEDIATE = 80
PROJECTION_HORIZON_DAYS = 3
PEAK_DECLINE_ALERT_PCT = 0.50
PLATFORM_FATIGUE_MULTIPLIERS = {"google": 1.0, "meta": 1.0, "linkedin": 0.7, "tiktok": 0.7, "dv360": 1.0}


@dataclass
class FatigueResult:
    creative_id: str
    platform: str
    campaign_id: str
    ad_group_id: str
    first_impression_date: str
    days_active: int
    peak_cwctr: float
    current_cwctr: float
    fatigue_score: int
    fatigue_label: str
    decay_slope: Optional[float]
    projected_days_to_50pct: Optional[int]
    frequency: Optional[float]
    recommendation: str


def _require_pandas():
    if pd is None:
        raise ImportError("pandas is required for creative fatigue analysis")
    return pd


def compute_conversion_weighted_ctr(
    df: "pd.DataFrame",
    campaign_median_conv_rate: float,
) -> "pd.Series":
    baseline = campaign_median_conv_rate if campaign_median_conv_rate > 0 else 1.0
    return df["ctr"].astype(float) * (df["conversion_rate"].astype(float) / baseline)


def smooth_series(
    series: "pd.Series",
    window: int = SMOOTHING_WINDOW,
) -> "pd.Series":
    return series.rolling(window=window, center=True, min_periods=1).mean()


def fit_piecewise_regression(
    series: "pd.Series",
) -> dict[str, Any]:
    values = series.astype(float).tolist()
    days = list(range(len(values)))
    if len(values) < 4:
        return {
            "breakpoint": 0,
            "plateau_slope": 0.0,
            "plateau_intercept": values[0] if values else 0.0,
            "decay_slope": 0.0,
            "decay_intercept": values[-1] if values else 0.0,
            "residual_ss": 0.0,
        }

    def fit_line(xs: list[int], ys: list[float]) -> tuple[float, float, float]:
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        denominator = sum((x - mean_x) ** 2 for x in xs) or 1.0
        slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denominator
        intercept = mean_y - slope * mean_x
        rss = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
        return slope, intercept, rss

    best: dict[str, Any] | None = None
    for breakpoint in range(2, len(values) - 1):
        plateau_slope, plateau_intercept, plateau_rss = fit_line(days[:breakpoint], values[:breakpoint])
        decay_slope, decay_intercept, decay_rss = fit_line(days[breakpoint:], values[breakpoint:])
        candidate = {
            "breakpoint": breakpoint,
            "plateau_slope": plateau_slope,
            "plateau_intercept": plateau_intercept,
            "decay_slope": decay_slope,
            "decay_intercept": decay_intercept,
            "residual_ss": plateau_rss + decay_rss,
        }
        if best is None or candidate["residual_ss"] < best["residual_ss"]:
            best = candidate
    return best or {
        "breakpoint": 0,
        "plateau_slope": 0.0,
        "plateau_intercept": values[0],
        "decay_slope": 0.0,
        "decay_intercept": values[-1],
        "residual_ss": 0.0,
    }


def compute_fatigue_score(
    peak_cwctr: float,
    current_cwctr: float,
) -> int:
    if peak_cwctr <= 0:
        return 0
    score = 100 * (1 - current_cwctr / peak_cwctr)
    return int(max(0, min(100, round(score))))


def fatigue_label(score: int) -> str:
    if score <= 20:
        return "Fresh"
    if score <= 40:
        return "Early wear"
    if score <= 60:
        return "Moderate"
    if score <= 80:
        return "Fatigued"
    return "Exhausted"


def project_days_to_threshold(
    current_cwctr: float,
    peak_cwctr: float,
    decay_slope: float,
    threshold_pct: float = PEAK_DECLINE_ALERT_PCT,
) -> Optional[int]:
    threshold_value = threshold_pct * peak_cwctr
    if current_cwctr <= threshold_value or decay_slope >= 0:
        return None
    return max(int((threshold_value - current_cwctr) / decay_slope), 0)


def generate_recommendation(
    fatigue_score: int,
    projected_days: Optional[int],
    frequency: Optional[float],
) -> str:
    if fatigue_score > FATIGUE_THRESHOLD_IMMEDIATE or (
        projected_days is not None and projected_days <= PROJECTION_HORIZON_DAYS
    ):
        return "Rotate immediately."
    if fatigue_score > FATIGUE_THRESHOLD_ROTATE:
        return "Queue replacement creative."
    if frequency is not None and frequency > 3.0 and fatigue_score > 40:
        return "Rotate soon and monitor overlap period."
    return "Continue monitoring."


def analyze_creative(
    creative_df: "pd.DataFrame",
    campaign_median_conv_rate: float,
    platform: str,
) -> Optional[FatigueResult]:
    pandas = _require_pandas()
    ordered = creative_df.sort_values("date").reset_index(drop=True).copy()
    if len(ordered) < MIN_DAYS_FOR_SCORING:
        return None
    ordered["cwctr"] = compute_conversion_weighted_ctr(ordered, campaign_median_conv_rate)
    ordered["smoothed_cwctr"] = smooth_series(ordered["cwctr"])
    piecewise = fit_piecewise_regression(ordered["smoothed_cwctr"])
    breakpoint = piecewise["breakpoint"]
    peak_cwctr = float(ordered.loc[:breakpoint, "smoothed_cwctr"].max())
    current_cwctr = float(ordered["smoothed_cwctr"].iloc[-1])
    base_score = compute_fatigue_score(peak_cwctr, current_cwctr)
    multiplier = PLATFORM_FATIGUE_MULTIPLIERS.get(platform, 1.0)
    adjusted_score = int(max(0, min(100, round(base_score / multiplier))))
    projected = project_days_to_threshold(current_cwctr, peak_cwctr, piecewise["decay_slope"])
    frequency = float(ordered["frequency"].mean()) if "frequency" in ordered.columns else None
    recommendation = generate_recommendation(adjusted_score, projected, frequency)
    return FatigueResult(
        creative_id=str(ordered["creative_id"].iloc[0]),
        platform=platform,
        campaign_id=str(ordered["campaign_id"].iloc[0]),
        ad_group_id=str(ordered["ad_group_id"].iloc[0]),
        first_impression_date=pandas.to_datetime(ordered["date"].iloc[0]).strftime("%Y-%m-%d"),
        days_active=len(ordered),
        peak_cwctr=peak_cwctr,
        current_cwctr=current_cwctr,
        fatigue_score=adjusted_score,
        fatigue_label=fatigue_label(adjusted_score),
        decay_slope=piecewise["decay_slope"],
        projected_days_to_50pct=projected,
        frequency=frequency,
        recommendation=recommendation,
    )


def analyze_all_creatives(
    df: "pd.DataFrame",
) -> list[FatigueResult]:
    results: list[FatigueResult] = []
    campaign_medians = df.groupby(["platform", "campaign_id"])["conversion_rate"].median().to_dict()
    for (platform, campaign_id, creative_id), creative_df in df.groupby(["platform", "campaign_id", "creative_id"]):
        result = analyze_creative(
            creative_df,
            campaign_medians[(platform, campaign_id)],
            platform=str(platform),
        )
        if result is not None:
            results.append(result)
    return sorted(results, key=lambda item: item.fatigue_score, reverse=True)
