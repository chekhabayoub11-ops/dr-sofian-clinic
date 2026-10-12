"""
Dr. Sofiane Zerrouki Clinic — Clinical Triage Microservice
==========================================================

Rule-based red-flag screening for gastroenterology bookings.
It does NOT diagnose: it flags alarm symptoms so the clinic can prioritise
the appointment, and returns patient-friendly preparation instructions.

Run:
    uvicorn main:app --reload --port 8000
Docs:
    http://localhost:8000/docs
"""

from __future__ import annotations

import os
import re
import unicodedata
from enum import Enum
from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

app = FastAPI(
    title="Dr. Sofiane Clinic — Triage API",
    version="1.0.0",
    description="Gastroenterology red-flag triage + endoscopy preparation guides (Arabic).",
)

# Comma-separated list, e.g. "https://clinic.dz,http://localhost:5500"
_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Urgency(str, Enum):
    routine = "routine"
    priority = "priority"
    urgent = "urgent"


VisitReason = Literal["consult", "gastroscopy", "colonoscopy", "followup"]


class TriageRequest(BaseModel):
    symptoms: str = Field("", max_length=1000, description="Free-text symptoms (Arabic, Darja or French)")
    visit_reason: VisitReason = "consult"
    age: Optional[int] = Field(None, ge=1, le=110)

    @field_validator("symptoms")
    @classmethod
    def strip(cls, v: str) -> str:
        return (v or "").strip()


class RedFlag(BaseModel):
    key: str
    label: str
    level: Urgency


class PrepGuide(BaseModel):
    title: str
    fasting: Optional[str] = None
    steps: list[str]


class TriageResponse(BaseModel):
    urgency: Urgency
    red_flags: list[RedFlag]
    message: str
    preparation: PrepGuide
    disclaimer: str


# ---------------------------------------------------------------------------
# Arabic normalisation
# ---------------------------------------------------------------------------

_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")


def normalize(text: str) -> str:
    """Lower-case, strip tashkeel/tatweel and unify common letter variants."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = _DIACRITICS.sub("", t)
    t = re.sub("[إأآٱ]", "ا", t)
    t = t.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", t)


# ---------------------------------------------------------------------------
# Red-flag rules  (patterns are matched on normalised text)
# ---------------------------------------------------------------------------

RULES: list[tuple[str, str, Urgency, list[str]]] = [
    # --- URGENT: needs same-day evaluation ---
    ("gi_bleeding", "نزيف هضمي (دم في القيء أو البراز)", Urgency.urgent, [
        r"نزيف", r"نزف", r"قيء? ?(ب|فيه )?دم", r"تقيو ?دم", r"دم في (البراز|الغايط|القيء|القي)",
        r"براز (اسود|اسود اللون|اسود كالقطران)", r"غايط اكحل", r"\bdam\b", r"sang", r"m[ée]l[ée]na", r"h[ée]mat[ée]m[èe]se",
    ]),
    ("persistent_vomiting", "تقيؤ مستمر", Urgency.urgent, [
        r"(تقيو|قيء|قي|ترجيع|نتقيا|نرجع)[^.،,]{0,25}(مستمر|متواصل|دايم|دائم|كل شي|بلا حبس|لا يتوقف|ما يحبسش)",
        r"(مستمر|متواصل)[^.،,]{0,15}(تقيو|قيء|ترجيع)", r"vomissements? (persistants?|incoercibles?)",
    ]),
    ("acute_pain", "ألم بطني حاد ومفاجئ", Urgency.urgent, [
        r"الم[^.،,]{0,20}(حاد|شديد|قوي|لا يحتمل|ما يتحملش)[^.،,]{0,20}(مفاجي|فجاه|فجاءه)",
        r"(مفاجي|فجاه)[^.،,]{0,20}الم[^.،,]{0,20}(حاد|شديد)",
        r"الم (حاد|شديد) (جدا|بزاف)", r"douleur (aigu[eë]|brutale|intense)",
    ]),
    ("complete_dysphagia", "عدم القدرة على البلع نهائياً", Urgency.urgent, [
        r"(لا|ما) ?(استطيع|نقدرش|نقدر|يقدرش) (ان )?(ابلع|نبلع|بلع)[^.،,]{0,20}(حتى|الماء|الما|الريق)",
        r"حتى (الماء|الما|الريق) (ما|لا) (يدخل|ينزل)",
    ]),
    # --- PRIORITY: alarm features, should be seen soon (days, not weeks) ---
    ("dysphagia", "صعوبة في البلع", Urgency.priority, [
        r"صعوب[^.،,]{0,6}(في )?(ال)?بلع", r"عسر (في )?(ال)?بلع", r"بلع مولم", r"ما نقدرش نبلع", r"dysphagie",
    ]),
    ("weight_loss", "فقدان وزن غير مبرر", Urgency.priority, [
        r"(فقدان|نقص|خسار|نقصت|خسرت|نقص في)[^.،,]{0,10}(ال)?وزن", r"ضعفت بزاف", r"perte de poids",
    ]),
    ("jaundice", "اصفرار الجلد أو العينين", Urgency.priority, [
        r"اصفرار", r"صفاير", r"بوصفير", r"يرقان", r"ictère|jaunisse",
    ]),
    ("fever_pain", "حمى مع ألم بطني", Urgency.priority, [
        r"(حمى|سخانه|حراره)[^.]{0,40}(الم|وجع)", r"(الم|وجع)[^.]{0,40}(حمى|سخانه|حراره)",
    ]),
    ("anemia", "فقر دم أو دوخة متكررة", Urgency.priority, [
        r"فقر (ال)?دم", r"انيميا", r"an[ée]mie", r"دوخه (متكرره|دايمه|بزاف)",
    ]),
]

_COMPILED = [(k, label, lvl, [re.compile(p) for p in pats]) for k, label, lvl, pats in RULES]

_LEVEL_ORDER = {Urgency.routine: 0, Urgency.priority: 1, Urgency.urgent: 2}


def detect_red_flags(symptoms: str) -> list[RedFlag]:
    text = normalize(symptoms)
    flags: list[RedFlag] = []
    for key, label, level, patterns in _COMPILED:
        if any(p.search(text) for p in patterns):
            flags.append(RedFlag(key=key, label=label, level=level))
    # complete dysphagia supersedes simple dysphagia
    keys = {f.key for f in flags}
    if "complete_dysphagia" in keys:
        flags = [f for f in flags if f.key != "dysphagia"]
    return flags


def assess(req: TriageRequest) -> tuple[Urgency, list[RedFlag]]:
    flags = detect_red_flags(req.symptoms)
    urgency = max((f.level for f in flags), key=_LEVEL_ORDER.__getitem__, default=Urgency.routine)

    # New digestive complaints after 50 → screening priority
    if urgency == Urgency.routine and req.age and req.age >= 50 and req.symptoms and req.visit_reason != "followup":
        flags.append(RedFlag(key="age_over_50", label="أعراض هضمية جديدة بعد سن الخمسين", level=Urgency.priority))
        urgency = Urgency.priority
    return urgency, flags


# ---------------------------------------------------------------------------
# Patient-facing content (Arabic)
# ---------------------------------------------------------------------------

MESSAGES = {
    Urgency.routine: "لا تظهر في وصفك علامات إنذار. سيتم تأكيد موعدك في الوقت المحدد.",
    Urgency.priority: "تم رصد أعراض تستحق تقييماً قريباً. ستتواصل معك العيادة لتقديم موعدك إن أمكن.",
    Urgency.urgent: (
        "أعراضك قد تستدعي تقييماً طبياً عاجلاً. لا تنتظر الموعد: اتصل بالعيادة فوراً، "
        "وفي حال نزيف غزير أو ألم شديد أو دوخة، توجّه إلى أقرب مصلحة استعجالات أو اتصل بالحماية المدنية على الرقم 14."
    ),
}

PREP_GUIDES: dict[str, PrepGuide] = {
    "gastroscopy": PrepGuide(
        title="التحضير لتنظير المعدة (FOGD)",
        fasting="صيام تام عن الطعام 6 ساعات، وعن الماء ساعتين قبل الفحص.",
        steps=[
            "لا تأكل أي طعام لمدة 6 ساعات قبل الموعد، ويُسمح برشفات ماء حتى ساعتين قبله.",
            "تجنّب التدخين والعلكة صباح يوم الفحص.",
            "تناول أدوية الضغط والقلب المعتادة برشفة ماء صغيرة.",
            "أخبر الطبيب مسبقاً إن كنت تتناول مميّعات الدم أو أدوية السكري — لا توقفها من تلقاء نفسك.",
            "أحضر مرافقاً معك إن كان الفحص تحت التخدير، ولا تقد السيارة بعده.",
            "أحضر نتائج التحاليل والفحوصات السابقة.",
        ],
    ),
    "colonoscopy": PrepGuide(
        title="التحضير لتنظير القولون",
        fasting="نظام قليل الألياف 3 أيام، ثم سوائل صافية فقط في اليوم السابق.",
        steps=[
            "قبل 3 أيام: تجنّب الخضر النيئة والفواكه ذات البذور والحبوب الكاملة والمكسرات.",
            "قبل 5 إلى 7 أيام: أوقف أقراص الحديد بعد استشارة الطبيب.",
            "في اليوم السابق: سوائل صافية فقط (ماء، مرق مصفّى، عصير بدون لبّ، شاي).",
            "اشرب محلول التنظيف حسب الوصفة الطبية، غالباً على جرعتين (مساء اليوم السابق وصباح يوم الفحص).",
            "يكون التحضير جيداً عندما يصبح الإخراج سائلاً صافياً مائلاً للصفرة.",
            "أخبر الطبيب إن كنت تتناول مميّعات الدم أو أدوية السكري.",
            "أحضر مرافقاً معك بسبب التخدير.",
        ],
    ),
    "consult": PrepGuide(
        title="التحضير للاستشارة",
        steps=[
            "أحضر قائمة بأدويتك الحالية وجرعاتها.",
            "أحضر نتائج التحاليل والأشعة والتقارير السابقة.",
            "دوّن أعراضك: متى بدأت، ما الذي يزيدها أو يخففها.",
            "لا حاجة للصيام إلا إذا طلب الطبيب تحاليل خاصة.",
        ],
    ),
    "followup": PrepGuide(
        title="التحضير لزيارة المتابعة",
        steps=[
            "أحضر آخر النتائج والتقارير وتقرير التنظير إن وجد.",
            "أحضر الأدوية التي تتناولها حالياً.",
            "دوّن أي تغيّر في الأعراض منذ الزيارة الأخيرة.",
        ],
    ),
}

DISCLAIMER = "هذا تقييم آلي أولي لترتيب الأولويات فقط، ولا يغني عن الفحص الطبي."


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/triage", response_model=TriageResponse)
def triage(req: TriageRequest) -> TriageResponse:
    urgency, flags = assess(req)
    return TriageResponse(
        urgency=urgency,
        red_flags=flags,
        message=MESSAGES[urgency],
        preparation=PREP_GUIDES[req.visit_reason],
        disclaimer=DISCLAIMER,
    )
