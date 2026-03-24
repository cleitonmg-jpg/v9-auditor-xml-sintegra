import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, FileText, FolderOpen, BarChart3, CheckCircle2,
  AlertTriangle, XCircle, FileX, FilePlus, RotateCcw,
  Building2, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseSintegra, readSintegraHeader } from "@/lib/sintegra-parser";
import type { CompanyInfo } from "@shared/schema";
import { parseXmlFiles } from "@/lib/xml-parser";
import { auditar, fmtBRL } from "@/lib/auditor";
import type { AuditResult, AuditRecord, AuditStatus } from "@shared/schema";
import { APP_VERSION } from "@shared/schema";

// ── helpers ────────────────────────────────────────────────────────────────

function statusLabel(s: AuditStatus): string {
  switch (s) {
    case "ok": return "OK";
    case "divergencia": return "DIVERGÊNCIA";
    case "somente_sintegra": return "Falta no XML";
    case "somente_xml": return "Falta no SINTEGRA";
    case "cancelado_sintegra": return "Cancelado";
    case "cancelado_xml": return "Cancelado (XML)";
  }
}

function rowBg(s: AuditStatus): string {
  switch (s) {
    case "ok": return "";
    case "divergencia": return "bg-amber-50 border-l-4 border-l-amber-400";
    case "somente_sintegra": return "bg-blue-50 border-l-4 border-l-blue-400";
    case "somente_xml": return "bg-purple-50 border-l-4 border-l-purple-400";
    case "cancelado_sintegra":
    case "cancelado_xml": return "bg-gray-50 opacity-60";
  }
}

function statusBadge(s: AuditStatus) {
  switch (s) {
    case "ok":
      return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">OK</Badge>;
    case "divergencia":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">Divergência</Badge>;
    case "somente_sintegra":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Falta no XML</Badge>;
    case "somente_xml":
      return <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">Falta no SINTEGRA</Badge>;
    case "cancelado_sintegra":
    case "cancelado_xml":
      return <Badge variant="secondary" className="text-xs">Cancelado</Badge>;
  }
}

// ── Table component ─────────────────────────────────────────────────────────

function AuditTable({ records, search }: { records: AuditRecord[]; search: string }) {
  const [sortField, setSortField] = useState<string>("numero");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.numero.includes(q) ||
      r.serie.toLowerCase().includes(q) ||
      r.dataEmissao.includes(q) ||
      statusLabel(r.status).toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    switch (sortField) {
      case "numero": av = parseInt(a.numero) || 0; bv = parseInt(b.numero) || 0; break;
      case "data": av = a.dataEmissao; bv = b.dataEmissao; break;
      case "serie": av = a.serie; bv = b.serie; break;
      case "sintegra": av = a.sintegraValor ?? -1; bv = b.sintegraValor ?? -1; break;
      case "xml": av = a.xmlValor ?? -1; bv = b.xmlValor ?? -1; break;
      case "diff": av = Math.abs(a.diferenca); bv = Math.abs(b.diferenca); break;
      case "status": av = a.status; bv = b.status; break;
    }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  function Th({ field, label }: { field: string; label: string }) {
    const active = sortField === field;
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
        onClick={() => { if (active) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(true); } }}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
        </span>
      </th>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum registro encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <Th field="numero" label="Nº Nota" />
            <Th field="serie" label="Série" />
            <Th field="data" label="Data Emissão" />
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Modelo</th>
            <Th field="sintegra" label="Valor SINTEGRA" />
            <Th field="xml" label="Valor XML" />
            <Th field="diff" label="Diferença" />
            <Th field="status" label="Status" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((r) => (
            <tr key={r.id} className={`${rowBg(r.status)} hover:brightness-95 transition-colors`}>
              <td className="px-3 py-2 font-mono font-medium">{r.numero}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.serie || "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.dataEmissao || "—"}</td>
              <td className="px-3 py-2 text-center">
                <Badge variant="outline" className="text-xs font-mono">{r.modelo}</Badge>
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {r.status === "cancelado_sintegra" || r.status === "cancelado_xml"
                  ? <span className="text-muted-foreground">—</span>
                  : r.sintegraValor !== null ? fmtBRL(r.sintegraValor) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {r.status === "cancelado_sintegra" || r.status === "cancelado_xml"
                  ? <span className="text-muted-foreground">—</span>
                  : r.xmlValor !== null ? fmtBRL(r.xmlValor) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className={`px-3 py-2 text-right font-mono font-semibold ${r.diferenca !== 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                {r.diferenca !== 0
                  ? (r.diferenca > 0 ? "+" : "") + fmtBRL(r.diferenca)
                  : "—"}
              </td>
              <td className="px-3 py-2">{statusBadge(r.status)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 border-t font-semibold text-sm">
          <tr>
            <td colSpan={4} className="px-3 py-2">Total ({sorted.length} registros)</td>
            <td className="px-3 py-2 text-right font-mono">
              {fmtBRL(sorted.filter((r) => r.status !== "cancelado_sintegra" && r.status !== "cancelado_xml").reduce((s, r) => s + (r.sintegraValor ?? 0), 0))}
            </td>
            <td className="px-3 py-2 text-right font-mono">
              {fmtBRL(sorted.filter((r) => r.status !== "cancelado_sintegra" && r.status !== "cancelado_xml").reduce((s, r) => s + (r.xmlValor ?? 0), 0))}
            </td>
            <td className="px-3 py-2 text-right font-mono text-amber-700">
              {(() => {
                const diff = sorted.reduce((s, r) => s + r.diferenca, 0);
                return diff !== 0 ? (diff > 0 ? "+" : "") + fmtBRL(diff) : "—";
              })()}
            </td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const { toast } = useToast();

  const [sintegraFile, setSintegraFile] = useState<File | null>(null);
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<CompanyInfo | null>(null);

  const sintegraInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const [siteStats, setSiteStats] = useState<{ totalVisits: number; onlineNow: number } | null>(null);

  useEffect(() => {
    // Register visit on first load
    fetch("/api/visit", { method: "POST" })
      .then((r) => r.json())
      .then(setSiteStats)
      .catch(() => {});

    // Heartbeat every 30s to keep user marked as online
    const interval = setInterval(() => {
      fetch("/api/ping", { method: "POST" })
        .then((r) => r.json())
        .then(setSiteStats)
        .catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  // ── Handlers ──

  const loadSintegraPreview = useCallback((file: File) => {
    setSintegraFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPreviewInfo(readSintegraHeader(text));
    };
    reader.readAsText(file, "latin1");
  }, []);

  const handleSintegraDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".txt")) {
      loadSintegraPreview(file);
    } else {
      toast({ title: "Arquivo inválido", description: "Selecione um arquivo .txt SINTEGRA.", variant: "destructive" });
    }
  }, [toast, loadSintegraPreview]);

  const handleXmlFolder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const xmlOnly = files.filter((f) => f.name.toLowerCase().endsWith(".xml"));
    setXmlFiles(xmlOnly);
    if (xmlOnly.length === 0) {
      toast({ title: "Nenhum XML encontrado", description: "A pasta não contém arquivos .xml.", variant: "destructive" });
    }
  }, [toast]);

  const handleProcess = useCallback(async () => {
    if (!sintegraFile) {
      toast({ title: "SINTEGRA não carregado", description: "Selecione o arquivo SINTEGRA (.txt).", variant: "destructive" });
      return;
    }
    if (xmlFiles.length === 0) {
      toast({ title: "XMLs não selecionados", description: "Selecione a pasta com os XMLs.", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      // Read SINTEGRA
      const sintegraText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(sintegraFile, "latin1");
      });

      const sintegraData = parseSintegra(sintegraText);
      const { nfes, cancelamentos, erros, emitCnpj } = await parseXmlFiles(xmlFiles);

      // Validate CNPJ: SINTEGRA Reg.10 must match <emit><CNPJ> in the XMLs
      const sintCnpj = sintegraData.companyInfo.cnpj.replace(/\D/g, "");
      const xmlCnpj = emitCnpj.replace(/\D/g, "");
      if (sintCnpj && xmlCnpj && sintCnpj !== xmlCnpj) {
        toast({
          title: "CNPJ divergente — cruzamento bloqueado",
          description: `SINTEGRA: ${sintCnpj} · XMLs: ${xmlCnpj}. Os arquivos pertencem a empresas diferentes.`,
          variant: "destructive",
        });
        setProcessing(false);
        return;
      }

      const auditResult = auditar(sintegraData, nfes, cancelamentos);
      setResult(auditResult);

      if (erros.length > 0) {
        toast({
          title: `${erros.length} XML(s) com erro`,
          description: `Não foi possível processar: ${erros.slice(0, 3).join(", ")}${erros.length > 3 ? "..." : ""}`,
        });
      }

      toast({
        title: "Cruzamento concluído",
        description: `${auditResult.records.length} documentos analisados. ${auditResult.totalDivergencia} divergências.`,
      });
    } catch (err) {
      toast({ title: "Erro ao processar", description: String(err), variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [sintegraFile, xmlFiles, toast]);

  const handleReset = useCallback(() => {
    setSintegraFile(null);
    setXmlFiles([]);
    setResult(null);
    setSearch("");
    setPreviewInfo(null);
    if (sintegraInputRef.current) sintegraInputRef.current.value = "";
    if (xmlInputRef.current) xmlInputRef.current.value = "";
  }, []);

  // ── Derived data ──

  const records55 = result?.records.filter((r) => r.modelo === "55") ?? [];
  const records65 = result?.records.filter((r) => r.modelo === "65") ?? [];
  const recordsSomenteStegra = result?.records.filter((r) => r.status === "somente_sintegra") ?? [];
  const recordsSomenteXml = result?.records.filter((r) => r.status === "somente_xml") ?? [];
  const recordsDivergencia = result?.records.filter((r) => r.status === "divergencia") ?? [];

  // ── Render: Upload ──

  if (!result) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-lg p-2">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground text-base leading-tight">Auditor XML × SINTEGRA</h1>
              {previewInfo?.name ? (
                <p className="text-xs text-foreground font-medium">
                  {previewInfo.name}
                  <span className="text-muted-foreground font-mono ml-2">{previewInfo.cnpj}</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">V9 INFORMATICA — (37) 4141-0341</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {siteStats && (
              <>
                <span title="Visitas totais">👁 {siteStats.totalVisits.toLocaleString("pt-BR")} visitas</span>
                <span title="Usuários online agora" className="text-green-600 font-medium">● {siteStats.onlineNow} online</span>
              </>
            )}
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">v{APP_VERSION}</span>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Cruzamento de Documentos Fiscais</h2>
            <p className="text-muted-foreground text-sm">
              Carregue o arquivo SINTEGRA e a pasta com os XMLs para cruzar NF-e (Mod.55) e NFC-e (Mod.65)
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* SINTEGRA upload */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <FileText className="w-4 h-4 text-primary" />
                Arquivo SINTEGRA (.txt)
              </div>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                } ${sintegraFile ? "bg-green-50 border-green-400" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleSintegraDrop}
                onClick={() => sintegraInputRef.current?.click()}
              >
                <input
                  ref={sintegraInputRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) loadSintegraPreview(f);
                  }}
                />
                {sintegraFile ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
                    <p className="text-green-700 font-medium text-sm">{sintegraFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(sintegraFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground">Formato: .txt (SINTEGRA)</p>
                  </div>
                )}
              </div>
            </div>

            {/* XML folder */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <FolderOpen className="w-4 h-4 text-primary" />
                Pasta com XMLs (NF-e / NFC-e)
              </div>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  xmlFiles.length > 0 ? "bg-green-50 border-green-400" : "border-border hover:border-primary/50"
                }`}
                onClick={() => xmlInputRef.current?.click()}
              >
                <input
                  ref={xmlInputRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  multiple
                  accept=".xml"
                  className="hidden"
                  onChange={handleXmlFolder}
                />
                {xmlFiles.length > 0 ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
                    <p className="text-green-700 font-medium text-sm">{xmlFiles.length} arquivo(s) XML</p>
                    <p className="text-xs text-muted-foreground">Prontos para processamento</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Clique para selecionar a pasta</p>
                    <p className="text-xs text-muted-foreground">XML: NF-e (55), NFC-e (65), Cancelamentos</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
            {[
              { icon: <FileText className="w-4 h-4" />, label: "NF-e Mod.55", sub: "Reg. 50 SINTEGRA" },
              { icon: <FileText className="w-4 h-4" />, label: "NFC-e Mod.65", sub: "Reg. 61 SINTEGRA" },
              { icon: <XCircle className="w-4 h-4" />, label: "Cancelamentos", sub: "tpEvento 110111" },
              { icon: <AlertTriangle className="w-4 h-4" />, label: "Divergências", sub: "Valores diferentes" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg p-3">
                {item.icon}
                <div>
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleProcess}
              disabled={processing || !sintegraFile || xmlFiles.length === 0}
              className="px-10"
            >
              {processing ? "Processando..." : "Processar Cruzamento"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Results ──

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary rounded-lg p-2 shrink-0">
            <BarChart3 className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold text-sm truncate">{result.companyInfo.name || "Empresa"}</span>
              <span className="text-xs text-muted-foreground font-mono hidden sm:inline">{result.companyInfo.cnpj}</span>
            </div>
            <p className="text-xs text-muted-foreground">Auditor XML × SINTEGRA · V9 INFORMATICA</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {siteStats && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <span>👁 {siteStats.totalVisits.toLocaleString("pt-BR")}</span>
              <span className="text-green-600 font-medium">● {siteStats.onlineNow} online</span>
              <span className="font-mono bg-muted px-2 py-0.5 rounded">v{APP_VERSION}</span>
            </div>
          )}
          <Button size="sm" onClick={handleReset} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Novo
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              label: "OK",
              value: result.totalOk,
              icon: <CheckCircle2 className="w-4 h-4" />,
              color: "text-green-700 bg-green-50 border-green-200",
            },
            {
              label: "Divergências",
              value: result.totalDivergencia,
              icon: <AlertTriangle className="w-4 h-4" />,
              color: "text-amber-700 bg-amber-50 border-amber-200",
            },
            {
              label: "Falta no XML",
              value: result.totalSomenteStegra,
              icon: <FileX className="w-4 h-4" />,
              color: "text-blue-700 bg-blue-50 border-blue-200",
            },
            {
              label: "Falta no SINTEGRA",
              value: result.totalSomenteXml,
              icon: <FilePlus className="w-4 h-4" />,
              color: "text-purple-700 bg-purple-50 border-purple-200",
            },
            {
              label: "Cancelados",
              value: result.totalCancelados,
              icon: <XCircle className="w-4 h-4" />,
              color: "text-gray-600 bg-gray-50 border-gray-200",
            },
          ].map((c, i) => (
            <div key={i} className={`rounded-xl border p-4 flex items-center gap-3 ${c.color}`}>
              {c.icon}
              <div>
                <p className="text-2xl font-bold leading-none">{c.value}</p>
                <p className="text-xs mt-0.5 opacity-80">{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Totals comparison */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Total SINTEGRA (Reg.50 mod.55 + Reg.61 mod.65)</p>
            <p className="text-xl font-bold font-mono">R$ {fmtBRL(result.totalSintegra)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Total XML (documentos válidos)</p>
            <p className="text-xl font-bold font-mono">R$ {fmtBRL(result.totalXml)}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, data, status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="todos">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="todos">
              Todos <Badge variant="secondary" className="ml-1 text-xs">{result.records.length}</Badge>
            </TabsTrigger>
            {records55.length > 0 && (
              <TabsTrigger value="nfe55">
                NF-e Mod.55 <Badge variant="secondary" className="ml-1 text-xs">{records55.length}</Badge>
              </TabsTrigger>
            )}
            {records65.length > 0 && (
              <TabsTrigger value="nfce65">
                NFC-e Mod.65 <Badge variant="secondary" className="ml-1 text-xs">{records65.length}</Badge>
              </TabsTrigger>
            )}
            {recordsDivergencia.length > 0 && (
              <TabsTrigger value="divergencias">
                <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                Divergências <Badge className="ml-1 text-xs bg-amber-100 text-amber-800 border-amber-200">{recordsDivergencia.length}</Badge>
              </TabsTrigger>
            )}
            {recordsSomenteStegra.length > 0 && (
              <TabsTrigger value="falta_xml">
                Falta no XML <Badge className="ml-1 text-xs bg-blue-100 text-blue-800 border-blue-200">{recordsSomenteStegra.length}</Badge>
              </TabsTrigger>
            )}
            {recordsSomenteXml.length > 0 && (
              <TabsTrigger value="falta_sintegra">
                Falta no SINTEGRA <Badge className="ml-1 text-xs bg-purple-100 text-purple-800 border-purple-200">{recordsSomenteXml.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="todos" className="mt-4">
            <AuditTable records={result.records} search={search} />
          </TabsContent>

          <TabsContent value="nfe55" className="mt-4">
            <AuditTable records={records55} search={search} />
          </TabsContent>

          <TabsContent value="nfce65" className="mt-4">
            <AuditTable records={records65} search={search} />
          </TabsContent>

          <TabsContent value="divergencias" className="mt-4">
            <div className="mb-3 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Documentos com diferença de valor entre SINTEGRA e XML superior a R$ 0,02
            </div>
            <AuditTable records={recordsDivergencia} search={search} />
          </TabsContent>

          <TabsContent value="falta_xml" className="mt-4">
            <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
              <FileX className="w-4 h-4 shrink-0" />
              Registros presentes no SINTEGRA sem correspondente XML na pasta selecionada
            </div>
            <AuditTable records={recordsSomenteStegra} search={search} />
          </TabsContent>

          <TabsContent value="falta_sintegra" className="mt-4">
            <div className="mb-3 flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-sm">
              <FilePlus className="w-4 h-4 shrink-0" />
              Documentos XML válidos sem correspondente no SINTEGRA
            </div>
            <AuditTable records={recordsSomenteXml} search={search} />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
