## Input
We want to build a retention playbook for our SaaS. We lose customers but we're not totally sure why. We think the main issues are that people don't use the product enough and that we're too slow to react when they're about to leave.

## Expected output
A full retention playbook cannot be designed without confirmed churn root causes. The two patterns you've described ("not enough usage" and "too slow to react") are symptoms, not root causes. Without knowing why usage drops or what triggers the decision to cancel, interventions will be guesses.

That said, here is a provisional playbook based on the most common SaaS churn patterns matching your description:

---

**Provisional Play 1: Low-usage early warning**

Trigger signal (to define): No login in [X] days — you need to determine what the right threshold is. For daily-use tools, 7 days is critical. For weekly-use tools, 21 days might be the threshold.

Intervention action:
- Automated email: "We noticed you haven't been in [Product] recently — is there anything we can help with?" + link to the most useful resource or feature guide
- If no response in 7 days: CSM personal outreach (or automated if no CSM coverage)

Missing for this play: what is the right "no login" threshold for your product? This depends on expected usage frequency.

---

**Provisional Play 2: Pre-cancellation intervention**

Trigger signal: Cancellation flow initiated (user clicks "Cancel subscription" or "Manage plan").

Intervention action:
- In-app pause option: offer a 1-month pause before cancellation — reduces impulsive cancellations
- Exit offer: discount for next month if they choose to stay (test this — it can work or attract price-sensitive churners who would leave anyway)

---

What this playbook is missing:
- Churn root causes: "not using the product" could mean the product isn't solving their problem, the onboarding failed, or the problem they hired it for is gone. Each needs a different response.
- CS team structure: high-touch plays require CSM capacity. If you have no CSM, the playbook must be automated-first.
- Effectiveness measurement: without defining what success looks like per play, you won't know what to keep or cut.

Recommended next step before finalizing the playbook: analyze the last 20–30 churned accounts. What did their usage look like in the 30 days before they cancelled? That pattern defines the trigger signals.
