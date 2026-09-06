"""Disclosure Inserter for Compliance-Aware Content Review."""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


class ContentType(Enum):
    PERFORMANCE = "PERFORMANCE"
    TESTIMONIAL = "TESTIMONIAL"
    ENDORSEMENT = "ENDORSEMENT"
    HYPOTHETICAL = "HYPOTHETICAL"
    THIRD_PARTY_RATING = "THIRD_PARTY_RATING"
    FEE_REFERENCE = "FEE_REFERENCE"
    RISK_STATEMENT = "RISK_STATEMENT"
    GENERAL = "GENERAL"


class DisclosureType(Enum):
    PAST_PERFORMANCE_US = "PAST_PERFORMANCE_US"
    PAST_PERFORMANCE_UK = "PAST_PERFORMANCE_UK"
    GROSS_NET = "GROSS_NET"
    HYPOTHETICAL = "HYPOTHETICAL"
    BACK_TESTED = "BACK_TESTED"
    BENCHMARK = "BENCHMARK"
    TESTIMONIAL_COMPENSATED = "TESTIMONIAL_COMPENSATED"
    TESTIMONIAL_UNCOMPENSATED = "TESTIMONIAL_UNCOMPENSATED"
    ENDORSEMENT = "ENDORSEMENT"
    THIRD_PARTY_RATING = "THIRD_PARTY_RATING"
    GENERAL_RISK_US = "GENERAL_RISK_US"
    GENERAL_RISK_UK = "GENERAL_RISK_UK"
    ADVISORY_FEE = "ADVISORY_FEE"
    TOTAL_COST = "TOTAL_COST"
    SEC_REGISTRATION = "SEC_REGISTRATION"
    FINRA_MEMBERSHIP = "FINRA_MEMBERSHIP"
    FCA_AUTHORIZATION = "FCA_AUTHORIZATION"
    HIGH_RISK_INVESTMENT = "HIGH_RISK_INVESTMENT"
    CAPITAL_AT_RISK = "CAPITAL_AT_RISK"


@dataclass
class DisclosureTemplate:
    disclosure_type: DisclosureType
    template_text: str
    placeholders: list[str]
    jurisdiction: str
    is_firm_customized: bool = False


@dataclass
class InsertionPoint:
    position: int
    anchor_text: str
    placement: str


@dataclass
class DisclosureInsertion:
    disclosure_type: DisclosureType
    disclosure_text: str
    insertion_point: InsertionPoint
    is_required: bool
    rule_citation: str
    status: str = "PENDING"


@dataclass
class InsertionResult:
    result_id: str
    timestamp: str
    content_source: str
    original_content_hash: str
    modified_content: Optional[str]
    insertions: list[DisclosureInsertion]
    disclosures_required: list[DisclosureType]
    disclosures_present: list[DisclosureType]
    disclosures_missing: list[DisclosureType]
    advisory_notice: str = "This is an advisory first-pass review, not compliance certification. All inserted disclosures require human compliance officer approval."


_HEADING_MAP = {
    "Past Performance Disclaimer (US -- SEC/FINRA)": DisclosureType.PAST_PERFORMANCE_US,
    "Past Performance Disclaimer (UK -- FCA)": DisclosureType.PAST_PERFORMANCE_UK,
    "Gross/Net Performance Disclosure": DisclosureType.GROSS_NET,
    "Hypothetical Performance Disclaimer": DisclosureType.HYPOTHETICAL,
    "Back-Tested Performance Disclaimer": DisclosureType.BACK_TESTED,
    "Benchmark Disclosure": DisclosureType.BENCHMARK,
    "General Investment Risk (US)": DisclosureType.GENERAL_RISK_US,
    "General Investment Risk (UK)": DisclosureType.GENERAL_RISK_UK,
    "Advisory Fee Disclosure": DisclosureType.ADVISORY_FEE,
    "Total Cost Disclosure": DisclosureType.TOTAL_COST,
    "Compensated Testimonial Disclosure": DisclosureType.TESTIMONIAL_COMPENSATED,
    "Uncompensated Testimonial Disclosure": DisclosureType.TESTIMONIAL_UNCOMPENSATED,
    "Endorsement Disclosure": DisclosureType.ENDORSEMENT,
    "Rating Disclosure": DisclosureType.THIRD_PARTY_RATING,
    "SEC-Registered Adviser": DisclosureType.SEC_REGISTRATION,
    "FINRA Broker-Dealer": DisclosureType.FINRA_MEMBERSHIP,
    "FCA-Authorized Firm": DisclosureType.FCA_AUTHORIZATION,
}


def _parse_templates(file_path: Path, customized: bool) -> dict[DisclosureType, DisclosureTemplate]:
    text = file_path.read_text(encoding="utf-8")
    templates: dict[DisclosureType, DisclosureTemplate] = {}
    matches = re.finditer(r"### (.+?)\n\n```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    for match in matches:
        heading = match.group(1).strip()
        disclosure_type = _HEADING_MAP.get(heading)
        if disclosure_type is None:
            continue
        template_text = match.group(2).strip()
        jurisdiction = (
            "UK"
            if "UK" in heading or "FCA" in heading
            else "US"
            if "US" in heading or "SEC" in heading or "FINRA" in heading
            else "BOTH"
        )
        placeholders = re.findall(r"\[[^\]]+\]", template_text)
        templates[disclosure_type] = DisclosureTemplate(
            disclosure_type=disclosure_type,
            template_text=template_text,
            placeholders=placeholders,
            jurisdiction=jurisdiction,
            is_firm_customized=customized,
        )
    return templates


def load_default_templates() -> dict[DisclosureType, DisclosureTemplate]:
    references_path = Path(__file__).resolve().parent.parent / "references" / "disclosure_templates.md"
    return _parse_templates(references_path, customized=False)


def load_firm_templates(
    firm_templates_path: Path,
) -> dict[DisclosureType, DisclosureTemplate]:
    if not firm_templates_path.exists():
        raise FileNotFoundError(firm_templates_path)
    return _parse_templates(firm_templates_path, customized=True)


def determine_required_disclosures(
    content: str,
    content_types: list[ContentType],
    jurisdictions: list[str],
) -> list[DisclosureType]:
    required = set()
    if ContentType.PERFORMANCE in content_types:
        required.add(
            DisclosureType.PAST_PERFORMANCE_US if "US" in jurisdictions else DisclosureType.PAST_PERFORMANCE_UK
        )
        required.add(DisclosureType.GENERAL_RISK_US if "US" in jurisdictions else DisclosureType.GENERAL_RISK_UK)
        if re.search(r"\bgross\b", content, re.IGNORECASE):
            required.add(DisclosureType.GROSS_NET)
        if re.search(r"\bbenchmark|index\b", content, re.IGNORECASE):
            required.add(DisclosureType.BENCHMARK)
    if ContentType.HYPOTHETICAL in content_types:
        required.add(DisclosureType.HYPOTHETICAL)
    if ContentType.TESTIMONIAL in content_types:
        required.add(DisclosureType.TESTIMONIAL_UNCOMPENSATED)
    if ContentType.ENDORSEMENT in content_types:
        required.add(DisclosureType.ENDORSEMENT)
    if "UK" in jurisdictions:
        required.add(DisclosureType.CAPITAL_AT_RISK)
    required.add(DisclosureType.SEC_REGISTRATION)
    return sorted(required, key=lambda item: item.value)


def detect_existing_disclosures(
    content: str,
    templates: dict[DisclosureType, DisclosureTemplate],
) -> list[DisclosureType]:
    present = []
    lowered = content.lower()
    for disclosure_type, template in templates.items():
        key_phrase = " ".join(template.template_text.split()[:6]).lower()
        if key_phrase and key_phrase in lowered:
            present.append(disclosure_type)
    return present


def find_insertion_points(
    content: str,
    disclosures_to_insert: list[DisclosureType],
) -> dict[DisclosureType, InsertionPoint]:
    points = {}
    performance_match = re.search(r"%|\bperformance\b|\breturn\b", content, re.IGNORECASE)
    footer_position = len(content)
    for disclosure in disclosures_to_insert:
        if (
            disclosure
            in {
                DisclosureType.PAST_PERFORMANCE_US,
                DisclosureType.PAST_PERFORMANCE_UK,
                DisclosureType.GROSS_NET,
                DisclosureType.HYPOTHETICAL,
                DisclosureType.BENCHMARK,
            }
            and performance_match
        ):
            points[disclosure] = InsertionPoint(
                position=performance_match.end(), anchor_text=performance_match.group(0), placement="AFTER"
            )
        elif disclosure in {
            DisclosureType.GENERAL_RISK_US,
            DisclosureType.GENERAL_RISK_UK,
            DisclosureType.CAPITAL_AT_RISK,
        }:
            points[disclosure] = InsertionPoint(position=0, anchor_text="document start", placement="BEFORE")
        else:
            points[disclosure] = InsertionPoint(
                position=footer_position, anchor_text="document end", placement="FOOTER"
            )
    return points


def insert_disclosures(
    content: str,
    disclosures: list[DisclosureInsertion],
) -> str:
    modified = content
    for disclosure in sorted(disclosures, key=lambda item: item.insertion_point.position, reverse=True):
        block = f"\n\n[DISCLOSURE: {disclosure.disclosure_type.value}]\n{disclosure.disclosure_text}\n"
        position = disclosure.insertion_point.position
        modified = modified[:position] + block + modified[position:]
        disclosure.status = "INSERTED"
    return modified


def validate_disclosure_placement(
    content: str,
    disclosures: list[DisclosureInsertion],
) -> list[dict[str, str]]:
    issues = []
    for disclosure in disclosures:
        if (
            disclosure.disclosure_type
            in {
                DisclosureType.PAST_PERFORMANCE_US,
                DisclosureType.PAST_PERFORMANCE_UK,
                DisclosureType.GENERAL_RISK_US,
                DisclosureType.GENERAL_RISK_UK,
            }
            and disclosure.insertion_point.placement == "FOOTER"
        ):
            issues.append(
                {
                    "disclosure_type": disclosure.disclosure_type.value,
                    "issue": "Important disclosure placed only in footer.",
                    "remediation": "Move disclosure closer to the related claim or top of document.",
                }
            )
    if "CAPITAL AT RISK" not in content.upper() and any(
        disclosure.disclosure_type == DisclosureType.CAPITAL_AT_RISK for disclosure in disclosures
    ):
        issues.append(
            {
                "disclosure_type": DisclosureType.CAPITAL_AT_RISK.value,
                "issue": "Capital-at-risk disclosure text not prominent after insertion.",
                "remediation": "Use explicit 'Capital at risk' wording near the headline or first investment claim.",
            }
        )
    return issues


def run_disclosure_pipeline(
    content: str,
    content_source: str,
    content_types: list[ContentType],
    jurisdictions: list[str],
    firm_templates_path: Optional[Path] = None,
) -> InsertionResult:
    templates = load_default_templates()
    if firm_templates_path and firm_templates_path.exists():
        templates.update(load_firm_templates(firm_templates_path))
    required = determine_required_disclosures(content, content_types, jurisdictions)
    present = detect_existing_disclosures(content, templates)
    missing = [disclosure for disclosure in required if disclosure not in present]
    insertion_points = find_insertion_points(content, missing)
    insertions = []
    for disclosure in missing:
        template = templates.get(disclosure)
        if not template:
            continue
        insertions.append(
            DisclosureInsertion(
                disclosure_type=disclosure,
                disclosure_text=template.template_text,
                insertion_point=insertion_points[disclosure],
                is_required=True,
                rule_citation="Auto-mapped disclosure requirement",
            )
        )
    modified_content = insert_disclosures(content, insertions) if insertions else content
    _ = validate_disclosure_placement(modified_content, insertions)
    return InsertionResult(
        result_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        content_source=content_source,
        original_content_hash=hashlib.sha256(content.encode()).hexdigest(),
        modified_content=modified_content,
        insertions=insertions,
        disclosures_required=required,
        disclosures_present=present,
        disclosures_missing=missing,
    )
