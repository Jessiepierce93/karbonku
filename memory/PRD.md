# KarbonKu — Product Requirements & Progress

## Problem Statement
Aplikasi web berbahasa Indonesia untuk perhitungan & pendataan karbon perusahaan berbasis GHG Protocol (Scope 1, 2, 3) & ISO 14064-1, ekspor sesuai GRI 305. Rumus: Emisi (kg CO2e) = Data Kegiatan × Faktor Emisi × GWP. Faktor emisi dari IPCC, DEFRA, KLHK/ESDM. Wilayah awal: Jabodetabek (Grid Jamali 0.87 kgCO2e/kWh).

## Personas
- **Super Admin Global** (email: aryadhanes7@gmail.com) — kelola lintas perusahaan, master data, review global.
- **Admin Perusahaan** — kelola perusahaan sendiri: user, fasilitas, laporan, approval.
- **Staf / Operator** — input data emisi (draft).
- **Supervisor / Tim EHS** — approve/reject data draft.

## Tech
- Frontend: React 19 + Tailwind + Shadcn/UI + Recharts + Phosphor Icons + Framer Motion
- Backend: FastAPI + Motor (MongoDB)
- Auth: Emergent Google OAuth
- AI: Gemini 3 Flash via Emergent LLM Key
- Export: reportlab (PDF) + CSV
- Design: Organic & Earthy (Forest Green #1b4332, Warm Sand background)

## Implemented (Iterasi 1 — Feb 2026)
- ✅ Landing publik (edukatif Scope 1/2/3 + Kalkulator Publik + export CSV/PDF)
- ✅ Auth Emergent Google OAuth (auto super_admin untuk aryadhanes7@gmail.com)
- ✅ Sign Up Perusahaan + Onboarding profil bisnis
- ✅ Master data Fasilitas & Aset (CRUD)
- ✅ Log Emisi Scope 1/2/3 dengan anti-double-entry (fasilitas+kategori+periode)
- ✅ Kalkulasi otomatis + refrigerant GWP handling
- ✅ Approval workflow (draft → approved/rejected dengan alasan)
- ✅ Dashboard Analytics (per Scope, tren bulanan, per fasilitas, intensitas per karyawan/produksi)
- ✅ Ekspor laporan CSV + PDF (GHG Protocol/GRI 305)
- ✅ AI Decarbonization Roadmap (Gemini 3 Flash)
- ✅ Manajemen User + Undangan berbasis email
- ✅ Audit Trail per-company
- ✅ **Super Admin Global Dashboard** (rekap lintas-perusahaan, ranking, komposisi Scope)
- ✅ **Admin CRUD** faktor emisi, wilayah, tipe fasilitas/aset dinamis
- ✅ **Tinjau lintas-perusahaan**: Approve / Flag (Kekurangan) / Reject
- ✅ Audit Trail Global

## Status
- Backend: 40/40 tests passed (100%)
- Design: Organic & Earthy sesuai design_guidelines.json
- Region grid seeded: Jamali/Sumatera/Kalimantan/Sulawesi

## Backlog (P1)
- Notifikasi email real-time saat draft menunggu approval (Resend integration)
- Upload dokumen bukti (Object Storage)
- Multi-year comparison YoY di dashboard
- Bulk import CSV data emisi
- Role permission matrix yang lebih granular (custom roles)
- Filter time (kwartalan) di dashboard perusahaan
- Delete/soft-delete company oleh Super Admin
