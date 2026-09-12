from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Cookie
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, io, csv, httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
SUPER_ADMIN_EMAIL = os.environ.get('SUPER_ADMIN_EMAIL', '').lower()
EMERGENT_EMAIL_KEY = os.environ.get('EMERGENT_EMAIL_KEY', '')
EMAIL_FROM_NAME = os.environ.get('EMAIL_FROM_NAME', 'KarbonKu')
EMAIL_BASE_URL = "https://integrations.emergentagent.com"

app = FastAPI()
api = APIRouter(prefix="/api")

def now_utc():
    return datetime.now(timezone.utc)

def iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt

# ============ EMAIL (Emergent Resend) ============
import re, ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

_SHORTENERS = ("bit.ly","tinyurl.com","t.co","is.gd","cutt.ly","goo.gl","rebrand.ly")
_CRED_ASK = ("reply with your password","reply with the code","send your password","cvv",
             "send us your password","enter your password below","confirm your card number",
             "your full card number","seed phrase","recovery phrase","verify your card",
             "social security number","confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(h):
    if not h or "xn--" in h: return False
    try: ipaddress.ip_address(h); return False
    except ValueError: pass
    return not any(h==s or h.endswith("."+s) for s in _SHORTENERS)

def _same_site(a, b): return a==b or b.endswith("."+a) or a.endswith("."+b)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__(); self.tags,self.urls,self.anchors=set(),[],[]
        self._href,self._text=None,[]
    def handle_starttag(self,tag,attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k,v in attrs if k.lower() in ("href","src") and v]
        if tag.lower()=="a":
            self._href=dict((k.lower(),v) for k,v in attrs).get("href"); self._text=[]
    def handle_data(self,data):
        if self._href is not None: self._text.append(data)
    def handle_endtag(self,tag):
        if tag.lower()=="a" and self._href is not None:
            self.anchors.append((self._href,"".join(self._text))); self._href,self._text=None,[]

def _assert_safe_email(subject, html):
    s = _EmailScan(); s.feed(html)
    if s.tags & {"form","input","textarea","select"}:
        raise ValueError("No forms/input in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body: raise ValueError(f"Email asks for credential: {p!r}")
    for url in s.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:","tel:","cid:","#")): continue
        if not low.startswith("https://"):
            raise ValueError(f"Non-https link/asset: {url!r}")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Unsafe host: {url!r}")
    for href,text in s.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real: continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor host mismatch: {m.group(1)!r} vs {real!r}")

async def send_email(to: str, subject: str, html: str):
    if not EMERGENT_EMAIL_KEY:
        logging.warning("EMERGENT_EMAIL_KEY not set — skipping email to %s", to)
        return None
    _assert_safe_email(subject, html)
    payload = {"to":[to], "subject":subject, "html":html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as hc:
            r = await hc.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                              headers={"X-Email-Key": EMERGENT_EMAIL_KEY}, json=payload)
            r.raise_for_status()
            return r.json().get("id")
    except Exception as e:
        logging.error("Email failed: %s", e)
        return None

# ============ MODELS ============
class Company(BaseModel):
    company_id: str
    name: str
    industry: Optional[str] = None
    size: Optional[str] = None
    org_boundary: Optional[str] = None  # operational_control | financial_control | equity_share
    region: Optional[str] = "jamali"
    employees: Optional[int] = 0
    annual_production: Optional[float] = 0
    created_at: str

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = ""
    company_id: Optional[str] = None
    role: str = "admin"  # admin | staff | supervisor
    is_super_admin: bool = False
    created_at: str
    impersonating_company_id: Optional[str] = None
    real_company_id: Optional[str] = None

class Facility(BaseModel):
    facility_id: str
    company_id: str
    name: str
    type: str  # office | plant | branch
    address: Optional[str] = ""
    region: str = "jamali"
    created_at: str

class Asset(BaseModel):
    asset_id: str
    company_id: str
    facility_id: str
    name: str
    type: str  # vehicle | genset | ac_refrigerant | machinery
    capacity: Optional[str] = ""
    created_at: str

class EmissionFactor(BaseModel):
    factor_id: str
    scope: int  # 1,2,3
    category: str  # fuel_gasoline, electricity, refrigerant_r134a, etc
    label: str
    unit: str  # liter, kWh, kg, km, km-tonne, passenger-km
    factor: float  # kg CO2e per unit (already includes GWP for refrigerants)
    gwp: float = 1.0
    region: Optional[str] = None
    source: str  # IPCC, DEFRA, KLHK, ESDM

class EmissionLog(BaseModel):
    log_id: str
    company_id: str
    facility_id: str
    scope: int
    factor_id: str
    category: str
    activity_data: float
    unit: str
    factor_value: float
    gwp: float
    total_kg_co2e: float
    period_year: int
    period_month: int
    notes: Optional[str] = ""
    status: str = "draft"  # draft | approved | rejected
    reject_reason: Optional[str] = ""
    created_by: str
    created_at: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None

# ============ EMISSION FACTORS SEED (IPCC/DEFRA/KLHK) ============
DEFAULT_FACTORS = [
    # Scope 1 - Fuel combustion
    {"scope":1,"category":"fuel_gasoline","label":"BBM Bensin (Gasoline)","unit":"liter","factor":2.31,"gwp":1.0,"source":"IPCC/DEFRA"},
    {"scope":1,"category":"fuel_diesel","label":"BBM Solar (Diesel)","unit":"liter","factor":2.68,"gwp":1.0,"source":"IPCC/DEFRA"},
    {"scope":1,"category":"fuel_lpg","label":"LPG","unit":"kg","factor":2.98,"gwp":1.0,"source":"IPCC"},
    {"scope":1,"category":"natural_gas","label":"Gas Alam","unit":"m3","factor":2.02,"gwp":1.0,"source":"IPCC"},
    # Scope 1 - Refrigerants (factor = GWP itself since we input kg leaked)
    {"scope":1,"category":"refrigerant_r134a","label":"Refrigerant R-134a","unit":"kg","factor":1430,"gwp":1430,"source":"IPCC AR5"},
    {"scope":1,"category":"refrigerant_r410a","label":"Refrigerant R-410A","unit":"kg","factor":2088,"gwp":2088,"source":"IPCC AR5"},
    {"scope":1,"category":"refrigerant_r32","label":"Refrigerant R-32","unit":"kg","factor":675,"gwp":675,"source":"IPCC AR5"},
    # Scope 2 - Electricity (region-based)
    {"scope":2,"category":"electricity_grid","label":"Listrik PLN - Grid Jamali","unit":"kWh","factor":0.87,"gwp":1.0,"region":"jamali","source":"KLHK/ESDM"},
    {"scope":2,"category":"electricity_grid","label":"Listrik PLN - Grid Sumatera","unit":"kWh","factor":0.74,"gwp":1.0,"region":"sumatera","source":"KLHK/ESDM"},
    {"scope":2,"category":"electricity_grid","label":"Listrik PLN - Grid Kalimantan","unit":"kWh","factor":1.05,"gwp":1.0,"region":"kalimantan","source":"KLHK/ESDM"},
    {"scope":2,"category":"electricity_grid","label":"Listrik PLN - Grid Sulawesi","unit":"kWh","factor":0.98,"gwp":1.0,"region":"sulawesi","source":"KLHK/ESDM"},
    {"scope":2,"category":"steam","label":"Uap / Pendingin Terpusat","unit":"kWh","factor":0.22,"gwp":1.0,"source":"DEFRA"},
    # Scope 3
    {"scope":3,"category":"business_travel_flight","label":"Penerbangan Dinas","unit":"km","factor":0.15,"gwp":1.0,"source":"DEFRA"},
    {"scope":3,"category":"logistics_freight","label":"Logistik & Pengiriman","unit":"km-tonne","factor":0.10,"gwp":1.0,"source":"DEFRA"},
    {"scope":3,"category":"employee_commute_car","label":"Komuting Karyawan (Mobil)","unit":"km","factor":0.171,"gwp":1.0,"source":"DEFRA"},
    {"scope":3,"category":"employee_commute_motorbike","label":"Komuting Karyawan (Motor)","unit":"km","factor":0.103,"gwp":1.0,"source":"DEFRA"},
    {"scope":3,"category":"employee_commute_public","label":"Komuting Karyawan (Transportasi Umum)","unit":"passenger-km","factor":0.089,"gwp":1.0,"source":"DEFRA"},
]

REGIONS = [
    {"id":"jamali","name":"Jawa-Madura-Bali (Jabodetabek)","factor":0.87},
    {"id":"sumatera","name":"Sumatera","factor":0.74},
    {"id":"kalimantan","name":"Kalimantan","factor":1.05},
    {"id":"sulawesi","name":"Sulawesi","factor":0.98},
]

INDUSTRIES = ["Manufaktur","Perbankan & Keuangan","Ritel","Logistik & Transportasi","Perhotelan","Teknologi Informasi","Kesehatan","Pendidikan","Konstruksi","Pertambangan","Makanan & Minuman","Lainnya"]
COMPANY_SIZES = ["Kecil (<50 karyawan)","Menengah (50-250 karyawan)","Besar (250-1000 karyawan)","Enterprise (>1000 karyawan)"]

@app.on_event("startup")
async def seed_data():
    if await db.emission_factors.count_documents({}) == 0:
        for f in DEFAULT_FACTORS:
            doc = {**f, "factor_id": str(uuid.uuid4())}
            await db.emission_factors.insert_one(doc)
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.emission_logs.create_index([("company_id",1),("facility_id",1),("scope",1),("category",1),("period_year",1),("period_month",1)])

# ============ AUTH ============
async def get_current_user(request: Request) -> User:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization","")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id":0})
    if not session:
        raise HTTPException(401, "Invalid session")
    exp = session["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(401, "Session expired")
    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id":0})
    if not user_doc:
        raise HTTPException(401, "User not found")
    # Impersonation override — only when super admin
    imp_cid = session.get("impersonating_company_id")
    if imp_cid and user_doc.get("is_super_admin"):
        user_doc["real_company_id"] = user_doc.get("company_id")
        user_doc["company_id"] = imp_cid
        user_doc["role"] = "admin"
        user_doc["impersonating_company_id"] = imp_cid
    return User(**user_doc)

async def require_company(user: User = Depends(get_current_user)):
    if not user.company_id:
        raise HTTPException(400, "Company registration required")
    return user

async def require_role(*roles):
    async def _check(user: User = Depends(require_company)):
        if user.role not in roles and not user.is_super_admin:
            raise HTTPException(403, f"Requires role: {roles}")
        return user
    return _check

@api.post("/auth/session")
async def create_session(payload: dict, response: Response):
    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id required")
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(401, f"OAuth verification failed: {e}")
    email = data["email"].lower()
    name = data.get("name", email)
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id":0})
    if existing:
        user_id = existing["user_id"]
        updates = {"name": name, "picture": picture}
        if email == SUPER_ADMIN_EMAIL and not existing.get("is_super_admin"):
            updates["is_super_admin"] = True
        # Consume pending invite if user has no company yet
        if not existing.get("company_id"):
            invite = await db.pending_invites.find_one({"email": email})
            if invite:
                updates["company_id"] = invite["company_id"]
                updates["role"] = invite.get("role","staff")
                await db.pending_invites.delete_many({"email": email})
        await db.users.update_one({"user_id": user_id}, {"$set": updates})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        # Consume pending invite for brand-new user
        invite = await db.pending_invites.find_one({"email": email})
        company_id = invite["company_id"] if invite else None
        role = invite.get("role","staff") if invite else "admin"
        if invite:
            await db.pending_invites.delete_many({"email": email})
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "company_id": company_id, "role": role,
            "is_super_admin": email == SUPER_ADMIN_EMAIL,
            "created_at": iso(now_utc())
        })

    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": iso(now_utc() + timedelta(days=7)),
        "created_at": iso(now_utc())
    })
    response.set_cookie("session_token", session_token, max_age=7*24*3600,
                        httponly=True, secure=True, samesite="none", path="/")
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id":0})
    return {"user": user_doc, "session_token": session_token}

@api.get("/auth/me")
async def me(user: User = Depends(get_current_user)):
    company = None
    if user.company_id:
        company = await db.companies.find_one({"company_id": user.company_id}, {"_id":0})
    return {"user": user.model_dump(), "company": company,
            "impersonating": bool(user.impersonating_company_id)}

@api.post("/admin/impersonate/stop")
async def stop_impersonate(request: Request, user: User = Depends(get_current_user)):
    token = request.cookies.get("session_token") or request.headers.get("Authorization","").replace("Bearer ","")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id":0})
    imp = session.get("impersonating_company_id") if session else None
    await db.user_sessions.update_one({"session_token": token},
                                      {"$unset": {"impersonating_company_id": ""}})
    if imp:
        await audit(user.user_id, imp, "admin.impersonate.stop", {})
    return {"ok": True}

@api.post("/admin/impersonate/{cid}")
async def impersonate(cid: str, request: Request, user: User = Depends(get_current_user)):
    if not user.is_super_admin:
        raise HTTPException(403, "Super Admin only")
    target = await db.companies.find_one({"company_id": cid}, {"_id":0})
    if not target:
        raise HTTPException(404, "Perusahaan tidak ditemukan")
    token = request.cookies.get("session_token") or request.headers.get("Authorization","").replace("Bearer ","")
    await db.user_sessions.update_one({"session_token": token},
                                      {"$set": {"impersonating_company_id": cid}})
    await audit(user.user_id, cid, "admin.impersonate.start", {"company": target.get("name")})
    return {"ok": True, "company": target}

@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ============ COMPANIES ============
class CompanyCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    size: Optional[str] = None
    region: Optional[str] = "jamali"

@api.post("/companies")
async def create_company(payload: CompanyCreate, user: User = Depends(get_current_user)):
    if user.company_id:
        raise HTTPException(400, "User already belongs to a company")
    company_id = f"co_{uuid.uuid4().hex[:12]}"
    doc = {
        "company_id": company_id, "name": payload.name,
        "industry": payload.industry, "size": payload.size,
        "region": payload.region or "jamali", "org_boundary": None,
        "employees": 0, "annual_production": 0,
        "created_at": iso(now_utc())
    }
    await db.companies.insert_one(doc)
    doc.pop("_id", None)
    await db.users.update_one({"user_id": user.user_id}, {"$set":{"company_id": company_id, "role": "admin"}})
    await audit(user.user_id, company_id, "company.create", doc)
    return {"company": doc}

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    region: Optional[str] = None
    org_boundary: Optional[str] = None
    employees: Optional[int] = None
    annual_production: Optional[float] = None

@api.put("/companies/me")
async def update_company(payload: CompanyUpdate, user: User = Depends(require_company)):
    updates = {k:v for k,v in payload.model_dump().items() if v is not None}
    if updates:
        await db.companies.update_one({"company_id": user.company_id}, {"$set": updates})
    await audit(user.user_id, user.company_id, "company.update", updates)
    doc = await db.companies.find_one({"company_id": user.company_id}, {"_id":0})
    return doc

# ============ FACILITIES ============
class FacilityIn(BaseModel):
    name: str
    type: str
    address: Optional[str] = ""
    region: Optional[str] = "jamali"

@api.get("/facilities")
async def list_facilities(user: User = Depends(require_company)):
    return await db.facilities.find({"company_id": user.company_id},{"_id":0}).to_list(500)

@api.post("/facilities")
async def create_facility(payload: FacilityIn, user: User = Depends(require_company)):
    doc = {"facility_id": f"fc_{uuid.uuid4().hex[:10]}", "company_id": user.company_id,
           **payload.model_dump(), "created_at": iso(now_utc())}
    await db.facilities.insert_one(doc)
    doc.pop("_id", None)
    await audit(user.user_id, user.company_id, "facility.create", doc)
    return doc

@api.put("/facilities/{fid}")
async def update_facility(fid: str, payload: FacilityIn, user: User = Depends(require_company)):
    r = await db.facilities.update_one({"facility_id": fid, "company_id": user.company_id}, {"$set": payload.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Fasilitas tidak ditemukan")
    await audit(user.user_id, user.company_id, "facility.update", {"facility_id": fid, **payload.model_dump()})
    return await db.facilities.find_one({"facility_id": fid, "company_id": user.company_id}, {"_id":0})

@api.delete("/facilities/{fid}")
async def delete_facility(fid: str, user: User = Depends(require_company)):
    r = await db.facilities.delete_one({"facility_id": fid, "company_id": user.company_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Fasilitas tidak ditemukan")
    await audit(user.user_id, user.company_id, "facility.delete", {"facility_id": fid})
    return {"ok": True}

# ============ ASSETS ============
class AssetIn(BaseModel):
    facility_id: str
    name: str
    type: str
    capacity: Optional[str] = ""

@api.get("/assets")
async def list_assets(user: User = Depends(require_company)):
    return await db.assets.find({"company_id": user.company_id},{"_id":0}).to_list(1000)

@api.post("/assets")
async def create_asset(payload: AssetIn, user: User = Depends(require_company)):
    doc = {"asset_id": f"as_{uuid.uuid4().hex[:10]}", "company_id": user.company_id,
           **payload.model_dump(), "created_at": iso(now_utc())}
    await db.assets.insert_one(doc)
    doc.pop("_id", None)
    await audit(user.user_id, user.company_id, "asset.create", doc)
    return doc

@api.delete("/assets/{aid}")
async def delete_asset(aid: str, user: User = Depends(require_company)):
    r = await db.assets.delete_one({"asset_id": aid, "company_id": user.company_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Aset tidak ditemukan")
    await audit(user.user_id, user.company_id, "asset.delete", {"asset_id": aid})
    return {"ok": True}

# ============ EMISSION FACTORS & REGIONS ============
@api.get("/emission-factors")
async def list_factors(scope: Optional[int]=None, region: Optional[str]=None):
    q = {}
    if scope: q["scope"] = scope
    factors = await db.emission_factors.find(q,{"_id":0}).to_list(500)
    if region:
        factors = [f for f in factors if f.get("region") in (None, region) or f.get("region")==region]
    return factors

@api.get("/regions")
async def list_regions():
    return REGIONS

@api.get("/meta")
async def meta():
    return {"industries": INDUSTRIES, "sizes": COMPANY_SIZES, "regions": REGIONS}

# ============ EMISSION LOGS ============
class EmissionIn(BaseModel):
    facility_id: str
    factor_id: str
    activity_data: float
    period_year: int
    period_month: int
    notes: Optional[str] = ""

@api.get("/emissions")
async def list_emissions(status: Optional[str]=None, scope: Optional[int]=None,
                          year: Optional[int]=None, facility_id: Optional[str]=None,
                          user: User = Depends(require_company)):
    q = {"company_id": user.company_id}
    if status: q["status"] = status
    if scope: q["scope"] = scope
    if year: q["period_year"] = year
    if facility_id: q["facility_id"] = facility_id
    return await db.emission_logs.find(q,{"_id":0}).sort("created_at",-1).to_list(2000)

@api.post("/emissions")
async def create_emission(payload: EmissionIn, user: User = Depends(require_company)):
    if user.role == "supervisor":
        raise HTTPException(403, "Supervisor tidak dapat menginput data")
    factor = await db.emission_factors.find_one({"factor_id": payload.factor_id},{"_id":0})
    if not factor:
        raise HTTPException(404, "Faktor emisi tidak ditemukan")
    # Anti double entry
    dupe = await db.emission_logs.find_one({
        "company_id": user.company_id, "facility_id": payload.facility_id,
        "scope": factor["scope"], "category": factor["category"],
        "period_year": payload.period_year, "period_month": payload.period_month,
        "status": {"$in": ["draft","approved"]}
    })
    if dupe:
        raise HTTPException(409, "Entri duplikat: sudah ada data untuk fasilitas + kategori + periode ini")
    total = payload.activity_data * factor["factor"] * (factor.get("gwp") or 1.0)
    # For refrigerants factor already = GWP so avoid double-multiplication
    if factor["category"].startswith("refrigerant"):
        total = payload.activity_data * factor["factor"]  # kg * GWP
    log = {
        "log_id": f"em_{uuid.uuid4().hex[:12]}", "company_id": user.company_id,
        "facility_id": payload.facility_id, "scope": factor["scope"],
        "factor_id": factor["factor_id"], "category": factor["category"],
        "activity_data": payload.activity_data, "unit": factor["unit"],
        "factor_value": factor["factor"], "gwp": factor.get("gwp",1.0),
        "total_kg_co2e": round(total,4),
        "period_year": payload.period_year, "period_month": payload.period_month,
        "notes": payload.notes, "status": "draft", "reject_reason": "",
        "created_by": user.user_id, "created_at": iso(now_utc()),
        "reviewed_by": None, "reviewed_at": None
    }
    await db.emission_logs.insert_one(log)
    log.pop("_id", None)
    await audit(user.user_id, user.company_id, "emission.create", {"log_id": log["log_id"], "total": log["total_kg_co2e"]})
    # Notify supervisors (fire-and-forget)
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id":0})
    facility = await db.facilities.find_one({"facility_id": payload.facility_id}, {"_id":0})
    supers = await db.users.find({"company_id": user.company_id, "role": "supervisor"}, {"_id":0}).to_list(50)
    if supers and EMERGENT_EMAIL_KEY:
        app_url = os.environ.get("APP_URL","").rstrip("/") or "https://karbon-tracker-1.preview.emergentagent.com"
        subject = f"[KarbonKu] Draft emisi baru menunggu persetujuan — {company['name']}"
        body = f"""<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:#1c1917">
<tr><td style="padding:24px;background:#1b4332;color:#fff;border-radius:6px 6px 0 0">
<h2 style="margin:0;font-size:20px">Draft Emisi Baru</h2>
<p style="margin:4px 0 0;font-size:13px;opacity:0.85">KarbonKu · Inventarisasi GRK</p></td></tr>
<tr><td style="padding:24px;background:#fafaf9;border:1px solid #e7e5e4;border-top:0;border-radius:0 0 6px 6px">
<p>Halo,</p>
<p><strong>{escape(user.name)}</strong> telah menginput data emisi baru yang menunggu persetujuan Anda:</p>
<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0">
<tr><td style="padding:8px;background:#f5f5f4;border:1px solid #e7e5e4"><b>Perusahaan</b></td><td style="padding:8px;border:1px solid #e7e5e4">{escape(company['name'])}</td></tr>
<tr><td style="padding:8px;background:#f5f5f4;border:1px solid #e7e5e4"><b>Fasilitas</b></td><td style="padding:8px;border:1px solid #e7e5e4">{escape(facility['name']) if facility else '-'}</td></tr>
<tr><td style="padding:8px;background:#f5f5f4;border:1px solid #e7e5e4"><b>Scope / Kategori</b></td><td style="padding:8px;border:1px solid #e7e5e4">Scope {log['scope']} — {escape(log['category'])}</td></tr>
<tr><td style="padding:8px;background:#f5f5f4;border:1px solid #e7e5e4"><b>Periode</b></td><td style="padding:8px;border:1px solid #e7e5e4">{log['period_month']}/{log['period_year']}</td></tr>
<tr><td style="padding:8px;background:#f5f5f4;border:1px solid #e7e5e4"><b>Total Emisi</b></td><td style="padding:8px;border:1px solid #e7e5e4">{log['total_kg_co2e']:,.2f} kg CO2e</td></tr>
</table>
<p style="margin-top:16px"><a href="{app_url}/persetujuan" style="display:inline-block;padding:10px 18px;background:#1b4332;color:#fff;text-decoration:none;border-radius:4px">Tinjau di KarbonKu</a></p>
<p style="font-size:12px;color:#78716c;margin-top:24px">Email otomatis dari KarbonKu. Kami tidak pernah meminta password atau data kartu melalui email.</p>
</td></tr></table>"""
        for s in supers:
            try: await send_email(s["email"], subject, body)
            except Exception: pass
    return log

@api.post("/emissions/{lid}/approve")
async def approve_emission(lid: str, user: User = Depends(require_company)):
    if user.role not in ("supervisor","admin") and not user.is_super_admin:
        raise HTTPException(403, "Hanya Supervisor/Admin yang dapat menyetujui")
    r = await db.emission_logs.update_one(
        {"log_id": lid, "company_id": user.company_id, "status":"draft"},
        {"$set":{"status":"approved","reviewed_by": user.user_id, "reviewed_at": iso(now_utc())}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Log tidak ditemukan atau sudah direview")
    await audit(user.user_id, user.company_id, "emission.approve", {"log_id": lid})
    return {"ok": True}

@api.post("/emissions/{lid}/reject")
async def reject_emission(lid: str, payload: dict, user: User = Depends(require_company)):
    if user.role not in ("supervisor","admin") and not user.is_super_admin:
        raise HTTPException(403, "Hanya Supervisor/Admin yang dapat menolak")
    reason = payload.get("reason","")
    if not reason:
        raise HTTPException(400, "Alasan wajib diisi")
    r = await db.emission_logs.update_one(
        {"log_id": lid, "company_id": user.company_id, "status":"draft"},
        {"$set":{"status":"rejected","reject_reason":reason,"reviewed_by": user.user_id, "reviewed_at": iso(now_utc())}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Log tidak ditemukan atau sudah direview")
    await audit(user.user_id, user.company_id, "emission.reject", {"log_id": lid, "reason": reason})
    return {"ok": True}

@api.delete("/emissions/{lid}")
async def delete_emission(lid: str, user: User = Depends(require_company)):
    if user.role == "supervisor":
        raise HTTPException(403, "Tidak diizinkan")
    r = await db.emission_logs.delete_one({"log_id": lid, "company_id": user.company_id, "status":"draft"})
    if r.deleted_count == 0:
        raise HTTPException(404, "Log tidak ditemukan atau tidak dapat dihapus")
    await audit(user.user_id, user.company_id, "emission.delete", {"log_id": lid})
    return {"ok": True}

# ============ DASHBOARD ============
@api.get("/dashboard/stats")
async def dashboard_stats(year: Optional[int]=None, user: User = Depends(require_company)):
    year = year or now_utc().year
    q = {"company_id": user.company_id, "status":"approved", "period_year": year}
    logs = await db.emission_logs.find(q,{"_id":0}).to_list(5000)
    by_scope = {1:0.0, 2:0.0, 3:0.0}
    by_month = {i: {1:0.0,2:0.0,3:0.0} for i in range(1,13)}
    by_facility = {}
    for l in logs:
        by_scope[l["scope"]] += l["total_kg_co2e"]
        by_month[l["period_month"]][l["scope"]] += l["total_kg_co2e"]
        by_facility[l["facility_id"]] = by_facility.get(l["facility_id"],0) + l["total_kg_co2e"]
    total = sum(by_scope.values())
    company = await db.companies.find_one({"company_id": user.company_id},{"_id":0})
    intensity_per_employee = (total/1000)/company["employees"] if company and company.get("employees") else 0
    intensity_per_production = (total/1000)/company["annual_production"] if company and company.get("annual_production") else 0
    facilities = await db.facilities.find({"company_id": user.company_id},{"_id":0}).to_list(200)
    fac_names = {f["facility_id"]: f["name"] for f in facilities}
    return {
        "year": year,
        "total_kg_co2e": round(total,2),
        "total_tco2e": round(total/1000,4),
        "by_scope_kg": {k: round(v,2) for k,v in by_scope.items()},
        "by_month": [{"month": m, "scope1": round(by_month[m][1],2), "scope2": round(by_month[m][2],2), "scope3": round(by_month[m][3],2)} for m in range(1,13)],
        "by_facility": [{"facility_id": fid, "name": fac_names.get(fid,fid), "total_kg": round(v,2)} for fid,v in by_facility.items()],
        "intensity_per_employee_tco2e": round(intensity_per_employee,4),
        "intensity_per_production_tco2e": round(intensity_per_production,4),
        "count_logs": len(logs)
    }

# ============ USERS (Admin only) ============
@api.get("/users")
async def list_users(user: User = Depends(require_company)):
    if user.role != "admin" and not user.is_super_admin:
        raise HTTPException(403, "Admin only")
    return await db.users.find({"company_id": user.company_id},{"_id":0}).to_list(200)

@api.put("/users/{uid}/role")
async def update_user_role(uid: str, payload: dict, user: User = Depends(require_company)):
    if user.role != "admin" and not user.is_super_admin:
        raise HTTPException(403, "Admin only")
    role = payload.get("role")
    if role not in ("admin","staff","supervisor"):
        raise HTTPException(400, "Invalid role")
    await db.users.update_one({"user_id": uid, "company_id": user.company_id}, {"$set":{"role": role}})
    await audit(user.user_id, user.company_id, "user.role_update", {"user_id":uid,"role":role})
    return {"ok": True}

@api.post("/users/invite")
async def invite_user(payload: dict, user: User = Depends(require_company)):
    if user.role != "admin" and not user.is_super_admin:
        raise HTTPException(403, "Admin only")
    email = payload.get("email","").lower()
    role = payload.get("role","staff")
    if not email:
        raise HTTPException(400, "Email required")
    if role not in ("admin","staff","supervisor"):
        raise HTTPException(400, "Invalid role")
    existing = await db.users.find_one({"email": email})
    if existing:
        if existing.get("company_id"):
            raise HTTPException(409, "Pengguna sudah terdaftar di perusahaan lain")
        await db.users.update_one({"email":email}, {"$set":{"company_id": user.company_id, "role": role}})
        await audit(user.user_id, user.company_id, "user.invite_accepted", {"email": email, "role": role})
    else:
        await db.pending_invites.update_one(
            {"email": email, "company_id": user.company_id},
            {"$set":{"email":email,"company_id":user.company_id,"role":role,"created_at":iso(now_utc())}},
            upsert=True
        )
        await audit(user.user_id, user.company_id, "user.invite_pending", {"email": email, "role": role})
    return {"ok": True, "message": "Undangan tersimpan. Pengguna akan otomatis bergabung saat sign-in dengan email tersebut."}

# ============ AUDIT ============
async def audit(user_id: str, company_id: str, action: str, meta: dict):
    await db.audit_logs.insert_one({
        "audit_id": f"au_{uuid.uuid4().hex[:10]}",
        "user_id": user_id, "company_id": company_id,
        "action": action, "meta": meta,
        "created_at": iso(now_utc())
    })

@api.get("/audit-logs")
async def list_audit(user: User = Depends(require_company)):
    logs = await db.audit_logs.find({"company_id": user.company_id},{"_id":0}).sort("created_at",-1).to_list(500)
    return logs

# ============ PUBLIC CALCULATOR ============
class PublicCalcIn(BaseModel):
    scope: int
    category: str
    activity_data: float
    region: Optional[str] = "jamali"

@api.post("/public/calculate")
async def public_calc(payload: PublicCalcIn):
    q = {"scope": payload.scope, "category": payload.category}
    factor = await db.emission_factors.find_one(q, {"_id":0})
    if factor and factor.get("region") and factor["region"] != payload.region:
        alt = await db.emission_factors.find_one({"scope":payload.scope,"category":payload.category,"region":payload.region},{"_id":0})
        if alt: factor = alt
    if not factor:
        raise HTTPException(404, "Faktor tidak ditemukan")
    if factor["category"].startswith("refrigerant"):
        total = payload.activity_data * factor["factor"]
    else:
        total = payload.activity_data * factor["factor"] * factor.get("gwp",1.0)
    return {
        "activity_data": payload.activity_data, "unit": factor["unit"],
        "factor": factor["factor"], "gwp": factor.get("gwp",1.0),
        "total_kg_co2e": round(total,4), "total_tco2e": round(total/1000,6),
        "label": factor["label"], "source": factor["source"]
    }

# ============ REPORTS (CSV / PDF) ============
@api.get("/reports/csv")
async def report_csv(year: Optional[int]=None, user: User = Depends(require_company)):
    year = year or now_utc().year
    logs = await db.emission_logs.find({"company_id": user.company_id, "status":"approved", "period_year": year},{"_id":0}).to_list(5000)
    facilities = {f["facility_id"]:f["name"] for f in await db.facilities.find({"company_id": user.company_id},{"_id":0}).to_list(500)}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Tahun","Bulan","Fasilitas","Scope","Kategori","Data Aktivitas","Satuan","Faktor Emisi","GWP","Total kg CO2e","Total tCO2e","Status","Standar"])
    for l in logs:
        w.writerow([l["period_year"], l["period_month"], facilities.get(l["facility_id"],""), f"Scope {l['scope']}",
                    l["category"], l["activity_data"], l["unit"], l["factor_value"], l["gwp"],
                    round(l["total_kg_co2e"],4), round(l["total_kg_co2e"]/1000,6), l["status"], "GHG Protocol / GRI 305"])
    content = buf.getvalue()
    return Response(content=content, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="laporan_karbon_{year}.csv"'})

@api.get("/reports/pdf")
async def report_pdf(year: Optional[int]=None, user: User = Depends(require_company)):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import cm
    year = year or now_utc().year
    stats = await dashboard_stats(year=year, user=user)
    company = await db.companies.find_one({"company_id": user.company_id},{"_id":0})
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle('t', parent=styles['Title'], textColor=colors.HexColor('#1b4332'))
    story = []
    story.append(Paragraph("Laporan Inventarisasi GRK", title))
    story.append(Paragraph(f"<b>{company['name']}</b>", styles['Heading2']))
    story.append(Paragraph(f"Periode: {year} — Standar: GHG Protocol & GRI 305 (ISO 14064-1)", styles['Normal']))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(f"<b>Total Emisi:</b> {stats['total_tco2e']} tCO2e ({stats['total_kg_co2e']} kg CO2e)", styles['Normal']))
    story.append(Paragraph(f"<b>Intensitas Karbon:</b> {stats['intensity_per_employee_tco2e']} tCO2e/karyawan", styles['Normal']))
    story.append(Spacer(1, 0.4*cm))
    data = [["Scope","Emisi (kg CO2e)","Emisi (tCO2e)","% Total"]]
    tot = stats['total_kg_co2e'] or 1
    for s in [1,2,3]:
        v = stats['by_scope_kg'][s]
        data.append([f"Scope {s}", f"{v:,.2f}", f"{v/1000:,.4f}", f"{(v/tot)*100:.1f}%"])
    data.append(["TOTAL", f"{stats['total_kg_co2e']:,.2f}", f"{stats['total_tco2e']:,.4f}", "100%"])
    t = Table(data, colWidths=[4*cm,4*cm,4*cm,3*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1b4332')),
        ('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('GRID',(0,0),(-1,-1),0.5,colors.grey),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#f0f4ef')),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("<b>Rincian per Fasilitas</b>", styles['Heading3']))
    fac_data = [["Fasilitas","Total (kg CO2e)","Total (tCO2e)"]]
    for f in stats['by_facility']:
        fac_data.append([f['name'], f"{f['total_kg']:,.2f}", f"{f['total_kg']/1000:,.4f}"])
    if len(fac_data) > 1:
        ft = Table(fac_data, colWidths=[7*cm,4*cm,4*cm])
        ft.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#52796f')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),0.5,colors.grey)]))
        story.append(ft)
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(f"<i>Dokumen dihasilkan otomatis pada {now_utc().strftime('%d %B %Y')}.</i>", styles['Italic']))
    doc.build(story)
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="laporan_karbon_{year}.pdf"'})

@api.get("/reports/certificate")
async def report_certificate(year: Optional[int]=None, user: User = Depends(require_company)):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER
    year = year or now_utc().year
    stats = await dashboard_stats(year=year, user=user)
    company = await db.companies.find_one({"company_id": user.company_id},{"_id":0})
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1.5*cm, bottomMargin=1.5*cm, leftMargin=2*cm, rightMargin=2*cm)
    styles = getSampleStyleSheet()
    forest = colors.HexColor('#1b4332')
    sand = colors.HexColor('#f5f0e6')
    center_h1 = ParagraphStyle('h1', parent=styles['Title'], textColor=forest, fontSize=32, alignment=TA_CENTER, spaceAfter=6)
    center_sub = ParagraphStyle('sub', parent=styles['Normal'], textColor=colors.HexColor('#52796f'), fontSize=11, alignment=TA_CENTER, spaceAfter=20)
    center_big = ParagraphStyle('big', parent=styles['Normal'], textColor=forest, fontSize=56, alignment=TA_CENTER, spaceAfter=6, fontName='Helvetica-Bold')
    center_body = ParagraphStyle('body', parent=styles['Normal'], fontSize=13, alignment=TA_CENTER, spaceAfter=12)
    story = []
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("SERTIFIKAT INVENTARISASI KARBON", center_h1))
    story.append(Paragraph("KarbonKu — GHG Protocol · ISO 14064-1 · GRI 305", center_sub))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Diberikan kepada", center_body))
    story.append(Paragraph(f"<b>{escape(company['name'])}</b>", ParagraphStyle('co', parent=styles['Normal'], fontSize=22, alignment=TA_CENTER, textColor=forest, spaceAfter=14)))
    story.append(Paragraph(f"atas pencatatan & pelaporan emisi GRK periode <b>{year}</b>", center_body))
    story.append(Spacer(1, 0.6*cm))
    tot = stats['total_tco2e']
    story.append(Paragraph(f"{tot:,.2f}".replace(",","."), center_big))
    story.append(Paragraph("tonnes CO<sub>2</sub>e (Total Emisi Terverifikasi)", center_body))
    story.append(Spacer(1, 0.4*cm))
    scope_row = [["Scope 1 (Langsung)", "Scope 2 (Energi)", "Scope 3 (Rantai Nilai)"],
                 [f"{stats['by_scope_kg'][1]/1000:,.3f} tCO2e",
                  f"{stats['by_scope_kg'][2]/1000:,.3f} tCO2e",
                  f"{stats['by_scope_kg'][3]/1000:,.3f} tCO2e"]]
    t = Table(scope_row, colWidths=[7*cm]*3)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), sand),
        ('TEXTCOLOR',(0,0),(-1,0), forest),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 11),
        ('BOX',(0,0),(-1,-1), 0.75, forest),
        ('INNERGRID',(0,0),(-1,-1), 0.5, forest),
        ('TOPPADDING',(0,0),(-1,-1), 10),
        ('BOTTOMPADDING',(0,0),(-1,-1), 10),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.7*cm))
    story.append(Paragraph(f"Diterbitkan pada {now_utc().strftime('%d %B %Y')} · Ref: {user.company_id[-8:].upper()}-{year}",
                           ParagraphStyle('foot', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor('#78716c'))))
    doc.build(story)
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="sertifikat_karbon_{year}.pdf"'})

# ============ AI RECOMMENDATIONS ============
@api.post("/ai/recommendations")
async def ai_recommendations(user: User = Depends(require_company)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key belum dikonfigurasi")
    year = now_utc().year
    stats = await dashboard_stats(year=year, user=user)
    company = await db.companies.find_one({"company_id": user.company_id},{"_id":0})
    prompt = f"""Anda adalah konsultan ESG/Sustainability senior. Berdasarkan data emisi perusahaan berikut, berikan rekomendasi Decarbonization Roadmap dalam bahasa Indonesia.

Perusahaan: {company['name']}
Industri: {company.get('industry','N/A')}
Ukuran: {company.get('size','N/A')}
Tahun: {year}
Total Emisi: {stats['total_tco2e']} tCO2e
Scope 1: {stats['by_scope_kg'][1]/1000:.3f} tCO2e
Scope 2: {stats['by_scope_kg'][2]/1000:.3f} tCO2e
Scope 3: {stats['by_scope_kg'][3]/1000:.3f} tCO2e
Intensitas: {stats['intensity_per_employee_tco2e']} tCO2e/karyawan

Berikan output dalam format:
1. RINGKASAN EKSEKUTIF (2-3 kalimat)
2. TARGET REDUKSI 1-3-5 TAHUN (realistis)
3. 5 REKOMENDASI PRIORITAS (dengan estimasi penurunan emisi & tingkat kesulitan)
4. QUICK WINS (aksi <6 bulan)

Gunakan bahasa profesional namun mudah dipahami."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"reco_{user.company_id}",
                       system_message="Konsultan ESG Sustainability senior berbahasa Indonesia.").with_model("gemini","gemini-3-flash-preview")
        resp = await chat.send_message(UserMessage(text=prompt))
        return {"recommendations": resp, "generated_at": iso(now_utc())}
    except Exception as e:
        logging.exception("LLM error")
        raise HTTPException(500, f"Gagal menghasilkan rekomendasi: {e}")

# ============ SUPER ADMIN GLOBAL ============
async def require_super(user: User = Depends(get_current_user)):
    if not user.is_super_admin:
        raise HTTPException(403, "Super Admin Global only")
    return user

@api.get("/admin/stats")
async def admin_stats(_: User = Depends(require_super)):
    companies_count = await db.companies.count_documents({})
    logs = await db.emission_logs.find({}, {"_id":0}).to_list(20000)
    by_scope = {1:0.0,2:0.0,3:0.0}
    approved = pending = rejected = flagged = 0
    for l in logs:
        if l["status"] == "approved":
            approved += 1; by_scope[l["scope"]] += l["total_kg_co2e"]
        elif l["status"] == "draft": pending += 1
        elif l["status"] == "rejected": rejected += 1
        elif l["status"] == "flagged": flagged += 1
    # By industry
    cos = await db.companies.find({},{"_id":0}).to_list(500)
    by_industry = {}
    for c in cos:
        ind = c.get("industry","N/A") or "N/A"
        by_industry.setdefault(ind, {"companies":0, "emissions_kg":0})
        by_industry[ind]["companies"] += 1
    for l in logs:
        if l["status"] != "approved": continue
        co = next((c for c in cos if c["company_id"]==l["company_id"]), None)
        if co:
            ind = co.get("industry","N/A") or "N/A"
            by_industry.setdefault(ind, {"companies":0,"emissions_kg":0})
            by_industry[ind]["emissions_kg"] += l["total_kg_co2e"]
    return {
        "companies_count": companies_count,
        "total_kg": round(sum(by_scope.values()),2),
        "total_tco2e": round(sum(by_scope.values())/1000,4),
        "by_scope_kg": {k: round(v,2) for k,v in by_scope.items()},
        "counts": {"approved": approved, "pending": pending, "rejected": rejected, "flagged": flagged},
        "by_industry": [{"industry": k, **v, "emissions_kg": round(v["emissions_kg"],2)} for k,v in by_industry.items()],
    }

@api.get("/admin/companies")
async def admin_companies(q: Optional[str]=None, industry: Optional[str]=None, region: Optional[str]=None, _: User = Depends(require_super)):
    filt = {}
    if q: filt["name"] = {"$regex": q, "$options":"i"}
    if industry: filt["industry"] = industry
    if region: filt["region"] = region
    cos = await db.companies.find(filt,{"_id":0}).to_list(500)
    out = []
    for c in cos:
        logs = await db.emission_logs.find({"company_id": c["company_id"]}, {"_id":0}).to_list(5000)
        approved_kg = sum(l["total_kg_co2e"] for l in logs if l["status"]=="approved")
        status = "no_data"
        if any(l["status"]=="flagged" for l in logs): status="flagged"
        elif any(l["status"]=="draft" for l in logs): status="pending"
        elif any(l["status"]=="approved" for l in logs): status="approved"
        elif any(l["status"]=="rejected" for l in logs): status="rejected"
        out.append({**c, "total_kg_co2e": round(approved_kg,2),
                    "total_tco2e": round(approved_kg/1000,4),
                    "report_status": status, "log_count": len(logs)})
    return out

@api.get("/admin/companies/{cid}/emissions")
async def admin_company_emissions(cid: str, _: User = Depends(require_super)):
    logs = await db.emission_logs.find({"company_id": cid},{"_id":0}).sort("created_at",-1).to_list(5000)
    facilities = await db.facilities.find({"company_id": cid},{"_id":0}).to_list(500)
    company = await db.companies.find_one({"company_id": cid},{"_id":0})
    return {"company": company, "emissions": logs, "facilities": facilities}

@api.post("/admin/emissions/{lid}/review")
async def admin_review(lid: str, payload: dict, user: User = Depends(require_super)):
    action = payload.get("action")  # approve | flag | reject
    reason = payload.get("reason","")
    if action not in ("approve","flag","reject"):
        raise HTTPException(400, "action invalid")
    status_map = {"approve":"approved","flag":"flagged","reject":"rejected"}
    log = await db.emission_logs.find_one({"log_id": lid},{"_id":0})
    if not log: raise HTTPException(404, "Not found")
    old_status = log["status"]
    upd = {"status": status_map[action], "reviewed_by": user.user_id, "reviewed_at": iso(now_utc())}
    if action != "approve": upd["reject_reason"] = reason
    await db.emission_logs.update_one({"log_id": lid}, {"$set": upd})
    await audit(user.user_id, log["company_id"], f"admin.emission.{action}",
                {"log_id": lid, "old": old_status, "new": upd["status"], "reason": reason})
    return {"ok": True}

# --- Master data CRUD (Emission Factors) ---
class FactorIn(BaseModel):
    scope: int
    category: str
    label: str
    unit: str
    factor: float
    gwp: float = 1.0
    region: Optional[str] = None
    source: str = "Custom"

@api.post("/admin/emission-factors")
async def admin_add_factor(payload: FactorIn, user: User = Depends(require_super)):
    doc = {**payload.model_dump(), "factor_id": str(uuid.uuid4())}
    await db.emission_factors.insert_one(doc)
    doc.pop("_id", None)
    await audit(user.user_id, "GLOBAL", "admin.factor.create", doc)
    return doc

@api.put("/admin/emission-factors/{fid}")
async def admin_edit_factor(fid: str, payload: FactorIn, user: User = Depends(require_super)):
    old = await db.emission_factors.find_one({"factor_id": fid},{"_id":0})
    await db.emission_factors.update_one({"factor_id": fid}, {"$set": payload.model_dump()})
    await audit(user.user_id, "GLOBAL", "admin.factor.update", {"factor_id": fid, "old": old, "new": payload.model_dump()})
    return await db.emission_factors.find_one({"factor_id": fid},{"_id":0})

@api.delete("/admin/emission-factors/{fid}")
async def admin_del_factor(fid: str, user: User = Depends(require_super)):
    await db.emission_factors.delete_one({"factor_id": fid})
    await audit(user.user_id, "GLOBAL", "admin.factor.delete", {"factor_id": fid})
    return {"ok": True}

# --- Regions CRUD ---
class RegionIn(BaseModel):
    id: str
    name: str
    factor: float

@api.get("/admin/regions")
async def admin_list_regions(_: User = Depends(require_super)):
    stored = await db.regions.find({},{"_id":0}).to_list(200)
    if not stored: return REGIONS
    return stored

@api.post("/admin/regions")
async def admin_add_region(payload: RegionIn, user: User = Depends(require_super)):
    if await db.regions.count_documents({}) == 0:
        for r in REGIONS: await db.regions.insert_one({**r})
    await db.regions.update_one({"id": payload.id}, {"$set": payload.model_dump()}, upsert=True)
    await audit(user.user_id, "GLOBAL", "admin.region.upsert", payload.model_dump())
    return payload.model_dump()

@api.delete("/admin/regions/{rid}")
async def admin_del_region(rid: str, user: User = Depends(require_super)):
    await db.regions.delete_one({"id": rid})
    await audit(user.user_id, "GLOBAL", "admin.region.delete", {"id": rid})
    return {"ok": True}

# --- Facility/Asset Types ---
class TypeIn(BaseModel):
    kind: str  # facility_type | asset_type
    key: str
    label: str

@api.get("/admin/types")
async def admin_types(_: User = Depends(require_super)):
    return await db.master_types.find({},{"_id":0}).to_list(500)

@api.post("/admin/types")
async def admin_add_type(payload: TypeIn, user: User = Depends(require_super)):
    if payload.kind not in ("facility_type","asset_type"):
        raise HTTPException(400,"kind invalid")
    doc = payload.model_dump()
    await db.master_types.update_one({"kind": doc["kind"], "key": doc["key"]}, {"$set": doc}, upsert=True)
    await audit(user.user_id, "GLOBAL", "admin.type.upsert", doc)
    return doc

@api.delete("/admin/types/{kind}/{key}")
async def admin_del_type(kind: str, key: str, user: User = Depends(require_super)):
    await db.master_types.delete_one({"kind": kind, "key": key})
    await audit(user.user_id, "GLOBAL", "admin.type.delete", {"kind":kind,"key":key})
    return {"ok": True}

@api.get("/admin/audit-logs")
async def admin_audit_logs(_: User = Depends(require_super)):
    return await db.audit_logs.find({},{"_id":0}).sort("created_at",-1).to_list(1000)

# ============ SUPER ADMIN — Full Cross-Company CRUD ============
class AdminCompanyIn(BaseModel):
    name: str
    industry: Optional[str] = None
    size: Optional[str] = None
    region: Optional[str] = "jamali"
    org_boundary: Optional[str] = None
    employees: Optional[int] = 0
    annual_production: Optional[float] = 0

@api.post("/admin/companies")
async def admin_create_company(payload: AdminCompanyIn, user: User = Depends(require_super)):
    company_id = f"co_{uuid.uuid4().hex[:12]}"
    doc = {"company_id": company_id, **payload.model_dump(), "created_at": iso(now_utc())}
    await db.companies.insert_one(doc)
    doc.pop("_id", None)
    await audit(user.user_id, company_id, "admin.company.create", doc)
    return doc

@api.put("/admin/companies/{cid}")
async def admin_update_company(cid: str, payload: AdminCompanyIn, user: User = Depends(require_super)):
    old = await db.companies.find_one({"company_id": cid},{"_id":0})
    if not old: raise HTTPException(404, "Perusahaan tidak ditemukan")
    updates = {k:v for k,v in payload.model_dump().items() if v is not None}
    await db.companies.update_one({"company_id": cid}, {"$set": updates})
    await audit(user.user_id, cid, "admin.company.update", {"old": old, "new": updates})
    return await db.companies.find_one({"company_id": cid},{"_id":0})

@api.delete("/admin/companies/{cid}")
async def admin_delete_company(cid: str, user: User = Depends(require_super)):
    old = await db.companies.find_one({"company_id": cid},{"_id":0})
    if not old: raise HTTPException(404, "Perusahaan tidak ditemukan")
    await db.companies.delete_one({"company_id": cid})
    await db.facilities.delete_many({"company_id": cid})
    await db.assets.delete_many({"company_id": cid})
    await db.emission_logs.delete_many({"company_id": cid})
    await db.users.update_many({"company_id": cid, "is_super_admin": {"$ne": True}}, {"$set":{"company_id": None}})
    await audit(user.user_id, cid, "admin.company.delete", {"name": old.get("name")})
    return {"ok": True}

# --- Users cross-company ---
class AdminUserIn(BaseModel):
    email: EmailStr
    name: str
    role: str = "staff"

@api.get("/admin/companies/{cid}/users")
async def admin_company_users(cid: str, _: User = Depends(require_super)):
    return await db.users.find({"company_id": cid},{"_id":0}).to_list(500)

@api.post("/admin/companies/{cid}/users")
async def admin_add_user(cid: str, payload: AdminUserIn, user: User = Depends(require_super)):
    if payload.role not in ("admin","staff","supervisor"):
        raise HTTPException(400, "Invalid role")
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        if existing.get("company_id") and existing["company_id"] != cid:
            raise HTTPException(409, "Pengguna sudah terdaftar di perusahaan lain")
        await db.users.update_one({"email": email}, {"$set":{"company_id": cid, "role": payload.role, "name": payload.name}})
        uid = existing["user_id"]
    else:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": uid, "email": email, "name": payload.name, "picture": "",
            "company_id": cid, "role": payload.role, "is_super_admin": False,
            "created_at": iso(now_utc())
        })
    await audit(user.user_id, cid, "admin.user.add", {"email": email, "role": payload.role})
    return await db.users.find_one({"user_id": uid},{"_id":0})

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company_id: Optional[str] = None

@api.put("/admin/users/{uid}")
async def admin_update_user(uid: str, payload: AdminUserUpdate, user: User = Depends(require_super)):
    old = await db.users.find_one({"user_id": uid},{"_id":0})
    if not old: raise HTTPException(404, "User tidak ditemukan")
    if old.get("is_super_admin") and old["user_id"] != user.user_id:
        raise HTTPException(403, "Tidak dapat mengubah Super Admin lain")
    updates = {k:v for k,v in payload.model_dump().items() if v is not None}
    if "role" in updates and updates["role"] not in ("admin","staff","supervisor"):
        raise HTTPException(400, "Invalid role")
    await db.users.update_one({"user_id": uid}, {"$set": updates})
    await audit(user.user_id, updates.get("company_id", old.get("company_id","GLOBAL")), "admin.user.update", {"user_id": uid, "old": old, "new": updates})
    return await db.users.find_one({"user_id": uid},{"_id":0})

@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user: User = Depends(require_super)):
    old = await db.users.find_one({"user_id": uid},{"_id":0})
    if not old: raise HTTPException(404, "User tidak ditemukan")
    if old.get("is_super_admin"):
        raise HTTPException(403, "Tidak dapat menghapus Super Admin")
    await db.users.delete_one({"user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await audit(user.user_id, old.get("company_id","GLOBAL"), "admin.user.delete", {"user_id": uid, "email": old.get("email")})
    return {"ok": True}

# --- Facilities/Assets/Emissions cross-company ---
@api.post("/admin/companies/{cid}/facilities")
async def admin_add_facility(cid: str, payload: FacilityIn, user: User = Depends(require_super)):
    doc = {"facility_id": f"fc_{uuid.uuid4().hex[:10]}", "company_id": cid,
           **payload.model_dump(), "created_at": iso(now_utc())}
    await db.facilities.insert_one(doc); doc.pop("_id", None)
    await audit(user.user_id, cid, "admin.facility.create", doc)
    return doc

@api.put("/admin/facilities/{fid}")
async def admin_update_facility(fid: str, payload: FacilityIn, user: User = Depends(require_super)):
    old = await db.facilities.find_one({"facility_id": fid},{"_id":0})
    if not old: raise HTTPException(404, "Fasilitas tidak ditemukan")
    await db.facilities.update_one({"facility_id": fid}, {"$set": payload.model_dump()})
    await audit(user.user_id, old["company_id"], "admin.facility.update", {"facility_id": fid, "old": old, "new": payload.model_dump()})
    return await db.facilities.find_one({"facility_id": fid},{"_id":0})

@api.delete("/admin/facilities/{fid}")
async def admin_delete_facility(fid: str, user: User = Depends(require_super)):
    old = await db.facilities.find_one({"facility_id": fid},{"_id":0})
    if not old: raise HTTPException(404, "Fasilitas tidak ditemukan")
    await db.facilities.delete_one({"facility_id": fid})
    await audit(user.user_id, old["company_id"], "admin.facility.delete", {"facility_id": fid})
    return {"ok": True}

@api.get("/admin/companies/{cid}/assets")
async def admin_list_assets(cid: str, _: User = Depends(require_super)):
    return await db.assets.find({"company_id": cid},{"_id":0}).to_list(1000)

@api.post("/admin/companies/{cid}/assets")
async def admin_add_asset(cid: str, payload: AssetIn, user: User = Depends(require_super)):
    doc = {"asset_id": f"as_{uuid.uuid4().hex[:10]}", "company_id": cid,
           **payload.model_dump(), "created_at": iso(now_utc())}
    await db.assets.insert_one(doc); doc.pop("_id", None)
    await audit(user.user_id, cid, "admin.asset.create", doc)
    return doc

@api.delete("/admin/assets/{aid}")
async def admin_delete_asset(aid: str, user: User = Depends(require_super)):
    old = await db.assets.find_one({"asset_id": aid},{"_id":0})
    if not old: raise HTTPException(404, "Aset tidak ditemukan")
    await db.assets.delete_one({"asset_id": aid})
    await audit(user.user_id, old["company_id"], "admin.asset.delete", {"asset_id": aid})
    return {"ok": True}

class AdminEmissionUpdate(BaseModel):
    activity_data: Optional[float] = None
    period_year: Optional[int] = None
    period_month: Optional[int] = None
    notes: Optional[str] = None

@api.put("/admin/emissions/{lid}")
async def admin_update_emission(lid: str, payload: AdminEmissionUpdate, user: User = Depends(require_super)):
    old = await db.emission_logs.find_one({"log_id": lid},{"_id":0})
    if not old: raise HTTPException(404, "Log tidak ditemukan")
    updates = {k:v for k,v in payload.model_dump().items() if v is not None}
    if "activity_data" in updates:
        factor_val = old["factor_value"]; gwp = old.get("gwp",1.0)
        if old["category"].startswith("refrigerant"):
            total = updates["activity_data"] * factor_val
        else:
            total = updates["activity_data"] * factor_val * gwp
        updates["total_kg_co2e"] = round(total,4)
    await db.emission_logs.update_one({"log_id": lid}, {"$set": updates})
    await audit(user.user_id, old["company_id"], "admin.emission.update", {"log_id": lid, "old": old, "new": updates})
    return await db.emission_logs.find_one({"log_id": lid},{"_id":0})

@api.delete("/admin/emissions/{lid}")
async def admin_delete_emission(lid: str, user: User = Depends(require_super)):
    old = await db.emission_logs.find_one({"log_id": lid},{"_id":0})
    if not old: raise HTTPException(404, "Log tidak ditemukan")
    await db.emission_logs.delete_one({"log_id": lid})
    await audit(user.user_id, old["company_id"], "admin.emission.delete", {"log_id": lid})
    return {"ok": True}

# ============ HEALTH ============
@api.get("/")
async def root():
    return {"message": "Carbon Tracker API", "status": "ok"}

app.include_router(api)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS','*').split(','),
    allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
