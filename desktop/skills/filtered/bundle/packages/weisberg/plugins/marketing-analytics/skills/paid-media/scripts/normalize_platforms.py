"""Platform data normalization for paid media analytics."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

try:
    import pandas as pd
except ModuleNotFoundError:  # pragma: no cover
    pd = None  # type: ignore[assignment]


PLATFORM_METRIC_MAP: dict[str, dict[str, str]] = {
    "google": {
        "Impressions": "impressions",
        "Clicks": "clicks",
        "Cost": "spend",
        "Conversions": "conversions",
        "ConversionValue": "revenue",
    },
    "meta": {
        "impressions": "impressions",
        "outbound_clicks": "clicks",
        "spend": "spend",
        "actions_purchase": "conversions",
        "action_values_purchase": "revenue",
    },
    "linkedin": {
        "impressions": "impressions",
        "clicks": "clicks",
        "costInLocalCurrency": "spend",
        "externalWebsiteConversions": "conversions",
        "conversionValueInLocalCurrency": "revenue",
    },
    "tiktok": {
        "impressions": "impressions",
        "clicks": "clicks",
        "spend": "spend",
        "conversions": "conversions",
        "value": "revenue",
    },
    "dv360": {
        "impressions": "impressions",
        "clicks": "clicks",
        "revenue": "spend",
        "totalConversions": "conversions",
        "totalConversionValue": "revenue",
    },
}

ATTRIBUTION_WINDOWS: dict[str, str] = {
    "google": "30-day click",
    "meta": "7-day click, 1-day view",
    "linkedin": "30-day click",
    "tiktok": "7-day click",
    "dv360": "floodlight",
}

SUPPORTED_PLATFORMS: list[str] = list(PLATFORM_METRIC_MAP.keys())


def _require_pandas() -> Any:
    if pd is None:
        raise ImportError("pandas is required for platform normalization")
    return pd


def _to_decimal(value: Any) -> Decimal:
    try:
        if value is None or value == "":
            return Decimal("0")
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def _safe_divide(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    if denominator == 0:
        return None
    return numerator / denominator


def load_platform_data(
    file_path: str | Path,
    platform: str,
) -> Any:
    pandas = _require_pandas()
    if platform not in SUPPORTED_PLATFORMS:
        raise ValueError(f"Unsupported platform: {platform}")
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(file_path)
    frame = pandas.read_csv(file_path)
    if "date" not in frame.columns:
        raise ValueError(f"{file_path.name} must include a date column")
    frame["date"] = pandas.to_datetime(frame["date"])
    return frame


def rename_columns(
    df: Any,
    platform: str,
) -> Any:
    pandas = _require_pandas()
    renamed = df.rename(columns=PLATFORM_METRIC_MAP[platform]).copy()
    for column in ("campaign_id", "ad_group_id", "keyword", "currency", "date"):
        if column not in renamed.columns:
            renamed[column] = None if column != "currency" else "USD"
    for metric in ("impressions", "clicks", "spend", "conversions", "revenue"):
        if metric not in renamed.columns:
            renamed[metric] = 0
        renamed[metric] = renamed[metric].apply(_to_decimal)
    renamed["platform"] = platform
    return renamed


def convert_google_micros(
    df: Any,
    columns: list[str] | None = None,
) -> Any:
    columns = columns or ["spend"]
    converted = df.copy()
    factor = Decimal("1000000")
    for column in columns:
        if column in converted.columns:
            converted[column] = converted[column].apply(lambda value: _to_decimal(value) / factor)
    return converted


def normalize_currency(
    df: Any,
    source_currency: str,
    target_currency: str = "USD",
    fx_rates: Optional[dict[str, Decimal]] = None,
) -> Any:
    normalized = df.copy()
    if source_currency == target_currency:
        normalized["reporting_currency"] = target_currency
        return normalized
    fx_rates = fx_rates or {}
    for metric in ("spend", "revenue"):
        if metric in normalized.columns:
            normalized[metric] = normalized.apply(
                lambda row: (
                    _to_decimal(row[metric])
                    * fx_rates.get(str(row["date"])[:10], fx_rates.get(source_currency, Decimal("1")))
                ),
                axis=1,
            )
    normalized["reporting_currency"] = target_currency
    return normalized


def add_attribution_label(
    df: Any,
    platform: str,
) -> Any:
    labeled = df.copy()
    labeled["attribution_window"] = ATTRIBUTION_WINDOWS[platform]
    return labeled


def compute_derived_metrics(df: Any) -> Any:
    derived = df.copy()
    derived["cpm"] = derived.apply(
        lambda row: _safe_divide(_to_decimal(row["spend"]) * Decimal("1000"), _to_decimal(row["impressions"])),
        axis=1,
    )
    derived["cpc"] = derived.apply(
        lambda row: _safe_divide(_to_decimal(row["spend"]), _to_decimal(row["clicks"])), axis=1
    )
    derived["ctr"] = derived.apply(
        lambda row: _safe_divide(_to_decimal(row["clicks"]), _to_decimal(row["impressions"])), axis=1
    )
    derived["cpa"] = derived.apply(
        lambda row: _safe_divide(_to_decimal(row["spend"]), _to_decimal(row["conversions"])), axis=1
    )
    derived["roas"] = derived.apply(
        lambda row: _safe_divide(_to_decimal(row["revenue"]), _to_decimal(row["spend"])), axis=1
    )
    return derived


def normalize_platform(
    file_path: str | Path,
    platform: str,
    target_currency: str = "USD",
    fx_rates: Optional[dict[str, Decimal]] = None,
) -> Any:
    frame = load_platform_data(file_path, platform)
    frame = rename_columns(frame, platform)
    if platform == "google":
        frame = convert_google_micros(frame, columns=["spend", "revenue"])
    frame = normalize_currency(
        frame, str(frame["currency"].iloc[0] or target_currency), target_currency=target_currency, fx_rates=fx_rates
    )
    frame = add_attribution_label(frame, platform)
    frame = compute_derived_metrics(frame)
    frame["campaign_id"] = frame["campaign_id"].fillna(frame["platform"] + "_unknown_campaign")
    return frame


def unify_all_platforms(
    raw_dir: str | Path,
    target_currency: str = "USD",
    fx_rates: Optional[dict[str, Decimal]] = None,
) -> Any:
    pandas = _require_pandas()
    raw_dir = Path(raw_dir)
    frames = []
    for platform in SUPPORTED_PLATFORMS:
        file_path = raw_dir / f"campaign_spend_{platform}.csv"
        if file_path.exists():
            frames.append(normalize_platform(file_path, platform, target_currency=target_currency, fx_rates=fx_rates))
    if not frames:
        raise FileNotFoundError(f"No paid media exports found in {raw_dir}")
    combined = pandas.concat(frames, ignore_index=True)
    return combined.sort_values(["date", "platform", "campaign_id"]).reset_index(drop=True)
