export const APP_VERSION = "1.0.0";

import { z } from "zod";

export const companyInfoSchema = z.object({
  name: z.string(),
  cnpj: z.string(),
});
export type CompanyInfo = z.infer<typeof companyInfoSchema>;

// Registro 50 - Nota Fiscal modelos 01, 1-A, 02, 55, 65
export const record50Schema = z.object({
  id: z.string(),
  cnpj: z.string(),
  ie: z.string(),
  date: z.string(),
  uf: z.string(),
  modelo: z.string(),
  serie: z.string(),
  numero: z.string(),
  cfop: z.string(),
  emitente: z.string(),
  valorTotal: z.number(),
  baseCalculo: z.number(),
  valorICMS: z.number(),
  isentaNT: z.number(),
  outras: z.number(),
  aliquota: z.number(),
  situacao: z.string(),
  cancelada: z.boolean(),
});
export type Record50 = z.infer<typeof record50Schema>;

// Registro 61 - Cupom Fiscal ECF/PDV
export const record61Schema = z.object({
  id: z.string(),
  cnpj: z.string(),
  ie: z.string(),
  date: z.string(),
  numMapaResumo: z.string(),
  modelo: z.string(),
  numOrdemECF: z.string(),
  numIniCupom: z.string(),
  numFinCupom: z.string(),
  valorTotal: z.number(),
});
export type Record61 = z.infer<typeof record61Schema>;

export interface SintegraData {
  companyInfo: CompanyInfo;
  records50: Record50[];
  records61: Record61[];
}

// XML NF-e / NFC-e parsed record
export const xmlNFeSchema = z.object({
  id: z.string(),
  numero: z.string(),
  serie: z.string(),
  modelo: z.string(),         // "55" or "65"
  dataEmissao: z.string(),    // DD/MM/YYYY
  valorTotal: z.number(),
  chaveAcesso: z.string(),
  cancelada: z.boolean(),
  fileName: z.string(),
});
export type XmlNFe = z.infer<typeof xmlNFeSchema>;

// Result of cross-reference
export type AuditStatus =
  | "ok"
  | "divergencia"
  | "somente_sintegra"
  | "somente_xml"
  | "cancelado_xml"
  | "cancelado_sintegra";

export interface AuditRecord {
  id: string;
  numero: string;
  serie: string;
  modelo: string;
  dataEmissao: string;
  status: AuditStatus;
  // SINTEGRA side
  sintegraValor: number | null;
  sintegraRecord: Record50 | null;
  // XML side
  xmlValor: number | null;
  xmlRecord: XmlNFe | null;
  // Difference (xmlValor - sintegraValor), 0 if one side missing
  diferenca: number;
}

export interface AuditResult {
  companyInfo: CompanyInfo;
  records: AuditRecord[];
  totalSintegra: number;
  totalXml: number;
  totalOk: number;
  totalDivergencia: number;
  totalSomenteStegra: number;
  totalSomenteXml: number;
  totalCancelados: number;
  records61: Record61[]; // ECF records shown separately
}
