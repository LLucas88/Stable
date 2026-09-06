"""Archival Tagger for Compliance-Aware Content Review."""

from __future__ import annotations

import csv
import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


class CommunicationType(Enum):
    RETAIL = "RETAIL"
    INSTITUTIONAL = "INSTITUTIONAL"
    CORRESPONDENCE = "CORRESPONDENCE"


class ContentCategory(Enum):
    ADVERTISEMENT = "ADVERTISEMENT"
    SALES_LITERATURE = "SALES_LITERATURE"
    RESEARCH = "RESEARCH"
    COMMENTARY = "COMMENTARY"
    EDUCATIONAL = "EDUCATIONAL"
    PROMOTIONAL = "PROMOTIONAL"


class FilingType(Enum):
    PRE_USE = "PRE_USE"
    POST_USE = "POST_USE"
    NONE = "NONE"


class FilingStatus(Enum):
    PENDING = "PENDING"
    FILED = "FILED"
    NOT_REQUIRED = "NOT_REQUIRED"


class StorageFormat(Enum):
    WORM = "WORM"
    STANDARD = "STANDARD"


@dataclass
class RetentionPolicy:
    period_years: int
    start_date: date
    end_date: date
    rule_citation: str
    worm_required: bool


@dataclass
class FilingMetadata:
    finra_filing_required: bool
    filing_type: FilingType
    filing_deadline: Optional[date]
    filing_status: FilingStatus


@dataclass
class StorageMetadata:
    primary_location: str
    duplicate_location: str
    index_reference: str
    format: StorageFormat


@dataclass
class ArchivalTag:
    content_id: str
    content_hash: str
    original_file_path: str
    review_id: str
    created_timestamp: str
    review_timestamp: str
    archival_timestamp: str
    reviewer_type: str
    reviewer_identity: str
    jurisdictions: list[str]
    communication_type: CommunicationType
    content_category: ContentCategory
    product_type: Optional[str]
    retention: RetentionPolicy
    filing: FilingMetadata
    storage: StorageMetadata


@dataclass
class ArchivalManifest:
    manifest_id: str
    generated_timestamp: str
    tags: list[ArchivalTag] = field(default_factory=list)
    advisory_notice: str = "This is an advisory first-pass review, not compliance certification. All archival tags require confirmation by a qualified compliance officer."


def compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def determine_retention_policy(
    communication_type: CommunicationType,
    content_category: ContentCategory,
    jurisdictions: list[str],
    is_complaint_related: bool = False,
) -> RetentionPolicy:
    today = date.today()
    period_years = 3
    rule_citation = "SEC 17a-4(b)(4)"
    if communication_type == CommunicationType.RETAIL:
        period_years = max(period_years, 3)
    if content_category in {
        ContentCategory.ADVERTISEMENT,
        ContentCategory.PROMOTIONAL,
        ContentCategory.SALES_LITERATURE,
    }:
        period_years = max(period_years, 3)
    if is_complaint_related:
        period_years = max(period_years, 4)
        rule_citation = "FINRA complaint retention"
    if "FCA" in jurisdictions:
        period_years = max(period_years, 5)
        rule_citation = "FCA recordkeeping"
    return RetentionPolicy(
        period_years=period_years,
        start_date=today,
        end_date=today + timedelta(days=period_years * 365),
        rule_citation=rule_citation,
        worm_required=True,
    )


def determine_filing_requirements(
    communication_type: CommunicationType,
    content_category: ContentCategory,
    is_new_member: bool = False,
    is_options_related: bool = False,
    is_cmo_related: bool = False,
    is_investment_company: bool = False,
) -> FilingMetadata:
    requires_filing = False
    filing_type = FilingType.NONE
    if communication_type == CommunicationType.RETAIL and (
        is_new_member or content_category in {ContentCategory.ADVERTISEMENT, ContentCategory.SALES_LITERATURE}
    ):
        requires_filing = True
        filing_type = (
            FilingType.PRE_USE if is_new_member or is_options_related or is_cmo_related else FilingType.POST_USE
        )
    if is_investment_company and communication_type == CommunicationType.RETAIL:
        requires_filing = True
        filing_type = FilingType.POST_USE
    deadline = date.today() + timedelta(days=10) if requires_filing else None
    return FilingMetadata(
        finra_filing_required=requires_filing,
        filing_type=filing_type,
        filing_deadline=deadline,
        filing_status=FilingStatus.PENDING if requires_filing else FilingStatus.NOT_REQUIRED,
    )


def create_archival_tag(
    content: str,
    original_file_path: str,
    review_id: str,
    review_timestamp: str,
    jurisdictions: list[str],
    communication_type: CommunicationType,
    content_category: ContentCategory,
    product_type: Optional[str] = None,
    is_complaint_related: bool = False,
    is_new_member: bool = False,
    is_options_related: bool = False,
    is_cmo_related: bool = False,
    is_investment_company: bool = False,
    storage_primary: str = "",
    storage_duplicate: str = "",
) -> ArchivalTag:
    now = datetime.now(timezone.utc).isoformat()
    content_hash = compute_content_hash(content)
    retention = determine_retention_policy(communication_type, content_category, jurisdictions, is_complaint_related)
    filing = determine_filing_requirements(
        communication_type, content_category, is_new_member, is_options_related, is_cmo_related, is_investment_company
    )
    content_id = str(uuid.uuid4())
    return ArchivalTag(
        content_id=content_id,
        content_hash=content_hash,
        original_file_path=original_file_path,
        review_id=review_id,
        created_timestamp=now,
        review_timestamp=review_timestamp,
        archival_timestamp=now,
        reviewer_type="AUTOMATED_FIRST_PASS",
        reviewer_identity="compliance-review-skill-v1",
        jurisdictions=jurisdictions,
        communication_type=communication_type,
        content_category=content_category,
        product_type=product_type,
        retention=retention,
        filing=filing,
        storage=StorageMetadata(
            primary_location=storage_primary,
            duplicate_location=storage_duplicate,
            index_reference=f"idx-{content_id}",
            format=StorageFormat.WORM if retention.worm_required else StorageFormat.STANDARD,
        ),
    )


def serialize_archival_tag(tag: ArchivalTag) -> dict:
    payload = asdict(tag)
    payload["communication_type"] = tag.communication_type.value
    payload["content_category"] = tag.content_category.value
    payload["retention"]["start_date"] = tag.retention.start_date.isoformat()
    payload["retention"]["end_date"] = tag.retention.end_date.isoformat()
    payload["filing"]["filing_type"] = tag.filing.filing_type.value
    payload["filing"]["filing_deadline"] = (
        tag.filing.filing_deadline.isoformat() if tag.filing.filing_deadline else None
    )
    payload["filing"]["filing_status"] = tag.filing.filing_status.value
    payload["storage"]["format"] = tag.storage.format.value
    return payload


def create_manifest(tags: list[ArchivalTag]) -> ArchivalManifest:
    return ArchivalManifest(
        manifest_id=str(uuid.uuid4()),
        generated_timestamp=datetime.now(timezone.utc).isoformat(),
        tags=tags,
    )


def export_manifest(
    manifest: ArchivalManifest,
    output_path: Path,
    format: str = "json",
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = [serialize_archival_tag(tag) for tag in manifest.tags]
    if format == "json":
        output_path.write_text(
            json.dumps(
                {
                    "manifest_id": manifest.manifest_id,
                    "generated_timestamp": manifest.generated_timestamp,
                    "advisory_notice": manifest.advisory_notice,
                    "tags": serialized,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return output_path
    if format == "csv":
        if not serialized:
            output_path.write_text("", encoding="utf-8")
            return output_path
        with output_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=sorted(serialized[0].keys()))
            writer.writeheader()
            writer.writerows(serialized)
        return output_path
    raise ValueError("format must be json or csv")


def append_to_review_log(
    tag: ArchivalTag,
    log_path: Path,
) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "tag": serialize_archival_tag(tag),
    }
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
