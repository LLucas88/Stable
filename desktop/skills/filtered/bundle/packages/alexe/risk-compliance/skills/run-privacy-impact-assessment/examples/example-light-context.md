## Input
We're adding a feature where users can optionally connect their LinkedIn profile to autofill their account information. We operate in the EU and US. Not sure what privacy implications this has.

## Expected output
Personal data inventory (type, sensitivity, volume):
- Name, email, professional history, profile photo: personal data imported from LinkedIn
- Connected account (OAuth token): authentication credential — sensitive
- Volume: users who opt in (voluntary feature)

Data flow map:
1. Collection: user initiates LinkedIn OAuth connection; LinkedIn API returns profile data with user's permission
2. Processing: profile data used to autofill registration or account fields
3. Storage: what is stored after autofill needs to be defined — is it the raw LinkedIn data, the filled fields only, or the OAuth token for repeated access?
4. Sharing: is any LinkedIn data shared with third parties or used for other purposes?

The "not sure" framing is a significant gap — the privacy implications depend entirely on what is stored and for how long.

Applicable regulations:
- EU GDPR: LinkedIn profile data is personal data. Under GDPR, the purpose of collecting it must be clear, and users must be informed. Purpose limitation: if data is collected for autofill, it cannot be used for other purposes (e.g., marketing targeting) without separate consent.
- UK GDPR: same as EU GDPR.
- CCPA (California): users have the right to know what data is collected and request deletion.
- LinkedIn API terms of service: LinkedIn restricts what data collected via their API can be stored and for how long. The company's use of LinkedIn data must comply with LinkedIn's API terms, not just GDPR.

Privacy risks by stage:
- If the OAuth token is stored permanently: the application can access LinkedIn data ongoing without re-requesting user consent. This may exceed the original purpose.
- If raw LinkedIn data is stored beyond the autofill moment: retention of a full professional profile has broader privacy implications than just autofilling a name field.
- If users don't understand what data is being imported: they may connect LinkedIn without realizing what fields will be filled or what will be stored.

Key questions before the PIA can be completed:
1. What exactly is stored after autofill — the imported fields only, or the full profile?
2. Is the OAuth token stored (enabling future access) or discarded after the autofill session?
3. Is any LinkedIn data used for purposes beyond autofill (personalization, targeting)?

Mitigations per risk:
- Show users a clear preview of what data will be imported before they confirm the connection
- Discard the OAuth token after the autofill session if ongoing access is not needed
- State data retention for LinkedIn-imported data explicitly
- Comply with LinkedIn API storage limits (typically 30-day data retention limitation for some data types)

Residual risk:
Low to medium, depending on what is stored. The feature is opt-in and the data type (professional profile) is not highly sensitive for most users. Main risks are controlled by clear consent design and data minimization.

Recommendation:
Proceed after confirming the three open questions above. Legal review is advisable given LinkedIn API terms + GDPR intersection, but this does not appear to require a full DPIA unless the feature will process LinkedIn data at scale for a large percentage of users.

Confidence level:
Context-informed
