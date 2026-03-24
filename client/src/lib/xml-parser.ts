import type { XmlNFe } from "@shared/schema";

function getTagText(doc: Document | Element, tagName: string): string {
  const el = doc.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() ?? "";
}

function formatISODate(dhEmi: string): string {
  // dhEmi format: 2024-01-15T10:30:00-03:00 or 2024-01-15
  if (!dhEmi) return "";
  const datePart = dhEmi.substring(0, 10); // YYYY-MM-DD
  const [year, month, day] = datePart.split("-");
  if (year && month && day) return `${day}/${month}/${year}`;
  return dhEmi;
}

// Extract NF number from chave de acesso (44 digits)
// Structure: cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + ...
function nNFFromChave(chave: string): string {
  if (chave.length >= 34) {
    return String(parseInt(chave.substring(25, 34), 10));
  }
  return "";
}

function parseNFe(xmlText: string, fileName: string): XmlNFe | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) return null;

  // Check if it's a cancellation event (procEvento / evento)
  const tpEvento = getTagText(doc, "tpEvento");
  if (tpEvento === "110111") {
    // This is a cancellation event
    const cStat = getTagText(doc, "cStat");
    const xMotivo = getTagText(doc, "xMotivo");

    if (cStat === "135" && xMotivo.toLowerCase().includes("evento registrado")) {
      // Get chNFe to extract the NF number
      const chNFe = getTagText(doc, "chNFe");
      const nNF = nNFFromChave(chNFe);

      // Extract mod from chave
      const mod = chNFe.length >= 22 ? chNFe.substring(20, 22) : "";
      const serie = chNFe.length >= 25 ? String(parseInt(chNFe.substring(22, 25), 10)) : "";

      return {
        id: `cancel-${chNFe || fileName}`,
        numero: nNF,
        serie,
        modelo: mod,
        dataEmissao: "",
        valorTotal: 0,
        chaveAcesso: chNFe,
        cancelada: true,
        fileName,
      };
    }
    return null;
  }

  // Regular NF-e or NFC-e
  // Authorization status must come from infProt element specifically.
  // Files without infProt are raw XMLs (no protocol yet) — skip them
  // so they don't pollute the cancelamentos list.
  const infProt = doc.getElementsByTagName("infProt")[0];
  if (!infProt) return null;

  const cStat = getTagText(infProt, "cStat");
  const xMotivo = getTagText(infProt, "xMotivo");

  // Valid if cStat=100 (Autorizado o uso da NF-e)
  const autorizado = cStat === "100";

  // Get NF data
  const nNF = getTagText(doc, "nNF");
  const serie = getTagText(doc, "serie");
  const mod = getTagText(doc, "mod");
  const dhEmi = getTagText(doc, "dhEmi");

  // Get total value - try vNF under ICMSTot first, then vNFTot
  let valorTotal = 0;
  const icmsTot = doc.getElementsByTagName("ICMSTot")[0];
  if (icmsTot) {
    const vNFEl = icmsTot.getElementsByTagName("vNF")[0];
    if (vNFEl?.textContent) {
      valorTotal = parseFloat(vNFEl.textContent.trim()) || 0;
    }
  }
  if (valorTotal === 0) {
    const vNFTotEl = doc.getElementsByTagName("vNFTot")[0];
    if (vNFTotEl?.textContent) {
      valorTotal = parseFloat(vNFTotEl.textContent.trim()) || 0;
    }
  }
  if (valorTotal === 0) {
    // Fallback: try vNF directly
    const vNFEl = doc.getElementsByTagName("vNF")[0];
    if (vNFEl?.textContent) {
      valorTotal = parseFloat(vNFEl.textContent.trim()) || 0;
    }
  }

  // Get chave de acesso from Id attribute or chNFe tag
  let chaveAcesso = "";
  const infNFe = doc.getElementsByTagName("infNFe")[0];
  if (infNFe) {
    const idAttr = infNFe.getAttribute("Id");
    if (idAttr) chaveAcesso = idAttr.replace(/^NFe/, "");
  }
  if (!chaveAcesso) {
    chaveAcesso = getTagText(doc, "chNFe");
  }

  if (!nNF || !mod) return null;

  return {
    id: `xml-${chaveAcesso || fileName}-${nNF}`,
    numero: String(parseInt(nNF, 10)),
    serie: String(parseInt(serie, 10) || 0),
    modelo: mod,
    dataEmissao: formatISODate(dhEmi),
    valorTotal: Math.round(valorTotal * 100) / 100,
    chaveAcesso,
    cancelada: !autorizado,
    fileName,
  };
}

export async function parseXmlFiles(files: File[]): Promise<{
  nfes: XmlNFe[];
  cancelamentos: XmlNFe[];
  erros: string[];
  emitCnpj: string; // CNPJ do emitente extraído do primeiro XML válido
}> {
  // Buffer all cancel events (procEvento) separately from regular NF-e
  const cancelEventos: XmlNFe[] = [];
  // Buffer regular NF-e: key (modelo-numero) -> best record found so far
  // Prefer authorized (cancelada=false) over rejected
  const nfesBuffer = new Map<string, XmlNFe>();
  const erros: string[] = [];
  let emitCnpj = "";

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".xml")) continue;

    try {
      const text = await file.text();
      const result = parseNFe(text, file.name);

      if (!result) continue;

      if (result.id.startsWith("cancel-")) {
        // Actual cancellation event (procEvento tpEvento=110111)
        cancelEventos.push(result);
      } else {
        // Extract emitente CNPJ from the first valid NF-e we find
        if (!emitCnpj) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, "application/xml");
          const emitEl = doc.getElementsByTagName("emit")[0];
          if (emitEl) {
            const cnpj = getTagText(emitEl, "CNPJ").replace(/\D/g, "");
            if (cnpj) emitCnpj = cnpj;
          }
        }
        // Regular NF-e / NFC-e: buffer and prefer authorized version
        const key = `${result.modelo}-${result.numero}`;
        const existing = nfesBuffer.get(key);
        if (!existing || (!result.cancelada && existing.cancelada)) {
          nfesBuffer.set(key, result);
        }
      }
    } catch (e) {
      erros.push(file.name);
    }
  }

  // Only authorized NF-e records go to nfes
  const nfes = Array.from(nfesBuffer.values()).filter((r) => !r.cancelada);

  return { nfes, cancelamentos: cancelEventos, erros, emitCnpj };
}
