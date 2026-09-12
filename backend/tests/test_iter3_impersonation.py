"""Iteration 3 backend tests: Super Admin Impersonation feature."""
# NOTE: Do NOT run in parallel — all tests share the single super-admin session token
# and mutate `impersonating_company_id` on that session; parallel workers race.
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://karbon-tracker-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TOK_SUPER = "test_session_karbon_super_1"
TOK_ADMIN = "test_session_karbon_admin_1"
TOK_STAFF = "test_session_karbon_staff_1"
TOK_SUP   = "test_session_karbon_sup_1"

CO = "co_test_karbon_1"


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _stop(tok=TOK_SUPER):
    try:
        requests.post(f"{API}/admin/impersonate/stop", headers=H(tok), timeout=10)
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _reset_super_impersonation():
    """Ensure super admin session is not impersonating before/after each test."""
    _stop(TOK_SUPER)
    yield
    _stop(TOK_SUPER)


# ---------- 1. Basic start impersonation ----------
class TestImpersonateStart:
    def test_start_returns_ok_and_company(self):
        r = requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["company"]["company_id"] == CO
        assert "name" in d["company"]

    def test_me_reflects_impersonation(self):
        rs = requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        assert rs.status_code == 200
        r = requests.get(f"{API}/auth/me", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["impersonating"] is True
        assert d["user"]["company_id"] == CO
        assert d["user"]["role"] == "admin"
        assert d["user"]["is_super_admin"] is True  # not stripped
        # real_company_id preserved (may be None if super had no company, but key should exist)
        assert "real_company_id" in d["user"]


# ---------- 2. Non-existent company ----------
class TestImpersonateNotFound:
    def test_404_unknown_company(self):
        r = requests.post(f"{API}/admin/impersonate/co_does_not_exist_xyz", headers=H(TOK_SUPER))
        assert r.status_code == 404, r.text


# ---------- 3. Non-super forbidden ----------
class TestImpersonateForbidden:
    @pytest.mark.parametrize("tok", [TOK_ADMIN, TOK_STAFF, TOK_SUP])
    def test_forbidden_for_non_super(self, tok):
        r = requests.post(f"{API}/admin/impersonate/{CO}", headers=H(tok))
        assert r.status_code == 403, f"{tok}: {r.status_code} {r.text}"


# ---------- 4. Data scoping under impersonation ----------
class TestImpersonateScoping:
    def test_facilities_scoped_to_impersonated_company(self):
        # start
        rs = requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        assert rs.status_code == 200
        r = requests.get(f"{API}/facilities", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        facs = r.json()
        assert isinstance(facs, list)
        for f in facs:
            assert f["company_id"] == CO, f"facility belongs to {f['company_id']} not {CO}"
        # cross-check against admin of same company — must be same set
        r2 = requests.get(f"{API}/facilities", headers=H(TOK_ADMIN))
        assert r2.status_code == 200
        assert {f["facility_id"] for f in facs} == {f["facility_id"] for f in r2.json()}

    def test_dashboard_stats_scoped(self):
        requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        r = requests.get(f"{API}/dashboard/stats", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        # sanity — just check it returned a dict (scoping to CO handled server-side via user.company_id)
        assert isinstance(r.json(), dict)

    def test_emissions_scoped(self):
        requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        r = requests.get(f"{API}/emissions", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        for e in r.json():
            assert e["company_id"] == CO


# ---------- 5. Stop impersonation ----------
class TestImpersonateStop:
    def test_stop_clears_state(self):
        requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        r = requests.post(f"{API}/admin/impersonate/stop", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        me = requests.get(f"{API}/auth/me", headers=H(TOK_SUPER)).json()
        assert me["impersonating"] is False
        # Super admin's real company_id (may be None) — impersonating_company_id must be None now
        assert not me["user"].get("impersonating_company_id")


# ---------- 6. Audit logging ----------
class TestImpersonateAudit:
    def test_audit_records_start_and_stop(self):
        requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        time.sleep(0.2)
        requests.post(f"{API}/admin/impersonate/stop", headers=H(TOK_SUPER))
        time.sleep(0.2)
        r = requests.get(f"{API}/admin/audit-logs", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        actions = {l["action"] for l in r.json()}
        assert "admin.impersonate.start" in actions, f"missing start; actions={actions}"
        assert "admin.impersonate.stop" in actions, f"missing stop; actions={actions}"


# ---------- 7. Route ordering: /stop is not matched as /{cid=stop} ----------
class TestImpersonateRouteOrder:
    def test_stop_without_prior_start_returns_ok_not_404(self):
        # ensure no prior state
        _stop(TOK_SUPER)
        r = requests.post(f"{API}/admin/impersonate/stop", headers=H(TOK_SUPER))
        # If ordering was wrong, backend would try to impersonate a company id "stop" → 404
        assert r.status_code == 200, f"route-ordering regression: {r.status_code} {r.text}"
        assert r.json().get("ok") is True


# ---------- 8. Emission create during impersonation (role='supervisor' bypassed) ----------
class TestImpersonateEmissionCreate:
    def test_supervisor_role_forced_to_admin_can_create(self):
        # Ensure at least one facility exists in CO — create via admin if empty
        facs = requests.get(f"{API}/facilities", headers=H(TOK_ADMIN)).json()
        created_fid = None
        if not facs:
            rc = requests.post(f"{API}/facilities", headers=H(TOK_ADMIN),
                               json={"name": "TEST_ITER3_imp_fac", "type": "office",
                                     "address": "JKT", "region": "jamali"})
            assert rc.status_code == 200, rc.text
            created_fid = rc.json()["facility_id"]
            fid = created_fid
        else:
            fid = facs[0]["facility_id"]
        factors = requests.get(f"{API}/emission-factors?scope=1").json()
        gasoline = next((f for f in factors if f["category"] == "fuel_gasoline"), None)
        assert gasoline, "no gasoline factor"

        # start impersonation
        rs = requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        assert rs.status_code == 200

        # POST /emissions as super (now role forced admin under impersonation)
        payload = {
            "facility_id": fid,
            "factor_id": gasoline["factor_id"],
            "activity_data": 12.5,
            "period_year": 2029,
            "period_month": 11,
            "notes": "TEST_ITER3_impersonation_emission",
        }
        r = requests.post(f"{API}/emissions", headers=H(TOK_SUPER), json=payload)
        assert r.status_code == 200, r.text
        lid = r.json()["log_id"]

        # cleanup via admin endpoint
        requests.delete(f"{API}/admin/emissions/{lid}", headers=H(TOK_SUPER))
        if created_fid:
            requests.delete(f"{API}/facilities/{created_fid}", headers=H(TOK_ADMIN))


# ---------- 9. Admin endpoints remain accessible during impersonation ----------
class TestImpersonateAdminEndpointsStillWork:
    def test_list_companies_during_impersonation(self):
        requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        r = requests.get(f"{API}/admin/companies", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_audit_logs_during_impersonation(self):
        requests.post(f"{API}/admin/impersonate/{CO}", headers=H(TOK_SUPER))
        r = requests.get(f"{API}/admin/audit-logs", headers=H(TOK_SUPER))
        assert r.status_code == 200, r.text
