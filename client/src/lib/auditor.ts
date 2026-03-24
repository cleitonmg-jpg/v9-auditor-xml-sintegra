import type {
  SintegraData,
  XmlNFe,
  AuditRecord,
  AuditResult,
  Record50,
  AuditStatus,
} from "@shared/schema";

const TOLERANCE = 0.02; // R$ 0,02 tolerance for float comparison

function normNum(n: string): string {
  return String(parseInt(n, 10) || 0);
}

function makeKey(modelo: string, numero: string): string {
  return `${modelo.trim()}-${normNum(numero)}`;
}

export function auditar(
  sintegraData: SintegraData,
  xmlNfes: XmlNFe[],
  cancelamentosXml: XmlNFe[]
): AuditResult {
  const { companyInfo, records50, records61 } = sintegraData;

  // Build set of cancelled XML chaves/numbers per model
  const canceladosXmlKeys = new Set<string>();
  for (const c of cancelamentosXml) {
    if (c.numero) {
      canceladosXmlKeys.add(makeKey(c.modelo, c.numero));
    }
  }

  // Save XML values of cancelled NF-e BEFORE filtering them out.
  // This lets us show the XML value even for cancelled mod.55/65 records.
  const cancelledXmlValues = new Map<string, number>();
  for (const nfe of xmlNfes) {
    if (nfe.modelo !== "55" && nfe.modelo !== "65") continue;
    const key = makeKey(nfe.modelo, nfe.numero);
    if (canceladosXmlKeys.has(key) && nfe.valorTotal > 0) {
      cancelledXmlValues.set(key, nfe.valorTotal);
    }
  }

  // Filter XML records: remove those that have a cancellation
  // Only keep model 55 and 65
  const xmlValidos = xmlNfes.filter((nfe) => {
    if (nfe.modelo !== "55" && nfe.modelo !== "65") return false;
    const key = makeKey(nfe.modelo, nfe.numero);
    return !canceladosXmlKeys.has(key);
  });

  // Build map: key -> XmlNFe
  // If duplicates exist, prefer the authorized (cancelada=false) one
  const xmlMap = new Map<string, XmlNFe>();
  for (const nfe of xmlValidos) {
    const key = makeKey(nfe.modelo, nfe.numero);
    const existing = xmlMap.get(key);
    if (!existing || (!nfe.cancelada && existing.cancelada)) {
      xmlMap.set(key, nfe);
    }
  }

  // Build map from SINTEGRA Reg50: key -> Record50
  // Only model 55 (emitente=P próprio)
  // Multiple lines per NF (different CFOP/aliquota) → sum valorTotal
  const sintegraMap = new Map<string, Record50>();
  for (const r of records50) {
    const modelo = r.modelo.trim();
    if (modelo !== "55") continue;
    if (r.emitente.trim() !== "P") continue;
    const key = makeKey(modelo, r.numero);
    const existing = sintegraMap.get(key);
    if (!existing) {
      sintegraMap.set(key, { ...r });
    } else {
      // Same NF, different CFOP/aliquota line — accumulate total
      existing.valorTotal = Math.round((existing.valorTotal + r.valorTotal) * 100) / 100;
    }
  }

  // NFC-e (mod.65) in SINTEGRA is in Registro 61, not Registro 50.
  // Each record61 line corresponds to one cupom (numIniCupom = nNF in XML).
  // Cupom is cancelled if valorTotal=0 OR if there's a matching procEvento XML.
  for (const r of records61) {
    if (r.modelo.trim() !== "65") continue;
    const nNF = String(parseInt(r.numIniCupom, 10));
    const key = makeKey("65", nNF);
    const cancelada = r.valorTotal === 0 || canceladosXmlKeys.has(key);
    const existing = sintegraMap.get(key);
    if (!existing) {
      sintegraMap.set(key, {
        id: r.id,
        cnpj: r.cnpj,
        ie: r.ie,
        date: r.date,
        uf: "",
        modelo: "65",
        serie: r.numOrdemECF,
        numero: nNF,
        cfop: "",
        emitente: "P",
        valorTotal: r.valorTotal,
        baseCalculo: 0,
        valorICMS: 0,
        isentaNT: 0,
        outras: 0,
        aliquota: 0,
        situacao: cancelada ? "S" : "",
        cancelada,
      });
    } else {
      existing.valorTotal = Math.round((existing.valorTotal + r.valorTotal) * 100) / 100;
      if (cancelada) existing.cancelada = true;
    }
  }

  const auditRecords: AuditRecord[] = [];

  // Collect all keys from both sides
  const allKeys = new Set<string>([
    ...Array.from(xmlMap.keys()),
    ...Array.from(sintegraMap.keys()),
  ]);

  for (const key of Array.from(allKeys)) {
    const xmlRec = xmlMap.get(key) ?? null;
    const sintRec = sintegraMap.get(key) ?? null;

    const numero = xmlRec?.numero ?? normNum(sintRec?.numero ?? "");
    const serie = xmlRec?.serie ?? (sintRec?.serie?.trim() ?? "");
    const modelo = xmlRec?.modelo ?? sintRec?.modelo?.trim() ?? "";
    const dataEmissao = xmlRec?.dataEmissao || sintRec?.date || "";

    const sintegraValor = sintRec ? sintRec.valorTotal : null;
    // For cancelled NF-e whose authorized XML was removed from xmlValidos,
    // recover the value from cancelledXmlValues so it's visible in the report.
    const xmlValor = xmlRec
      ? xmlRec.valorTotal
      : (cancelledXmlValues.get(key) ?? null);

    let status: AuditStatus;
    let diferenca = 0;

    if (sintRec?.cancelada && !xmlRec) {
      // Cancelled in SINTEGRA, no XML
      status = "cancelado_sintegra";
    } else if (sintRec && xmlRec) {
      if (sintRec.cancelada) {
        // Cancelled documents: never show a difference
        status = "cancelado_sintegra";
      } else if (Math.abs(Math.round((xmlValor! - sintegraValor!) * 100) / 100) > TOLERANCE) {
        diferenca = Math.round((xmlValor! - sintegraValor!) * 100) / 100;
        status = "divergencia";
      } else {
        status = "ok";
        diferenca = 0;
      }
    } else if (sintRec && !xmlRec) {
      if (sintRec.cancelada) {
        status = "cancelado_sintegra";
      } else {
        status = "somente_sintegra";
      }
    } else if (!sintRec && xmlRec) {
      status = "somente_xml";
    } else {
      status = "ok";
    }

    auditRecords.push({
      id: key,
      numero,
      serie,
      modelo,
      dataEmissao,
      status,
      sintegraValor,
      sintegraRecord: sintRec,
      xmlValor,
      xmlRecord: xmlRec,
      diferenca,
    });
  }

  // Sort by model then by number
  auditRecords.sort((a, b) => {
    if (a.modelo !== b.modelo) return a.modelo.localeCompare(b.modelo);
    return parseInt(a.numero) - parseInt(b.numero);
  });

  // Compute totals
  const totalOk = auditRecords.filter((r) => r.status === "ok").length;
  const totalDivergencia = auditRecords.filter((r) => r.status === "divergencia").length;
  const totalSomenteStegra = auditRecords.filter((r) => r.status === "somente_sintegra").length;
  const totalSomenteXml = auditRecords.filter((r) => r.status === "somente_xml").length;
  const totalCancelados = auditRecords.filter(
    (r) => r.status === "cancelado_sintegra" || r.status === "cancelado_xml"
  ).length;

  // Totals: only valid (non-cancelled) documents
  const totalSintegra = auditRecords
    .filter((r) => r.status !== "cancelado_sintegra" && r.status !== "cancelado_xml")
    .reduce((s, r) => s + (r.sintegraValor ?? 0), 0);

  const totalXml = auditRecords
    .filter((r) => r.status !== "cancelado_sintegra" && r.status !== "cancelado_xml")
    .reduce((s, r) => s + (r.xmlValor ?? 0), 0);

  return {
    companyInfo,
    records: auditRecords,
    totalSintegra: Math.round(totalSintegra * 100) / 100,
    totalXml: Math.round(totalXml * 100) / 100,
    totalOk,
    totalDivergencia,
    totalSomenteStegra,
    totalSomenteXml,
    totalCancelados,
    records61,
  };
}

export function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
