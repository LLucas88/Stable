## Input
We're building a health journaling feature for our wellness app. Users can log daily mood, sleep, symptoms, and medications. This data will be stored on our servers (AWS, EU region), analyzed by an AI model to provide personalized insights, and optionally shared with the user's doctor via a PDF export. We operate in the EU and US. Target users include adults and some users with chronic conditions. We plan to use anonymized data to improve our AI model.

## Expected output
Data types and classification:
- Mood and emotional state: personal data (GDPR Art. 9 special category: mental health-related)
- Sleep data: personal data (health data, special category under GDPR)
- Symptoms and medications: personal data, special category health data under GDPR; may constitute Protected Health Information (PHI) under HIPAA if users are in the US and the data is shared with healthcare providers
- Doctor export data: contains identified health records — triggers HIPAA Business Associate considerations for US users if sharing with covered healthcare entities

Applicable regulations:
- EU users: GDPR (health data as special category — requires explicit consent under Art. 9(2)(a); Data Protection Impact Assessment (DPIA) required for large-scale processing of health data under Art. 35)
- US users: HIPAA may apply if the platform qualifies as a "covered entity" or "business associate" when facilitating doctor-patient data sharing; at minimum, the doctor export feature should be reviewed by legal
- US (state): California users fall under CCPA/CPRA; Illinois users may be subject to BIPA if biometric data is inferred from health patterns
- Minor users: if any users are under 13 (US) or under 16 (EU default), COPPA and GDPR's stricter consent requirements apply

Privacy risk assessment:

| Risk area | Risk description | Severity |
|---|---|---|
| Data collection | Mood, sleep, medication data is highly sensitive. Breach or misuse would cause significant harm | High |
| AI model training on user data | Using identifiable health data to train AI models requires specific consent; "anonymized data" must be genuinely anonymized (GDPR standard is strict — pseudonymized data is not anonymous) | High |
| Doctor export | Creating a direct data pathway to healthcare providers triggers HIPAA considerations. If misused, PHI is exposed | High |
| Data retention | No retention policy stated — how long is health journal data kept? Users must have a clear right to delete | Medium |
| Third-party AI model | Is the AI model run in-house or via a third-party provider? If third-party, data processing agreements are required | Medium |
| Re-identification risk | "Anonymized" health data combined with other user data can be re-identified. This risk is elevated for users with rare conditions | Medium |

Security risk assessment:
- Health data stored on AWS EU: appropriate jurisdiction for EU users, but encryption at rest and in transit must be confirmed
- Doctor export: PDF export must not include any authentication-free download link; requires user authentication at point of export
- AI model access to raw health data: must be scoped to minimum necessary; model access logs should be maintained

Consent and transparency requirements:
- Explicit consent required under GDPR Art. 9 for health data processing (cannot rely on "legitimate interest")
- Separate consent layer required for using data to improve AI model — this is a distinct purpose from journaling and requires specific opt-in, not opt-out
- Doctor export: user must explicitly authorize each export; data recipient must be confirmed

User rights implications:
- Right to access: users must be able to download all their health journal data in a machine-readable format
- Right to erasure: users must be able to delete their health journal data, including data used in AI model training (this is complex if data has been used in model weights — legal guidance needed)
- Right to data portability: GDPR requires portability for data provided directly by the user

Items requiring legal or security review:
1. HIPAA applicability: legal must determine whether the doctor export makes the company a "business associate" under HIPAA
2. DPIA: required under GDPR before launching large-scale special category data processing; must be completed before launch
3. AI model training consent: anonymization standard under GDPR must be confirmed by legal or DPO before training on user data
4. Age verification: if any users may be under 16 (EU) or 13 (US), parental consent mechanisms are required

Recommended mitigations:
1. Obtain explicit opt-in consent for health data processing (at feature level, separate from general terms)
2. Conduct a DPIA before launch
3. AI model training opt-in should be separate and off-by-default
4. Doctor export requires user-initiated authorization at each export, not a persistent share token
5. Define and publish data retention policy for health journal data
6. Engage legal on HIPAA applicability before US launch
