## Input
Our main metric went down. Help us figure out why.

## Expected output
Diagnosis can't proceed without knowing which metric changed, by how much, and when.

What is known:
- A metric declined

What must be provided before diagnosis can begin:
- Which metric? (name and definition)
- What is the observed change? (current value vs. prior baseline)
- When did the change start? (exact date or approximate window)
- What product changes were deployed recently?

Without these, the only output is a generic diagnostic checklist, not a real diagnosis.

Generic diagnostic steps (to apply once inputs are available):
1. Verify the data is real — check instrumentation and pipeline before assuming a product problem
2. Identify the exact timing — correlate with product changes or external events
3. Segment the change — is it uniform across platforms, channels, and user groups?
4. List all product changes in the window — even minor ones
5. Rank candidate causes by likelihood and evidence

Suggested next inputs:
- Metric name and current vs. prior value
- Approximate time when the drop started
- Any recent product, infrastructure, or marketing changes

Confidence level:
Provisional
