"""Content Scanner for Compliance-Aware Content Review."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


class Severity(Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class Jurisdiction(Enum):
    SEC = "SEC"
    FINRA = "FINRA"
    FCA = "FCA"


@dataclass
class ComplianceFinding:
    issue_id: str
    severity: Severity
    jurisdiction: Jurisdiction
    rule_citation: str
    description: str
    matched_text: str
    location: str
    remediation: str
    requires_human_review: bool = True


@dataclass
class ScanResult:
    scan_id: str
    scan_timestamp: str
    content_source: str
    overall_status: str
    advisory_notice: str = "This is an advisory first-pass review, not compliance certification."
    findings: list[ComplianceFinding] = field(default_factory=list)


@dataclass
class ScanRule:
    rule_id: str
    pattern: re.Pattern[str]
    severity: Severity
    jurisdiction: Jurisdiction
    rule_citation: str
    description: str
    remediation: str


def load_default_rules() -> list[ScanRule]:
    return [
        ScanRule(
            "sec_superlatives",
            re.compile(r"\b(best|guaranteed|risk[- ]free|safe|certain)\b", re.IGNORECASE),
            Severity.HIGH,
            Jurisdiction.SEC,
            "SEC Marketing Rule 206(4)-1",
            "Promissory or superlative statement detected.",
            "Remove or qualify the statement and add balanced risk language.",
        ),
        ScanRule(
            "finra_balance",
            re.compile(r"\b(outperform|superior returns|consistent gains)\b", re.IGNORECASE),
            Severity.MEDIUM,
            Jurisdiction.FINRA,
            "FINRA Rule 2210(d)",
            "Benefit claim may not be balanced with risks.",
            "Add fair-and-balanced risk disclosures near the claim.",
        ),
        ScanRule(
            "fca_clear_fair",
            re.compile(r"\b(capital guaranteed|guaranteed income)\b", re.IGNORECASE),
            Severity.HIGH,
            Jurisdiction.FCA,
            "FCA financial promotions",
            "Potentially misleading FCA promotion language detected.",
            "Replace with factual wording and include capital-at-risk messaging.",
        ),
    ]


def load_custom_rules(rules_path: Path) -> list[ScanRule]:
    if not rules_path.exists():
        raise FileNotFoundError(rules_path)
    payload = json.loads(rules_path.read_text(encoding="utf-8"))
    rules = []
    for entry in payload:
        rules.append(
            ScanRule(
                rule_id=entry["rule_id"],
                pattern=re.compile(entry["pattern"], re.IGNORECASE),
                severity=Severity[entry["severity"]],
                jurisdiction=Jurisdiction[entry["jurisdiction"]],
                rule_citation=entry["rule_citation"],
                description=entry["description"],
                remediation=entry["remediation"],
            )
        )
    return rules


def _location_for_match(content: str, match: re.Match[str]) -> str:
    line_number = content[: match.start()].count("\n") + 1
    return f"line {line_number}, chars {match.start()}-{match.end()}"


def scan_content(
    content: str,
    rules: list[ScanRule],
    content_source: str = "unknown",
) -> ScanResult:
    findings: list[ComplianceFinding] = []
    for rule in rules:
        for match in rule.pattern.finditer(content):
            findings.append(
                ComplianceFinding(
                    issue_id=str(uuid.uuid4()),
                    severity=rule.severity,
                    jurisdiction=rule.jurisdiction,
                    rule_citation=rule.rule_citation,
                    description=rule.description,
                    matched_text=match.group(0),
                    location=_location_for_match(content, match),
                    remediation=rule.remediation,
                )
            )
    if any(finding.severity == Severity.HIGH for finding in findings):
        status = "FAIL"
    elif any(finding.severity == Severity.MEDIUM for finding in findings):
        status = "WARNING"
    else:
        status = "PASS"
    return ScanResult(
        scan_id=str(uuid.uuid4()),
        scan_timestamp=datetime.now(timezone.utc).isoformat(),
        content_source=content_source,
        overall_status=status,
        findings=findings,
    )


def scan_for_superlatives(content: str) -> list[ComplianceFinding]:
    return scan_content(content, [load_default_rules()[0]]).findings


def scan_for_cherry_picked_performance(content: str) -> list[ComplianceFinding]:
    findings = []
    performance_claims = list(
        re.finditer(r"([+-]?\d+(?:\.\d+)?)%\s+(?:return|gain|performance)", content, re.IGNORECASE)
    )
    if performance_claims and not re.search(
        r"\b(1[- ]year|5[- ]year|10[- ]year|since inception)\b", content, re.IGNORECASE
    ):
        for match in performance_claims:
            findings.append(
                ComplianceFinding(
                    issue_id=str(uuid.uuid4()),
                    severity=Severity.HIGH,
                    jurisdiction=Jurisdiction.SEC,
                    rule_citation="SEC Marketing Rule 206(4)-1",
                    description="Performance claim may be cherry-picked without standard trailing periods.",
                    matched_text=match.group(0),
                    location=_location_for_match(content, match),
                    remediation="Add 1/5/10-year or since-inception performance alongside the cited return.",
                )
            )
    return findings


def scan_for_missing_risk_disclosures(content: str) -> list[ComplianceFinding]:
    findings = []
    benefit_language = list(re.finditer(r"\b(growth|income|outperformance|returns|upside)\b", content, re.IGNORECASE))
    has_risk_language = re.search(r"\b(risk|loss|may decline|capital at risk|not guaranteed)\b", content, re.IGNORECASE)
    if benefit_language and not has_risk_language:
        for match in benefit_language[:3]:
            findings.append(
                ComplianceFinding(
                    issue_id=str(uuid.uuid4()),
                    severity=Severity.MEDIUM,
                    jurisdiction=Jurisdiction.FINRA,
                    rule_citation="FINRA Rule 2210(d)(1)",
                    description="Benefit-oriented statement appears without balancing risk disclosure.",
                    matched_text=match.group(0),
                    location=_location_for_match(content, match),
                    remediation="Insert a proximate risk disclosure covering loss of principal and uncertainty of returns.",
                )
            )
    return findings


def scan_for_fca_violations(content: str) -> list[ComplianceFinding]:
    findings = []
    if re.search(r"\b(uk|united kingdom|fca)\b", content, re.IGNORECASE):
        if not re.search(
            r"\b(capital at risk|may not get back the amount originally invested)\b", content, re.IGNORECASE
        ):
            findings.append(
                ComplianceFinding(
                    issue_id=str(uuid.uuid4()),
                    severity=Severity.HIGH,
                    jurisdiction=Jurisdiction.FCA,
                    rule_citation="FCA financial promotions",
                    description="UK-directed content appears to omit a capital-at-risk warning.",
                    matched_text="UK/FCA context",
                    location="document-level",
                    remediation="Add an FCA-compliant capital-at-risk warning with clear prominence.",
                )
            )
    return findings


def classify_content(
    content: str,
    metadata: Optional[dict[str, str]] = None,
) -> dict[str, str | list[str] | bool]:
    metadata = metadata or {}
    jurisdictions = set()
    if re.search(r"\b(uk|fca|england|wales)\b", content, re.IGNORECASE) or metadata.get("jurisdiction") == "UK":
        jurisdictions.add("FCA")
    if (
        re.search(r"\b(finra|broker-dealer|member sipc)\b", content, re.IGNORECASE)
        or metadata.get("firm_member_status") == "finra"
    ):
        jurisdictions.add("FINRA")
    jurisdictions.add("SEC")
    audience = metadata.get("target_audience", "RETAIL").upper()
    if "institution" in content.lower():
        audience = "INSTITUTIONAL"
    content_type = "GENERAL"
    if re.search(r"\b(testimonial|endorsement)\b", content, re.IGNORECASE):
        content_type = "TESTIMONIAL"
    elif re.search(r"\b(return|performance|benchmark)\b", content, re.IGNORECASE):
        content_type = "PERFORMANCE"
    filing_required = "PRE_USE" if audience == "RETAIL" and "FINRA" in jurisdictions else "NONE"
    return {
        "jurisdiction": sorted(jurisdictions),
        "audience": audience,
        "content_type": content_type,
        "filing_required": filing_required,
    }


def generate_scan_report(result: ScanResult) -> dict:
    return {
        "scan_id": result.scan_id,
        "scan_timestamp": result.scan_timestamp,
        "content_source": result.content_source,
        "overall_status": result.overall_status,
        "advisory_notice": result.advisory_notice,
        "findings": [
            {
                "issue_id": finding.issue_id,
                "severity": finding.severity.value,
                "jurisdiction": finding.jurisdiction.value,
                "rule_citation": finding.rule_citation,
                "description": finding.description,
                "matched_text": finding.matched_text,
                "location": finding.location,
                "remediation": finding.remediation,
                "requires_human_review": finding.requires_human_review,
            }
            for finding in result.findings
        ],
    }
