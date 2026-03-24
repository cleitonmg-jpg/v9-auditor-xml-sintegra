import type { CompanyInfo, Record50, Record61, SintegraData } from "@shared/schema";

function formatDate(rawDate: string): string {
  const cleaned = rawDate.replace(/-/g, "");
  if (cleaned.length === 8) {
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6);
    const day = cleaned.substring(6, 8);
    return `${day}/${month}/${year}`;
  }
  return rawDate;
}

function parseValue(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) ? 0 : n / 100;
}

// Fast header read — extracts only company name and CNPJ from Registro 10/11
export function readSintegraHeader(content: string): CompanyInfo {
  let name = "";
  let cnpj = "";
  for (const line of content.split(/\r?\n/).slice(0, 30)) {
    if (line.length < 2) continue;
    const t = line.substring(0, 2);
    if (t === "10") {
      cnpj = line.substring(2, 16).trim();
      name = line.substring(30, 65).trim();
    }
    if (t === "11" && !name) {
      name = line.substring(2, 49).trim();
    }
    if (cnpj && name) break;
  }
  return { name, cnpj };
}

export function parseSintegra(content: string): SintegraData {
  const lines = content.split(/\r?\n/);

  let companyName10 = "";
  let companyName11 = "";
  let cnpj = "";
  const records50: Record50[] = [];
  const records61: Record61[] = [];

  // First pass: collect header info
  for (const line of lines) {
    if (line.length < 2) continue;
    const recordType = line.substring(0, 2);

    if (recordType === "10") {
      cnpj = line.substring(2, 16).trim();
      companyName10 = line.substring(30, 65).trim();
    }

    if (recordType === "11") {
      companyName11 = line.substring(2, 49).trim();
    }
  }

  const companyName = companyName10 || companyName11;
  const companyInfo: CompanyInfo = { name: companyName, cnpj };

  // Second pass: collect records 50 and 61
  for (const line of lines) {
    if (line.length < 2) continue;
    const recordType = line.substring(0, 2);

    // Registro 50 - Nota Fiscal (modelos 01, 1-A, 02, 55, 65)
    // [0:2]   tipo
    // [2:16]  cnpj (14)
    // [16:30] ie (14)
    // [30:38] data AAAAMMDD (8)
    // [38:40] uf (2)
    // [40:42] modelo (2)
    // [42:45] serie (3)
    // [45:51] numero NF (6)
    // [51:55] cfop (4)
    // [55:56] emitente P/T (1)
    // [56:69] valor total (13)
    // [69:82] base calculo ICMS (13)
    // [82:95] valor ICMS (13)
    // [95:108] isenta/NT (13)
    // [108:121] outras (13)
    // [121:125] aliquota ICMS (4)
    // [125:126] situacao S=Cancelada (1)
    if (recordType === "50" && line.length >= 126) {
      const nfCnpj = line.substring(2, 16).trim();
      const ie = line.substring(16, 30).trim();
      const rawDate = line.substring(30, 38).trim();
      const date = formatDate(rawDate);
      const uf = line.substring(38, 40).trim();
      const modelo = line.substring(40, 42).trim();
      const serie = line.substring(42, 45).trim();
      const numero = line.substring(45, 51).trim();
      const cfop = line.substring(51, 55).trim();
      const emitente = line.substring(55, 56).trim();
      const valorTotal = parseValue(line.substring(56, 69));
      const baseCalculo = parseValue(line.substring(70, 83));
      const valorICMS = parseValue(line.substring(83, 95));
      const isentaNT = parseValue(line.substring(95, 108));
      const outras = parseValue(line.substring(108, 121));
      const aliquota = parseValue(line.substring(121, 125));
      const situacao = line.substring(125, 126).trim();
      const cancelada = situacao === "S";

      records50.push({
        id: `50-${rawDate}-${numero}-${Math.random().toString(36).substr(2, 6)}`,
        cnpj: nfCnpj,
        ie,
        date,
        uf,
        modelo,
        serie,
        numero,
        cfop,
        emitente,
        valorTotal: Math.round(valorTotal * 100) / 100,
        baseCalculo: Math.round(baseCalculo * 100) / 100,
        valorICMS: Math.round(valorICMS * 100) / 100,
        isentaNT: Math.round(isentaNT * 100) / 100,
        outras: Math.round(outras * 100) / 100,
        aliquota: Math.round(aliquota * 100) / 100,
        situacao,
        cancelada,
      });
    }

    // Registro 61 - Cupom Fiscal ECF/PDV / NFC-e
    // [0:2]   tipo
    // [2:16]  cnpj (14)
    // [16:30] ie (14)
    // [30:38] data (8)
    // [38:40] modelo (2)
    // [40:44] serie NFC-e (4)
    // [45:51] num ini cupom (6)
    // [51:57] num fim cupom (6)
    // [57:70] valor total (13)
    if (recordType === "61" && line.charAt(2) === " " && line.length >= 70) {
      const cupCnpj = line.substring(2, 16).trim();
      const ie = line.substring(16, 30).trim();
      const rawDate = line.substring(30, 38).trim();
      const date = formatDate(rawDate);
      const modelo = line.substring(38, 40).trim();
      const numOrdemECF = line.substring(40, 44).trim();
      const numIniCupom = line.substring(45, 51).trim();
      const numFinCupom = line.substring(51, 57).trim();
      const valorTotal = parseValue(line.substring(57, 70));

      records61.push({
        id: `61-${rawDate}-${numOrdemECF}-${numIniCupom}-${Math.random().toString(36).substr(2, 6)}`,
        cnpj: cupCnpj,
        ie,
        date,
        numMapaResumo: "",
        modelo,
        numOrdemECF,
        numIniCupom,
        numFinCupom,
        valorTotal: Math.round(valorTotal * 100) / 100,
      });
    }
  }

  return {
    companyInfo,
    records50,
    records61,
  };
}
