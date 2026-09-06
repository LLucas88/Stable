"""Performance Validator for Compliance-Aware Content Review."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional


class ValidationSeverity(Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


@dataclass
class PerformanceClaim:
    raw_text: str
    percentage: Optional[float]
    time_period: Optional[str]
    is_gross: Optional[bool]
    is_net: Optional[bool]
    is_annualized: Optional[bool]
    benchmark_name: Optional[str]
    location: str


@dataclass
class ValidationFinding:
    finding_id: str
    severity: ValidationSeverity
    rule_citation: str
    description: str
    related_claim: Optional[PerformanceClaim]
    remediation: str
    requires_human_review: bool = True


@dataclass
class PerformanceValidationResult:
    validation_id: str
    validation_timestamp: str
    content_source: str
    claims_found: list[PerformanceClaim]
    findings: list[ValidationFinding]
    gross_net_balanced: Optional[bool]
    time_periods_complete: Optional[bool]
    benchmarks_included: Optional[bool]
    advisory_notice: str = "This is an advisory first-pass review, not compliance certification."


def _claim_location(content: str, start: int, end: int) -> str:
    line_number = content[:start].count("\n") + 1
    return f"line {line_number}, chars {start}-{end}"


def extract_performance_claims(content: str) -> list[PerformanceClaim]:
    claims = []
    pattern = re.compile(r"([+-]?\d+(?:\.\d+)?)%\s*(?:return|gain|performance|growth)?", re.IGNORECASE)
    for match in pattern.finditer(content):
        context = content[max(0, match.start() - 80) : match.end() + 80]
        time_match = re.search(
            r"\b(1[- ]year|5[- ]year|10[- ]year|since inception|ytd|quarter|month)\b", context, re.IGNORECASE
        )
        benchmark_match = re.search(r"\b(S&P 500|benchmark|index|MSCI [A-Za-z ]+)\b", context, re.IGNORECASE)
        lowered = context.lower()
        claims.append(
            PerformanceClaim(
                raw_text=match.group(0),
                percentage=float(match.group(1)),
                time_period=time_match.group(0) if time_match else None,
                is_gross="gross" in lowered,
                is_net="net" in lowered,
                is_annualized="annualized" in lowered,
                benchmark_name=benchmark_match.group(0) if benchmark_match else None,
                location=_claim_location(content, match.start(), match.end()),
            )
        )
    return claims


def validate_gross_net_balance(
    claims: list[PerformanceClaim],
) -> list[ValidationFinding]:
    findings = []
    has_gross = any(claim.is_gross for claim in claims)
    has_net = any(claim.is_net for claim in claims)
    if has_gross and not has_net:
        findings.append(
            ValidationFinding(
                finding_id=str(uuid.uuid4()),
                severity=ValidationSeverity.HIGH,
                rule_citation="SEC Marketing Rule 206(4)-1",
                description="Gross performance appears without net performance of equal prominence.",
                related_claim=next((claim for claim in claims if claim.is_gross), None),
                remediation="Add net performance alongside each gross performance presentation.",
            )
        )
    return findings


def validate_time_period_completeness(
    claims: list[PerformanceClaim],
    inception_date: Optional[date] = None,
) -> list[ValidationFinding]:
    findings = []
    periods = {claim.time_period.lower() for claim in claims if claim.time_period}
    required = {"1-year", "5-year"}
    required.add(
        "10-year" if inception_date is None or (date.today().year - inception_date.year) >= 10 else "since inception"
    )
    if not any(period in periods for period in required):
        findings.append(
            ValidationFinding(
                finding_id=str(uuid.uuid4()),
                severity=ValidationSeverity.HIGH,
                rule_citation="SEC Marketing Rule 206(4)-1",
                description="Performance claims do not include the expected standard trailing periods.",
                related_claim=claims[0] if claims else None,
                remediation="Add 1-year, 5-year, and 10-year or since-inception figures.",
            )
        )
    for claim in claims:
        if claim.time_period and claim.time_period.lower() in {"month", "quarter"} and claim.is_annualized:
            findings.append(
                ValidationFinding(
                    finding_id=str(uuid.uuid4()),
                    severity=ValidationSeverity.HIGH,
                    rule_citation="SEC Marketing Rule 206(4)-1",
                    description="Sub-one-year performance appears to be annualized.",
                    related_claim=claim,
                    remediation="Remove annualization for periods shorter than one year.",
                )
            )
    return findings


def validate_benchmark_inclusion(
    claims: list[PerformanceClaim],
) -> list[ValidationFinding]:
    findings = []
    if claims and not any(claim.benchmark_name for claim in claims):
        findings.append(
            ValidationFinding(
                finding_id=str(uuid.uuid4()),
                severity=ValidationSeverity.MEDIUM,
                rule_citation="FINRA Rule 2210",
                description="Performance is shown without benchmark context.",
                related_claim=claims[0],
                remediation="Consider adding an appropriate benchmark or explain why none is relevant.",
            )
        )
    return findings


def validate_hypothetical_performance(
    content: str,
    claims: list[PerformanceClaim],
) -> list[ValidationFinding]:
    findings = []
    if re.search(r"\b(hypothetical|back-tested|model performance|projected)\b", content, re.IGNORECASE):
        if not re.search(r"\b(assumptions|limitations|not indicative|hindsight)\b", content, re.IGNORECASE):
            findings.append(
                ValidationFinding(
                    finding_id=str(uuid.uuid4()),
                    severity=ValidationSeverity.HIGH,
                    rule_citation="SEC Marketing Rule 206(4)-1",
                    description="Hypothetical performance appears without methodology and limitation disclosures.",
                    related_claim=claims[0] if claims else None,
                    remediation="Add assumptions, limitations, and risk language for hypothetical performance.",
                )
            )
    return findings


def validate_extracted_performance(
    content: str,
    claims: list[PerformanceClaim],
) -> list[ValidationFinding]:
    findings = []
    if re.search(
        r"\b(selected holdings|top positions|subset of portfolio)\b", content, re.IGNORECASE
    ) and not re.search(r"\b(total portfolio|overall portfolio)\b", content, re.IGNORECASE):
        findings.append(
            ValidationFinding(
                finding_id=str(uuid.uuid4()),
                severity=ValidationSeverity.HIGH,
                rule_citation="SEC Marketing Rule 206(4)-1",
                description="Extracted performance may be shown without total portfolio context.",
                related_claim=claims[0] if claims else None,
                remediation="Add total portfolio performance alongside extracted results.",
            )
        )
    return findings


def run_full_validation(
    content: str,
    content_source: str = "unknown",
    inception_date: Optional[date] = None,
) -> PerformanceValidationResult:
    claims = extract_performance_claims(content)
    findings = []
    findings.extend(validate_gross_net_balance(claims))
    findings.extend(validate_time_period_completeness(claims, inception_date=inception_date))
    findings.extend(validate_benchmark_inclusion(claims))
    findings.extend(validate_hypothetical_performance(content, claims))
    findings.extend(validate_extracted_performance(content, claims))
    has_gross_issue = any("gross" in finding.description.lower() for finding in findings)
    has_period_issue = any("period" in finding.description.lower() for finding in findings)
    has_benchmark_issue = any("benchmark" in finding.description.lower() for finding in findings)
    return PerformanceValidationResult(
        validation_id=str(uuid.uuid4()),
        validation_timestamp=datetime.now(timezone.utc).isoformat(),
        content_source=content_source,
        claims_found=claims,
        findings=findings,
        gross_net_balanced=not has_gross_issue if claims else None,
        time_periods_complete=not has_period_issue if claims else None,
        benchmarks_included=not has_benchmark_issue if claims else None,
    )
