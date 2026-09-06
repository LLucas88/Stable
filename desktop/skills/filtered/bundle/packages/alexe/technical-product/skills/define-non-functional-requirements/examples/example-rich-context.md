## Input
We're building a document signing feature for our B2B SaaS HR platform. Employees sign offer letters, NDAs, and employment contracts through the product. The platform is used by 300 HR teams across the EU and UK.

Scale: 300 companies, average 50 employees each. Peak usage is Monday morning when onboarding batches go out — up to 2,000 simultaneous document views estimated.

Regulatory context: GDPR applies (EU/UK). Legal has confirmed that signed documents may be used as legal evidence in employment disputes. We also need to support accessibility for users with disabilities (EU Accessibility Act applies for products over 50 employees at customer companies).

Performance baseline from existing features: p50 page load is 1.1s, p99 is 3.4s. Engineering considers 4s p99 the current system limit.

Security: documents contain PII (names, addresses, salary information). Legal has flagged that we need an audit trail for every signing action.

## Expected output
NFR inventory by category:

Performance:
- Page load for document view: p50 <1.5s, p99 <3s (stricter than current baseline given legal use case)
- Signing action response time: <2s from button click to confirmation — users signing legal documents expect immediate confirmation
- Concurrent load: 2,000 simultaneous document views must not degrade performance below the above thresholds
- Type: hard requirement for signing response time; target for page load

Scalability:
- The feature must support 300 companies × average 50 users = 15,000 users, with peak 2,000 concurrent
- Document storage: HR platforms retain employment documents for 7+ years in some jurisdictions — storage design must account for long-term document retention, not just active users
- Type: hard requirement for the 2,000 concurrent peak; storage design is a target

Security:
- All documents must be encrypted at rest and in transit (TLS 1.2+ in transit; AES-256 at rest)
- PII contained in documents must be handled under GDPR data minimization principles: only collect what is needed for the signing record
- Access control: documents accessible only to the employee being asked to sign and the HR admin who sent it — no cross-company document visibility
- Penetration testing required before launch (recommended by legal for PII + legal evidence use case)
- Type: all hard requirements

Privacy (GDPR):
- Lawful basis for processing signing data: contractual necessity (employment contract signing) — legal to confirm
- Data subject rights: employees must be able to request deletion of personal data; however, signed employment contracts may be exempt from erasure requests (legal to confirm scope of retention obligation)
- Data residency: EU/UK customers — confirm whether document storage can be on EU-region cloud infrastructure only; if yes, this is a hard architecture constraint
- Type: data residency is hard if legal confirms EU-only requirement; data subject rights handling is hard

Accessibility:
- EU Accessibility Act applies to customers with 50+ employees — the signing flow must meet WCAG 2.1 AA
- Specific requirements: keyboard navigation for the full signing flow; screen reader compatibility for document review; sufficient color contrast on signature UI
- Type: hard requirement given regulatory applicability

Reliability:
- Availability: 99.9% uptime for the signing service (8.7 hours/year downtime ceiling)
- Audit trail: every signing event must be logged with timestamp, user ID, document ID, and IP address. Audit logs must be tamper-evident and retained for at least 7 years.
- If signing is unavailable: clear error state with retry instructions; do not lose partially completed signing state
- Type: audit trail retention is a hard requirement; 99.9% availability is a target

Compliance:
- Legal has confirmed signed documents may be used as legal evidence — this requires: qualified electronic signatures or at minimum advanced electronic signatures under eIDAS (EU regulation on electronic identification)
- Engineering must confirm which signature standard is being implemented before launch
- Type: hard requirement — failure to meet eIDAS requirements could invalidate the signatures as legal evidence

Cost or timeline implications:
- Penetration testing: 2-4 week lead time; must be scheduled 4 weeks before launch
- WCAG 2.1 AA accessibility review: 1-2 weeks for an external audit; recommended before launch
- eIDAS compliance confirmation: legal and engineering alignment session needed in week 1 of development
- EU data residency architecture: if required, this affects cloud provider configuration and may add 1-2 weeks to infrastructure setup

Validation approach per NFR:
- Performance: load testing at 2,000 concurrent before launch; p99 latency measured in staging
- Security: penetration test by external vendor; code review of access control logic
- Accessibility: automated scan (axe or equivalent) + manual keyboard navigation test + external accessibility audit
- eIDAS compliance: legal sign-off on signature implementation
- GDPR: DPO or legal review of data flows and privacy documentation
- Audit trail: engineering to provide tamper-evident log design for product review; test that audit log captures all required fields

NFRs requiring third-party assessment:
- Security penetration test (external vendor)
- Accessibility audit (external specialist or in-house if available)
- eIDAS compliance review (legal)

Open questions for engineering or compliance:
1. Which eIDAS signature tier is being implemented? (Simple, Advanced, or Qualified)
2. Can document storage be confirmed to EU-region infrastructure?
3. What is the current audit log design — append-only? How is tamper-evidence ensured?
4. What is the document retention policy in the system — is there a purge mechanism?
