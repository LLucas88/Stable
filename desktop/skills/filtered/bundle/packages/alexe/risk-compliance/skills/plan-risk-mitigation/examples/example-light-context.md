## Input
We're launching a new feature next month — a file sharing component for our project management tool. Users can upload files and share links. We haven't thought through the risks yet.

## Expected output
Risk inventory by category:

Technical risks:
- File storage and infrastructure cost: uncapped file uploads can create unexpected storage costs; no mention of file size limits
- Security: shared links could be forwarded beyond intended recipients if not access-controlled
- Malware/virus in uploaded files: if files aren't scanned, users can upload and share malicious content

Market/user risks:
- Users share sensitive files not intended for the product's security posture: if this is a project management tool, users may share contracts, PII, or financial documents
- Feature adoption lower than expected: file sharing in project management tools is often underused if the UX is not intuitive

Execution risks:
- Launch timing: "next month" is a hard deadline with unknown scope — risk of rushing and shipping with security gaps

Risk register (draft — owners TBD):

| Risk | Likelihood | Impact | Severity | Mitigation |
|---|---|---|---|---|
| Malicious file upload | Medium | High | High | Implement virus scanning on upload before storage |
| Link oversharing (no access control) | High | Medium | High | Add view-only vs. editable permissions; require authentication to view shared links |
| Storage cost explosion | High | Medium | Medium | Implement file size limits (e.g., 50MB/file, 1GB/workspace) before launch |
| Sensitive data uploaded without user understanding privacy posture | Medium | Medium | Medium | Add clear messaging about file security; consider encryption at rest |

Missing information to complete the risk plan:
- Who owns each risk? (risk with no owner is not mitigated)
- Are there compliance implications? (if users might share personal data files, privacy risk applies)
- What's the maximum timeline available for security measures?

Escalation triggers:
- If virus scanning can't be implemented before launch: delay launch or limit to trusted file types only (PDF, images, common document formats)

Confidence level:
Context-informed
