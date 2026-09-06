## Input
We're adding email notifications to our e-commerce platform. Users will get order updates and we might also send marketing emails. We're in the US and UK. Not sure what privacy rules apply.

## Expected output
Data types and classification:
- Email address: personal data
- Order history (name, items, address): personal data
- Behavioral data used for marketing email targeting: personal data if linked to individual user

Applicable regulations:
- UK users: UK GDPR (post-Brexit equivalent of EU GDPR) applies. Marketing emails require opt-in consent under PECR (Privacy and Electronic Communications Regulations) — "we might also send marketing emails" requires an opt-in mechanism, not a default opt-out.
- US users: No single federal email privacy law, but: CAN-SPAM Act applies to commercial email (requires unsubscribe option, accurate sender identification, no deceptive subject lines). California users: CCPA gives users the right to opt out of sale of personal information; if email lists are shared with third parties for marketing, this is relevant.

Privacy risk assessment:
- Transactional emails (order updates): low privacy risk. Users expect and need these.
- Marketing emails: moderate risk if not handled correctly. Sending marketing emails to users who did not explicitly opt in is a legal violation in the UK and a reputational risk in the US.
- "Might also send" framing is a red flag: marketing email decisions should not be made post-hoc. The consent mechanism must be decided before launch.

Security risk assessment:
- Email systems need to prevent unauthorized access to the subscriber list
- Unsubscribe links must actually work (CAN-SPAM requirement)
- No specific security risks identified from the description — standard email deliverability hygiene applies

Consent and transparency requirements:
- UK: Separate opt-in for marketing emails required (transactional emails don't require opt-in as long as they relate to the purchase). Pre-checked boxes do not constitute valid consent under UK GDPR.
- US: Opt-out mechanism required (CAN-SPAM), but opt-in is a best practice to protect sender reputation

User rights implications:
- Unsubscribe from marketing: must be easy and functional. Required under CAN-SPAM and UK GDPR.
- Right to access/delete (UK users): users can request their email/personal data and ask for deletion.

Items requiring legal or security review:
- Confirm the legal basis for marketing emails to UK users (must be consent, not legitimate interest for direct marketing)
- If email lists are ever shared with third-party advertisers: CCPA assessment needed for California users

Recommended mitigations:
- Separate opt-in checkbox for marketing emails at registration (unchecked by default)
- Confirm transactional email content is genuinely transactional (no promotions bundled into order confirmation emails without consent)
- Add working unsubscribe link to all marketing emails

Confidence level:
Context-informed
