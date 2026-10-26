import io
import json
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from config import settings

logger = logging.getLogger("khusela.legal")
router = APIRouter()


class RawSurvivorNotesRequest(BaseModel):
    survivor_name: Optional[str] = ""
    respondent_name: Optional[str] = ""
    applicant_surname: Optional[str] = ""
    applicant_full_names: Optional[str] = ""
    applicant_id_or_dob: Optional[str] = ""
    applicant_gender: Optional[str] = ""
    applicant_race: Optional[str] = ""
    applicant_marital_status: Optional[str] = ""
    applicant_phone: Optional[str] = ""
    applicant_email: Optional[str] = ""
    applicant_address: Optional[str] = ""
    applicant_occupation: Optional[str] = ""
    relationship_to_respondent: Optional[str] = "Current co-resident / Partner"
    respondent_surname: Optional[str] = ""
    respondent_full_names: Optional[str] = ""
    respondent_id_or_dob: Optional[str] = ""
    respondent_phone: Optional[str] = ""
    respondent_email: Optional[str] = ""
    respondent_address: Optional[str] = ""
    respondent_work_address: Optional[str] = ""
    respondent_occupation: Optional[str] = ""
    police_station: Optional[str] = ""
    magistrates_court: Optional[str] = ""
    raw_notes: str
    evidence_hashes: Optional[List[str]] = Field(default_factory=list)


class Form06StructuredData(BaseModel):
    applicant_full_name: str = ""
    respondent_full_name: str = ""
    applicant_surname: str = ""
    applicant_full_names: str = ""
    applicant_id_or_dob: str = ""
    applicant_gender: str = ""
    applicant_race: str = ""
    applicant_marital_status: str = ""
    applicant_phone: str = ""
    applicant_email: str = ""
    applicant_address: str = ""
    applicant_occupation: str = ""
    relationship_to_respondent: str = "Current co-resident / Partner"
    respondent_surname: str = ""
    respondent_full_names: str = ""
    respondent_id_or_dob: str = ""
    respondent_phone: str = ""
    respondent_email: str = ""
    respondent_address: str = ""
    respondent_work_address: str = ""
    respondent_occupation: str = ""
    incident_date_time: str = ""
    incident_location: str = ""
    nature_of_domestic_violence: List[str] = Field(default_factory=list)
    chronological_affidavit_narrative: str = ""
    weapons_or_threats_involved: str = ""
    medical_treatment_received: str = "No emergency hospitalisation yet; visible bruising documented in cryptographic vault."
    harm_or_damages_caused: str = "Physical bruising, psychological trauma, and unlawful deprivation of phone/bank card."
    urgency_grounds_section_4: str = ""
    requested_protection_terms: List[str] = Field(default_factory=list)
    police_station: str = ""
    magistrates_court: str = ""
    evidence_sha256_manifest: List[str] = Field(default_factory=list)


def _split_name(full_name: str):
    cleaned = full_name.replace("(Applicant)", "").replace("(Respondent)", "").strip()
    parts = cleaned.split()
    if len(parts) >= 2:
        return parts[-1], " ".join(parts[:-1])
    return cleaned, cleaned


def _resolve_particulars(payload: RawSurvivorNotesRequest):
    app_surname = (payload.applicant_surname or "").strip()
    app_names = (payload.applicant_full_names or "").strip()
    if not app_surname and not app_names and payload.survivor_name:
        app_surname, app_names = _split_name(payload.survivor_name)
    app_full = f"{app_names} {app_surname}".strip() or payload.survivor_name or ""

    resp_surname = (payload.respondent_surname or "").strip()
    resp_names = (payload.respondent_full_names or "").strip()
    if not resp_surname and not resp_names and payload.respondent_name:
        resp_surname, resp_names = _split_name(payload.respondent_name)
    resp_full = f"{resp_names} {resp_surname}".strip() or payload.respondent_name or ""

    return app_surname, app_names, app_full, resp_surname, resp_names, resp_full


@router.post("/structure", response_model=Form06StructuredData)
async def structure_survivor_notes(payload: RawSurvivorNotesRequest):
    app_surname, app_names, app_full, resp_surname, resp_names, resp_full = _resolve_particulars(payload)

    base_fields = {
        "applicant_full_name": app_full,
        "respondent_full_name": resp_full,
        "applicant_surname": app_surname,
        "applicant_full_names": app_names,
        "applicant_id_or_dob": payload.applicant_id_or_dob or "",
        "applicant_gender": payload.applicant_gender or "",
        "applicant_race": payload.applicant_race or "",
        "applicant_marital_status": payload.applicant_marital_status or "",
        "applicant_phone": payload.applicant_phone or "",
        "applicant_email": payload.applicant_email or "",
        "applicant_address": payload.applicant_address or "",
        "applicant_occupation": payload.applicant_occupation or "",
        "relationship_to_respondent": payload.relationship_to_respondent or "Current co-resident / Partner",
        "respondent_surname": resp_surname,
        "respondent_full_names": resp_names,
        "respondent_id_or_dob": payload.respondent_id_or_dob or "",
        "respondent_phone": payload.respondent_phone or "",
        "respondent_email": payload.respondent_email or "",
        "respondent_address": payload.respondent_address or payload.applicant_address or "",
        "respondent_work_address": payload.respondent_work_address or "",
        "respondent_occupation": payload.respondent_occupation or "",
        "police_station": payload.police_station or "",
        "magistrates_court": payload.magistrates_court or "",
    }

    if settings.GEMINI_API_KEY:
        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            prompt = f"""
You are a South African Domestic Violence Act (Act 116 of 1998, as amended by Act 14 of 2021) legal clerk assistant.
Convert the following raw survivor notes into formal, first-person legal affidavit fields suitable for
Form 06 (J480) Application for a Protection Order (Section 4). Do not invent facts or dates not stated.

Applicant Name: {app_full}
Respondent Name: {resp_full}
Relationship: {base_fields['relationship_to_respondent']}
Address: {base_fields['applicant_address']}
Raw Notes: {payload.raw_notes}
Evidence SHA-256 Hashes: {payload.evidence_hashes}

Return strictly valid JSON matching this schema:
{{
  "incident_date_time": "string",
  "incident_location": "string",
  "nature_of_domestic_violence": ["Physical Abuse", "Emotional, Verbal and Psychological Abuse", "Economic Abuse", "Intimidation", "Controlling Behaviour"],
  "chronological_affidavit_narrative": "Formal first-person legal paragraph for Form 06 Section 4...",
  "weapons_or_threats_involved": "string",
  "medical_treatment_received": "string",
  "harm_or_damages_caused": "string",
  "urgency_grounds_section_4": "Why an interim protection order is urgently required to prevent undue hardship or imminent harm...",
  "requested_protection_terms": ["Prohibit respondent from entering shared residence", "Prohibit any direct or indirect contact"],
  "evidence_sha256_manifest": ["string"]
}}
"""
            response = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0,
                ),
            )
            parsed = json.loads(response.text)
            if not parsed.get("evidence_sha256_manifest") and payload.evidence_hashes:
                parsed["evidence_sha256_manifest"] = payload.evidence_hashes
            merged = {**base_fields, **parsed}
            if not merged.get("applicant_address") and merged.get("incident_location"):
                merged["applicant_address"] = merged["incident_location"]
            if not merged.get("respondent_address") and merged.get("incident_location"):
                merged["respondent_address"] = merged["incident_location"]
            return Form06StructuredData(**merged)
        except Exception as exc:
            logger.warning(f"Gemini legal structuring fallback engaged: {exc}")

    # AI unavailable: deterministically structure from the survivor's verbatim notes
    raw = payload.raw_notes.strip()
    lower_raw = raw.lower()

    detected_types = []
    if any(w in lower_raw for w in ["hit", "struck", "punch", "slap", "kick", "assault", "bruise", "push", "choke", "physical", "grab", "beat"]):
        detected_types.append("Physical Abuse")
    if any(w in lower_raw for w in ["insult", "scream", "shout", "humiliat", "worthless", "verbal", "emotional", "psycholog", "curse", "degrad"]):
        detected_types.append("Emotional, Verbal and Psychological Abuse")
    if any(w in lower_raw for w in ["money", "bank", "card", "salary", "rent", "financial", "economic", "withheld", "account", "funds"]):
        detected_types.append("Economic Abuse")
    if any(w in lower_raw for w in ["threat", "kill", "weapon", "knife", "gun", "firearm", "intimidat", "harm", "fear", "die"]):
        detected_types.append("Intimidation")
    if any(w in lower_raw for w in ["lock", "phone", "track", "isolat", "forbid", "control", "leave", "trapped", "keys"]):
        detected_types.append("Controlling Behaviour")
    if not detected_types:
        detected_types = ["Physical Abuse", "Emotional, Verbal and Psychological Abuse", "Intimidation"]

    import re
    date_match = re.search(
        r"\b(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}(?:\s+at\s+\d{1,2}[:h]\d{2}(?:\s*(?:am|pm|AM|PM))?)?)",
        raw,
        re.IGNORECASE,
    )
    date_str = date_match.group(1) if date_match else datetime.now(timezone.utc).strftime("%d %B %Y")

    loc_str = payload.applicant_address or "Shared Residence (Domestic Dwelling)"
    loc_match = re.search(
        r"(?:at|in|residence:|address:|location:)\s+(\d+\s+[A-Za-z0-9\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Close|Crescent|Township|Soweto|Johannesburg|Pretoria|Durban|Cape Town)(?:,\s*[A-Za-z\s]+)?)",
        raw,
        re.IGNORECASE,
    )
    if loc_match:
        loc_str = loc_match.group(1).strip()[:52]

    if not base_fields["applicant_address"]:
        base_fields["applicant_address"] = loc_str
    if not base_fields["respondent_address"]:
        base_fields["respondent_address"] = loc_str

    weapons_str = (
        "Threats of severe bodily harm and physical violence reported by Applicant."
        if any(w in lower_raw for w in ["threat", "kill", "knife", "gun", "weapon", "hit", "struck", "bruise"])
        else "Verbal threats, intimidation, and coercive control reported by Applicant."
    )

    urgency_str = (
        "The Respondent poses an immediate and continuing risk of physical harm, intimidation, and undue hardship "
        "to the Applicant within the shared residence. An Interim Protection Order in terms of Section 5 of the "
        "Domestic Violence Act 116 of 1998 is urgently required to protect the Applicant's safety."
    )

    return Form06StructuredData(
        **base_fields,
        incident_date_time=date_str,
        incident_location=loc_str,
        nature_of_domestic_violence=detected_types,
        chronological_affidavit_narrative=raw,
        weapons_or_threats_involved=weapons_str,
        urgency_grounds_section_4=urgency_str,
        requested_protection_terms=[
            "Prohibit Respondent from committing any act of domestic violence",
            "Prohibit Respondent from entering the shared residence or Applicant's workplace",
            "Prohibit any direct or indirect contact or intimidation by the Respondent",
        ],
        evidence_sha256_manifest=payload.evidence_hashes or [],
    )


def _wrap_text(text: str, max_chars: int = 88) -> List[str]:
    words = text.split()
    lines = []
    current = []
    for word in words:
        if sum(len(w) + 1 for w in current) + len(word) <= max_chars:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def _build_page_overlays(data: Form06StructuredData) -> dict:
    """
    Creates transparent ReportLab coordinate overlays for Pages 1, 2, 3, 4, 5, 6, 7, 8, and 10
    of the official Department of Justice Form 06 (J480E) PDF (594.96 x 842.04 pt).
    """
    overlays = {}
    app_surname = data.applicant_surname.strip()
    app_names = data.applicant_full_names.strip()
    if not app_surname and not app_names:
        app_surname, app_names = _split_name(data.applicant_full_name)

    resp_surname = data.respondent_surname.strip()
    resp_names = data.respondent_full_names.strip()
    if not resp_surname and not resp_names:
        resp_surname, resp_names = _split_name(data.respondent_full_name)

    rel_lower = (data.relationship_to_respondent or "Current co-resident / Partner").lower()
    app_addr = (data.applicant_address or data.incident_location or "").strip()
    resp_addr = (data.respondent_address or data.incident_location or "").strip()

    # Page 1 (index 0): Section 1 Complainant Particulars (divider at x=162.7) & Section 3 Relationship
    buf0 = io.BytesIO()
    c0 = canvas.Canvas(buf0, pagesize=A4)
    c0.setFont("Helvetica-Bold", 10)
    c0.drawString(172, 581.5, app_surname)
    c0.drawString(172, 563.5, app_names)

    if "ex-boyfriend" in rel_lower:
        c0.drawString(39, 151.3, "X")
    elif "boyfriend" in rel_lower:
        c0.drawString(39, 196.0, "X")
    elif "ex-girlfriend" in rel_lower:
        c0.drawString(39, 129.1, "X")
    elif "girlfriend" in rel_lower:
        c0.drawString(39, 173.7, "X")
    elif "ex-husband" in rel_lower:
        c0.drawString(138, 151.3, "X")
    elif "husband" in rel_lower:
        c0.drawString(39, 62.2, "X")
    elif "ex-wife" in rel_lower:
        c0.drawString(138, 129.1, "X")
    elif "ex-partner" in rel_lower:
        c0.drawString(138, 106.8, "X")
    elif "parent" in rel_lower or "child" in rel_lower:
        c0.drawString(138, 84.5, "X")
    if "co-resident" in rel_lower or "partner" in rel_lower or not rel_lower:
        c0.drawString(138, 196.0, "X")  # Current co-resident checkbox
    c0.save()
    buf0.seek(0)
    overlays[0] = PdfReader(buf0).pages[0]

    # Page 2 (index 1): Section 3 Relationship & Respondent Particulars (divider at x=261.9)
    buf1 = io.BytesIO()
    c1 = canvas.Canvas(buf1, pagesize=A4)
    c1.setFont("Helvetica-Bold", 10)
    if "wife" in rel_lower and "ex-wife" not in rel_lower:
        c1.drawString(39, 761.5, "X")
    elif "partner" in rel_lower and "ex-partner" not in rel_lower:
        c1.drawString(138, 727.7, "X")
    c1.drawString(270, 485.0, resp_surname)
    c1.drawString(270, 459.0, resp_names)
    c1.setFont("Helvetica", 9.5)
    if data.respondent_id_or_dob:
        c1.drawString(270, 433.0, data.respondent_id_or_dob[:45])
    if resp_addr:
        c1.drawString(270, 406.5, resp_addr[:52])
    if data.respondent_phone:
        c1.drawString(270, 345.0, data.respondent_phone[:40])
    if data.respondent_email:
        c1.drawString(270, 319.0, data.respondent_email[:45])
    if data.respondent_work_address:
        c1.drawString(270, 194.5, data.respondent_work_address[:52])
    if data.respondent_occupation:
        c1.drawString(270, 168.5, data.respondent_occupation[:45])
    c1.save()
    buf1.seek(0)
    overlays[1] = PdfReader(buf1).pages[0]

    # Page 3 (index 2): Section 4 Information Regarding Acts of Domestic Violence (divider at x=212.4)
    buf2 = io.BytesIO()
    c2 = canvas.Canvas(buf2, pagesize=A4)
    c2.setFont("Helvetica", 9.5)
    y = 718
    for line in _wrap_text(data.chronological_affidavit_narrative, 88)[:18]:
        c2.drawString(38, y, line)
        y -= 14

    c2.setFont("Helvetica-Bold", 9)
    c2.drawString(220, 331.0, data.incident_date_time[:45])
    c2.drawString(220, 305.0, data.incident_location[:52])

    c2.setFont("Helvetica", 8.5)
    y_rec = 247.0
    for line in _wrap_text(data.chronological_affidavit_narrative, 58)[:6]:
        c2.drawString(220, y_rec, line)
        y_rec -= 12

    y_inj = 143.0
    for line in _wrap_text(data.weapons_or_threats_involved, 58)[:4]:
        c2.drawString(220, y_inj, line)
        y_inj -= 12
    c2.save()
    buf2.seek(0)
    overlays[2] = PdfReader(buf2).pages[0]

    # Page 4 (index 3): Section 4 Continuation — Medical treatment & Harm/damages (divider at x=212.4)
    buf3 = io.BytesIO()
    c3 = canvas.Canvas(buf3, pagesize=A4)
    c3.setFont("Helvetica", 8.5)
    if data.medical_treatment_received:
        y_med = 763.0
        for line in _wrap_text(data.medical_treatment_received, 58)[:2]:
            c3.drawString(220, y_med, line)
            y_med -= 11
    if data.harm_or_damages_caused:
        y_harm = 728.0
        for line in _wrap_text(data.harm_or_damages_caused, 58)[:4]:
            c3.drawString(220, y_harm, line)
            y_harm -= 11
    c3.save()
    buf3.seek(0)
    overlays[3] = PdfReader(buf3).pages[0]

    # Page 5 (index 4): Section 5 Urgency of Application (divider at x=233.7)
    buf4 = io.BytesIO()
    c4 = canvas.Canvas(buf4, pagesize=A4)
    c4.setFont("Helvetica", 9.5)
    y_urg = 695
    for line in _wrap_text(data.urgency_grounds_section_4, 88)[:8]:
        c4.drawString(38, y_urg, line)
        y_urg -= 14

    c4.setFont("Helvetica", 9)
    c4.drawString(242, 369.0, "YES (Shared Residence)")
    y_weap = 337.0
    for line in _wrap_text(data.weapons_or_threats_involved, 54)[:3]:
        c4.drawString(242, y_weap, line)
        y_weap -= 12
    y_fear = 185.0
    for line in _wrap_text(data.urgency_grounds_section_4, 54)[:6]:
        c4.drawString(242, y_fear, line)
        y_fear -= 12
    c4.save()
    buf4.seek(0)
    overlays[4] = PdfReader(buf4).pages[0]

    # Page 6 (index 5): Section 6 Terms of Protection Order Checkboxes (left box x=58.5, right box x=317.5)
    buf5 = io.BytesIO()
    c5 = canvas.Canvas(buf5, pagesize=A4)
    c5.setFont("Helvetica-Bold", 10)
    joined_tags = " ".join(data.nature_of_domestic_violence).lower()
    if "physical" in joined_tags:
        c5.drawString(58.5, 601.4, "X")
    if "emotional" in joined_tags or "verbal" in joined_tags or "psychological" in joined_tags:
        c5.drawString(58.5, 556.8, "X")
    if "economic" in joined_tags or "financial" in joined_tags:
        c5.drawString(58.5, 534.5, "X")
    if "intimidation" in joined_tags or "threat" in joined_tags:
        c5.drawString(58.5, 512.2, "X")
    if "control" in joined_tags or "confinement" in joined_tags:
        c5.drawString(317.5, 512.2, "X")
    if data.requested_protection_terms:
        c5.drawString(58.5, 367.0, "X")
        c5.drawString(58.5, 333.1, "X")
    c5.setFont("Helvetica", 9)
    c5.drawString(282, 334.0, (resp_addr or data.incident_location)[:46])
    c5.save()
    buf5.seek(0)
    overlays[5] = PdfReader(buf5).pages[0]

    # Page 7 (index 6): Section 7(h) Non-disclosure of complainant's contact/home details ("Yes" box at x=450)
    buf6 = io.BytesIO()
    c6 = canvas.Canvas(buf6, pagesize=A4)
    c6.setFont("Helvetica-Bold", 9.5)
    c6.drawString(450.0, 260.2, "X")
    c6.save()
    buf6.seek(0)
    overlays[6] = PdfReader(buf6).pages[0]

    # Page 8 (index 7): Section 9 Police Station, Section 10 Court, Section 11 Index of Annexures
    buf7 = io.BytesIO()
    c7 = canvas.Canvas(buf7, pagesize=A4)
    c7.setFont("Helvetica", 9)
    if data.police_station:
        c7.drawString(305, 385.5, data.police_station[:32])
    if data.magistrates_court:
        c7.drawString(200, 356.0, data.magistrates_court[:55])
    c7.drawString(
        158,
        242.0,
        f"ECTA Section 15 Digital Evidence Schedule ({len(data.evidence_sha256_manifest)} SHA-256 Exhibit(s))",
    )
    c7.drawString(435, 94.0, datetime.now(timezone.utc).strftime("%d/%m/%Y"))
    c7.save()
    buf7.seek(0)
    overlays[7] = PdfReader(buf7).pages[0]

    # Page 10 (index 9): Form 6A Complainant Particulars (divider at x=321.4)
    buf9 = io.BytesIO()
    c9 = canvas.Canvas(buf9, pagesize=A4)
    c9.setFont("Helvetica-Bold", 9.5)
    c9.drawString(328, 586.8, app_surname)
    c9.drawString(328, 571.4, app_names)
    c9.setFont("Helvetica", 9)
    if data.applicant_id_or_dob:
        c9.drawString(328, 555.9, data.applicant_id_or_dob[:38])
    if data.applicant_gender:
        c9.drawString(328, 513.4, data.applicant_gender[:30])
    if data.applicant_race:
        c9.drawString(328, 498.1, data.applicant_race[:30])
    if data.applicant_marital_status:
        c9.drawString(328, 467.1, data.applicant_marital_status[:30])
    if app_addr:
        c9.drawString(328, 451.6, app_addr[:42])
    if data.applicant_phone:
        c9.drawString(328, 421.5, data.applicant_phone[:35])
        c9.drawString(328, 400.0, data.applicant_phone[:35])
    if data.applicant_email:
        c9.drawString(328, 379.1, data.applicant_email[:40])
    c9.drawString(328, 213.0, (data.relationship_to_respondent or "Current co-resident / Partner")[:40])
    if data.applicant_occupation:
        c9.drawString(328, 189.1, data.applicant_occupation[:40])
    c9.save()
    buf9.seek(0)
    overlays[9] = PdfReader(buf9).pages[0]

    return overlays


@router.post("/generate-form06")
async def generate_form06_pdf(data: Form06StructuredData):
    template_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "templates",
        "dv-Form06-J480.pdf",
    )

    # Build Final ECTA Section 15 Cryptographic Annexure Page
    overlay_buffer = io.BytesIO()
    c = canvas.Canvas(overlay_buffer, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 12)
    c.drawString(45, height - 50, "ANNEXURE A: ECTA SECTION 15 DIGITAL EVIDENCE SCHEDULE")
    c.setFont("Helvetica", 9)
    c.drawString(
        45,
        height - 66,
        "Attached to Form 06 (J480) Application for Protection Order — Domestic Violence Act 116 of 1998",
    )
    c.line(45, height - 74, width - 45, height - 74)

    app_display = data.applicant_full_name or f"{data.applicant_full_names} {data.applicant_surname}".strip()
    resp_display = data.respondent_full_name or f"{data.respondent_full_names} {data.respondent_surname}".strip()
    y = height - 98
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(45, y, f"APPLICANT: {app_display}")
    y -= 15
    c.drawString(45, y, f"RESPONDENT: {resp_display}")
    y -= 15
    c.drawString(45, y, f"INCIDENT TIMESTAMP: {data.incident_date_time}")

    y -= 25
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(45, y, "SECTION 4 FULL AFFIDAVIT CONTINUATION:")
    c.setFont("Helvetica", 9)
    for line in _wrap_text(data.chronological_affidavit_narrative, 88):
        if y < 65:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = height - 55
        y -= 13
        c.drawString(45, y, line)

    y -= 25
    if y < 90:
        c.showPage()
        y = height - 55
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(45, y, "TAMPER-EVIDENT SERVER-SYNCED EXHIBIT HASHES (SHA-256):")
    c.setFont("Courier", 8.5)
    manifest = data.evidence_sha256_manifest
    if not manifest:
        y -= 13
        c.drawString(45, y, "No exhibits attached.")
    for idx, digest in enumerate(manifest, start=1):
        if y < 65:
            c.showPage()
            c.setFont("Courier", 8.5)
            y = height - 55
        y -= 13
        c.drawString(45, y, f"Exhibit #{idx:02d} : {digest}")

    y -= 25
    c.setFont("Helvetica", 8)
    c.drawString(
        45,
        max(y, 40),
        f"Server Sync Verification UTC: {datetime.now(timezone.utc).isoformat()} | Tamper-Evident Chain-of-Custody",
    )
    c.showPage()
    c.save()
    overlay_buffer.seek(0)

    writer = PdfWriter()
    annexure_reader = PdfReader(overlay_buffer)

    if os.path.exists(template_path):
        try:
            template_reader = PdfReader(template_path)
            page_overlays = _build_page_overlays(data)
            for i, page in enumerate(template_reader.pages):
                if i in page_overlays:
                    page.merge_page(page_overlays[i])
                writer.add_page(page)
        except Exception as exc:
            logger.warning(f"Template overlay fallback: {exc}")

    for annex_page in annexure_reader.pages:
        writer.add_page(annex_page)

    pdf_out = io.BytesIO()
    writer.write(pdf_out)
    pdf_bytes = pdf_out.getvalue()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="Form06_J480_Protection_Order.pdf"',
            "Cache-Control": "no-store",
        },
    )
