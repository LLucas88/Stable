## Input
We're building a location-based "nearby deals" feature for our consumer marketplace app. The feature shows users deals at businesses within 2km of their current location. Location is collected in real-time (when the feature is open) and stored for 30 days to improve deal personalization. Location data is shared with merchant partners to enable geo-triggered offers. We operate in the EU and UK. Target users include general consumers, 18+. We will also analyze location patterns to infer user interests (e.g., "frequents coffee shops" or "visits gyms").

## Expected output
Personal data inventory (type, sensitivity, volume):

| Data type | Sensitivity | Volume |
|---|---|---|
| Real-time location | High — enables physical tracking | All users who enable the feature |
| Location history (30 days) | High — reveals patterns, routines, home/work locations | Stored for all active users |
| Inferred interest profiles ("frequents coffee shops") | High — derived sensitive data, may reveal health or lifestyle information | Generated for all active users |
| Merchant partner data sharing | High — location data shared with third parties | Shared for all users who receive geo-triggered offers |

Data flow map:
1. Collection: real-time GPS coordinates collected when user opens the feature (in-app)
2. Processing: location matched to nearby business database → deal matching algorithm runs
3. Storage: location coordinates stored on servers for 30 days
4. Inference: location history analyzed to generate interest profile tags
5. Sharing: coordinates or proximity signals shared with merchant partners when a geo-triggered offer is activated
6. Deletion: location history deleted after 30 days (process must be confirmed as automated, not manual)

Applicable regulations and requirements:
- EU GDPR: location data is personal data; inferred data is derived personal data. Article 5(b): purpose limitation — storing location for "30 days to improve personalization" may exceed the purpose of the original collection (showing nearby deals). Purpose compatibility assessment required.
- GDPR Article 35: a Data Protection Impact Assessment (DPIA) is mandatory for large-scale processing of location data. This PIA is a precursor to the formal DPIA.
- GDPR Article 9: if inferred interests touch on health-related categories (gym visits may imply health conditions), this may constitute special category data processing. Legal basis would need to be explicit consent, not legitimate interest.
- UK GDPR: same requirements as EU GDPR post-Brexit. ICO guidance on location data applies.
- UK PECR: if location data is being used for direct marketing (geo-triggered offers), consent under PECR is required in addition to GDPR consent.

Privacy risks by data flow stage:

| Stage | Risk | Severity |
|---|---|---|
| Collection | Users may not fully understand that real-time location is being collected continuously while the feature is open | High |
| Storage (30 days) | Long retention creates a large dataset of sensitive location history. Data breach would expose users' movements and routines | High |
| Inference | Location-based interest inference may produce sensitive category data (health, religion based on place of worship visits, political affiliation) without explicit consent for special category processing | Critical |
| Merchant sharing | Third-party data sharing of location data requires a Data Processing Agreement; merchants are data processors. Sharing without DPA in place is a GDPR violation | High |
| Deletion | 30-day deletion must be automated and verified. Manual processes are unreliable | Medium |

Risk severity assessment:
- Location inference to sensitive categories: Critical — requires explicit consent or legal re-assessment
- Merchant data sharing without DPA: High — GDPR violation if DPA not in place before launch
- Long retention and breach risk: High — 30-day history is substantial; consider whether 7 days achieves the same personalization goal
- User consent clarity: High — users must explicitly consent to location collection, storage, and merchant sharing as separate consent actions (not bundled)

Mitigations per risk:
1. Consent design: separate consent prompts for (a) real-time location for deal matching, (b) location storage for personalization, (c) merchant data sharing. All must be opt-in, not opt-out. No pre-checked boxes.
2. Inference categories: before the interest inference feature is enabled, legal must assess whether any inferred categories constitute GDPR Article 9 special category data. If yes, explicit consent is required for those categories or the feature must be scoped to exclude them.
3. Merchant DPAs: execute Data Processing Agreements with all merchant partners before the feature goes live. Merchants must only receive proximity signals, not precise coordinates.
4. Retention reduction: evaluate whether 7-day retention achieves the personalization objective. If yes, reduce to 7 days — this meaningfully reduces breach risk and GDPR proportionality concerns.
5. DPIA: commission the formal DPIA (GDPR Art. 35) based on this PIA. DPIA must be completed before EU/UK launch.
6. Deletion verification: implement automated deletion with logging; audit the deletion process quarterly.

Residual risk assessment:
After mitigations, the residual risk is medium. The biggest remaining risk is the interest inference feature if it touches special categories — this is a binary compliance question (explicit consent or don't infer special categories). All other risks can be reduced to low with the mitigations above.

Recommendation:
Proceed with conditions. The feature can launch after:
1. Consent design is implemented and tested
2. Merchant DPAs are executed
3. DPIA is completed with no blocking findings
4. Legal confirms the interest inference scope does not include special category data (or explicit consent is obtained for it)
5. Retention period is confirmed as 7 or 30 days with documented justification

Do not launch before the formal DPIA is complete. The DPIA is mandatory and cannot be retroactive.
