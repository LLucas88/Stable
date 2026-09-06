"""Budget pacing calculation for paid media campaigns."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover
    pd = None  # type: ignore[assignment]


DEFAULT_SMOOTHING_ALPHA = 0.3
DEFAULT_WARNING_THRESHOLD = 0.10
DEFAULT_CRITICAL_THRESHOLD = 0.20


@dataclass
class PacingResult:
    campaign_id: str
    platform: str
    budget_plan: Decimal
    spend_to_date: Decimal
    days_elapsed: int
    days_remaining: int
    projected_spend: Decimal
    variance_pct: Decimal
    alert_level: str
    daily_target_remaining: Optional[Decimal]


def exponential_smoothing(
    daily_spend: list[Decimal],
    alpha: float = DEFAULT_SMOOTHING_ALPHA,
) -> Decimal:
    if not daily_spend:
        raise ValueError("daily_spend cannot be empty")
    if not 0 < alpha <= 1:
        raise ValueError("alpha must be in (0, 1]")
    smoothed = daily_spend[0]
    alpha_decimal = Decimal(str(alpha))
    for value in daily_spend[1:]:
        smoothed = alpha_decimal * value + (Decimal("1") - alpha_decimal) * smoothed
    return smoothed


def apply_dow_seasonality(
    smoothed_rate: Decimal,
    days_remaining_by_dow: dict[int, int],
    dow_factors: dict[int, Decimal],
) -> Decimal:
    total = Decimal("0")
    for dow, count in days_remaining_by_dow.items():
        total += smoothed_rate * dow_factors.get(dow, Decimal("1")) * Decimal(str(count))
    return total


def compute_pacing(
    daily_spend: list[Decimal],
    budget_plan: Decimal,
    current_date: date,
    month_start: date,
    month_end: date,
    alpha: float = DEFAULT_SMOOTHING_ALPHA,
    dow_factors: Optional[dict[int, Decimal]] = None,
) -> PacingResult:
    spend_to_date = sum(daily_spend, Decimal("0"))
    days_elapsed = max((current_date - month_start).days + 1, 1)
    days_remaining = max((month_end - current_date).days, 0)
    smoothed_rate = exponential_smoothing(daily_spend, alpha=alpha)
    if dow_factors:
        remaining_by_dow: dict[int, int] = {}
        for offset in range(1, days_remaining + 1):
            dow = (current_date + timedelta(days=offset)).weekday()
            remaining_by_dow[dow] = remaining_by_dow.get(dow, 0) + 1
        remaining_projection = apply_dow_seasonality(smoothed_rate, remaining_by_dow, dow_factors)
    else:
        remaining_projection = smoothed_rate * Decimal(str(days_remaining))
    projected_spend = spend_to_date + remaining_projection
    variance_pct = ((projected_spend - budget_plan) / budget_plan) if budget_plan else Decimal("0")
    return PacingResult(
        campaign_id="",
        platform="",
        budget_plan=budget_plan,
        spend_to_date=spend_to_date,
        days_elapsed=days_elapsed,
        days_remaining=days_remaining,
        projected_spend=projected_spend,
        variance_pct=variance_pct,
        alert_level=determine_alert_level(variance_pct),
        daily_target_remaining=compute_daily_target_remaining(budget_plan, spend_to_date, days_remaining),
    )


def determine_alert_level(
    variance_pct: Decimal,
    warning_threshold: float = DEFAULT_WARNING_THRESHOLD,
    critical_threshold: float = DEFAULT_CRITICAL_THRESHOLD,
) -> str:
    absolute = abs(float(variance_pct))
    if absolute >= critical_threshold:
        return "critical"
    if absolute >= warning_threshold:
        return "warning"
    return "none"


def compute_daily_target_remaining(
    budget_plan: Decimal,
    spend_to_date: Decimal,
    days_remaining: int,
) -> Optional[Decimal]:
    if days_remaining <= 0:
        return None
    return (budget_plan - spend_to_date) / Decimal(str(days_remaining))


def compute_dow_factors(
    historical_spend: "pd.DataFrame",
) -> dict[int, Decimal]:
    if pd is None:
        raise ImportError("pandas is required for DOW factor computation")
    working = historical_spend.copy()
    working["date"] = pd.to_datetime(working["date"])
    working["spend"] = working["spend"].apply(lambda value: Decimal(str(value)))
    overall_mean = sum(working["spend"], Decimal("0")) / Decimal(str(len(working) or 1))
    grouped = working.groupby(working["date"].dt.dayofweek)["spend"].apply(
        lambda values: sum(values, Decimal("0")) / Decimal(str(len(values) or 1))
    )
    return {int(dow): (value / overall_mean if overall_mean else Decimal("1")) for dow, value in grouped.items()}


def run_pacing_report(
    df: "pd.DataFrame",
    budget_plans: dict[str, Decimal],
    current_date: date,
    alpha: float = DEFAULT_SMOOTHING_ALPHA,
) -> list[PacingResult]:
    if pd is None:
        raise ImportError("pandas is required for pacing reports")
    results: list[PacingResult] = []
    working = df.copy()
    working["date"] = pd.to_datetime(working["date"])
    working["spend"] = working["spend"].apply(lambda value: Decimal(str(value)))
    month_start = current_date.replace(day=1)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    month_end = next_month - timedelta(days=1)
    for (campaign_id, platform), group in working.groupby(["campaign_id", "platform"]):
        if campaign_id not in budget_plans:
            continue
        month_data = group[
            (group["date"].dt.date >= month_start) & (group["date"].dt.date <= current_date)
        ].sort_values("date")
        daily_spend = month_data.groupby(month_data["date"].dt.date)["spend"].sum().tolist()
        if not daily_spend:
            continue
        historical = group[group["date"].dt.date < month_start].sort_values("date")
        dow_factors = compute_dow_factors(historical.tail(28)) if len(historical) >= 7 else None
        pacing = compute_pacing(
            daily_spend=daily_spend,
            budget_plan=budget_plans[campaign_id],
            current_date=current_date,
            month_start=month_start,
            month_end=month_end,
            alpha=alpha,
            dow_factors=dow_factors,
        )
        pacing.campaign_id = str(campaign_id)
        pacing.platform = str(platform)
        results.append(pacing)
    return sorted(results, key=lambda item: abs(item.variance_pct), reverse=True)
