## Input
Build me a customer health score.

## Expected output
A health score model requires two things before it can be designed: the data signals you have available, and some understanding of what health means for your product.

What is needed:
- What data do you currently collect? (Login frequency, feature usage, support tickets, NPS, billing data, etc.)
- What type of product and customer are you scoring? (B2B SaaS, B2C subscription, marketplace, etc.)

Optional but significantly improves the model:
- Historical churn data: which accounts churned in the last 12 months? Were there behavioral patterns before churn?
- Account segments or tiers (e.g., SMB vs. enterprise may need different health definitions)
- CS team workflow: how will the score be used? Who sees it, how often, and what do they do with it?

Without knowing what data is available, the model design is purely abstract and may describe signals you can't measure.

Suggested next inputs:
- "We have data on [login dates / feature usage / support tickets / NPS / other]"
- "Our product is [type] and customers are [segment]"
- "Our biggest concern is [identifying churn early / finding expansion candidates / both]"
