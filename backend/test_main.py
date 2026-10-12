"""Run: python -m pytest -q   (pytest + httpx are dev-only dependencies)"""
from __future__ import annotations
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def triage(symptoms: str, reason: str = "consult", age: "int | None" = 35) -> dict:
    r = client.post("/api/triage", json={"symptoms": symptoms, "visit_reason": reason, "age": age})
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize("text", [
    "عندي نزيف هضمي منذ البارحة",
    "تقيؤ دم صباح اليوم",
    "لاحظت براز أسود اللون",
    "تقيؤ مستمر منذ يومين ولا أستطيع الأكل",
    "ألم حاد ومفاجئ في البطن",
    "ما نقدرش نبلع حتى الماء",
])
def test_urgent_red_flags(text):
    assert triage(text)["urgency"] == "urgent"


@pytest.mark.parametrize("text", [
    "صعوبة في البلع منذ شهر",
    "فقدان الوزن بدون سبب مع حموضة",
    "اصفرار في العينين",
])
def test_priority_flags(text):
    assert triage(text)["urgency"] == "priority"


def test_routine():
    res = triage("انتفاخ خفيف بعد الأكل", "gastroscopy")
    assert res["urgency"] == "routine"
    assert res["red_flags"] == []
    assert "6 ساعات" in res["preparation"]["fasting"]


def test_age_over_50_escalates_new_symptoms():
    assert triage("حموضة متكررة", age=58)["urgency"] == "priority"


def test_diacritics_are_ignored():
    assert triage("نَزِيفٌ")["urgency"] == "urgent"


def test_colonoscopy_prep_and_empty_symptoms():
    res = triage("", "colonoscopy", None)
    assert res["urgency"] == "routine"
    assert "القولون" in res["preparation"]["title"]


def test_validation():
    r = client.post("/api/triage", json={"symptoms": "x", "visit_reason": "surgery"})
    assert r.status_code == 422
