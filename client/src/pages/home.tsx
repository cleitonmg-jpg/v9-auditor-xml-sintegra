import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, FileText, FolderOpen, BarChart3, CheckCircle2,
  AlertTriangle, XCircle, FileX, FilePlus, RotateCcw,
  Building2, Search, ChevronDown, ChevronUp, Printer, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseSintegra, readSintegraHeader, readSintegraReference } from "@/lib/sintegra-parser";
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

function AuditTable({ records, search, showCancelledValues = false }: { records: AuditRecord[]; search: string; showCancelledValues?: boolean }) {
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
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">CFOP</th>
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
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground" title={r.sintegraRecord?.cfop || ""}>
                {(() => {
                  const cfop = r.sintegraRecord?.cfop || "";
                  if (!cfop) return <span className="opacity-40">—</span>;
                  const parts = cfop.split(",").map(c => c.trim()).filter(Boolean);
                  return parts.length > 1
                    ? <span className="italic opacity-70">Múlt.</span>
                    : cfop;
                })()}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {(r.status === "cancelado_sintegra" || r.status === "cancelado_xml") && !showCancelledValues
                  ? <span className="text-muted-foreground">—</span>
                  : r.sintegraValor !== null ? fmtBRL(r.sintegraValor) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {(r.status === "cancelado_sintegra" || r.status === "cancelado_xml") && !showCancelledValues
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
          {showCancelledValues ? (
            // Cancelled tab: show subtotals per model + grand total
            <>
              {(["55", "65"] as const).map((mod) => {
                const modRecs = sorted.filter((r) => r.modelo === mod);
                if (modRecs.length === 0) return null;
                const tXml = modRecs.reduce((s, r) => s + (r.xmlValor ?? 0), 0);
                return (
                  <tr key={mod} className="text-xs opacity-80">
                    <td colSpan={5} className="px-3 py-1.5">Subtotal Mod.{mod} ({modRecs.length})</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">—</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtBRL(tXml)}</td>
                    <td colSpan={2} className="px-3 py-1.5" />
                  </tr>
                );
              })}
              <tr className="border-t">
                <td colSpan={5} className="px-3 py-2">Total ({sorted.length} cancelados)</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right font-mono">
                  {fmtBRL(sorted.reduce((s, r) => s + (r.xmlValor ?? 0), 0))}
                </td>
                <td colSpan={2} className="px-3 py-2" />
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={5} className="px-3 py-2">Total ({sorted.length} registros)</td>
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
          )}
        </tfoot>
      </table>
    </div>
  );
}

// ── Print ───────────────────────────────────────────────────────────────────

function printRecords(title: string, records: AuditRecord[], company: { name: string; cnpj: string }, showCancelledValues = false) {
  const win = window.open("", "_blank", "width=960,height=720");
  if (!win) return;

  const valid = (r: AuditRecord) => r.status !== "cancelado_sintegra" && r.status !== "cancelado_xml";
  const totalSint = records.filter(valid).reduce((s, r) => s + (r.sintegraValor ?? 0), 0);
  const totalXml  = records.filter(valid).reduce((s, r) => s + (r.xmlValor ?? 0), 0);

  const bgMap: Record<AuditStatus, string> = {
    ok: "", divergencia: "background:#fef3c7",
    somente_sintegra: "background:#dbeafe", somente_xml: "background:#f3e8ff",
    cancelado_sintegra: "opacity:.55", cancelado_xml: "opacity:.55",
  };

  const rows = records.map((r) => {
    const cancelled = !valid(r);
    return `<tr style="${bgMap[r.status]}">
      <td>${r.numero}</td><td>${r.serie || "—"}</td><td>${r.dataEmissao || "—"}</td>
      <td style="text-align:center">${r.modelo}</td>
      <td style="text-align:right">${(cancelled && !showCancelledValues) ? "—" : r.sintegraValor !== null ? "R$ " + fmtBRL(r.sintegraValor) : "—"}</td>
      <td style="text-align:right">${(cancelled && !showCancelledValues) ? "—" : r.xmlValor !== null ? "R$ " + fmtBRL(r.xmlValor) : "—"}</td>
      <td style="text-align:right">${r.diferenca !== 0 ? (r.diferenca > 0 ? "+" : "") + fmtBRL(r.diferenca) : "—"}</td>
      <td>${statusLabel(r.status)}</td>
    </tr>`;
  }).join("");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
    h2{font-size:15px;margin:0 0 2px}
    .sub{color:#666;font-size:10px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse}
    th{background:#f4f4f5;padding:5px 7px;text-align:left;border-bottom:2px solid #ccc;font-size:10px}
    td{padding:4px 7px;border-bottom:1px solid #eee}
    tfoot td{font-weight:700;background:#f4f4f5;border-top:2px solid #ccc}
    @media print{@page{margin:15mm}}
  </style></head><body>
  <h2>Auditor XML × SINTEGRA — ${title}</h2>
  <div class="sub">${company.name} &nbsp;·&nbsp; CNPJ: ${company.cnpj} &nbsp;·&nbsp; ${new Date().toLocaleDateString("pt-BR")}</div>
  <table>
    <thead><tr><th>Nº Nota</th><th>Série</th><th>Data</th><th>Mod.</th>
      <th>Valor SINTEGRA</th><th>Valor XML</th><th>Diferença</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="4">Total (${records.length} registros — ${records.filter(valid).length} válidos)</td>
      <td style="text-align:right">R$ ${fmtBRL(totalSint)}</td>
      <td style="text-align:right">R$ ${fmtBRL(totalXml)}</td>
      <td></td><td></td>
    </tr></tfoot>
  </table>
  <script>window.onload=()=>window.print();</script>
  </body></html>`);
  win.document.close();
}

// ── Export CSV (opens in Excel) ──────────────────────────────────────────────

function exportCsv(title: string, records: AuditRecord[], company: { name: string; cnpj: string }) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const num = (v: number | null) => v !== null ? v.toFixed(2).replace(".", ",") : "";

  const header = ["Nº Nota", "Série", "Data Emissão", "Modelo", "Valor SINTEGRA", "Valor XML", "Diferença", "Status"];

  const rows = records.map((r) => {
    const sint = r.sintegraValor !== null ? num(r.sintegraValor) : "";
    const xml  = r.xmlValor !== null ? num(r.xmlValor) : "";
    const diff = r.diferenca !== 0 ? num(r.diferenca) : "";
    return [r.numero, r.serie || "", r.dataEmissao || "", r.modelo, sint, xml, diff, statusLabel(r.status)]
      .map(esc).join(";");
  });

  // Footer: totals excl. cancelled
  const valid = (r: AuditRecord) => r.status !== "cancelado_sintegra" && r.status !== "cancelado_xml";
  const tSint = records.filter(valid).reduce((s, r) => s + (r.sintegraValor ?? 0), 0);
  const tXml  = records.filter(valid).reduce((s, r) => s + (r.xmlValor ?? 0), 0);
  const tDiff = records.filter(valid).reduce((s, r) => s + r.diferenca, 0);
  const footerRow = [
    `"Total (${records.length} registros — ${records.filter(valid).length} válidos)"`,
    `""`, `""`, `""`,
    esc(num(tSint)), esc(num(tXml)), esc(num(tDiff)), `""`,
  ].join(";");

  const lines = [
    `${esc("Auditor XML × SINTEGRA — " + title)}`,
    `${esc(company.name)};${esc("CNPJ: " + company.cnpj)}`,
    "",
    header.map(esc).join(";"),
    ...rows,
    footerRow,
  ];

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}_${company.cnpj}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const [previewPeriod, setPreviewPeriod] = useState<{ mes: number; ano: number } | null>(null);
  const [modoExigencia, setModoExigencia] = useState(false);

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
      setPreviewPeriod(readSintegraReference(text));
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
      const reference = readSintegraReference(sintegraText);
      const { nfes, cancelamentos, erros, emitCnpj, fora_periodo } = await parseXmlFiles(xmlFiles, reference ?? undefined);

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

      const auditResult = auditar(sintegraData, nfes, cancelamentos, modoExigencia);
      setResult(auditResult);

      if (fora_periodo.length > 0 && reference) {
        toast({
          title: `${fora_periodo.length} XML(s) fora do período ${String(reference.mes).padStart(2,"0")}/${reference.ano}`,
          description: `Ignorados: ${fora_periodo.slice(0, 3).join(", ")}${fora_periodo.length > 3 ? ` e mais ${fora_periodo.length - 3}...` : ""}`,
          variant: "destructive",
        });
      }

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
    setPreviewPeriod(null);
    if (sintegraInputRef.current) sintegraInputRef.current.value = "";
    if (xmlInputRef.current) xmlInputRef.current.value = "";
  }, []);

  const [activeTab, setActiveTab] = useState("todos");

  // ── Derived data ──

  const records55 = result?.records.filter((r) => r.modelo === "55") ?? [];
  const records65 = result?.records.filter((r) => r.modelo === "65") ?? [];
  const recordsSomenteStegra = result?.records.filter((r) => r.status === "somente_sintegra") ?? [];
  const recordsSomenteXml = result?.records.filter((r) => r.status === "somente_xml") ?? [];
  const recordsDivergencia = result?.records.filter((r) => r.status === "divergencia") ?? [];
  const recordsCancelados = result?.records.filter(
    (r) => r.status === "cancelado_sintegra" || r.status === "cancelado_xml"
  ) ?? [];
  const totalXmlCancelados = recordsCancelados.reduce((s, r) => s + (r.xmlValor ?? 0), 0);

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
                  {previewPeriod && (
                    <span className="ml-2 px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono">
                      {String(previewPeriod.mes).padStart(2,"0")}/{previewPeriod.ano}
                    </span>
                  )}
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

          <div className="flex flex-col items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={modoExigencia}
                onChange={(e) => setModoExigencia(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="font-medium">Modo Exigência</span>
              <span className="text-muted-foreground text-xs">(diferença ≥ R$ 0,01 = divergência)</span>
            </label>
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
          {([
            { label: "OK",              value: result.totalOk,           tab: "todos",          icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-700 bg-green-50 border-green-200" },
            { label: "Divergências",    value: result.totalDivergencia,  tab: "divergencias",   icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-700 bg-amber-50 border-amber-200" },
            { label: "Falta no XML",    value: result.totalSomenteStegra,tab: "falta_xml",      icon: <FileX className="w-4 h-4" />, color: "text-blue-700 bg-blue-50 border-blue-200" },
            { label: "Falta SINTEGRA",  value: result.totalSomenteXml,   tab: "falta_sintegra", icon: <FilePlus className="w-4 h-4" />, color: "text-purple-700 bg-purple-50 border-purple-200" },
          ] as const).map((c) => (
            <div
              key={c.tab}
              className={`rounded-xl border p-4 flex items-center gap-3 cursor-pointer hover:brightness-95 transition ${c.color}`}
              onClick={() => setActiveTab(c.tab)}
            >
              {c.icon}
              <div>
                <p className="text-2xl font-bold leading-none">{c.value}</p>
                <p className="text-xs mt-0.5 opacity-80">{c.label}</p>
              </div>
            </div>
          ))}
          {/* Cancelados card — clicável + mostra total XML cancelado */}
          <div
            className="rounded-xl border p-4 flex items-center gap-3 cursor-pointer hover:brightness-95 transition text-gray-600 bg-gray-50 border-gray-200"
            onClick={() => setActiveTab("cancelados")}
          >
            <XCircle className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none">{result.totalCancelados}</p>
              <p className="text-xs mt-0.5 opacity-80">Cancelados</p>
              {totalXmlCancelados > 0 && (
                <p className="text-xs font-mono mt-1 text-gray-500">XML: R$ {fmtBRL(totalXmlCancelados)}</p>
              )}
            </div>
          </div>
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
            {recordsCancelados.length > 0 && (
              <TabsTrigger value="cancelados">
                <XCircle className="w-3.5 h-3.5 mr-1 text-gray-500" />
                Cancelados <Badge variant="secondary" className="ml-1 text-xs">{recordsCancelados.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* helper to render tab content with print button */}
          {(["todos", "nfe55", "nfce65", "divergencias", "falta_xml", "falta_sintegra", "cancelados"] as const).map((tab) => {
            const tabData: Record<string, { records: AuditRecord[]; label: string; info?: React.ReactNode }> = {
              todos:         { records: result.records,        label: "Todos" },
              nfe55:         { records: records55,             label: "NF-e Mod.55" },
              nfce65:        { records: records65,             label: "NFC-e Mod.65" },
              divergencias:  { records: recordsDivergencia,   label: "Divergências",
                info: <div className="mb-3 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm"><AlertTriangle className="w-4 h-4 shrink-0" />Documentos com diferença de valor entre SINTEGRA e XML superior a R$ 0,02</div> },
              falta_xml:     { records: recordsSomenteStegra, label: "Falta no XML",
                info: <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm"><FileX className="w-4 h-4 shrink-0" />Registros presentes no SINTEGRA sem correspondente XML na pasta selecionada</div> },
              falta_sintegra:{ records: recordsSomenteXml,    label: "Falta no SINTEGRA",
                info: <div className="mb-3 flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-sm"><FilePlus className="w-4 h-4 shrink-0" />Documentos XML válidos sem correspondente no SINTEGRA</div> },
              cancelados:    { records: recordsCancelados,    label: "Cancelados",
                info: <div className="mb-3 flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm"><XCircle className="w-4 h-4 shrink-0" />Documentos cancelados — não entram nos totais</div> },
            };
            const d = tabData[tab];
            if (!d) return null;
            const isCancelTab = tab === "cancelados";
            return (
              <TabsContent key={tab} value={tab} className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  {d.info ?? <span />}
                  <div className="flex gap-2 shrink-0 ml-2">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => exportCsv(d.label, d.records, result.companyInfo)}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-green-600" />
                      Excel
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => printRecords(d.label, d.records, result.companyInfo, isCancelTab)}
                    >
                      <Printer className="w-3.5 h-3.5 mr-1.5" />
                      Imprimir
                    </Button>
                  </div>
                </div>
                <AuditTable records={d.records} search={search} showCancelledValues={isCancelTab} />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
