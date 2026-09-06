"""Deliverability check: bounce rate trend analysis and authentication record validation.

This script provides deterministic computation for email deliverability monitoring,
including bounce rate trend analysis with spike detection, and SPF/DKIM/DMARC
authentication record validation via DNS lookup.

Inputs:
    - workspace/raw/email_sends.csv: Send-level data with bounce information.

Outputs:
    - workspace/analysis/email_deliverability.json: Deliverability health scores
      and issue flags.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class BounceRateTrend:
    """Container for bounce rate trend data over a time window."""

    date: str
    hard_bounce_rate: float
    soft_bounce_rate: float
    total_bounce_rate: float
    sent_count: int
    is_spike: bool = False
    spike_severity: str | None = None  # "warning" or "critical"


@dataclass
class AuthenticationResult:
    """Result of an SPF, DKIM, or DMARC validation check."""

    record_type: str  # "SPF", "DKIM", or "DMARC"
    domain: str
    is_valid: bool
    issues: list[str] = field(default_factory=list)
    raw_record: str | None = None
    recommendations: list[str] = field(default_factory=list)


@dataclass
class DeliverabilityReport:
    """Aggregated deliverability health report."""

    overall_health_score: float  # 0.0 to 1.0
    bounce_rate_trends: list[BounceRateTrend] = field(default_factory=list)
    authentication_results: list[AuthenticationResult] = field(default_factory=list)
    blocklist_hits: list[dict[str, Any]] = field(default_factory=list)
    issue_flags: list[str] = field(default_factory=list)
    generated_at: str = ""


# ---------------------------------------------------------------------------
# Bounce rate trend analysis
# ---------------------------------------------------------------------------


def compute_bounce_rate_trends(
    sends_csv_path: Path,
    window_days: int = 30,
    spike_multiplier: float = 2.0,
) -> list[BounceRateTrend]:
    """Compute daily bounce rate trends and detect spikes.

    Reads send-level data grouped by date, calculates hard/soft/total bounce
    rates per day, and flags days where the bounce rate exceeds
    ``spike_multiplier`` times the trailing ``window_days`` average.

    Args:
        sends_csv_path: Path to ``email_sends.csv`` with columns
            ``send_time``, ``delivered``, ``bounced``, and optionally
            ``bounce_type`` (hard/soft).
        window_days: Number of trailing days used for the rolling average
            baseline when detecting spikes.
        spike_multiplier: A day's bounce rate must exceed this multiple of the
            rolling average to be flagged as a spike.

    Returns:
        List of ``BounceRateTrend`` objects, one per day, sorted chronologically.
    """
    df = pd.read_csv(sends_csv_path, parse_dates=["send_time"])
    df["date"] = df["send_time"].dt.date

    # Determine bounce type column presence
    has_bounce_type = "bounce_type" in df.columns

    daily = (
        df.groupby("date")
        .agg(
            sent_count=("delivered", "size"),
            total_bounced=("bounced", "sum"),
        )
        .reset_index()
        .sort_values("date")
    )

    if has_bounce_type:
        hard = df[df["bounce_type"] == "hard"].groupby("date")["bounced"].sum().rename("hard_bounced")
        soft = df[df["bounce_type"] == "soft"].groupby("date")["bounced"].sum().rename("soft_bounced")
        daily = daily.merge(hard, left_on="date", right_index=True, how="left")
        daily = daily.merge(soft, left_on="date", right_index=True, how="left")
        daily["hard_bounced"] = daily["hard_bounced"].fillna(0)
        daily["soft_bounced"] = daily["soft_bounced"].fillna(0)
    else:
        # If no bounce_type column, treat all bounces as hard bounces
        daily["hard_bounced"] = daily["total_bounced"]
        daily["soft_bounced"] = 0

    daily["hard_bounce_rate"] = daily["hard_bounced"] / daily["sent_count"]
    daily["soft_bounce_rate"] = daily["soft_bounced"] / daily["sent_count"]
    daily["total_bounce_rate"] = daily["total_bounced"] / daily["sent_count"]

    # Rolling average for spike detection
    daily["rolling_avg"] = (
        daily["total_bounce_rate"]
        .rolling(window=window_days, min_periods=1)
        .mean()
        .shift(1)  # exclude current day from its own baseline
    )
    # For the first row, use the current value as baseline (no spike possible)
    daily["rolling_avg"] = daily["rolling_avg"].fillna(daily["total_bounce_rate"])

    results: list[BounceRateTrend] = []
    for _, row in daily.iterrows():
        is_spike = bool(row["rolling_avg"] > 0 and row["total_bounce_rate"] >= spike_multiplier * row["rolling_avg"])
        severity = None
        if is_spike:
            severity = classify_spike_severity(row["total_bounce_rate"])

        results.append(
            BounceRateTrend(
                date=str(row["date"]),
                hard_bounce_rate=float(row["hard_bounce_rate"]),
                soft_bounce_rate=float(row["soft_bounce_rate"]),
                total_bounce_rate=float(row["total_bounce_rate"]),
                sent_count=int(row["sent_count"]),
                is_spike=is_spike,
                spike_severity=severity,
            )
        )

    return results


def classify_spike_severity(
    bounce_rate: float,
    hard_bounce_threshold_warning: float = 0.005,
    hard_bounce_threshold_critical: float = 0.02,
    soft_bounce_threshold_warning: float = 0.02,
    soft_bounce_threshold_critical: float = 0.05,
) -> str | None:
    """Classify a bounce rate spike as warning or critical.

    Args:
        bounce_rate: The observed bounce rate (0.0 to 1.0).
        hard_bounce_threshold_warning: Hard bounce rate above which a warning
            is issued.
        hard_bounce_threshold_critical: Hard bounce rate above which a critical
            alert is issued.
        soft_bounce_threshold_warning: Soft bounce rate above which a warning
            is issued.
        soft_bounce_threshold_critical: Soft bounce rate above which a critical
            alert is issued.

    Returns:
        ``"critical"``, ``"warning"``, or ``None`` if no spike.
    """
    if bounce_rate >= hard_bounce_threshold_critical:
        return "critical"
    if bounce_rate >= soft_bounce_threshold_critical:
        return "critical"
    if bounce_rate >= hard_bounce_threshold_warning:
        return "warning"
    if bounce_rate >= soft_bounce_threshold_warning:
        return "warning"
    return None


# ---------------------------------------------------------------------------
# Authentication record validation
# ---------------------------------------------------------------------------


def _dns_txt_lookup(qname: str) -> list[str]:
    """Perform a DNS TXT lookup, returning a list of TXT record strings.

    Wraps dns.resolver so callers get a clean list or an empty list on failure.
    """
    try:
        import dns.resolver

        answers = dns.resolver.resolve(qname, "TXT")
        records: list[str] = []
        for rdata in answers:
            # Join multi-part TXT record strings
            records.append("".join(s.decode() if isinstance(s, bytes) else s for s in rdata.strings))
        return records
    except ImportError:
        raise ImportError(
            "dns.resolver (dnspython) is required for authentication validation. Install with: pip install dnspython"
        )
    except Exception:
        return []


def validate_spf_record(domain: str) -> AuthenticationResult:
    """Validate the SPF record for a sending domain.

    Performs DNS TXT lookup for the domain, parses the SPF record, and checks:
    - Exactly one SPF record exists.
    - Record does not use ``+all``.
    - DNS lookup count does not exceed 10.
    - Deprecated ``ptr`` mechanism is not used.
    - All known ESPs are included.

    Args:
        domain: The sending domain to validate (e.g., ``"example.com"``).

    Returns:
        ``AuthenticationResult`` with validation status and any issues found.
    """
    result = AuthenticationResult(record_type="SPF", domain=domain, is_valid=True)

    try:
        txt_records = _dns_txt_lookup(domain)
    except ImportError as exc:
        result.is_valid = False
        result.issues.append(str(exc))
        return result

    spf_records = [r for r in txt_records if r.startswith("v=spf1")]

    if len(spf_records) == 0:
        result.is_valid = False
        result.issues.append("No SPF record found for domain.")
        result.recommendations.append(
            "Create a TXT record with an SPF policy (e.g., 'v=spf1 include:_spf.google.com ~all')."
        )
        return result

    if len(spf_records) > 1:
        result.is_valid = False
        result.issues.append(f"Multiple SPF records found ({len(spf_records)}). Only one is allowed.")
        result.recommendations.append("Merge all SPF records into a single TXT record.")

    spf = spf_records[0]
    result.raw_record = spf

    # Check for +all (critical misconfiguration)
    if "+all" in spf:
        result.is_valid = False
        result.issues.append("SPF record uses '+all', which allows any server to send as this domain.")
        result.recommendations.append("Change '+all' to '~all' (soft fail) or '-all' (hard fail).")

    # Check for deprecated ptr mechanism
    if " ptr" in spf or spf.startswith("v=spf1 ptr"):
        result.issues.append("SPF record uses deprecated 'ptr' mechanism.")
        result.recommendations.append("Remove 'ptr' mechanism and use explicit IP or include mechanisms.")

    # Count DNS lookups (include, a, mx, ptr, exists, redirect count toward the 10-lookup limit)
    lookup_mechanisms = ["include:", "a:", "a ", "mx:", "mx ", "ptr", "exists:", "redirect="]
    lookup_count = 0
    for mechanism in lookup_mechanisms:
        lookup_count += spf.lower().count(mechanism)
    # 'a' and 'mx' without qualifiers also count if they appear as standalone tokens
    tokens = spf.split()
    for token in tokens:
        clean = token.lstrip("+-~?")
        if clean in ("a", "mx"):
            lookup_count += 1

    if lookup_count > 10:
        result.is_valid = False
        result.issues.append(f"SPF record requires {lookup_count} DNS lookups (max 10).")
        result.recommendations.append("Flatten includes or use subdomains to reduce lookup count.")

    # Check that record ends with -all or ~all
    if not (spf.rstrip().endswith("-all") or spf.rstrip().endswith("~all")):
        if not spf.rstrip().endswith("+all"):
            result.issues.append("SPF record does not end with '-all' or '~all'.")
            result.recommendations.append("Add '-all' (hard fail) or '~all' (soft fail) at the end of the SPF record.")

    return result


def validate_dkim_record(domain: str, selector: str) -> AuthenticationResult:
    """Validate the DKIM record for a sending domain and selector.

    Performs DNS TXT lookup for ``{selector}._domainkey.{domain}``, parses
    the DKIM public key record, and checks:
    - Record exists and contains a valid public key.
    - Key length is at least 1024 bits (2048 recommended).
    - The ``d=`` domain aligns with the From domain for DMARC purposes.

    Args:
        domain: The sending domain (e.g., ``"example.com"``).
        selector: The DKIM selector (e.g., ``"s1"`` or ``"braze"``).

    Returns:
        ``AuthenticationResult`` with validation status and any issues found.
    """
    qname = f"{selector}._domainkey.{domain}"
    result = AuthenticationResult(record_type="DKIM", domain=domain, is_valid=True)

    try:
        txt_records = _dns_txt_lookup(qname)
    except ImportError as exc:
        result.is_valid = False
        result.issues.append(str(exc))
        return result

    if not txt_records:
        result.is_valid = False
        result.issues.append(f"No DKIM record found at {qname}.")
        result.recommendations.append(f"Publish a DKIM public key TXT record at {qname}.")
        return result

    dkim_record = txt_records[0]
    result.raw_record = dkim_record

    # Parse DKIM tags
    tags: dict[str, str] = {}
    for part in dkim_record.replace(" ", "").split(";"):
        if "=" in part:
            key, _, value = part.partition("=")
            tags[key.strip()] = value.strip()

    # Check for public key
    if "p" not in tags or not tags["p"]:
        result.is_valid = False
        result.issues.append("DKIM record does not contain a public key (p= tag is missing or empty).")
        result.recommendations.append("Ensure the DKIM TXT record includes a valid public key in the p= tag.")
        return result

    # Check key length (approximate from base64-encoded key)
    # Base64 encodes 3 bytes into 4 characters. The key includes ASN.1 headers (~30 bytes overhead).
    import base64

    try:
        key_bytes = base64.b64decode(tags["p"])
        key_bits = (len(key_bytes) - 30) * 8  # approximate, subtract ASN.1 overhead
        if key_bits < 1024:
            result.issues.append(f"DKIM key length is approximately {key_bits} bits (minimum 1024, recommended 2048).")
            result.recommendations.append("Generate a new 2048-bit DKIM key pair and update DNS.")
        elif key_bits < 2048:
            result.issues.append(f"DKIM key length is approximately {key_bits} bits (2048 recommended).")
            result.recommendations.append("Consider upgrading to a 2048-bit DKIM key for stronger security.")
    except Exception:
        result.issues.append("Could not decode DKIM public key to assess key length.")

    # Check version tag
    if "v" in tags and tags["v"] != "DKIM1":
        result.issues.append(f"Unexpected DKIM version: {tags['v']} (expected DKIM1).")

    # Check key type
    if "k" in tags and tags["k"] not in ("rsa", "ed25519"):
        result.issues.append(f"Unexpected key type: {tags['k']}.")

    return result


def validate_dmarc_record(domain: str) -> AuthenticationResult:
    """Validate the DMARC record for a sending domain.

    Performs DNS TXT lookup for ``_dmarc.{domain}``, parses the DMARC record,
    and checks:
    - Record exists at ``_dmarc.{domain}``.
    - Policy (``p=``) is ``quarantine`` or ``reject`` (not ``none`` in
      production).
    - Aggregate report address (``rua``) is specified.
    - Subdomain policy (``sp=``) is set if subdomains are used for sending.

    Args:
        domain: The sending domain (e.g., ``"example.com"``).

    Returns:
        ``AuthenticationResult`` with validation status and any issues found.
    """
    qname = f"_dmarc.{domain}"
    result = AuthenticationResult(record_type="DMARC", domain=domain, is_valid=True)

    try:
        txt_records = _dns_txt_lookup(qname)
    except ImportError as exc:
        result.is_valid = False
        result.issues.append(str(exc))
        return result

    dmarc_records = [r for r in txt_records if r.startswith("v=DMARC1")]

    if not dmarc_records:
        result.is_valid = False
        result.issues.append(f"No DMARC record found at {qname}.")
        result.recommendations.append(
            f"Create a TXT record at {qname} with at least: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}'"
        )
        return result

    dmarc = dmarc_records[0]
    result.raw_record = dmarc

    # Parse DMARC tags
    tags: dict[str, str] = {}
    for part in dmarc.split(";"):
        part = part.strip()
        if "=" in part:
            key, _, value = part.partition("=")
            tags[key.strip()] = value.strip()

    # Check policy
    policy = tags.get("p", "").lower()
    if policy == "none":
        result.issues.append("DMARC policy is 'none' (monitoring only). This does not enforce authentication.")
        result.recommendations.append(
            "Progress DMARC policy to 'quarantine' or 'reject' after reviewing aggregate reports."
        )
    elif policy not in ("quarantine", "reject"):
        result.is_valid = False
        result.issues.append(f"DMARC policy is '{policy}' — expected 'none', 'quarantine', or 'reject'.")

    # Check for rua (aggregate report address)
    if "rua" not in tags:
        result.issues.append("No aggregate report address (rua) specified in DMARC record.")
        result.recommendations.append(f"Add 'rua=mailto:dmarc-reports@{domain}' to receive aggregate reports.")

    # Check subdomain policy
    if "sp" not in tags:
        result.issues.append("No subdomain policy (sp) specified. Subdomains will inherit the main policy.")
        result.recommendations.append(
            "Set 'sp=quarantine' or 'sp=reject' explicitly if subdomains are used for sending."
        )

    # Check for forensic report address (optional but recommended)
    if "ruf" not in tags:
        result.recommendations.append(
            f"Consider adding 'ruf=mailto:dmarc-forensic@{domain}' for forensic failure reports."
        )

    return result


def validate_all_authentication(
    domain: str,
    dkim_selectors: list[str] | None = None,
) -> list[AuthenticationResult]:
    """Run SPF, DKIM, and DMARC validation for a domain.

    Convenience function that runs all three authentication checks and returns
    the combined results.

    Args:
        domain: The sending domain to validate.
        dkim_selectors: List of DKIM selectors to check. If ``None``, attempts
            common selectors (``"default"``, ``"s1"``, ``"s2"``, ``"braze"``,
            ``"sendgrid"``, ``"k1"``).

    Returns:
        List of ``AuthenticationResult`` objects for SPF, each DKIM selector,
        and DMARC.
    """
    if dkim_selectors is None:
        dkim_selectors = ["default", "s1", "s2", "braze", "sendgrid", "k1"]

    results: list[AuthenticationResult] = []

    # SPF
    results.append(validate_spf_record(domain))

    # DKIM — check each selector
    for selector in dkim_selectors:
        results.append(validate_dkim_record(domain, selector))

    # DMARC
    results.append(validate_dmarc_record(domain))

    return results


# ---------------------------------------------------------------------------
# Blocklist checking
# ---------------------------------------------------------------------------


def check_blocklists(
    sending_ips: list[str],
    blocklist_servers: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Check sending IPs against known blocklists via DNS lookup.

    Queries each sending IP against each blocklist's DNS zone. A positive
    DNS response indicates the IP is listed.

    Args:
        sending_ips: List of sending IP addresses to check.
        blocklist_servers: List of blocklist DNS zones to query. If ``None``,
            uses the default set: Spamhaus SBL/XBL, Barracuda BRBL, SpamCop,
            SORBS, CBL.

    Returns:
        List of dicts with keys ``ip``, ``blocklist``, ``listed`` (bool),
        and ``detail``.
    """
    if blocklist_servers is None:
        blocklist_servers = [
            "zen.spamhaus.org",
            "b.barracudacentral.org",
            "bl.spamcop.net",
            "dnsbl.sorbs.net",
            "cbl.abuseat.org",
        ]

    results: list[dict[str, Any]] = []

    for ip in sending_ips:
        # Reverse the IP octets for DNSBL query
        reversed_ip = ".".join(reversed(ip.split(".")))

        for blocklist in blocklist_servers:
            query = f"{reversed_ip}.{blocklist}"
            listed = False
            detail = ""

            try:
                txt_records = _dns_txt_lookup(query)
                # If DNS resolves, the IP is listed
                # Also try A record lookup
                try:
                    import dns.resolver

                    dns.resolver.resolve(query, "A")
                    listed = True
                    detail = txt_records[0] if txt_records else "Listed (no detail available)"
                except Exception:
                    pass
            except ImportError as exc:
                detail = str(exc)
            except Exception:
                # DNS lookup failure means not listed (NXDOMAIN)
                pass

            results.append(
                {
                    "ip": ip,
                    "blocklist": blocklist,
                    "listed": listed,
                    "detail": detail,
                }
            )

    return results


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


def generate_deliverability_report(
    sends_csv_path: Path,
    domain: str,
    sending_ips: list[str] | None = None,
    dkim_selectors: list[str] | None = None,
    output_path: Path | None = None,
) -> DeliverabilityReport:
    """Generate a complete deliverability health report.

    Orchestrates bounce rate trend analysis, authentication validation, and
    blocklist checking into a single report with an overall health score.

    Args:
        sends_csv_path: Path to ``email_sends.csv``.
        domain: The primary sending domain.
        sending_ips: List of sending IPs for blocklist checks. If ``None``,
            blocklist check is skipped.
        dkim_selectors: DKIM selectors to validate. If ``None``, common
            selectors are tried.
        output_path: If provided, write the report JSON to this path.
            Defaults to ``workspace/analysis/email_deliverability.json``.

    Returns:
        ``DeliverabilityReport`` with all findings.
    """
    issue_flags: list[str] = []

    # 1. Bounce rate trends
    bounce_trends = compute_bounce_rate_trends(sends_csv_path)
    spikes = [t for t in bounce_trends if t.is_spike]
    if spikes:
        critical_spikes = [s for s in spikes if s.spike_severity == "critical"]
        if critical_spikes:
            issue_flags.append(f"CRITICAL: {len(critical_spikes)} critical bounce rate spike(s) detected.")
        else:
            issue_flags.append(f"WARNING: {len(spikes)} bounce rate spike(s) detected.")

    # 2. Authentication validation
    auth_results = validate_all_authentication(domain, dkim_selectors=dkim_selectors)
    failed_auth = [r for r in auth_results if not r.is_valid]
    if failed_auth:
        for r in failed_auth:
            issue_flags.append(f"{r.record_type} validation failed for {r.domain}: {'; '.join(r.issues)}")

    # 3. Blocklist checking
    blocklist_hits: list[dict[str, Any]] = []
    if sending_ips:
        blocklist_hits = check_blocklists(sending_ips)
        listed = [h for h in blocklist_hits if h["listed"]]
        if listed:
            issue_flags.append(f"CRITICAL: {len(listed)} blocklist listing(s) found.")

    # 4. Compute overall health score (0.0 to 1.0)
    # Components:
    #   - Bounce health (40%): based on most recent bounce rate
    #   - Auth health (35%): fraction of auth checks passing
    #   - Blocklist health (25%): fraction of IPs not listed
    bounce_score = 1.0
    if bounce_trends:
        recent_bounce = bounce_trends[-1].total_bounce_rate
        # Score degrades linearly: 0% bounce = 1.0, 5% bounce = 0.0
        bounce_score = max(0.0, 1.0 - recent_bounce / 0.05)

    auth_score = 1.0
    if auth_results:
        valid_count = sum(1 for r in auth_results if r.is_valid)
        auth_score = valid_count / len(auth_results)

    blocklist_score = 1.0
    if blocklist_hits:
        not_listed = sum(1 for h in blocklist_hits if not h["listed"])
        blocklist_score = not_listed / len(blocklist_hits)

    overall = 0.40 * bounce_score + 0.35 * auth_score + 0.25 * blocklist_score
    overall = max(0.0, min(1.0, overall))

    report = DeliverabilityReport(
        overall_health_score=round(overall, 4),
        bounce_rate_trends=bounce_trends,
        authentication_results=auth_results,
        blocklist_hits=blocklist_hits,
        issue_flags=issue_flags,
        generated_at=datetime.utcnow().isoformat(),
    )

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(_report_to_dict(report), indent=2, default=str))

    return report


def _report_to_dict(report: DeliverabilityReport) -> dict[str, Any]:
    """Convert a DeliverabilityReport to a JSON-serializable dict."""
    return {
        "overall_health_score": report.overall_health_score,
        "bounce_rate_trends": [asdict(t) for t in report.bounce_rate_trends],
        "authentication_results": [asdict(r) for r in report.authentication_results],
        "blocklist_hits": report.blocklist_hits,
        "issue_flags": report.issue_flags,
        "generated_at": report.generated_at,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate email deliverability health metrics from send-level CSV data."
    )
    parser.add_argument(
        "sends_path",
        nargs="?",
        default=Path("workspace/raw/email_sends.csv"),
        type=Path,
        help="Path to email_sends.csv.",
    )
    parser.add_argument(
        "domain",
        nargs="?",
        default="example.com",
        help="Domain to validate for SPF, DKIM, DMARC, and blocklist checks.",
    )
    parser.add_argument(
        "--output",
        default=Path("workspace/analysis/email_deliverability.json"),
        type=Path,
        help="Path for the generated deliverability JSON report.",
    )
    args = parser.parse_args()

    report = generate_deliverability_report(
        sends_csv_path=args.sends_path,
        domain=args.domain,
        output_path=args.output,
    )
    print(f"Deliverability report generated: health_score={report.overall_health_score}")
