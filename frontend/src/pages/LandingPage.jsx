import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { Factory, Lightning, Truck, Leaf, ChartBar, FileArrowDown } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const HERO_IMG = "https://images.unsplash.com/photo-1675116731363-c17d957f3444?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA5NTd8MHwxfHNlYXJjaHwyfHx3aW5kJTIwdHVyYmluZSUyMGdyZWVuJTIwbGFuZHNjYXBlfGVufDB8fHx8MTc4Nzc1MTYwNXww&ixlib=rb-4.1.0&q=85";

function handleGoogleSignIn() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

const SCOPE_INFO = [
  { n: 1, icon: Factory, title: "Scope 1 — Emisi Langsung", desc: "Emisi dari sumber yang dimiliki/dikendalikan perusahaan: BBM kendaraan, genset, boiler, dan kebocoran refrigerant AC/chiller.", color: "scope-1-bg", text: "scope-1-text" },
  { n: 2, icon: Lightning, title: "Scope 2 — Energi Terbeli", desc: "Emisi dari listrik PLN, uap, atau pendingin yang dibeli. Menggunakan faktor emisi grid lokal (Jamali 0,87 kgCO2e/kWh).", color: "scope-2-bg", text: "scope-2-text" },
  { n: 3, icon: Truck, title: "Scope 3 — Rantai Nilai", desc: "Emisi tidak langsung dari perjalanan dinas, logistik, komuting karyawan, dan aktivitas hulu-hilir lainnya.", color: "scope-3-bg", text: "scope-3-text" },
];

function PublicCalculator() {
  const [scope, setScope] = useState("2");
  const [category, setCategory] = useState("");
  const [factors, setFactors] = useState([]);
  const [region, setRegion] = useState("jamali");
  const [regions, setRegions] = useState([]);
  const [activity, setActivity] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/regions").then(r => setRegions(r.data));
  }, []);

  useEffect(() => {
    api.get("/emission-factors", { params: { scope: Number(scope) } }).then(r => {
      const list = r.data.filter(f => !f.region || f.region === region);
      setFactors(list);
      if (list.length && !list.find(f => f.category === category)) setCategory(list[0].category);
    });
  }, [scope, region]);

  const calculate = async () => {
    if (!category || !activity) {
      toast.error("Lengkapi kategori dan data aktivitas");
      return;
    }
    try {
      const { data } = await api.post("/public/calculate", {
        scope: Number(scope), category, region, activity_data: Number(activity),
      });
      setResult(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menghitung");
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const csv = `Label,Data Aktivitas,Satuan,Faktor Emisi,GWP,Total kg CO2e,Total tCO2e,Sumber\n"${result.label}",${result.activity_data},${result.unit},${result.factor},${result.gwp},${result.total_kg_co2e},${result.total_tco2e},"${result.source}"`;
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "kalkulator_karbon_publik.csv";
    link.click();
  };

  const exportPdf = () => {
    if (!result) return;
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Kalkulator Karbon</title>
      <style>body{font-family:Arial;padding:32px;color:#1c1917}h1{color:#1b4332}.row{padding:6px 0;border-bottom:1px solid #eee}.total{font-size:24px;color:#1b4332;font-weight:bold;margin-top:16px}</style></head>
      <body><h1>Hasil Kalkulator Karbon</h1>
      <div class="row"><b>Aktivitas:</b> ${result.label}</div>
      <div class="row"><b>Data Aktivitas:</b> ${result.activity_data} ${result.unit}</div>
      <div class="row"><b>Faktor Emisi:</b> ${result.factor} kg CO2e/${result.unit}</div>
      <div class="row"><b>GWP:</b> ${result.gwp}</div>
      <div class="row"><b>Sumber:</b> ${result.source}</div>
      <div class="total">Total: ${result.total_kg_co2e} kg CO2e (${result.total_tco2e} tCO2e)</div>
      <p style="margin-top:24px;color:#666;font-size:12px">Kalkulator publik — hasil tidak disimpan. Untuk pencatatan berkala, daftarkan perusahaan Anda.</p>
      </body></html>`);
    win.print();
  };

  return (
    <Card className="p-6 md:p-8 card-flat" data-testid="public-calculator-card">
      <div className="flex items-center gap-3 mb-6">
        <ChartBar size={28} weight="duotone" className="text-primary" />
        <div>
          <h3 className="text-xl md:text-2xl font-semibold">Kalkulator Karbon Publik</h3>
          <p className="text-sm text-muted-foreground">Hitung cepat tanpa perlu login. Hasil dapat diekspor CSV/PDF.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label>Scope</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger data-testid="calc-scope-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Scope 1 — Langsung</SelectItem>
              <SelectItem value="2">Scope 2 — Energi</SelectItem>
              <SelectItem value="3">Scope 3 — Rantai Nilai</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Wilayah / Grid</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger data-testid="calc-region-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Kategori Aktivitas</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="calc-category-select"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
            <SelectContent>
              {factors.map(f => <SelectItem key={f.factor_id} value={f.category}>{f.label} ({f.unit})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data Aktivitas</Label>
          <Input type="number" min="0" step="0.01" placeholder="Contoh: 1000"
            value={activity} onChange={e => setActivity(e.target.value)} data-testid="calc-activity-input" />
        </div>
      </div>
      <Button onClick={calculate} className="w-full md:w-auto" data-testid="calc-submit-btn">Hitung Emisi</Button>

      {result && (
        <div className="mt-6 p-6 rounded-md border border-primary/20 bg-primary/5" data-testid="calc-result">
          <div className="text-sm text-muted-foreground">Rumus: Data Kegiatan × Faktor Emisi × GWP</div>
          <div className="text-3xl md:text-4xl font-display font-bold text-primary mt-2">
            {result.total_kg_co2e.toLocaleString('id-ID')} <span className="text-lg">kg CO2e</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">≈ {result.total_tco2e.toLocaleString('id-ID')} tCO2e — {result.label} · Sumber: {result.source}</div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={exportCsv} data-testid="calc-export-csv"><FileArrowDown size={16}/> Ekspor CSV</Button>
            <Button variant="outline" size="sm" onClick={exportPdf} data-testid="calc-export-pdf"><FileArrowDown size={16}/> Ekspor PDF</Button>
          </div>
          <div className="mt-4 text-sm text-primary">
            <b>Ingin mencatat & menyimpan jejak karbon perusahaanmu?</b>{" "}
            <button onClick={handleGoogleSignIn} className="underline font-semibold" data-testid="calc-cta-signup">Daftarkan perusahaan Anda</button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function LandingPage() {
  const { user, company } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf size={28} weight="fill" className="text-primary" />
            <span className="font-display font-bold text-lg">KarbonKu</span>
            <span className="hidden md:inline text-xs text-muted-foreground ml-2">Inventarisasi GRK Perusahaan</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to={company ? "/dashboard" : "/signup-company"}>
                <Button data-testid="header-dashboard-btn">Masuk Dashboard</Button>
              </Link>
            ) : (
              <>
                <Button variant="ghost" onClick={handleGoogleSignIn} data-testid="header-signin-btn">Sign In</Button>
                <Button onClick={handleGoogleSignIn} data-testid="header-signup-btn">Sign Up</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="marketing-hero">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{duration:0.6}}>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-4">GHG PROTOCOL · ISO 14064-1 · GRI 305</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-none">
              Hitung, Catat, & Laporkan <span className="text-primary">Jejak Karbon</span> Perusahaan Anda.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl">
              Platform inventarisasi Gas Rumah Kaca berbasis GHG Protocol untuk Scope 1, 2, & 3.
              Faktor emisi terverifikasi (IPCC, DEFRA, KLHK) dengan grid Jamali otomatis.
            </p>
            <div className="mt-8 flex gap-3">
              <Button size="lg" onClick={handleGoogleSignIn} data-testid="hero-signup-btn">Daftarkan Perusahaan</Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("calc")?.scrollIntoView({behavior:"smooth"})} data-testid="hero-try-calc-btn">
                Coba Kalkulator Gratis
              </Button>
            </div>
          </motion.div>
          <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{duration:0.7}}
              className="relative">
            <img src={HERO_IMG} alt="Sustainability" className="rounded-md w-full h-[400px] object-cover" />
            <div className="absolute -bottom-6 -left-6 bg-card border border-border rounded-md p-4 shadow-sm">
              <div className="text-xs text-muted-foreground">Grid Jamali</div>
              <div className="text-2xl font-display font-bold text-primary">0.87</div>
              <div className="text-xs text-muted-foreground">kgCO2e / kWh</div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2">Edukasi</div>
        <h2 className="text-3xl md:text-4xl font-display font-semibold mb-4">Memahami Scope 1, 2, dan 3</h2>
        <p className="text-muted-foreground max-w-2xl mb-10">
          GHG Protocol mengelompokkan emisi perusahaan menjadi tiga kategori untuk memudahkan pengukuran dan pengelolaan.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {SCOPE_INFO.map(s => (
            <motion.div key={s.n} initial={{opacity:0, y:20}} whileInView={{opacity:1, y:0}} viewport={{once:true}}
              transition={{delay: s.n*0.1}}>
              <Card className={`p-6 h-full card-flat ${s.color}`}>
                <s.icon size={40} weight="duotone" className={s.text} />
                <h3 className="mt-4 text-xl font-display font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="calc" className="bg-muted/30 border-y border-border">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-20">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2">Coba Gratis</div>
          <h2 className="text-3xl md:text-4xl font-display font-semibold mb-6">Hitung Emisi dalam Hitungan Detik</h2>
          <PublicCalculator />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-display font-semibold">Siap mengelola karbon perusahaan Anda?</h2>
        <p className="mt-4 text-muted-foreground">Sign Up sekali, dan mulai catat inventarisasi GRK secara berkala.</p>
        <Button size="lg" className="mt-6" onClick={handleGoogleSignIn} data-testid="footer-signup-btn">Sign Up dengan Google</Button>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 text-sm text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Leaf size={20} weight="fill" className="text-primary" />
            <span>KarbonKu · Platform Inventarisasi GRK</span>
          </div>
          <div>© {new Date().getFullYear()} · Standar GHG Protocol, ISO 14064-1, GRI 305</div>
        </div>
      </footer>
    </div>
  );
}
