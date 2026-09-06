# Email Deliverability Guide

SPF/DKIM/DMARC validation rules, blocklist remediation procedures, and
deliverability monitoring best practices.

## Authentication Records

### SPF (Sender Policy Framework)

SPF defines which mail servers are authorized to send email on behalf of a
domain.

**Validation Rules:**

1. The domain must have exactly one SPF record (multiple records cause
   failures).
2. The record must include all legitimate sending sources (ESP IPs/domains).
3. The record must end with `-all` (hard fail) or `~all` (soft fail).
   Using `+all` is a critical misconfiguration.
4. The record must not exceed 10 DNS lookups (include mechanisms count toward
   this limit).
5. The record must not use the deprecated `ptr` mechanism.

**Common Misconfigurations:**

| Issue | Symptom | Fix |
| :---- | :------ | :-- |
| Multiple SPF records | Authentication failures | Merge into single record |
| Missing ESP include | Emails from ESP fail SPF | Add `include:esp-domain.com` |
| Too many DNS lookups (>10) | SPF permerror | Flatten includes or use subdomains |
| Using `+all` | Anyone can spoof domain | Change to `-all` or `~all` |
| No SPF record | No sender verification | Create TXT record with SPF policy |

### DKIM (DomainKeys Identified Mail)

DKIM adds a cryptographic signature to outgoing emails, verifying the message
was not altered in transit.

**Validation Rules:**

1. The DKIM selector must resolve to a valid public key in DNS.
2. Key length must be at least 1024 bits (2048 bits recommended).
3. The `d=` domain in the DKIM signature must align with the From domain (or
   be a subdomain) for DMARC alignment.
4. Key rotation should occur at least annually.
5. All sending sources (ESP, transactional, internal) must have DKIM
   configured.

**Common Misconfigurations:**

| Issue | Symptom | Fix |
| :---- | :------ | :-- |
| Missing DKIM record | Signature verification fails | Publish public key via DNS TXT record |
| Key too short (<1024 bits) | Reduced trust score | Generate new 2048-bit key pair |
| Domain misalignment | DMARC alignment failure | Ensure `d=` matches or is subdomain of From |
| Expired/rotated key without update | Verification failures | Update DNS with new public key |

### DMARC (Domain-based Message Authentication, Reporting & Conformance)

DMARC ties SPF and DKIM together and defines the policy for handling
authentication failures.

**Validation Rules:**

1. A DMARC record must exist at `_dmarc.yourdomain.com`.
2. The policy (`p=`) should be `quarantine` or `reject` in production. A
   policy of `none` provides monitoring only — acceptable during rollout but
   not long-term.
3. The `rua` tag should point to a valid aggregate report address.
4. The `ruf` tag (forensic reports) is optional but recommended for debugging.
5. Subdomain policy (`sp=`) should be explicitly set if subdomains are used
   for sending.
6. DMARC requires either SPF alignment or DKIM alignment to pass.

**DMARC Policy Progression:**

| Phase | Policy | Purpose |
| :---- | :----- | :------ |
| Monitoring | `p=none` | Collect reports, identify legitimate senders |
| Soft enforcement | `p=quarantine; pct=25` | Quarantine 25% of failures |
| Ramp enforcement | `p=quarantine; pct=100` | Quarantine all failures |
| Full enforcement | `p=reject` | Reject unauthenticated mail |

## Blocklist Monitoring

### Major Blocklists to Monitor

| Blocklist | Impact | Check Method |
| :-------- | :----- | :----------- |
| Spamhaus SBL/XBL/PBL | High — widely used by ISPs | DNS query or API |
| Barracuda BRBL | Medium-High | DNS query |
| SpamCop | Medium | DNS query |
| SORBS | Medium | DNS query |
| CBL (Composite Blocking List) | Medium | DNS query |
| URIBL/SURBL | Medium — checks URLs in content | DNS query |

### Blocklist Remediation Procedures

1. **Identify the listing.** Determine which blocklist(s) and which IP(s) or
   domain(s) are listed.

2. **Diagnose the root cause.**
   - Sending to purchased/scraped lists
   - High complaint rates (>0.1%)
   - Sending to spam traps (recycled or pristine)
   - Compromised sending infrastructure
   - Sudden volume spikes without warmup

3. **Fix the underlying issue before requesting delisting.** Blocklist
   operators will re-list IPs that continue problematic behavior.

4. **Submit delisting request** via the blocklist's self-service portal. Most
   require:
   - Explanation of the issue
   - Steps taken to remediate
   - Commitment to best practices

5. **Monitor for re-listing** for 30 days post-delisting.

## Deliverability Monitoring Checklist

### Daily Checks

- [ ] Hard bounce rate < 2% per campaign
- [ ] Soft bounce rate < 5% per campaign
- [ ] Complaint rate < 0.1% per campaign
- [ ] No new blocklist appearances

### Weekly Checks

- [ ] Delivery rate trend stable or improving
- [ ] Authentication pass rates (SPF, DKIM, DMARC) > 98%
- [ ] Review DMARC aggregate reports for unauthorized senders
- [ ] Check sending IP reputation scores

### Monthly Checks

- [ ] Full SPF/DKIM/DMARC record audit
- [ ] Blocklist scan across all sending IPs and domains
- [ ] Review and clean bounced addresses
- [ ] IP warmup status for any new sending IPs

## Bounce Rate Thresholds

| Bounce Type | Acceptable | Warning | Critical |
| :---------- | :--------- | :------ | :------- |
| Hard Bounce | < 0.5% | 0.5-2.0% | > 2.0% |
| Soft Bounce | < 2.0% | 2.0-5.0% | > 5.0% |
| Total Bounce | < 2.5% | 2.5-5.0% | > 5.0% |

**Spike Detection:** A bounce rate increase of 2x or more compared to the
trailing 30-day average should trigger an immediate investigation.

## ESP-Specific Notes

### Braze
- Bounce handling is automatic; hard bounces are suppressed.
- DKIM is configured per sending domain in the Braze dashboard.
- Deliverability metrics available via Currents export or REST API.

### SendGrid
- Provides dedicated IP warmup schedules.
- SPF includes `include:sendgrid.net`.
- Event webhook provides real-time bounce and complaint data.

### Iterable
- Shared IP pools by default; dedicated IPs available.
- DKIM configured via DNS CNAME records.
- Deliverability metrics available via data export or API.
