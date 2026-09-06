## Input
We want to add AI to help users write better product descriptions on our e-commerce platform. Sellers list products and the descriptions are often low quality. Can you help us frame the value?

## Expected output
User problem statement (provisional):
Sellers on the platform write low-quality product descriptions. This likely affects buyer conversion — buyers need descriptions to make purchase decisions. "Low quality" needs to be defined: is it too short? Missing key details? Poor grammar? The intervention differs depending on what's actually wrong.

Current user behavior without AI:
- Sellers write descriptions manually, likely without guidance on what information buyers need
- Low-quality descriptions presumably result in lower conversion or more buyer questions
- Sellers don't know their descriptions are underperforming unless they track conversion rate per listing

AI-delivered outcome (provisional):
Seller gets an AI-improved description suggestion that they can accept or edit — reducing the skill required to write a high-converting product description.

Business value translation:
- If better descriptions increase buyer conversion rate: more GMV per listing → higher seller success → seller retention and platform revenue
- If better descriptions reduce buyer questions or returns: operational savings and buyer satisfaction
- The primary metric needs to be chosen carefully: description quality is not directly measurable — proxy metrics like click-through rate or conversion rate per listing are more reliable

Risk identification:
1. Sellers don't use the feature: if sellers don't see value quickly, adoption will be low. Demo-quality AI improvements on simple product descriptions may not translate to the sellers' actual category.
2. AI generates inaccurate descriptions: if the AI adds product details that aren't true (wrong specs, unsupported claims), this creates liability for sellers and the platform.
3. Descriptions become homogeneous: if all AI-generated descriptions sound similar, listings lose differentiation — bad for sellers and platform diversity.

Success definition (to validate):
- Feature adoption rate: % of active sellers who use the AI suggestion at least once
- Listing conversion rate: do listings with AI-improved descriptions convert better? (Requires A/B test)
- Seller satisfaction with the feature: post-use rating

Missing context before a confident build decision:
- What specifically is "low quality" about current descriptions? (Too short? Missing specs? Grammar?) Without this, the AI feature may not fix the actual problem.
- Is there user research confirming sellers want help, or is this a product team assumption?
- What categories are most affected? (A luxury handbag description has different requirements than a commodity USB cable)

Build / don't build recommendation:
Provisional — the problem direction is plausible but needs validation before committing to full build. Run 5 seller interviews on the description-writing experience before proceeding.
