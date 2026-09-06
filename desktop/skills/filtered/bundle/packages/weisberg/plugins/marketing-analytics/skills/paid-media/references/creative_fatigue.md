# Creative Fatigue Detection

Reference documentation for identifying creative fatigue in paid media campaigns
and recommending rotation schedules.

## Definition

Creative fatigue occurs when an ad's performance degrades over time due to
audience overexposure. It manifests as declining CTR and conversion rates even
when targeting and bid strategy remain constant.

## Detection Methodology

### Step 1: Metric Selection

Use **conversion-weighted CTR** (cwCTR) as the primary fatigue signal, not raw
CTR. This avoids incorrectly flagging top-of-funnel awareness creatives that
naturally have lower CTR but are not fatiguing.

```
cwCTR = CTR * (conversion_rate / median_conversion_rate)
```

Where `median_conversion_rate` is the campaign-level median conversion rate over
the observation window.

### Step 2: Time-Series Construction

For each creative:

1. Aggregate daily cwCTR values from the creative's first impression date.
2. Require a minimum of 7 days of data before scoring.
3. Apply a 3-day centered moving average to smooth daily variance.

### Step 3: Piecewise Regression

Fit a two-phase piecewise linear regression to the smoothed cwCTR series:

- **Phase 1 (Plateau)**: The creative is performing at or near peak. Slope is
  approximately zero or slightly positive.
- **Phase 2 (Decay)**: Performance is declining. Slope is negative.

The breakpoint between phases is identified by minimizing the combined residual
sum of squares. Use the Muggeo segmented regression approach.

### Step 4: Fatigue Scoring

Compute a fatigue score from 0 (fresh) to 100 (exhausted):

```
fatigue_score = min(100, max(0, 100 * (1 - current_cwCTR / peak_cwCTR)))
```

Where `peak_cwCTR` is the maximum smoothed cwCTR during the plateau phase.

| Score Range | Label       | Interpretation                           |
|-------------|-------------|------------------------------------------|
| 0-20        | Fresh       | Creative performing at or near peak      |
| 21-40       | Early wear  | Minor decline, monitor closely           |
| 41-60       | Moderate    | Noticeable decline, prepare replacement  |
| 61-80       | Fatigued    | Significant decline, rotate soon         |
| 81-100      | Exhausted   | Severely degraded, rotate immediately    |

### Step 5: Projection

Using the Phase 2 (decay) slope, project forward to estimate when cwCTR will
drop below 50% of peak. If that date is within 3 days, emit a rotation alert.

```
days_to_50pct = (0.5 * peak_cwCTR - current_cwCTR) / decay_slope
```

## Rotation Heuristics

### When to Rotate

| Condition                                          | Action              |
|----------------------------------------------------|---------------------|
| Fatigue score > 60                                 | Queue replacement   |
| Fatigue score > 80                                 | Rotate immediately  |
| Projected 50% threshold within 3 days              | Rotate immediately  |
| Frequency > 3.0 and fatigue score > 40             | Rotate soon         |

### Rotation Strategy

- Maintain a creative pipeline with at least 2 replacement creatives per ad
  group in various stages of readiness.
- When rotating, do not pause the fatigued creative instantly. Run both old and
  new creatives for 3-5 days to allow the learning phase, then pause the
  fatigued creative.
- Rotate creatives within the same ad group to preserve audience signals and
  bid optimization history.

### Frequency as a Leading Indicator

Monitor ad frequency (impressions / unique reach) as an early warning:

| Frequency | Risk Level | Typical Fatigue Timeline       |
|-----------|------------|--------------------------------|
| < 2.0     | Low        | Several weeks before fatigue   |
| 2.0-3.0   | Moderate   | Fatigue likely within 1-2 weeks|
| 3.0-5.0   | High       | Fatigue likely within days     |
| > 5.0     | Critical   | Fatigue probably already active |

Note: frequency thresholds vary by platform and campaign type. Display/video
creatives fatigue faster than search ads.

## Platform-Specific Considerations

### Meta Ads

- Meta provides frequency data natively. Use `frequency` field directly.
- Dynamic creative optimization (DCO) campaigns self-rotate elements but
  can still fatigue at the asset level. Analyze individual image/video/headline
  performance separately.

### Google Ads

- Google does not report frequency for search campaigns. Use impression share
  and average position changes as proxy signals.
- Responsive Search Ads (RSAs) self-optimize asset combinations. Monitor
  individual asset performance ratings for fatigue signals.

### LinkedIn

- Smaller audience pools mean fatigue occurs faster. Reduce frequency
  thresholds by roughly 30% compared to Meta/Google defaults.

### TikTok

- Short-form video creatives fatigue faster than static or carousel formats.
  Apply a 0.7x multiplier to the default fatigue score thresholds.
- TikTok's creative tools (Spark Ads, branded effects) have different fatigue
  profiles; treat each format independently.

## Output Schema

```json
{
  "creative_id": "cr_98765",
  "platform": "meta",
  "campaign_id": "camp_111",
  "ad_group_id": "adset_222",
  "first_impression_date": "2026-02-15",
  "days_active": 32,
  "peak_cwctr": 0.045,
  "current_cwctr": 0.022,
  "fatigue_score": 51,
  "fatigue_label": "Moderate",
  "decay_slope": -0.0008,
  "projected_days_to_50pct": 5,
  "frequency": 3.2,
  "recommendation": "Prepare replacement creative. Projected to cross 50% threshold in 5 days."
}
```
