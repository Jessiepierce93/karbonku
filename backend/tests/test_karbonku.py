"""Backend tests for KarbonKu Carbon Calculation API"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://karbon-tracker-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TOK_SUPER = "test_session_karbon_super_1"
TOK_ADMIN = "test_session_karbon_admin_1"
TOK_STAFF = "test_session_karbon_staff_1"
TOK_SUP   = "test_session_karbon_sup_1"

def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Auth ----------------
class TestAuth:
    def test_me_admin(self):
        r = requests.get(f"{API}/auth/me", headers=H(TOK_ADMIN))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["company"]["company_id"] == "co_test_karbon_1"

    def test_me_staff(self):
        r = requests.get(f"{API}/auth/me", headers=H(TOK_STAFF))
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "staff"

    def test_me_supervisor(self):
        r = requests.get(f"{API}/auth/me", headers=H(TOK_SUP))
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "supervisor"

    def test_me_super(self):
        r = requests.get(f"{API}/auth/me", headers=H(TOK_SUPER))
        assert r.status_code == 200
        assert r.json()["user"]["is_super_admin"] is True

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Public Calculator ----------------
class TestPublicCalc:
    def test_electricity_jamali(self):
        r = requests.post(f"{API}/public/calculate", json={
            "scope": 2, "category": "electricity_grid",
            "activity_data": 50000, "region": "jamali"
        })
        assert r.status_code == 200, r.text
        assert r.json()["total_kg_co2e"] == 43500

    def test_fuel_gasoline(self):
        r = requests.post(f"{API}/public/calculate", json={
            "scope": 1, "category": "fuel_gasoline", "activity_data": 1000
        })
        assert r.status_code == 200
        assert r.json()["total_kg_co2e"] == 2310

    def test_refrigerant_r134a(self):
        r = requests.post(f"{API}/public/calculate", json={
            "scope": 1, "category": "refrigerant_r134a", "activity_data": 1
        })
        assert r.status_code == 200
        assert r.json()["total_kg_co2e"] == 1430


# ---------------- Meta ----------------
class TestMeta:
    def test_meta(self):
        r = requests.get(f"{API}/meta")
        assert r.status_code == 200
        d = r.json()
        assert "industries" in d and "sizes" in d and "regions" in d

    def test_regions(self):
        r = requests.get(f"{API}/regions")
        assert r.status_code == 200
        assert any(x["id"] == "jamali" for x in r.json())

    def test_factors_scope1(self):
        r = requests.get(f"{API}/emission-factors?scope=1")
        assert r.status_code == 200
        assert len(r.json()) > 0


# ---------------- Company update ----------------
class TestCompany:
    def test_update(self):
        r = requests.put(f"{API}/companies/me", headers=H(TOK_ADMIN),
                         json={"employees": 120, "annual_production": 5000, "industry": "Manufaktur", "size": "Menengah (50-250 karyawan)"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["employees"] == 120
        assert d["annual_production"] == 5000


# ---------------- Facilities CRUD ----------------
@pytest.fixture(scope="module")
def facility_id():
    r = requests.post(f"{API}/facilities", headers=H(TOK_ADMIN),
                      json={"name": "TEST_Facility_A", "type": "office", "address": "Jkt", "region": "jamali"})
    assert r.status_code == 200, r.text
    fid = r.json()["facility_id"]
    yield fid
    requests.delete(f"{API}/facilities/{fid}", headers=H(TOK_ADMIN))


class TestFacilities:
    def test_list(self, facility_id):
        r = requests.get(f"{API}/facilities", headers=H(TOK_ADMIN))
        assert r.status_code == 200
        assert any(f["facility_id"] == facility_id for f in r.json())

    def test_update(self, facility_id):
        r = requests.put(f"{API}/facilities/{facility_id}", headers=H(TOK_ADMIN),
                         json={"name": "TEST_Facility_A2", "type": "plant", "address": "Sby", "region": "jamali"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Facility_A2"


# ---------------- Assets ----------------
class TestAssets:
    def test_create_and_list(self, facility_id):
        r = requests.post(f"{API}/assets", headers=H(TOK_ADMIN),
                          json={"facility_id": facility_id, "name": "TEST_Genset1", "type": "genset", "capacity": "500kVA"})
        assert r.status_code == 200, r.text
        aid = r.json()["asset_id"]
        lst = requests.get(f"{API}/assets", headers=H(TOK_ADMIN)).json()
        assert any(a["asset_id"] == aid for a in lst)
        requests.delete(f"{API}/assets/{aid}", headers=H(TOK_ADMIN))


# ---------------- Emissions ----------------
@pytest.fixture(scope="module")
def elec_factor():
    r = requests.get(f"{API}/emission-factors?scope=2")
    for f in r.json():
        if f["category"] == "electricity_grid" and f.get("region") == "jamali":
            return f["factor_id"]
    pytest.skip("jamali factor not found")


@pytest.fixture(scope="module")
def gasoline_factor():
    r = requests.get(f"{API}/emission-factors?scope=1")
    for f in r.json():
        if f["category"] == "fuel_gasoline":
            return f["factor_id"]
    pytest.skip()


class TestEmissions:
    log_id = None

    def test_supervisor_cannot_create(self, facility_id, elec_factor):
        r = requests.post(f"{API}/emissions", headers=H(TOK_SUP),
                          json={"facility_id": facility_id, "factor_id": elec_factor,
                                "activity_data": 1000, "period_year": 2026, "period_month": 1})
        assert r.status_code == 403

    def test_staff_create(self, facility_id, elec_factor):
        r = requests.post(f"{API}/emissions", headers=H(TOK_STAFF),
                          json={"facility_id": facility_id, "factor_id": elec_factor,
                                "activity_data": 50000, "period_year": 2026, "period_month": 1,
                                "notes": "TEST"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_kg_co2e"] == 43500
        assert d["status"] == "draft"
        TestEmissions.log_id = d["log_id"]

    def test_duplicate_returns_409(self, facility_id, elec_factor):
        r = requests.post(f"{API}/emissions", headers=H(TOK_STAFF),
                          json={"facility_id": facility_id, "factor_id": elec_factor,
                                "activity_data": 60000, "period_year": 2026, "period_month": 1})
        assert r.status_code == 409

    def test_staff_cannot_approve(self):
        assert TestEmissions.log_id
        r = requests.post(f"{API}/emissions/{TestEmissions.log_id}/approve", headers=H(TOK_STAFF))
        assert r.status_code == 403

    def test_supervisor_approve(self):
        assert TestEmissions.log_id
        r = requests.post(f"{API}/emissions/{TestEmissions.log_id}/approve", headers=H(TOK_SUP))
        assert r.status_code == 200

    def test_reject_flow(self, facility_id, gasoline_factor):
        # Create another log for rejection
        r = requests.post(f"{API}/emissions", headers=H(TOK_STAFF),
                          json={"facility_id": facility_id, "factor_id": gasoline_factor,
                                "activity_data": 500, "period_year": 2026, "period_month": 2})
        assert r.status_code == 200
        lid = r.json()["log_id"]
        r2 = requests.post(f"{API}/emissions/{lid}/reject", headers=H(TOK_SUP),
                           json={"reason": "data tidak valid"})
        assert r2.status_code == 200
        # Verify status
        logs = requests.get(f"{API}/emissions", headers=H(TOK_ADMIN)).json()
        found = next((l for l in logs if l["log_id"] == lid), None)
        assert found and found["status"] == "rejected"


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_stats(self):
        r = requests.get(f"{API}/dashboard/stats?year=2026", headers=H(TOK_ADMIN))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "by_scope_kg" in d
        assert "by_month" in d
        assert "intensity_per_employee_tco2e" in d


# ---------------- Reports ----------------
class TestReports:
    def test_csv(self):
        r = requests.get(f"{API}/reports/csv?year=2026", headers=H(TOK_ADMIN))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_pdf(self):
        r = requests.get(f"{API}/reports/pdf?year=2026", headers=H(TOK_ADMIN))
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        assert r.content[:4] == b"%PDF"


# ---------------- AI ----------------
class TestAI:
    def test_recommendations(self):
        r = requests.post(f"{API}/ai/recommendations", headers=H(TOK_ADMIN), timeout=60)
        assert r.status_code == 200, r.text
        assert "recommendations" in r.json()
        assert len(r.json()["recommendations"]) > 20


# ---------------- Users ----------------
class TestUsers:
    def test_list(self):
        r = requests.get(f"{API}/users", headers=H(TOK_ADMIN))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_staff_cannot_list(self):
        r = requests.get(f"{API}/users", headers=H(TOK_STAFF))
        assert r.status_code == 403

    def test_invite(self):
        r = requests.post(f"{API}/users/invite", headers=H(TOK_ADMIN),
                          json={"email": "TEST_invite@example.com", "role": "staff"})
        assert r.status_code == 200

    def test_role_update(self):
        users = requests.get(f"{API}/users", headers=H(TOK_ADMIN)).json()
        staff_user = next((u for u in users if u.get("email") == "test.karbon.staff@example.com"), None)
        assert staff_user
        r = requests.put(f"{API}/users/{staff_user['user_id']}/role", headers=H(TOK_ADMIN),
                         json={"role": "staff"})
        assert r.status_code == 200


# ---------------- Audit ----------------
class TestAudit:
    def test_list(self):
        r = requests.get(f"{API}/audit-logs", headers=H(TOK_ADMIN))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Super Admin ----------------
class TestSuperAdmin:
    def test_stats(self):
        r = requests.get(f"{API}/admin/stats", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "companies_count" in d
        assert "by_scope_kg" in d
        assert "by_industry" in d

    def test_companies(self):
        r = requests.get(f"{API}/admin/companies", headers=H(TOK_SUPER))
        assert r.status_code == 200
        cos = r.json()
        assert any(c["company_id"] == "co_test_karbon_1" for c in cos)
        for c in cos:
            assert "report_status" in c
            assert "total_kg_co2e" in c

    def test_companies_filter(self):
        r = requests.get(f"{API}/admin/companies?q=Test", headers=H(TOK_SUPER))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_company_emissions(self):
        r = requests.get(f"{API}/admin/companies/co_test_karbon_1/emissions", headers=H(TOK_SUPER))
        assert r.status_code == 200
        d = r.json()
        assert "emissions" in d and "facilities" in d

    def test_admin_review_flag(self, facility_id, gasoline_factor):
        # create a fresh log to flag
        r = requests.post(f"{API}/emissions", headers=H(TOK_STAFF),
                          json={"facility_id": facility_id, "factor_id": gasoline_factor,
                                "activity_data": 300, "period_year": 2026, "period_month": 3})
        assert r.status_code == 200
        lid = r.json()["log_id"]
        r2 = requests.post(f"{API}/admin/emissions/{lid}/review", headers=H(TOK_SUPER),
                           json={"action": "flag", "reason": "cek ulang"})
        assert r2.status_code == 200

    def test_master_factor_crud(self):
        payload = {"scope": 1, "category": "TEST_custom_fuel", "label": "TEST Fuel",
                   "unit": "liter", "factor": 1.5, "gwp": 1.0, "source": "TEST"}
        r = requests.post(f"{API}/admin/emission-factors", headers=H(TOK_SUPER), json=payload)
        assert r.status_code == 200, r.text
        fid = r.json()["factor_id"]
        payload["factor"] = 2.0
        r2 = requests.put(f"{API}/admin/emission-factors/{fid}", headers=H(TOK_SUPER), json=payload)
        assert r2.status_code == 200
        assert r2.json()["factor"] == 2.0
        r3 = requests.delete(f"{API}/admin/emission-factors/{fid}", headers=H(TOK_SUPER))
        assert r3.status_code == 200

    def test_master_region_crud(self):
        r = requests.post(f"{API}/admin/regions", headers=H(TOK_SUPER),
                          json={"id": "TEST_region", "name": "Test Region", "factor": 0.5})
        assert r.status_code == 200
        r2 = requests.delete(f"{API}/admin/regions/TEST_region", headers=H(TOK_SUPER))
        assert r2.status_code == 200

    def test_master_types_crud(self):
        r = requests.post(f"{API}/admin/types", headers=H(TOK_SUPER),
                          json={"kind": "facility_type", "key": "TEST_warehouse", "label": "Warehouse"})
        assert r.status_code == 200
        r2 = requests.delete(f"{API}/admin/types/facility_type/TEST_warehouse", headers=H(TOK_SUPER))
        assert r2.status_code == 200

    def test_audit_logs_global(self):
        r = requests.get(f"{API}/admin/audit-logs", headers=H(TOK_SUPER))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_non_super_forbidden(self):
        r = requests.get(f"{API}/admin/stats", headers=H(TOK_ADMIN))
        assert r.status_code == 403
        r2 = requests.get(f"{API}/admin/companies", headers=H(TOK_STAFF))
        assert r2.status_code == 403
