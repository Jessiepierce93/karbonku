"""Iteration 2 backend tests: bug-fix verification + new admin CRUD + certificate PDF + email notification wiring."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://karbon-tracker-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TOK_SUPER = "test_session_karbon_super_1"
TOK_ADMIN = "test_session_karbon_admin_1"
TOK_STAFF = "test_session_karbon_staff_1"
TOK_SUP   = "test_session_karbon_sup_1"

def H(t): return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- helpers ----------
@pytest.fixture(scope="module")
def elec_factor_id():
    r = requests.get(f"{API}/emission-factors?scope=2")
    for f in r.json():
        if f["category"] == "electricity_grid" and f.get("region") == "jamali":
            return f["factor_id"]
    pytest.skip("no jamali factor")

@pytest.fixture(scope="module")
def gasoline_factor_id():
    r = requests.get(f"{API}/emission-factors?scope=1")
    for f in r.json():
        if f["category"] == "fuel_gasoline":
            return f["factor_id"]
    pytest.skip("no fuel_gasoline factor")

@pytest.fixture(scope="module")
def home_facility_id():
    # Create a facility in co_test_karbon_1 for admin tests
    r = requests.post(f"{API}/facilities", headers=H(TOK_ADMIN),
                      json={"name": "TEST_ITER2_HOME", "type": "office", "address": "JKT", "region": "jamali"})
    assert r.status_code == 200, r.text
    fid = r.json()["facility_id"]
    yield fid
    requests.delete(f"{API}/facilities/{fid}", headers=H(TOK_ADMIN))


# ---------- Bug A: Facility PUT cross-tenant leak ----------
class TestBugA_FacilityCrossTenant:
    def test_admin_cannot_update_other_company_facility(self, home_facility_id):
        # Super creates a company and facility owned by that company
        rc = requests.post(f"{API}/admin/companies", headers=H(TOK_SUPER),
                           json={"name": "TEST_ITER2_OtherCo", "region": "sumatera", "industry": "Ritel"})
        assert rc.status_code == 200, rc.text
        other_cid = rc.json()["company_id"]

        rf = requests.post(f"{API}/admin/companies/{other_cid}/facilities", headers=H(TOK_SUPER),
                           json={"name": "TEST_ITER2_OtherFac", "type": "office", "region": "sumatera"})
        assert rf.status_code == 200, rf.text
        other_fid = rf.json()["facility_id"]

        # Admin of co_test_karbon_1 tries to PUT other company's facility → MUST 404
        r = requests.put(f"{API}/facilities/{other_fid}", headers=H(TOK_ADMIN),
                        json={"name": "HACKED", "type": "office", "region": "jamali"})
        assert r.status_code == 404, f"cross-tenant leak: {r.status_code} {r.text}"

        # cleanup
        requests.delete(f"{API}/admin/facilities/{other_fid}", headers=H(TOK_SUPER))
        requests.delete(f"{API}/admin/companies/{other_cid}", headers=H(TOK_SUPER))


# ---------- Bug B: Pending invite persisted ----------
class TestBugB_PendingInvite:
    def test_invite_creates_pending_doc(self):
        email = "newbie.karbon@example.com"
        r = requests.post(f"{API}/users/invite", headers=H(TOK_ADMIN),
                          json={"email": email, "role": "staff"})
        assert r.status_code == 200, r.text
        # verify audit log has invite_pending record
        logs = requests.get(f"{API}/audit-logs", headers=H(TOK_ADMIN)).json()
        assert any(l["action"] in ("user.invite_pending", "user.invite_accepted")
                   and l["meta"].get("email") == email for l in logs)


# ---------- Bug D: PDF report ----------
class TestBugD_PDFExport:
    def test_reports_pdf(self):
        r = requests.get(f"{API}/reports/pdf?year=2026", headers=H(TOK_ADMIN))
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        assert r.content[:4] == b"%PDF"


# ---------- Bug E: /auth/session import health ----------
class TestBugE_SessionEndpoint:
    def test_session_endpoint_defined(self):
        # Bad payload should return 400/401, not 404 (route exists) and not 500 on import
        r = requests.post(f"{API}/auth/session", json={})
        assert r.status_code in (400, 401), r.text


# ---------- NEW 1: Certificate PDF ----------
class TestCertificatePDF:
    def test_certificate_pdf(self):
        r = requests.get(f"{API}/reports/certificate?year=2026", headers=H(TOK_ADMIN))
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type") == "application/pdf"
        assert "sertifikat_karbon_2026.pdf" in r.headers.get("content-disposition", "")
        assert r.content[:4] == b"%PDF"


# ---------- NEW 2: Email wiring is a no-op when key empty ----------
class TestEmailWiring:
    def test_create_emission_no_500_when_email_key_empty(self, home_facility_id, elec_factor_id):
        # fresh period unused before
        r = requests.post(f"{API}/emissions", headers=H(TOK_STAFF),
                          json={"facility_id": home_facility_id, "factor_id": elec_factor_id,
                                "activity_data": 1234, "period_year": 2027, "period_month": 6,
                                "notes": "TEST_ITER2_email_wire"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "draft"
        assert d["total_kg_co2e"] == round(1234 * 0.87, 4)
        # cleanup
        requests.delete(f"{API}/emissions/{d['log_id']}", headers=H(TOK_ADMIN))


# ---------- NEW 3: Super Admin Company CRUD ----------
class TestSuperAdminCompanyCRUD:
    cid = None

    def test_create(self):
        r = requests.post(f"{API}/admin/companies", headers=H(TOK_SUPER),
                          json={"name": "TEST_ITER2_TestingCorp2", "region": "jamali", "industry": "Manufaktur"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "company_id" in d
        assert d["name"] == "TEST_ITER2_TestingCorp2"
        TestSuperAdminCompanyCRUD.cid = d["company_id"]

    def test_update(self):
        cid = TestSuperAdminCompanyCRUD.cid
        assert cid
        r = requests.put(f"{API}/admin/companies/{cid}", headers=H(TOK_SUPER),
                         json={"name": "TEST_ITER2_TestingCorp2_Renamed"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_ITER2_TestingCorp2_Renamed"

    def test_list_contains_new(self):
        cid = TestSuperAdminCompanyCRUD.cid
        r = requests.get(f"{API}/admin/companies", headers=H(TOK_SUPER))
        assert r.status_code == 200
        assert any(c["company_id"] == cid for c in r.json())

    def test_non_super_forbidden(self):
        r1 = requests.post(f"{API}/admin/companies", headers=H(TOK_ADMIN),
                           json={"name": "X", "region": "jamali"})
        assert r1.status_code == 403
        r2 = requests.put(f"{API}/admin/companies/x", headers=H(TOK_ADMIN), json={"name": "y"})
        assert r2.status_code == 403
        r3 = requests.delete(f"{API}/admin/companies/x", headers=H(TOK_ADMIN))
        assert r3.status_code == 403

    def test_delete_cascade(self, gasoline_factor_id):
        cid = TestSuperAdminCompanyCRUD.cid
        # add facility+asset+emission to verify cascade
        rf = requests.post(f"{API}/admin/companies/{cid}/facilities", headers=H(TOK_SUPER),
                           json={"name": "TEST_ITER2_cascade_fac", "type": "office", "region": "jamali"})
        assert rf.status_code == 200
        fid = rf.json()["facility_id"]
        ra = requests.post(f"{API}/admin/companies/{cid}/assets", headers=H(TOK_SUPER),
                           json={"facility_id": fid, "name": "TEST_ITER2_cascade_asset", "type": "genset"})
        assert ra.status_code == 200

        r = requests.delete(f"{API}/admin/companies/{cid}", headers=H(TOK_SUPER))
        assert r.status_code == 200

        # verify facilities & assets removed
        assert not any(c["company_id"] == cid for c in requests.get(f"{API}/admin/companies", headers=H(TOK_SUPER)).json())
        emis = requests.get(f"{API}/admin/companies/{cid}/emissions", headers=H(TOK_SUPER)).json()
        assert emis["emissions"] == []
        assert emis["facilities"] == []


# ---------- NEW 4: Super Admin Users CRUD ----------
class TestSuperAdminUsersCRUD:
    cid = None
    uid = None

    def test_setup_company(self):
        r = requests.post(f"{API}/admin/companies", headers=H(TOK_SUPER),
                          json={"name": "TEST_ITER2_UserCRUDCo", "region": "jamali"})
        assert r.status_code == 200
        TestSuperAdminUsersCRUD.cid = r.json()["company_id"]

    def test_add_user(self):
        cid = TestSuperAdminUsersCRUD.cid
        r = requests.post(f"{API}/admin/companies/{cid}/users", headers=H(TOK_SUPER),
                          json={"email": "admincrud.karbon@example.com", "name": "AdminCRUD", "role": "admin"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == "admincrud.karbon@example.com"
        assert d["role"] == "admin"
        TestSuperAdminUsersCRUD.uid = d["user_id"]

    def test_list_company_users(self):
        cid = TestSuperAdminUsersCRUD.cid
        r = requests.get(f"{API}/admin/companies/{cid}/users", headers=H(TOK_SUPER))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_update_role(self):
        uid = TestSuperAdminUsersCRUD.uid
        r = requests.put(f"{API}/admin/users/{uid}", headers=H(TOK_SUPER),
                         json={"role": "staff"})
        assert r.status_code == 200
        assert r.json()["role"] == "staff"

    def test_move_across_company(self):
        uid = TestSuperAdminUsersCRUD.uid
        # create second company
        r = requests.post(f"{API}/admin/companies", headers=H(TOK_SUPER),
                          json={"name": "TEST_ITER2_UserCRUDCo2", "region": "jamali"})
        other_cid = r.json()["company_id"]
        r2 = requests.put(f"{API}/admin/users/{uid}", headers=H(TOK_SUPER),
                          json={"company_id": other_cid})
        assert r2.status_code == 200
        assert r2.json()["company_id"] == other_cid
        # cleanup
        requests.delete(f"{API}/admin/companies/{other_cid}", headers=H(TOK_SUPER))

    def test_super_cannot_delete_super(self):
        # find a super admin user
        users = requests.get(f"{API}/admin/companies/co_test_karbon_1/users", headers=H(TOK_SUPER)).json()
        # try to fetch super via list of a company user has: super lives under user_super_admin1
        # Try direct delete via known super id
        r = requests.delete(f"{API}/admin/users/user_super_admin1", headers=H(TOK_SUPER))
        assert r.status_code == 403, r.text

    def test_non_super_forbidden(self):
        r1 = requests.get(f"{API}/admin/companies/x/users", headers=H(TOK_ADMIN))
        assert r1.status_code == 403
        r2 = requests.put(f"{API}/admin/users/x", headers=H(TOK_ADMIN), json={"role": "staff"})
        assert r2.status_code == 403
        r3 = requests.delete(f"{API}/admin/users/x", headers=H(TOK_ADMIN))
        assert r3.status_code == 403

    def test_delete_user(self):
        uid = TestSuperAdminUsersCRUD.uid
        r = requests.delete(f"{API}/admin/users/{uid}", headers=H(TOK_SUPER))
        assert r.status_code == 200
        # cleanup company
        requests.delete(f"{API}/admin/companies/{TestSuperAdminUsersCRUD.cid}", headers=H(TOK_SUPER))


# ---------- NEW 5: Super Admin Facilities/Assets CRUD across companies ----------
class TestSuperAdminFacAssetCRUD:
    cid = None
    fid = None
    aid = None

    def test_setup(self):
        r = requests.post(f"{API}/admin/companies", headers=H(TOK_SUPER),
                          json={"name": "TEST_ITER2_FacAssetCo", "region": "jamali"})
        TestSuperAdminFacAssetCRUD.cid = r.json()["company_id"]

    def test_add_facility(self):
        cid = TestSuperAdminFacAssetCRUD.cid
        r = requests.post(f"{API}/admin/companies/{cid}/facilities", headers=H(TOK_SUPER),
                          json={"name": "TEST_ITER2_AdminFac", "type": "plant", "region": "jamali"})
        assert r.status_code == 200
        assert r.json()["company_id"] == cid
        TestSuperAdminFacAssetCRUD.fid = r.json()["facility_id"]

    def test_update_facility_any_company(self):
        fid = TestSuperAdminFacAssetCRUD.fid
        r = requests.put(f"{API}/admin/facilities/{fid}", headers=H(TOK_SUPER),
                         json={"name": "TEST_ITER2_AdminFac_U", "type": "office", "region": "jamali"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_ITER2_AdminFac_U"

    def test_add_asset(self):
        cid = TestSuperAdminFacAssetCRUD.cid
        fid = TestSuperAdminFacAssetCRUD.fid
        r = requests.post(f"{API}/admin/companies/{cid}/assets", headers=H(TOK_SUPER),
                          json={"facility_id": fid, "name": "TEST_ITER2_AdminAsset", "type": "genset"})
        assert r.status_code == 200
        TestSuperAdminFacAssetCRUD.aid = r.json()["asset_id"]

    def test_list_assets(self):
        cid = TestSuperAdminFacAssetCRUD.cid
        r = requests.get(f"{API}/admin/companies/{cid}/assets", headers=H(TOK_SUPER))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_delete_asset(self):
        r = requests.delete(f"{API}/admin/assets/{TestSuperAdminFacAssetCRUD.aid}", headers=H(TOK_SUPER))
        assert r.status_code == 200

    def test_delete_facility(self):
        r = requests.delete(f"{API}/admin/facilities/{TestSuperAdminFacAssetCRUD.fid}", headers=H(TOK_SUPER))
        assert r.status_code == 200

    def test_non_super_forbidden(self):
        r1 = requests.post(f"{API}/admin/companies/x/facilities", headers=H(TOK_ADMIN),
                           json={"name": "x", "type": "office"})
        assert r1.status_code == 403
        r2 = requests.put(f"{API}/admin/facilities/x", headers=H(TOK_ADMIN),
                          json={"name": "x", "type": "office"})
        assert r2.status_code == 403
        r3 = requests.delete(f"{API}/admin/assets/x", headers=H(TOK_ADMIN))
        assert r3.status_code == 403

    def test_cleanup(self):
        requests.delete(f"{API}/admin/companies/{TestSuperAdminFacAssetCRUD.cid}", headers=H(TOK_SUPER))


# ---------- NEW 6: Super Admin Emissions edit/delete ----------
class TestSuperAdminEmissionsEditDelete:
    lid = None

    def test_setup_create_emission(self, home_facility_id, gasoline_factor_id):
        # fresh period
        r = requests.post(f"{API}/emissions", headers=H(TOK_STAFF),
                          json={"facility_id": home_facility_id, "factor_id": gasoline_factor_id,
                                "activity_data": 100, "period_year": 2028, "period_month": 4})
        assert r.status_code == 200, r.text
        d = r.json()
        # gasoline: 100 * 2.31 * 1.0 = 231
        assert d["total_kg_co2e"] == 231.0
        TestSuperAdminEmissionsEditDelete.lid = d["log_id"]

    def test_update_recomputes(self):
        lid = TestSuperAdminEmissionsEditDelete.lid
        r = requests.put(f"{API}/admin/emissions/{lid}", headers=H(TOK_SUPER),
                         json={"activity_data": 200})
        assert r.status_code == 200, r.text
        d = r.json()
        # 200 * 2.31 * 1.0 = 462
        assert d["total_kg_co2e"] == 462.0

    def test_non_super_forbidden(self):
        lid = TestSuperAdminEmissionsEditDelete.lid
        r = requests.put(f"{API}/admin/emissions/{lid}", headers=H(TOK_ADMIN),
                         json={"activity_data": 50})
        assert r.status_code == 403
        r2 = requests.delete(f"{API}/admin/emissions/{lid}", headers=H(TOK_ADMIN))
        assert r2.status_code == 403

    def test_delete(self):
        lid = TestSuperAdminEmissionsEditDelete.lid
        r = requests.delete(f"{API}/admin/emissions/{lid}", headers=H(TOK_SUPER))
        assert r.status_code == 200


# ---------- NEW 7: Audit trail records admin actions ----------
class TestAuditAdminActions:
    def test_audit_contains_admin_events(self):
        r = requests.get(f"{API}/admin/audit-logs", headers=H(TOK_SUPER))
        assert r.status_code == 200
        actions = {l["action"] for l in r.json()}
        expected_any = {
            "admin.company.create", "admin.company.update", "admin.company.delete",
            "admin.user.add", "admin.user.update", "admin.user.delete",
            "admin.facility.create", "admin.facility.delete",
            "admin.emission.update", "admin.emission.delete",
        }
        missing = expected_any - actions
        assert not missing, f"Missing audit actions: {missing}"
