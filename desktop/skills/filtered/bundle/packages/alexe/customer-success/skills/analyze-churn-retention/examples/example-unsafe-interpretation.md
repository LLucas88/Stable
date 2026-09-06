## Input
Two issues to sort out:

First: our monthly churn is 6%, so our annual churn must be 72%. That's terrible. We need to fix this immediately.

Second: our 6% monthly churn is much worse than our competitor. They just published a blog post saying their churn is under 4%. We're clearly losing.

Context: we're a B2C fitness subscription app. The competitor mentioned is a B2B employee wellness platform.

## Expected output

**Issue 1: The 72% annual churn calculation is wrong.**

Annual churn is not monthly churn × 12. That formula overstates annual loss because it ignores that as users churn, the remaining pool is smaller each month.

The correct formula:
```
annual_churn = 1 - (1 - monthly_churn)^12
```

At 6% monthly churn:
```
annual_churn = 1 - (1 - 0.06)^12 = 1 - (0.94)^12 = 1 - 0.476 = 52.4%
```

Your annual churn is approximately 52%, not 72%.

This matters for decision-making. A 52% annual churn figure still represents a significant retention problem worth addressing. But 72% vs. 52% is a 20-point difference that affects how urgently you frame the issue, how much you invest in retention, and how you model LTV.

The 12× error is one of the most common churn calculation mistakes. Document the correct formula and use it consistently.

**Issue 2: The competitor comparison is invalid.**

You are a B2C fitness subscription app. The competitor is a B2B employee wellness platform. These are different business models, different customer relationships, and different churn dynamics.

B2C subscription churn: monthly voluntary cancellations by individual consumers who can leave at any time. Typical range: 3-8% monthly.

B2B SaaS churn: annual contract cancellations or non-renewals by companies. Typical range: 1-2.5% monthly.

B2B products have structurally lower reported monthly churn because:
- Customers are on annual contracts, so mid-year churn is rare
- Procurement and switching costs are high
- A "churn" event is an organizational decision, not a consumer tap

Comparing 6% B2C monthly churn to 4% B2B monthly churn says nothing useful. You would expect B2B to report lower monthly churn by design.

A valid comparison for your product:
- Other B2C fitness or wellness apps
- Consumer subscription apps with a similar price point and usage pattern

6% monthly churn for a B2C fitness app is at the high end of the typical range but not anomalous. Whether it's a problem depends on your LTV, CAC payback period, and whether retention is improving or worsening over time — not on a competitor's published B2B metric.
