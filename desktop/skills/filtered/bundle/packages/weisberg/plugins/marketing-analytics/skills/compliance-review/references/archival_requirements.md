# Archival Requirements

**Reference Version:** 1.0
**Last Updated:** 2026-03-19

> This reference file is used by the compliance-review skill for automated first-pass
> archival tagging. It does not constitute legal advice. Always consult qualified
> counsel for authoritative regulatory interpretation.

## SEC Rule 17a-4: Records to Be Preserved by Certain Exchange Members, Brokers, and Dealers

### Overview

SEC Rule 17a-4 prescribes the retention periods and storage requirements for records
that broker-dealers must preserve. It applies to all communications related to the
firm's business as a broker-dealer.

### Retention Periods

| Record Type | Retention Period | Citation |
|---|---|---|
| Advertisements and sales literature | 3 years from date of last use | 17a-4(b)(4) |
| Communications with the public | 3 years from creation | 17a-4(b)(4) |
| Written agreements | 3 years after termination | 17a-4(b)(7) |
| Compliance records | 3 years (first 2 years in accessible location) | 17a-4(b)(9) |
| Customer account records | 6 years after account closure | 17a-4(c)(1) |
| General ledger and financials | Lifetime of the firm + 3 years | 17a-4(a) |
| Partnership articles / corporate charter | Lifetime of the firm + 3 years | 17a-4(a) |

### WORM Storage Requirements

SEC Rule 17a-4(f) requires that electronic records be preserved in a
**Write-Once-Read-Many (WORM)** format:

- Records must be stored on non-rewriteable, non-erasable media.
- OR stored using a system that prevents alteration or deletion for the required
  retention period.
- A third-party audit system or technical controls must verify the integrity of
  stored records.
- The storage system must include an indexing mechanism to permit retrieval.

### Accessibility Requirements

- Records must be readily accessible for the first two years of the retention period.
- After the initial two-year period, records must remain available but need not be
  immediately accessible.
- Records must be producible to the SEC or SRO within a reasonable time upon request.

### Electronic Storage Conditions (17a-4(f)(2))

When using electronic storage:
1. Must preserve records exclusively in a non-rewriteable, non-erasable format.
2. Must verify automatically the quality and accuracy of the storage media recording
   process.
3. Must serialize the original and duplicate units of storage media and time-date the
   information.
4. Must have the capacity to readily download indexes and records.
5. Must store separately from the original, a duplicate copy of the record.
6. Must organize and index records so they are accessible in a reasonable time.
7. Must have available facilities for examination of records.

### Third-Party Access Requirements

- A designated third party (D3P) must have access to records, or the firm must use
  a compliant automated system.
- The D3P must file an undertaking with the SEC agreeing to provide access to records.

## FINRA Retention Rules

### Rule 3110: Supervision

FINRA Rule 3110 requires member firms to establish, maintain, and enforce written
supervisory procedures, including review and retention of communications.

### Rule 4511: General Requirements for Books and Records

- Member firms must make and preserve books and records as required by FINRA rules,
  the Exchange Act, and the applicable Exchange Act rules.
- Records must be preserved in a format and media that comply with SEA Rule 17a-4.

### FINRA Retention Schedule

| Communication Type | Retention Period | Notes |
|---|---|---|
| Retail communications | 3 years from date of last use | Includes principal approval records |
| Institutional communications | 3 years from date of last use | Includes supervisory review records |
| Correspondence | 3 years from creation | Includes spot-check review records |
| FINRA filing records | 3 years from filing date | Proof of filing must be retained |
| Supervisory review logs | 3 years | Must document reviewer identity and date |
| Complaint-related communications | 4 years | Extended retention for complaint-related records |

### FINRA Filing Record Requirements

For content that was filed with FINRA:
- Retain the as-filed version of the communication.
- Retain any FINRA comment letters and firm responses.
- Retain the final approved version after any FINRA-requested modifications.
- Retain documentation of the filing date and any applicable review period.

## Archival Metadata Schema

The archival_tagger script produces the following metadata for each content piece:

```json
{
  "content_id": "string (UUID)",
  "content_hash": "string (SHA-256 hash of content at time of review)",
  "original_file_path": "string",
  "review_id": "string (UUID, links to compliance review)",
  "created_timestamp": "string (ISO 8601)",
  "review_timestamp": "string (ISO 8601)",
  "archival_timestamp": "string (ISO 8601)",
  "reviewer_type": "AUTOMATED_FIRST_PASS | HUMAN_COMPLIANCE_OFFICER",
  "reviewer_identity": "string",
  "classification": {
    "jurisdiction": ["SEC", "FINRA", "FCA"],
    "communication_type": "RETAIL | INSTITUTIONAL | CORRESPONDENCE",
    "content_category": "ADVERTISEMENT | SALES_LITERATURE | RESEARCH | COMMENTARY",
    "product_type": "string (if applicable)"
  },
  "retention": {
    "period_years": 3,
    "start_date": "string (ISO 8601 date)",
    "end_date": "string (ISO 8601 date)",
    "rule_citation": "string (e.g., '17a-4(b)(4)')",
    "worm_required": true
  },
  "filing": {
    "finra_filing_required": false,
    "filing_type": "PRE_USE | POST_USE | NONE",
    "filing_deadline": "string (ISO 8601 date, if applicable)",
    "filing_status": "PENDING | FILED | NOT_REQUIRED"
  },
  "storage": {
    "primary_location": "string (storage system reference)",
    "duplicate_location": "string (separate storage for duplicate)",
    "index_reference": "string (index entry for retrieval)",
    "format": "WORM | STANDARD"
  }
}
```

## Compatible Archival Systems

The archival metadata schema is designed to be compatible with the following common
compliance archival systems:

- **Smarsh** -- Enterprise archiving for communications and social media.
- **Global Relay** -- Cloud-based archiving for electronic communications.
- **Bloomberg Vault** -- Compliance data management and archiving.
- **Proofpoint (formerly Nexgate)** -- Social media and digital communications
  archiving.
- **MirrorWeb** -- Website and social media archiving.

### Integration Notes

- Export format supports JSON and CSV for bulk ingestion.
- Content hashes (SHA-256) enable integrity verification across systems.
- UUID-based content IDs allow cross-referencing between the compliance review
  system and external archival platforms.
- Timestamps use ISO 8601 for universal compatibility.
- Classification taxonomy maps to standard FINRA and SEC content categories.
