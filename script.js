/* =============================================================
   LicitaAudit · Multi-Workspace — OmniLicit
   Motor de auditoria cruzada + parser robusto de selos digitais
   + laudo PDF em padrão executivo (3 blocos de paginação)
   Lei nº 14.133/2021
   ============================================================= */
'use strict';

/* -------------------------------------------------------------
   1. MÓDULOS E MATRIZ LEGAL
   ------------------------------------------------------------- */
const SLOTS = [
  { id: 'dfd',      code: 'LicitaReq',      label: 'DFD — Formalização de Demanda',   articles: ['Art. 12','Art. 18'], required: true,  aliases: ['DFD','LICITAREQ','REQ','DEMANDA'] },
  { id: 'etp',      code: 'LicitaETP',      label: 'ETP — Estudo Técnico Preliminar', articles: ['Art. 18','Art. 22'], required: true,  aliases: ['ETP','LICITAETP','ESTUDO'] },
  { id: 'tr',       code: 'LicitaTR',       label: 'TR — Termo de Referência',        articles: ['Art. 22','Art. 23'], required: true,  aliases: ['TR','LICITATR','TERMO','TERMOREF'] },
  { id: 'edital',   code: 'LicitaEdital',   label: 'Edital de Licitação',             articles: ['Art. 25','Art. 36'], required: false, aliases: ['EDITAL','LICITAEDITAL','EDT'] },
  { id: 'contrato', code: 'LicitaContrato', label: 'Contrato / Ata de Registro',      articles: ['Art. 92','Art. 94'], required: false, aliases: ['CONTRATO','ATA','LICITACONTRATO','ARP'] },
];

const LEGAL_MATRIX = [
  { id:'art5',   art:'Art. 5º',   title:'Princípios administrativos',         desc:'Legalidade, impessoalidade, moralidade, publicidade, eficiência, motivação, razoabilidade, competitividade, planejamento, transparência.' },
  { id:'art11',  art:'Art. 11',   title:'Objetivos do processo licitatório',  desc:'Seleção da proposta mais vantajosa, tratamento isonômico e observância da justa competição.' },
  { id:'art12',  art:'Art. 12',   title:'Fases da licitação',                 desc:'Preparatória, divulgação, apresentação de propostas, julgamento, habilitação, recursal e homologação.' },
  { id:'art18',  art:'Art. 18',   title:'Estudo Técnico Preliminar (ETP)',    desc:'Caracterização da necessidade, levantamento de mercado, estimativa de quantidades e valor, riscos e sustentabilidade.' },
  { id:'art22',  art:'Art. 22',   title:'Projeto Básico / TR',                desc:'Descrição do objeto, fundamentação, prazo, especificações técnicas, critérios de julgamento e forma de pagamento.' },
  { id:'art23',  art:'Art. 23',   title:'Pesquisa de preços',                 desc:'Painel de preços, contratações similares, mídia especializada ou fornecedores — para composição do TR.' },
  { id:'art24',  art:'Art. 24',   title:'Matriz de Alocação de Riscos',       desc:'Obrigatória para contratos de grande vulto e obras/engenharia, com identificação de riscos e responsabilidades.' },
  { id:'art25',  art:'Art. 25',   title:'Edital — conteúdo e publicidade',    desc:'Objeto, regras de participação, critérios de julgamento, valores, prazos e demais elementos.' },
  { id:'art33',  art:'Art. 33',   title:'Adoção do Pregão (preferencial)',    desc:'Pregão obrigatoriamente eletrônico para bens e serviços comuns.' },
  { id:'art36',  art:'Art. 36',   title:'Publicidade no PNCP',                desc:'Divulgação obrigatória no Portal Nacional de Contratações Públicas e no sítio oficial do ente.' },
  { id:'art63',  art:'Art. 63',   title:'Habilitação',                        desc:'Jurídica, técnica, fiscal e econômico-financeira, com verificação prévia à celebração do contrato.' },
  { id:'art71',  art:'Art. 71',   title:'Encerramento da fase competitiva',   desc:'Registro dos lances, julgamento das propostas e declaração do vencedor com publicidade.' },
  { id:'art72',  art:'Art. 72',   title:'Homologação e adjudicação',          desc:'Homologação pela autoridade competente, com verificação de regularidade do processo e da proposta.' },
  { id:'art75',  art:'Art. 75',   title:'Contratação direta — dispensa',      desc:'Hipóteses de dispensa, justificativa de preço e razão de escolha do contratado.' },
  { id:'art89',  art:'Art. 89',   title:'Contratação direta — procedimento',  desc:'Justificativa de preço, razão de escolha e instrução processual nos casos de dispensa/inexigibilidade.' },
  { id:'art92',  art:'Art. 92',   title:'Cláusulas necessárias do contrato',  desc:'Objeto, regime, preço, prazos, garantias, fiscalização, sanções, extinção e demais cláusulas essenciais.' },
  { id:'art94',  art:'Art. 94',   title:'Publicidade do contrato no PNCP',    desc:'Publicação obrigatória do extrato contratual no Portal Nacional de Contratações Públicas.' },
  { id:'art174', art:'Art. 174',  title:'Portal Nacional de Contratações',    desc:'Integração e alimentação obrigatória de dados ao PNCP.' },
];

/* -------------------------------------------------------------
   2. ESTADO + PERSISTÊNCIA
   ------------------------------------------------------------- */
const LS_KEY = 'omnlicit:licitaudit:state:v3';

const STATE = {
  workspaces: {},
  activeId: null,
};

function emptyWorkspace(name, processo, orgao) {
  const id = 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  return {
    id,
    name: name || 'Novo Processo',
    processo: processo || '',
    orgao: orgao || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slots: {},
    divergences: [],
    compliance: {},
    autoCompliance: {},
  };
}

const activeWs = () => STATE.activeId ? STATE.workspaces[STATE.activeId] : null;

function persistState() {
  try {
    const slim = {
      activeId: STATE.activeId,
      workspaces: Object.fromEntries(
        Object.entries(STATE.workspaces).map(([id, w]) => [id, {
          id: w.id, name: w.name, processo: w.processo, orgao: w.orgao,
          createdAt: w.createdAt, updatedAt: w.updatedAt,
          compliance: w.compliance || {},
          slots: Object.fromEntries(
            Object.entries(w.slots || {}).map(([sid, s]) => [sid, {
              file: s.file,
              hash: s.hash,
              declaredHash: s.declaredHash || null,
              hashMatch: s.hashMatch ?? null,
              tag: s.tag || null,
              tagModule: s.tagModule || null,
              tagUnique: s.tagUnique || null,
              tagYear: s.tagYear || null,
              tagModuleMatch: s.tagModuleMatch ?? null,
              seal: s.seal || null,
              signature: s.signature || null,
              sealStatus: s.sealStatus || null,
              fields: s.fields || {},
              loadedAt: s.loadedAt,
              stale: true,
            }])
          ),
        }])
      ),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(slim));
  } catch (err) {
    console.warn('[LicitaAudit] persist falhou:', err);
  }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    STATE.workspaces = data.workspaces || {};
    STATE.activeId = data.activeId && data.workspaces?.[data.activeId] ? data.activeId : null;
  } catch (err) {
    console.warn('[LicitaAudit] restore falhou:', err);
  }
}

function touchWs(ws) { if (ws) ws.updatedAt = new Date().toISOString(); }

/* -------------------------------------------------------------
   3. UTILITÁRIOS
   ------------------------------------------------------------- */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const fmtBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : b < 1073741824 ? `${(b/1048576).toFixed(2)} MB` : `${(b/1073741824).toFixed(2)} GB`;
const fmtDate = (d = new Date()) => (d instanceof Date ? d : new Date(d)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
const shortHash = (h) => h ? `${h.slice(0, 10)}…${h.slice(-10)}` : '—';

const escapeHTML = (s = '') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const escapeAttr = (s = '') => escapeHTML(s).replace(/`/g, '&#96;');

const toast = (msg, kind = 'ok', timeout = 3200) => {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    setTimeout(() => el.remove(), 300);
  }, timeout);
};

/* -------------------------------------------------------------
   4. TEMA
   ------------------------------------------------------------- */
const Theme = {
  KEY: 'omnlicit:licitaudit:theme',
  init() {
    const saved = localStorage.getItem(this.KEY);
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    this.apply(saved || (prefersLight ? 'light' : 'dark'));
  },
  apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(this.KEY, t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#09090B' : '#F1F5F9');
  },
  toggle() { this.apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); },
};

/* -------------------------------------------------------------
   5. HASH + EXTRAÇÃO DE TEXTO
   ------------------------------------------------------------- */
async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const detectExt = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

async function decompressPdfStreams(latin1Text) {
  if (typeof DecompressionStream === 'undefined') return [];
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m, count = 0;
  while ((m = re.exec(latin1Text)) !== null && count < 40) {
    count++;
    const raw = m[1];
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(bytes); writer.close();
      const reader = ds.readable.getReader();
      const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
      const len = chunks.reduce((a, c) => a + c.length, 0);
      const buf = new Uint8Array(len);
      let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
      out.push(new TextDecoder('latin1').decode(buf));
    } catch { /* stream não-Flate, ignora */ }
  }
  return out;
}

async function extractText(file, buffer) {
  const ext = detectExt(file.name);
  if (['txt','csv','json','xml','md','html','htm','xsd','nfe','cte'].includes(ext)) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
  const latin1 = new TextDecoder('latin1', { fatal: false }).decode(buffer);
  const parts = [latin1];
  if (ext === 'pdf' || latin1.slice(0, 5).includes('%PDF')) {
    try {
      const streams = await decompressPdfStreams(latin1);
      parts.push(...streams);
    } catch { /* silencioso */ }
  }
  return parts.join('\n');
}

/* -------------------------------------------------------------
   6. PARSER DE SELO DIGITAL — TAG + HASH (ROBUSTO)
   ------------------------------------------------------------- */
const MODULE_TOKEN = '(?:[A-Z][A-Z0-9_]{1,15})';
const UNIQUE_TOKEN = '(?:[A-Z0-9][A-Z0-9_\\-]{3,64})';

function extractOmniSeal(text) {
  const out = {
    tags: [],
    declaredHashes: [],
    primaryTag: null,
    primaryHash: null,
    declaredAt: null,
  };

  // Formato 1: OMNILICIT::MODULO::TAG[::ANO]
  const re1 = new RegExp(
    `OMNILICIT\\s*::\\s*(${MODULE_TOKEN})\\s*::\\s*(${UNIQUE_TOKEN})(?:\\s*::\\s*(\\d{2,4}))?`,
    'gi'
  );
  let m;
  while ((m = re1.exec(text)) !== null && out.tags.length < 20) {
    pushTag(out.tags, m[1], m[2], m[3], m[0]);
  }

  // Formato 2: OMNILICIT-MODULO-TAG-ANO (separadores mistos)
  if (!out.tags.length) {
    const re2 = new RegExp(
      `OMNILICIT[\\s:._\\-]+(${MODULE_TOKEN})[\\s:._\\-]+(${UNIQUE_TOKEN})(?:[\\s:._\\-]+(\\d{4}))?`,
      'gi'
    );
    while ((m = re2.exec(text)) !== null && out.tags.length < 20) {
      if (/^(WORKSPACE|SYSTEM|MODULE|SISTEMA|PLATAFORMA)$/i.test(m[1])) continue;
      pushTag(out.tags, m[1], m[2], m[3], m[0]);
    }
  }

  // Formato 3: TAG OMNILICIT [sep] MODULO [sep] TAG [sep] ANO
  const re3 = new RegExp(
    `TAG\\s+OMNILICIT[\\s:._\\-]*(${MODULE_TOKEN})?[\\s:._\\-]*(${UNIQUE_TOKEN})?(?:[\\s:._\\-]+(\\d{4}))?`,
    'gi'
  );
  while ((m = re3.exec(text)) !== null && out.tags.length < 40) {
    if (!m[1] || !m[2]) continue;
    pushTag(out.tags, m[1], m[2], m[3], m[0]);
  }

  // Formato 4: fallback permissivo
  if (!out.tags.length) {
    const re4 = /OMNILICIT[\s\S]{0,120}?([A-Z]{2,10})[\s:._\-]+([A-Z0-9][A-Z0-9_\-]{3,48})(?:[\s:._\-]+(\d{4}))?/gi;
    while ((m = re4.exec(text)) !== null && out.tags.length < 20) {
      if (/^(WORKSPACE|SYSTEM|MODULE|SISTEMA|PLATAFORMA)$/i.test(m[1])) continue;
      pushTag(out.tags, m[1], m[2], m[3], m[0]);
    }
  }

  // SHA-256 declarado (com prefixo)
  const hashRe1 = /(?:SHA[\s_\-]?256|HASH(?:\s+SHA[\s_\-]?256)?|INTEGRIDADE|DIGEST|CHAVE)\s*[:=\-]?\s*([A-F0-9]{64})/gi;
  while ((m = hashRe1.exec(text)) !== null && out.declaredHashes.length < 20) {
    out.declaredHashes.push({ value: m[1].toUpperCase(), raw: m[0].trim() });
  }

  // SHA-256 próximo de palavras-chave
  if (!out.declaredHashes.length) {
    const hashRe2 = /(?:selo|assinatura|verifica|autentica|integridade|confer[êe]ncia)[^\n]{0,120}?([A-F0-9]{64})/gi;
    while ((m = hashRe2.exec(text)) !== null && out.declaredHashes.length < 10) {
      out.declaredHashes.push({ value: m[1].toUpperCase(), raw: m[0].trim() });
    }
  }

  // SHA-256 isolado em linha
  if (!out.declaredHashes.length) {
    const hashRe3 = /(?:^|[\s\r\n>|<])([A-F0-9]{64})(?:$|[\s\r\n<|>])/gm;
    while ((m = hashRe3.exec(text)) !== null && out.declaredHashes.length < 10) {
      out.declaredHashes.push({ value: m[1].toUpperCase(), raw: m[1] });
    }
  }

  // Data do selo
  const dateRe = /(?:emitido|assinado|gerado|selado)\s*(?:em)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i;
  const dm = text.match(dateRe);
  if (dm) out.declaredAt = dm[1];

  out.primaryTag  = out.tags[0] || null;
  out.primaryHash = out.declaredHashes[0]?.value || null;

  return out;
}

function pushTag(arr, mod, uniq, year, raw) {
  const M = String(mod).toUpperCase();
  const U = String(uniq).toUpperCase();
  const Y = year ? String(year).padStart(4, '0').slice(-4) : null;
  if (arr.some(t => t.module === M && t.unique === U && t.year === Y)) return;
  arr.push({
    module: M, unique: U, year: Y, raw: String(raw).trim(),
    full: `OMNILICIT::${M}::${U}${Y ? '::' + Y : ''}`,
  });
}

function validateTagModule(slotId, tagModule) {
  if (!tagModule) return null;
  const slot = SLOTS.find(s => s.id === slotId);
  if (!slot) return null;
  const up = tagModule.toUpperCase();
  return slot.aliases.some(a => up.includes(a) || a.includes(up));
}

/* -------------------------------------------------------------
   7. SELO PAdES / PKCS#7 / XMLDSig
   ------------------------------------------------------------- */
function inspectSignature(file, buffer) {
  const ext = detectExt(file.name);
  const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4 * 1024 * 1024)));
  const res = { signed: false, standard: null, level: 'none', details: [] };

  const isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (isPDF || ext === 'pdf') {
    const text = new TextDecoder('latin1').decode(bytes);
    if (/\/ByteRange\s*\[/.test(text) || /\/Type\s*\/Sig\b/.test(text)) {
      res.signed = true; res.standard = 'PAdES / PKCS#7'; res.level = 'basic';
      res.details.push('Assinatura embutida (/Sig)');
    }
    if (/adbe\.pkcs7\.detached/i.test(text)) res.details.push('SubFilter adbe.pkcs7.detached');
    if (/ETSI\.CAdES\.detached/i.test(text)) { res.standard = 'PAdES-BES (ETSI)'; res.details.push('SubFilter ETSI.CAdES'); }
    if (/(2\.16\.76\.1\.3|2\.16\.76\.1\.7|ICP-Brasil)/i.test(text)) { res.level = 'icp'; res.details.push('Indícios ICP-Brasil'); }
  }

  if (!res.signed && bytes[0] === 0x30 && (bytes[1] & 0x80)) {
    res.signed = true; res.standard = 'PKCS#7 / CMS'; res.level = 'basic';
    res.details.push('Estrutura ASN.1 detectada');
  }

  if (['xml','nfe','cte','mdfe'].includes(ext)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (/<Signature[\s>]/i.test(text)) { res.signed = true; res.standard = 'XMLDSig'; res.level = 'basic'; res.details.push('Elemento <Signature>'); }
    if (/ICP-Brasil/i.test(text)) { res.level = 'icp'; res.details.push('Cadeia ICP-Brasil'); }
  }

  if (!res.details.length) res.details.push('Nenhuma assinatura estrutural detectada');
  return res;
}

/* -------------------------------------------------------------
   8. PROCESSAMENTO DO ARQUIVO
   ------------------------------------------------------------- */
async function processFile(file) {
  const buffer = await file.arrayBuffer();
  const computedHash = await sha256(buffer);
  const ext = detectExt(file.name);
  const text = await extractText(file, buffer);
  const signature = inspectSignature(file, buffer);
  const seal = extractOmniSeal(text);

  return {
    file: { name: file.name, size: file.size, ext, mime: file.type || '' },
    hash: computedHash,
    textLength: text.length,
    declaredHash: seal.primaryHash,
    hashMatch: seal.primaryHash ? (seal.primaryHash === computedHash) : null,
    tag: seal.primaryTag?.full || null,
    tagModule: seal.primaryTag?.module || null,
    tagUnique: seal.primaryTag?.unique || null,
    tagYear: seal.primaryTag?.year || null,
    signature,
    seal,
    fields: extractFields(text, ext),
    loadedAt: new Date().toISOString(),
    stale: false,
  };
}

function computeSealStatus(slot) {
  const hasTag = !!slot.tag;
  const hasDeclared = !!slot.declaredHash;
  const match = slot.hashMatch;
  const hasSig = slot.signature?.signed;

  if (hasDeclared && match === false) {
    return { status: 'tampered', label: 'Divergente — possível adulteração', cls: 'tampered' };
  }
  if (hasTag && hasDeclared && match === true) {
    return { status: 'verified', label: 'Verificado e Íntegro', cls: 'verified' };
  }
  if (hasTag && hasSig && !hasDeclared) {
    return { status: 'sealed', label: 'Selo digital (hash não declarado)', cls: 'verified' };
  }
  if (hasDeclared && match === true && !hasTag) {
    return { status: 'hash-only', label: 'Hash confere (TAG ausente)', cls: 'partial' };
  }
  if (hasSig && !hasTag && !hasDeclared) {
    return { status: 'signed-only', label: 'Assinado (TAG/hash ausentes)', cls: 'partial' };
  }
  if (hasTag && !hasDeclared && !hasSig) {
    return { status: 'tag-only', label: 'TAG detectada (hash ausente)', cls: 'partial' };
  }
  return { status: 'unsigned', label: 'Sem selo digital', cls: 'unsigned' };
}

/* -------------------------------------------------------------
   9. EXTRAÇÃO DE CAMPOS
   ------------------------------------------------------------- */
function toNumberBR(s) {
  if (s == null) return null;
  const clean = String(s).replace(/[^\d.,-]/g, '').trim();
  if (!clean) return null;
  let n;
  if (/,\d{1,2}$/.test(clean)) n = clean.replace(/\./g, '').replace(',', '.');
  else n = clean.replace(/,/g, '');
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}

function extractFields(text, ext) {
  const f = {};
  if (ext === 'json') {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        f.processo = obj.processo || obj.processNumber || obj.numeroProcesso || null;
        f.objeto   = obj.objeto   || obj.object || null;
        f.quantidade = obj.quantidade ?? obj.qtd ?? obj.quantity ?? null;
        f.unidade  = obj.unidade  || obj.unit || null;
        f.valorEstimado = obj.valorEstimado ?? obj.valor ?? obj.estimatedValue ?? null;
        f.orgao = obj.orgao || obj.org || obj.unidadeGestora || null;
        f.uasg  = obj.uasg || null;
        f.data  = obj.data || obj.date || null;
        return cleanFields(f);
      }
    } catch { /* segue regex */ }
  }

  const first = (re) => { const m = text.match(re); return m ? (m[1] || '').trim() : null; };
  f.processo = first(/processo(?:\s+n?[º°.:]*)?\s*[:\-]?\s*([\w./-]{4,40})/i);
  f.objeto   = first(/objeto\s*(?:do\s+processo|da\s+contrata[çc][ãa]o)?\s*[:\-]\s*([^\n\r]{10,300})/i);
  f.quantidade = first(/(?:quantidade|qtd\.?|quantitativo)\s*[:\-]?\s*([\d.,]{1,20})/i);
  f.unidade    = first(/unidade\s*(?:de\s*medida)?\s*[:\-]?\s*([A-Za-zçãáéíóúâêô]{1,15})/i);
  f.valorEstimado = first(/(?:valor\s+(?:estimado|total|global|de\s+refer[êe]ncia)?)\s*[:\-]?\s*R?\$?\s*([\d.,]{3,25})/i);
  f.orgao = first(/(?:[óo]rg[ãa]o|unidade\s+gestora|entidade)\s*[:\-]\s*([^\n\r]{3,120})/i);
  f.uasg  = first(/uasg\s*[:\-]?\s*(\d{6})/i);
  f.data  = first(/data\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);

  return cleanFields(f);
}

function cleanFields(f) {
  const out = {};
  for (const k of Object.keys(f)) {
    const v = f[k];
    if (v === null || v === undefined || v === '') continue;
    if (k === 'quantidade' || k === 'valorEstimado') out[k] = typeof v === 'number' ? v : toNumberBR(v);
    else out[k] = String(v).trim().replace(/\s+/g, ' ');
  }
  return out;
}

/* -------------------------------------------------------------
   10. ROTEAMENTO AUTOMÁTICO
   ------------------------------------------------------------- */
function detectSlotFor(filename, text, fields, omniSeal) {
  if (omniSeal?.primaryTag?.module) {
    const mod = omniSeal.primaryTag.module.toUpperCase();
    for (const s of SLOTS) {
      if (s.aliases.some(a => mod.includes(a) || a.includes(mod))) return s.id;
    }
  }
  const modulo = (fields?.modulo || '').toLowerCase();
  if (/dfd|licitareq|formaliza/.test(modulo)) return 'dfd';
  if (/etp|estudo/.test(modulo)) return 'etp';
  if (/licitatr|^tr|termo/.test(modulo)) return 'tr';
  if (/edital/.test(modulo)) return 'edital';
  if (/contrato|ata/.test(modulo)) return 'contrato';

  const low = (filename + ' ' + text.slice(0, 3000)).toLowerCase();
  if (/licitareq|[-_ .]dfd|formaliza/.test(low)) return 'dfd';
  if (/licitaetp|[-_ .]etp|estudo\s+t[ée]cnico/.test(low)) return 'etp';
  if (/licitatr|[-_ .]tr[._]|termo\s+de\s+refer/.test(low)) return 'tr';
  if (/edital/.test(low)) return 'edital';
  if (/contrato|ata\s+de\s+registro/.test(low)) return 'contrato';
  return null;
}

/* -------------------------------------------------------------
   11. CRUD DE WORKSPACES
   ------------------------------------------------------------- */
function createWorkspace(name, processo, orgao) {
  const ws = emptyWorkspace(name, processo, orgao);
  STATE.workspaces[ws.id] = ws;
  STATE.activeId = ws.id;
  persistState();
  renderAll();
  toast(`Workspace "${ws.name}" criado.`, 'ok');
  return ws;
}

function switchWorkspace(id) {
  if (!STATE.workspaces[id]) return;
  STATE.activeId = id;
  persistState();
  renderAll();
  const ws = STATE.workspaces[id];
  toast(`Workspace ativo: ${ws.name}`, 'ok', 2200);
}

function deleteWorkspace(id) {
  const ws = STATE.workspaces[id];
  if (!ws) return;
  if (!confirm(`Excluir o workspace "${ws.name}"?\nTodos os dados de auditoria deste processo serão removidos.`)) return;
  delete STATE.workspaces[id];
  if (STATE.activeId === id) {
    const remaining = Object.keys(STATE.workspaces);
    STATE.activeId = remaining.length ? remaining[0] : null;
  }
  persistState();
  renderAll();
  toast('Workspace excluído.', 'warn');
}

/* -------------------------------------------------------------
   12. INGESTÃO DE ARQUIVOS
   ------------------------------------------------------------- */
async function loadFileIntoSlot(slotId, file) {
  const ws = activeWs();
  if (!ws) { toast('Crie um workspace primeiro.', 'warn'); return; }

  try {
    const payload = await processFile(file);
    payload.tagModuleMatch = validateTagModule(slotId, payload.tagModule);
    payload.sealStatus = computeSealStatus(payload);

    ws.slots[slotId] = payload;
    touchWs(ws);
    persistState();
    renderAll();

    const status = payload.sealStatus;
    const slotCode = SLOTS.find(s => s.id === slotId)?.code || slotId;
    if (status.status === 'verified' || status.status === 'sealed') {
      toast(`${slotCode}: verificado e íntegro.`, 'ok');
    } else if (status.status === 'tampered') {
      toast(`⚠️ ${file.name}: hash divergente — possível adulteração!`, 'danger', 6000);
    } else if (payload.tagModuleMatch === false) {
      toast(`TAG "${payload.tagModule}" não corresponde ao módulo ${slotId.toUpperCase()}.`, 'warn', 5000);
    } else {
      toast(`${slotCode}: ${file.name} carregado.`, 'ok');
    }
  } catch (err) {
    console.error('[LicitaAudit] erro', err);
    toast(`Falha ao processar ${file.name}`, 'danger');
  }
}

async function loadBulk(files) {
  const ws = activeWs();
  if (!ws) { toast('Crie um workspace primeiro.', 'warn'); return; }
  const list = Array.from(files);
  if (!list.length) return;

  const matched = [], unmatched = [];
  for (const file of list) {
    const buffer = await file.arrayBuffer();
    const ext = detectExt(file.name);
    const text = await extractText(file, buffer);
    const omniSeal = extractOmniSeal(text);
    const fields = extractFields(text, ext);
    const target = detectSlotFor(file.name, text, fields, omniSeal);
    if (target) matched.push({ file, slotId: target });
    else unmatched.push(file);
  }

  for (const { file, slotId } of matched) {
    await loadFileIntoSlot(slotId, file);
  }

  if (unmatched.length) {
    toast(`${unmatched.length} arquivo(s) sem módulo identificado. Use os slots individuais.`, 'warn', 5000);
  }
}

/* -------------------------------------------------------------
   13. CROSS-CHECKS
   ------------------------------------------------------------- */
function getLoaded() {
  const ws = activeWs();
  if (!ws) return [];
  return Object.entries(ws.slots)
    .filter(([, s]) => s && s.file)
    .map(([id, s]) => ({ id, ...s, code: SLOTS.find(x => x.id === id)?.code || id }));
}

function jaccard(a = '', b = '') {
  const A = new Set(String(a).toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const B = new Set(String(b).toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (!A.size && !B.size) return 1;
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
}

function runCrossChecks() {
  const ws = activeWs();
  if (!ws) return [];
  const div = [];
  const loaded = getLoaded();

  const add = (severity, category, title, description, modules, legalRef, field) =>
    div.push({ id: Math.random().toString(36).slice(2, 10), severity, category, title, description, modules, legalRef, field });

  // Selos divergentes
  loaded.forEach(x => {
    if (x.sealStatus?.status === 'tampered') {
      add('critical', 'Integridade',
        `Hash SHA-256 divergente em ${x.code}`,
        `O hash computado do arquivo não corresponde ao hash declarado no documento. Possível adulteração ou reemissão. Computado: ${x.hash.slice(0, 16)}… / Declarado: ${(x.declaredHash || '').slice(0, 16)}…`,
        [x.code], 'Art. 5º', 'hash');
    } else if (x.tagModuleMatch === false) {
      add('critical', 'Identificação',
        `TAG OmniLicit não corresponde ao módulo ${x.code}`,
        `TAG extraída: ${x.tag} — módulo declarado "${x.tagModule}" diverge do slot ${x.code}.`,
        [x.code], 'Art. 12', 'tag');
    } else if (x.sealStatus?.status === 'unsigned') {
      add('info', 'Assinatura',
        `Documento sem selo digital: ${x.code}`,
        `${x.file.name} não possui TAG OmniLicit nem hash SHA-256 declarado.`,
        [x.code], 'Art. 5º', 'seal');
    } else if (x.sealStatus?.status === 'hash-only' || x.sealStatus?.status === 'tag-only') {
      add('warning', 'Assinatura',
        `Selo digital parcial em ${x.code}`,
        `${x.sealStatus.label}. TAG: ${x.tag || 'ausente'} · Hash declarado: ${x.declaredHash ? 'presente' : 'ausente'}.`,
        [x.code], 'Art. 5º', 'seal');
    }
  });

  const byField = (key) => loaded.filter(x => x.fields?.[key] != null && x.fields[key] !== '').map(x => ({ id: x.id, code: x.code, value: x.fields[key] }));

  // Processo
  const procs = byField('processo');
  if (procs.length > 1) {
    const ref = procs[0];
    for (const p of procs.slice(1)) {
      if (p.value !== ref.value) add('critical', 'Identificação', 'Divergência no número do processo',
        `"${ref.value}" em ${ref.code} difere de "${p.value}" em ${p.code}.`, [ref.code, p.code], 'Art. 12', 'processo');
    }
  }

  // Órgão
  const orgaos = byField('orgao');
  if (orgaos.length > 1) {
    const ref = orgaos[0];
    for (const o of orgaos.slice(1)) {
      if (jaccard(ref.value, o.value) < 0.5) add('warning', 'Identificação', 'Divergência de órgão/unidade gestora',
        `"${ref.value}" (${ref.code}) vs "${o.value}" (${o.code}).`, [ref.code, o.code], 'Art. 12', 'orgao');
    }
  }

  // UASG
  const uasgs = byField('uasg');
  if (uasgs.length > 1) {
    const ref = uasgs[0];
    for (const u of uasgs.slice(1)) {
      if (u.value !== ref.value) add('critical', 'Identificação', 'Divergência de UASG',
        `"${ref.value}" (${ref.code}) vs "${u.value}" (${u.code}).`, [ref.code, u.code], 'Art. 12', 'uasg');
    }
  }

  // Quantidade
  const qtds = byField('quantidade').map(x => ({ ...x, value: Number(x.value) })).filter(x => Number.isFinite(x.value));
  if (qtds.length > 1) {
    const ref = qtds[0];
    for (const q of qtds.slice(1)) {
      if (q.value !== ref.value) {
        const delta = Math.abs(q.value - ref.value);
        const pct = ref.value ? (delta / ref.value) * 100 : 100;
        const sev = pct > 10 ? 'critical' : 'warning';
        add(sev, 'Consistência', 'Divergência de quantitativo',
          `${ref.value} (${ref.code}) vs ${q.value} (${q.code}). Diferença de ${delta} (${pct.toFixed(1)}%).`,
          [ref.code, q.code], 'Art. 22', 'quantidade');
      }
    }
  }

  // Valor estimado
  const valores = byField('valorEstimado').map(x => ({ ...x, value: Number(x.value) })).filter(x => Number.isFinite(x.value) && x.value > 0);
  if (valores.length > 1) {
    const ref = valores[0];
    for (const v of valores.slice(1)) {
      const delta = Math.abs(v.value - ref.value);
      const pct = ref.value ? (delta / ref.value) * 100 : 100;
      if (pct > 5) {
        const sev = pct > 20 ? 'critical' : 'warning';
        add(sev, 'Consistência', 'Divergência de valor estimado',
          `R$ ${ref.value.toLocaleString('pt-BR')} (${ref.code}) vs R$ ${v.value.toLocaleString('pt-BR')} (${v.code}). Diferença de ${pct.toFixed(1)}%.`,
          [ref.code, v.code], 'Art. 23', 'valorEstimado');
      }
    }
  }

  // Objeto
  const objetos = byField('objeto');
  if (objetos.length > 1) {
    const ref = objetos[0];
    for (const o of objetos.slice(1)) {
      const sim = jaccard(ref.value, o.value);
      if (sim < 0.4) add('warning', 'Consistência', 'Baixa aderência entre objetos',
        `Similaridade de apenas ${(sim * 100).toFixed(0)}% entre ${ref.code} e ${o.code}.`,
        [ref.code, o.code], 'Art. 22', 'objeto');
    }
  }

  // Hashes duplicados
  const hmap = new Map();
  loaded.forEach(x => { if (!hmap.has(x.hash)) hmap.set(x.hash, []); hmap.get(x.hash).push(x.code); });
  hmap.forEach((codes, h) => {
    if (codes.length > 1) add('critical', 'Integridade', 'Hash SHA-256 duplicado entre módulos',
      `Artefatos idênticos detectados em ${codes.join(', ')}. Hash: ${h.slice(0, 16)}…`,
      codes, 'Art. 12', 'hash');
  });

  // Completude
  SLOTS.filter(s => s.required).forEach(s => {
    if (!ws.slots[s.id]?.file) add('critical', 'Completude', `Módulo obrigatório ausente: ${s.code}`,
      `${s.label} não foi importado no workspace.`, [s.code], s.articles[0], 'required');
  });

  // Campos ausentes
  loaded.forEach(x => {
    ['processo','objeto','valorEstimado'].forEach(f => {
      if (!x.fields?.[f]) add('warning', 'Extração', `Campo "${f}" não localizado em ${x.code}`,
        `Não foi possível extrair "${f}" automaticamente.`, [x.code], 'Art. 12', f);
    });
  });

  ws.divergences = div;
  return div;
}

/* -------------------------------------------------------------
   14. CONFORMIDADE
   ------------------------------------------------------------- */
function calcCompliance() {
  const ws = activeWs();
  if (!ws) return;
  const auto = {};
  const loadedIds = new Set(getLoaded().map(x => x.id));

  const coverage = {};
  SLOTS.forEach(s => s.articles.forEach(a => {
    const k = a.replace(/\D/g, '');
    (coverage[k] ||= []).push(s.id);
  }));

  LEGAL_MATRIX.forEach(item => {
    const num = item.art.replace(/\D/g, '');
    const mods = coverage[num] || [];
    const covered = mods.some(id => loadedIds.has(id));
    const crit = ws.divergences.filter(d => d.severity === 'critical' && d.legalRef === item.art);
    let status;
    if (!covered) status = 'warn';
    else if (crit.length) status = 'fail';
    else status = 'ok';
    auto[item.id] = status;
  });

  ws.autoCompliance = auto;
}

const getEffectiveCompliance = (id) => {
  const ws = activeWs();
  if (!ws) return null;
  return ws.compliance[id] || ws.autoCompliance[id] || null;
};

/* -------------------------------------------------------------
   15. RENDERS
   ------------------------------------------------------------- */
function renderWorkspaceList() {
  const list = $('#wsList');
  const ids = Object.keys(STATE.workspaces).sort((a, b) =>
    new Date(STATE.workspaces[b].updatedAt) - new Date(STATE.workspaces[a].updatedAt));

  $('#wsCount').textContent = `${ids.length} processo${ids.length === 1 ? '' : 's'}`;

  if (!ids.length) {
    list.innerHTML = '<li class="ws-empty">Nenhum workspace criado. Clique em "+ Novo".</li>';
    return;
  }

  list.innerHTML = ids.map(id => {
    const w = STATE.workspaces[id];
    const active = id === STATE.activeId;
    const loadedCount = Object.values(w.slots || {}).filter(s => s?.file).length;
    const modDots = SLOTS.map(s => `<span class="dot-mod ${w.slots?.[s.id]?.file ? 'on' : ''}"></span>`).join('');
    const tampered = Object.values(w.slots || {}).some(s => s?.sealStatus?.status === 'tampered');
    const criticalCount = (w.divergences || []).filter(d => d.severity === 'critical').length;

    return `
      <li class="ws-item ${active ? 'active' : ''}" data-ws="${id}" tabindex="0">
        <div class="ws-item-head">
          <span class="ws-item-name" title="${escapeAttr(w.name)}">${escapeHTML(w.name)}</span>
          <button class="ws-item-del" data-del="${id}" title="Excluir workspace" aria-label="Excluir">✕</button>
        </div>
        <div class="ws-item-meta">
          <span>${loadedCount}/${SLOTS.length}</span>
          <span class="progress-mini">${modDots}</span>
          ${tampered ? '<span style="color:var(--danger)">⚠ hash divergente</span>' :
            criticalCount ? `<span style="color:var(--danger)">${criticalCount} crítico(s)</span>` : ''}
        </div>
      </li>
    `;
  }).join('');
}

function renderSlotList() {
  const list = $('#slotList');
  const ws = activeWs();

  if (!ws) {
    list.innerHTML = '<li class="ws-empty">Crie um workspace para liberar os slots.</li>';
    $('#sidebarSub').textContent = 'Sem workspace ativo';
    return;
  }

  const loadedCount = Object.values(ws.slots || {}).filter(s => s?.file).length;
  $('#sidebarSub').textContent = `${loadedCount} de ${SLOTS.length} módulos · ${ws.name}`;

  list.innerHTML = SLOTS.map(slot => {
    const st = ws.slots?.[slot.id];
    const hasFile = !!st?.file;
    let sealCls = '';
    if (hasFile) {
      const s = st.sealStatus?.status || 'unsigned';
      sealCls = (s === 'verified' || s === 'sealed') ? 'seal-verified'
              : (s === 'tampered') ? 'seal-tampered'
              : (s === 'unsigned') ? 'seal-unsigned'
              : 'seal-partial';
    }

    const meta = hasFile
      ? `<span>${fmtBytes(st.file.size)}</span><span>·</span><span>${st.file.ext.toUpperCase()}</span>${st.tag ? `<span>·</span><span style="color:var(--accent)">${escapeHTML(st.tagUnique || '')}</span>` : ''}`
      : `<span class="muted">${slot.required ? 'obrigatório' : 'opcional'}</span>`;

    return `
      <li class="slot ${hasFile ? 'loaded' : ''} ${sealCls}" data-slot="${slot.id}" tabindex="0" role="button" aria-label="Carregar ${escapeAttr(slot.label)}">
        <div class="slot-icon">${hasFile ? (st.sealStatus?.status === 'tampered' ? '!' : '✓') : '＋'}</div>
        <div class="slot-info">
          <div class="slot-name" title="${escapeAttr(hasFile ? st.file.name : slot.label)}">${escapeHTML(hasFile ? st.file.name : slot.label)}</div>
          <div class="slot-meta">${meta}</div>
        </div>
        <div class="slot-actions">
          ${hasFile ? `<button class="icon-mini danger" data-action="remove" data-slot="${slot.id}" title="Remover">✕</button>` : ''}
          <button class="icon-mini" data-action="upload" data-slot="${slot.id}" title="Carregar arquivo">↑</button>
        </div>
      </li>
    `;
  }).join('');

  const hashes = getLoaded().map(x => x.hash).sort();
  if (hashes.length) {
    $('#workspaceHashWrap').hidden = false;
    const combined = hashes.join(':');
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(combined)).then(buf => {
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      $('#workspaceHash').textContent = hex;
      $('#workspaceHash').title = hex;
    });
  } else {
    $('#workspaceHashWrap').hidden = true;
  }
}

function renderKPIs() {
  const ws = activeWs();
  if (!ws) return;
  const loaded = getLoaded();
  const verified = loaded.filter(x => x.sealStatus?.status === 'verified' || x.sealStatus?.status === 'sealed').length;
  const tampered = loaded.filter(x => x.sealStatus?.status === 'tampered').length;
  const critical = ws.divergences.filter(d => d.severity === 'critical').length;

  const total = LEGAL_MATRIX.length;
  const ok = LEGAL_MATRIX.filter(i => getEffectiveCompliance(i.id) === 'ok').length;
  const pct = total ? Math.round((ok / total) * 100) : 0;

  $('#kpiModules').textContent = `${loaded.length}/${SLOTS.length}`;
  $('#kpiSeals').textContent = verified;
  $('#kpiTampered').textContent = tampered;
  $('#kpiCompliance').textContent = total ? `${pct}%` : '—';
  $('#kpiCritical').textContent = critical;

  const badge = $('#statusBadgeText');
  if (!loaded.length) badge.textContent = 'Workspace vazio';
  else if (tampered) badge.textContent = `${tampered} selo(s) divergente(s)`;
  else if (critical) badge.textContent = `${critical} alerta(s) crítico(s)`;
  else badge.textContent = 'Workspace íntegro';

  $('#processChipValue').textContent = ws.processo || ws.name || '—';
}

function renderIntegrity() {
  const grid = $('#integrityGrid');
  const loaded = getLoaded();

  if (!loaded.length) {
    grid.innerHTML = '<div class="empty">Nenhum artefato carregado neste workspace.</div>';
    return;
  }

  grid.innerHTML = loaded.map(x => {
    const sealStatus = x.sealStatus || { status: 'unsigned', label: 'Sem selo digital', cls: 'unsigned' };
    const computedFull = x.hash || '';
    const declaredFull = x.declaredHash || '';
    const matchClass = x.hashMatch === false ? 'hash-mismatch' : 'hash-value';
    const tagDisplay = x.tag ? escapeHTML(x.tag) : '<span style="color:var(--text-3)">— não detectada —</span>';

    return `
      <div class="int-card" data-seal="${sealStatus.cls}">
        <div class="int-head">
          <span class="int-code">${x.code}</span>
          <span class="seal-pill ${sealStatus.cls}">
            ${sealStatus.status === 'tampered' ? '⚠' : (sealStatus.status === 'verified' || sealStatus.status === 'sealed') ? '✓' : '·'}
            ${escapeHTML(sealStatus.label)}
          </span>
        </div>
        <div class="int-file" title="${escapeAttr(x.file.name)}">${escapeHTML(x.file.name)}</div>
        <dl class="int-kv">
          <dt>TAG</dt><dd class="tag-value">${tagDisplay}</dd>
          <dt>Hash calc.</dt><dd class="${matchClass}" data-copy="${computedFull}" title="Clique para copiar">${escapeHTML(computedFull || '—')}</dd>
          <dt>Hash doc.</dt><dd class="${matchClass}" data-copy="${declaredFull}" title="Clique para copiar">${escapeHTML(declaredFull || '—')}</dd>
          <dt>Selo</dt><dd>${x.signature?.signed ? escapeHTML(x.signature.standard || 'Assinado') : '—'}</dd>
        </dl>
        <div class="int-foot">
          <span>${fmtBytes(x.file.size)} · ${x.file.ext.toUpperCase()}</span>
          <span>${x.stale ? '⚠ re-upload p/ re-verificar' : 'verificado nesta sessão'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderDivergences() {
  const ws = activeWs();
  if (!ws) return;
  const tbody = $('#divTableBody');
  const divs = ws.divergences || [];

  const c = { critical: 0, warning: 0, info: 0 };
  divs.forEach(d => c[d.severity]++);
  $('#chipCritical').textContent = `${c.critical} críticos`;
  $('#chipWarning').textContent = `${c.warning} avisos`;
  $('#chipInfo').textContent = `${c.info} informativos`;

  if (!divs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Nenhuma divergência detectada entre os módulos.</td></tr>';
    return;
  }

  const sevLabel = { critical: 'Crítico', warning: 'Aviso', info: 'Info' };
  const sevClass = { critical: 'sev-critical', warning: 'sev-warning', info: 'sev-info' };
  const order = { critical: 0, warning: 1, info: 2 };
  const sorted = [...divs].sort((a, b) => order[a.severity] - order[b.severity]);

  tbody.innerHTML = sorted.map(d => `
    <tr>
      <td><span class="sev-pill ${sevClass[d.severity]}">${sevLabel[d.severity]}</span></td>
      <td><span class="legal-ref">${escapeHTML(d.category || '—')}</span></td>
      <td>
        <strong style="display:block;margin-bottom:3px;color:var(--text-0)">${escapeHTML(d.title)}</strong>
        <span style="color:var(--text-2);font-size:.78rem">${escapeHTML(d.description)}</span>
      </td>
      <td>${(d.modules || []).map(m => `<span class="mod-pill active">${escapeHTML(m)}</span>`).join('')}</td>
      <td><span class="legal-ref">${escapeHTML(d.legalRef || '—')}</span></td>
    </tr>
  `).join('');
}

function renderCompliance() {
  const wrap = $('#complianceList');
  const ws = activeWs();
  if (!ws) return;

  const count = { ok: 0, warn: 0, fail: 0 };
  LEGAL_MATRIX.forEach(i => {
    const s = getEffectiveCompliance(i.id);
    if (s === 'ok') count.ok++;
    else if (s === 'warn') count.warn++;
    else if (s === 'fail') count.fail++;
  });
  $('#chipOk').textContent = `${count.ok} conformes`;
  $('#chipWarn').textContent = `${count.warn} pendentes`;
  $('#chipFail').textContent = `${count.fail} não conformes`;

  wrap.innerHTML = LEGAL_MATRIX.map(item => {
    const status = getEffectiveCompliance(item.id);
    const auto = ws.autoCompliance[item.id];
    const manual = ws.compliance[item.id];
    const isOverride = manual && manual !== auto;

    return `
      <div class="comp-item" data-id="${item.id}" data-status="${status || ''}">
        <div class="comp-head">
          <span class="comp-art">${item.art}</span>
          <span class="status-dot ${
            status === 'ok' ? 'dot-ok' :
            status === 'warn' ? 'dot-warn' :
            status === 'fail' ? 'dot-danger' : ''
          }" title="${isOverride ? 'Ajuste manual' : 'Status automático'}"></span>
        </div>
        <div class="comp-title">${escapeHTML(item.title)}</div>
        <div class="comp-desc">${escapeHTML(item.desc)}</div>
        <div class="comp-foot">
          <button type="button" class="comp-btn ${status === 'ok' ? 'active-ok' : ''}"     data-set="ok">Conforme</button>
          <button type="button" class="comp-btn ${status === 'warn' ? 'active-warn' : ''}" data-set="warn">Pendente</button>
          <button type="button" class="comp-btn ${status === 'fail' ? 'active-fail' : ''}" data-set="fail">Não conforme</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderEmptyState() {
  const ws = activeWs();
  const empty = $('#emptyState');
  const panel = $('#workspacePanel');
  if (!ws) { empty.hidden = false; panel.hidden = true; }
  else { empty.hidden = true; panel.hidden = false; }
}

function renderAll() {
  renderEmptyState();
  runCrossChecks();
  calcCompliance();
  renderWorkspaceList();
  renderSlotList();
  renderKPIs();
  renderIntegrity();
  renderDivergences();
  renderCompliance();
}

/* -------------------------------------------------------------
   16. EVENTOS — SIDEBAR
   ------------------------------------------------------------- */
function bindWorkspaceList() {
  const list = $('#wsList');

  list.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteWorkspace(del.dataset.del); return; }
    const item = e.target.closest('.ws-item');
    if (item) switchWorkspace(item.dataset.ws);
  });

  list.addEventListener('keydown', (e) => {
    const item = e.target.closest('.ws-item');
    if (!item) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchWorkspace(item.dataset.ws); }
  });
}

function bindSidebar() {
  const list = $('#slotList');

  list.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const slotId = actionBtn.dataset.slot;
      const action = actionBtn.dataset.action;
      if (action === 'remove') {
        const ws = activeWs();
        if (ws && ws.slots[slotId]) {
          delete ws.slots[slotId];
          touchWs(ws);
          persistState();
          renderAll();
          toast('Módulo removido do workspace.', 'warn');
        }
      } else if (action === 'upload') {
        openFilePickerFor(slotId);
      }
      return;
    }
    const slotEl = e.target.closest('.slot');
    if (slotEl) openFilePickerFor(slotEl.dataset.slot);
  });

  list.addEventListener('keydown', (e) => {
    const slotEl = e.target.closest('.slot');
    if (!slotEl) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFilePickerFor(slotEl.dataset.slot); }
  });

  list.addEventListener('dragover', (e) => {
    const slotEl = e.target.closest('.slot');
    if (!slotEl) return;
    e.preventDefault();
    slotEl.classList.add('dragover');
  });
  list.addEventListener('dragleave', (e) => {
    const slotEl = e.target.closest('.slot');
    if (slotEl) slotEl.classList.remove('dragover');
  });
  list.addEventListener('drop', async (e) => {
    const slotEl = e.target.closest('.slot');
    if (!slotEl) return;
    e.preventDefault();
    slotEl.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) await loadFileIntoSlot(slotEl.dataset.slot, file);
  });

  $('#btnBulk').addEventListener('click', () => $('#bulkInput').click());
  $('#bulkInput').addEventListener('change', (e) => {
    loadBulk(e.target.files);
    e.target.value = '';
  });
}

function openFilePickerFor(slotId) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '*/*';
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    if (f) await loadFileIntoSlot(slotId, f);
  });
  inp.click();
}

/* -------------------------------------------------------------
   17. EVENTOS — COMPLIANCE
   ------------------------------------------------------------- */
function bindCompliance() {
  $('#complianceList').addEventListener('click', (e) => {
    const btn = e.target.closest('.comp-btn');
    if (!btn) return;
    const card = btn.closest('.comp-item');
    const id = card.dataset.id;
    const set = btn.dataset.set;
    const ws = activeWs();
    if (!ws) return;

    if (ws.compliance[id] === set) delete ws.compliance[id];
    else ws.compliance[id] = set;

    touchWs(ws);
    persistState();
    renderCompliance();
    renderKPIs();
  });
}

/* -------------------------------------------------------------
   18. EVENTOS — GLOBAIS + MODAL
   ------------------------------------------------------------- */
function openWorkspaceModal() {
  $('#wsModal').hidden = false;
  $('#wsName').value = '';
  $('#wsProcess').value = '';
  $('#wsOrgao').value = '';
  setTimeout(() => $('#wsName').focus(), 50);
}
function closeWorkspaceModal() { $('#wsModal').hidden = true; }

function bindGlobal() {
  $('#themeToggle').addEventListener('click', () => Theme.toggle());

  $('#btnNewWorkspace').addEventListener('click', openWorkspaceModal);
  $('#btnNewWorkspaceEmpty').addEventListener('click', openWorkspaceModal);
  $('#wsModalClose').addEventListener('click', closeWorkspaceModal);
  $('#wsCancel').addEventListener('click', closeWorkspaceModal);

  $('#wsModal').addEventListener('click', (e) => {
    if (e.target.id === 'wsModal') closeWorkspaceModal();
  });

  $('#wsCreate').addEventListener('click', () => {
    const name = $('#wsName').value.trim();
    if (!name) { toast('Informe o nome do processo.', 'warn'); $('#wsName').focus(); return; }
    createWorkspace(name, $('#wsProcess').value.trim(), $('#wsOrgao').value.trim());
    closeWorkspaceModal();
  });

  $('#wsName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#wsCreate').click(); });

  $('#btnReverify').addEventListener('click', () => {
    renderAll();
    toast('Verificação cruzada reexecutada.', 'ok');
  });

  $('#btnReset').addEventListener('click', () => {
    const ws = activeWs();
    if (!ws) return;
    if (!confirm(`Reiniciar o workspace "${ws.name}"?\nTodos os documentos e análises deste processo serão descartados.`)) return;
    ws.slots = {};
    ws.divergences = [];
    ws.compliance = {};
    ws.autoCompliance = {};
    touchWs(ws);
    persistState();
    renderAll();
    toast('Workspace reiniciado.', 'ok');
  });

  $('#btnExportJSON').addEventListener('click', exportJSON);
  $('#btnExportPDF').addEventListener('click', exportPDF);

  $('#btnCopyWsHash').addEventListener('click', () => {
    const h = $('#workspaceHash').textContent;
    if (h && h !== '—') navigator.clipboard.writeText(h).then(() => toast('Hash do workspace copiado.', 'ok'));
  });

  document.addEventListener('click', (e) => {
    const h = e.target.closest('[data-copy]');
    if (!h || !h.dataset.copy) return;
    navigator.clipboard.writeText(h.dataset.copy).then(() => toast('Hash copiado.', 'ok'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#wsModal').hidden) closeWorkspaceModal();
  });
}

/* -------------------------------------------------------------
   19. EXPORTAÇÃO — TRILHA JSON
   ------------------------------------------------------------- */
function buildPayload() {
  const ws = activeWs();
  if (!ws) return null;
  const loaded = getLoaded();
  const counts = { ok: 0, warn: 0, fail: 0, pending: 0 };
  LEGAL_MATRIX.forEach(i => {
    const s = getEffectiveCompliance(i.id);
    if (s === 'ok') counts.ok++;
    else if (s === 'warn') counts.warn++;
    else if (s === 'fail') counts.fail++;
    else counts.pending++;
  });

  return {
    geradoEm: new Date().toISOString(),
    geradoEmBR: fmtDate(),
    iniciadoEm: ws.createdAt,
    norma: 'Lei nº 14.133/2021',
    modulo: 'LicitaAudit Workspace · OmniLicit',
    workspaceId: ws.id,
    workspaceNome: ws.name,
    workspaceOrgao: ws.orgao || '',
    processo: ws.processo || loaded.find(x => x.fields?.processo)?.fields?.processo || null,
    workspaceHash: $('#workspaceHash').textContent || null,
    artefatos: loaded.map(x => ({
      slot: x.id,
      modulo: x.code,
      nome: x.file.name,
      tamanhoBytes: x.file.size,
      extensao: x.file.ext,
      sha256: x.hash,
      declaredHash: x.declaredHash,
      hashMatch: x.hashMatch,
      tag: x.tag,
      tagModule: x.tagModule,
      tagUnique: x.tagUnique,
      tagYear: x.tagYear,
      tagModuleMatch: x.tagModuleMatch,
      sealStatus: x.sealStatus,
      signature: x.signature,
      camposExtraidos: x.fields,
      carregadoEm: x.loadedAt,
    })),
    divergencias: ws.divergences,
    conformidade: LEGAL_MATRIX.map(i => ({
      id: i.id,
      artigo: i.art,
      titulo: i.title,
      descricao: i.desc,
      status: getEffectiveCompliance(i.id),
      automatico: ws.autoCompliance[i.id],
      manual: ws.compliance[i.id] || null,
    })),
    resumo: counts,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJSON() {
  const data = buildPayload();
  if (!data || !data.artefatos.length) { toast('Workspace vazio — nada para exportar.', 'warn'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(blob, `licitaudit-trilha-${stamp}.json`);
  toast('Trilha JSON exportada.', 'ok');
}

/* -------------------------------------------------------------
   20. EXPORTAÇÃO — LAUDO EM PDF (padrão executivo OmniLicit)
   ------------------------------------------------------------- */
let __logoDataURL = null;

async function loadLogoDataURL() {
  if (__logoDataURL !== null) return __logoDataURL;
  try {
    const res = await fetch('logo-omnlicit.png', { cache: 'force-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    __logoDataURL = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[LicitaAudit] logo-omnlicit.png não carregada:', err);
    __logoDataURL = null;
  }
  return __logoDataURL;
}

const SEV_LABEL = { critical: 'CRÍTICO', warning: 'AVISO', info: 'INFO' };
const SEV_COLOR = { critical: '#DC2626', warning: '#D97706', info: '#0284C7' };
const SEV_BG    = { critical: '#FEE2E2', warning: '#FEF3C7', info: '#E0F2FE' };

const ST_LABEL = { ok: 'CONFORME', warn: 'PENDENTE', fail: 'NÃO CONFORME' };
const ST_COLOR = { ok: '#059669', warn: '#D97706', fail: '#DC2626' };
const ST_BG    = { ok: '#D1FAE5', warn: '#FEF3C7', fail: '#FEE2E2' };

const SEAL_LABEL = {
  verified: 'VERIFICADO', sealed: 'VERIFICADO', tampered: 'DIVERGENTE',
  partial: 'PARCIAL', 'hash-only': 'PARCIAL', 'tag-only': 'PARCIAL',
  'signed-only': 'PARCIAL', unsigned: 'SEM SELO',
};
const SEAL_COLOR = {
  verified: '#059669', sealed: '#059669', tampered: '#DC2626',
  partial: '#D97706', 'hash-only': '#D97706', 'tag-only': '#D97706',
  'signed-only': '#D97706', unsigned: '#64748B',
};

const RULE = (color = '#0D9488', w = 1.2) => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: w, lineColor: color }],
});

const sectionHeader = (num, title, hint) => ({
  stack: [
    {
      columns: [
        { width: 30, text: num, fontSize: 22, bold: true, color: '#0D9488', alignment: 'center' },
        {
          width: '*',
          stack: [
            { text: title, fontSize: 13, bold: true, color: '#0F172A' },
            hint ? { text: hint, fontSize: 8, color: '#64748B', margin: [0, 3, 0, 0] } : null,
          ].filter(Boolean),
        },
      ],
    },
    RULE('#E2E8F0', 0.8),
  ],
  margin: [0, 0, 0, 14],
});

function buildCoverPage(data, logo) {
  const loadedCodes = data.artefatos.map(a => a.modulo).join(' · ') || '—';

  const metaRow = (k, v) => ([
    { text: k, fontSize: 8, bold: true, color: '#64748B', letterSpacing: 0.8 },
    { text: v || '—', fontSize: 9.5, color: '#0F172A', bold: true },
  ]);

  const metaTable = {
    table: {
      widths: [110, '*'],
      body: [
        metaRow('WORKSPACE', data.workspaceNome),
        metaRow('PROCESSO', data.processo || data.workspaceNome),
        metaRow('ÓRGÃO', data.workspaceOrgao),
        metaRow('EMISSÃO', data.geradoEmBR),
        metaRow('MÓDULOS ANALISADOS', `${data.artefatos.length} de ${SLOTS.length} (${loadedCodes})`),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#E2E8F0',
      paddingTop: () => 7,
      paddingBottom: () => 7,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
  };

  const hashBox = {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: 'HASH SHA-256 RAIZ DO WORKSPACE', fontSize: 7.5, bold: true, color: '#0D9488', letterSpacing: 1 },
          { text: data.workspaceHash || '—', fontSize: 8.5, color: '#0F172A', margin: [0, 4, 0, 0] },
        ],
      }]],
    },
    layout: {
      fillColor: () => '#F1F5F9',
      hLineColor: () => '#0D9488',
      vLineColor: () => '#0D9488',
      hLineWidth: () => 0.6,
      vLineWidth: () => 0,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
    margin: [0, 18, 0, 0],
  };

  const summary = {
    columns: [
      { width: '*', stack: [
        { text: 'CONFORMES', fontSize: 7.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
        { text: String(data.resumo.ok), fontSize: 20, bold: true, color: '#059669' },
      ]},
      { width: '*', stack: [
        { text: 'PENDENTES', fontSize: 7.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
        { text: String(data.resumo.warn + data.resumo.pending), fontSize: 20, bold: true, color: '#D97706' },
      ]},
      { width: '*', stack: [
        { text: 'NÃO CONFORMES', fontSize: 7.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
        { text: String(data.resumo.fail), fontSize: 20, bold: true, color: '#DC2626' },
      ]},
      { width: '*', stack: [
        { text: 'CRÍTICOS', fontSize: 7.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
        { text: String(data.divergencias.filter(d => d.severity === 'critical').length), fontSize: 20, bold: true, color: '#DC2626' },
      ]},
    ],
    margin: [0, 22, 0, 0],
  };

  const content = [
    {
      columns: [
        logo
          ? { width: 58, image: logo, fit: [58, 58] }
          : { width: 58, text: 'OMNI', fontSize: 14, bold: true, color: '#0D9488', alignment: 'center' },
        {
          width: '*',
          stack: [
            { text: 'OMNILICIT', fontSize: 12, bold: true, color: '#0D9488', letterSpacing: 2.4 },
            { text: 'Ecossistema Unificado de Contratações Públicas', fontSize: 8, color: '#64748B', margin: [0, 2, 0, 0] },
          ],
          margin: [12, 10, 0, 0],
        },
        {
          width: 160,
          stack: [
            { text: 'MÓDULO', fontSize: 7, bold: true, color: '#64748B', letterSpacing: 0.8, alignment: 'right' },
            { text: 'LicitaAudit', fontSize: 11, bold: true, color: '#0F172A', alignment: 'right' },
            { text: 'Auditoria Integrada', fontSize: 7.5, color: '#64748B', alignment: 'right', margin: [0, 1, 0, 0] },
          ],
          margin: [0, 8, 0, 0],
        },
      ],
    },
    { ...RULE('#0D9488', 2), margin: [0, 18, 0, 0] },
    {
      stack: [
        { text: 'LAUDO DE AUDITORIA', fontSize: 26, bold: true, color: '#0F172A', margin: [0, 40, 0, 0] },
        { text: 'DO WORKSPACE', fontSize: 26, bold: true, color: '#0D9488' },
        { text: 'Conformidade processual perante a Lei nº 14.133/2021', fontSize: 10.5, color: '#475569', margin: [0, 12, 0, 0] },
        { text: 'Auditoria cruzada de integridade, consistência documental e matriz legal.', fontSize: 9, color: '#64748B', margin: [0, 4, 0, 0] },
      ],
    },
    { text: 'IDENTIFICAÇÃO DO PROCESSO', fontSize: 7.5, bold: true, color: '#0D9488', letterSpacing: 1, margin: [0, 40, 0, 8] },
    metaTable,
    hashBox,
    summary,
  ];

  return { stack: content, pageBreak: 'after' };
}

function buildIntegritySection(data) {
  const body = [
    [
      { text: 'Módulo', style: 'th' },
      { text: 'Artefato', style: 'th' },
      { text: 'Hash SHA-256', style: 'th' },
      { text: 'Selo digital', style: 'th' },
      { text: 'Tamanho', style: 'th', alignment: 'right' },
    ],
    ...data.artefatos.map(a => {
      const sealKey = a.sealStatus?.status || 'unsigned';
      const sealLabel = SEAL_LABEL[sealKey] || 'SEM SELO';
      const sealColor = SEAL_COLOR[sealKey] || '#64748B';
      return [
        { text: a.modulo, fontSize: 8, bold: true, color: '#0D9488' },
        {
          stack: [
            { text: a.nome, fontSize: 8, color: '#0F172A' },
            { text: `${a.extensao.toUpperCase() || 'BIN'}${a.tagUnique ? ' · ' + a.tagUnique : ''}`, fontSize: 6.5, color: '#94A3B8', margin: [0, 1, 0, 0] },
          ],
        },
        { text: a.sha256 || '—', fontSize: 6.8, color: '#334155' },
        { text: sealLabel, fontSize: 7, bold: true, color: sealColor },
        { text: fmtBytes(a.tamanhoBytes), fontSize: 8, color: '#475569', alignment: 'right' },
      ];
    }),
  ];

  return {
    stack: [
      sectionHeader('1', 'Integridade Documental', 'Verificação criptográfica SHA-256 dos artefatos do workspace'),
      {
        table: {
          headerRows: 1,
          widths: [55, '*', 150, 65, 55],
          body,
        },
        layout: {
          fillColor: (row) => row === 0 ? '#F1F5F9' : null,
          hLineColor: () => '#E2E8F0',
          vLineColor: () => '#E2E8F0',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 7,
          paddingRight: () => 7,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
      data.artefatos.some(a => a.sealStatus?.status === 'tampered')
        ? {
            table: {
              widths: ['*'],
              body: [[{
                text: '⚠  Atenção: foram detectados artefatos com hash divergente. Recomenda-se revisão imediata da cadeia de custódia documental.',
                fontSize: 8, bold: true, color: '#991B1B',
              }]],
            },
            layout: {
              fillColor: () => '#FEE2E2',
              hLineColor: () => '#DC2626',
              vLineColor: () => '#DC2626',
              hLineWidth: () => 0.5, vLineWidth: () => 0.5,
              paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 7, paddingBottom: () => 7,
            },
            margin: [0, 12, 0, 0],
          }
        : null,
    ].filter(Boolean),
    pageBreak: 'before',
  };
}

function buildDivergencesSection(data) {
  const divs = [...data.divergencias].sort((a, b) => {
    const o = { critical: 0, warning: 1, info: 2 };
    return o[a.severity] - o[b.severity];
  });

  const body = [
    [
      { text: 'Severidade', style: 'th' },
      { text: 'Categoria', style: 'th' },
      { text: 'Descrição', style: 'th' },
      { text: 'Módulos', style: 'th' },
      { text: 'Base legal', style: 'th' },
    ],
    ...(divs.length
      ? divs.map(d => [
          {
            table: { widths: ['*'], body: [[{
              text: SEV_LABEL[d.severity] || d.severity.toUpperCase(),
              fontSize: 6.5, bold: true, color: SEV_COLOR[d.severity], alignment: 'center',
            }]] },
            layout: {
              fillColor: () => SEV_BG[d.severity],
              hLineWidth: () => 0, vLineWidth: () => 0,
              paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2,
            },
          },
          { text: d.category || '—', fontSize: 7.5, color: '#334155' },
          {
            stack: [
              { text: d.title, fontSize: 8, bold: true, color: '#0F172A' },
              { text: d.description, fontSize: 7, color: '#475569', margin: [0, 2, 0, 0] },
            ],
          },
          { text: (d.modules || []).join(', ') || '—', fontSize: 7, color: '#0D9488' },
          { text: d.legalRef || '—', fontSize: 7, color: '#64748B' },
        ])
      : [[{ text: 'Nenhuma divergência detectada entre os módulos analisados.', fontSize: 8, italics: true, color: '#64748B', colSpan: 5, alignment: 'center' }, {}, {}, {}, {}]]
    ),
  ];

  const counts = {
    critical: divs.filter(d => d.severity === 'critical').length,
    warning:  divs.filter(d => d.severity === 'warning').length,
    info:     divs.filter(d => d.severity === 'info').length,
  };

  return {
    stack: [
      sectionHeader('2', 'Divergências e Alertas Cruzados', 'Consistência de campos e identificação entre módulos (DFD · ETP · TR · Edital · Contrato)'),
      {
        columns: [
          { width: '*', text: `${counts.critical} crítico(s)`,  fontSize: 8, bold: true, color: '#DC2626', alignment: 'left' },
          { width: '*', text: `${counts.warning} aviso(s)`,     fontSize: 8, bold: true, color: '#D97706', alignment: 'center' },
          { width: '*', text: `${counts.info} informativo(s)`,  fontSize: 8, bold: true, color: '#0284C7', alignment: 'right' },
        ],
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: [55, 75, '*', 80, 55],
          body,
        },
        layout: {
          fillColor: (row) => row === 0 ? '#F1F5F9' : null,
          hLineColor: () => '#E2E8F0',
          vLineColor: () => '#E2E8F0',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 7,
          paddingRight: () => 7,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
    ],
    pageBreak: 'before',
  };
}

function buildComplianceSection(data) {
  const body = [
    [
      { text: 'Artigo', style: 'th' },
      { text: 'Requisito', style: 'th' },
      { text: 'Status', style: 'th', alignment: 'center' },
    ],
    ...data.conformidade.map(c => [
      { text: c.artigo, fontSize: 8, bold: true, color: '#0D9488' },
      {
        stack: [
          { text: c.titulo, fontSize: 8, bold: true, color: '#0F172A' },
          { text: c.descricao, fontSize: 7, color: '#475569', margin: [0, 2, 0, 0] },
        ],
      },
      {
        table: { widths: ['*'], body: [[{
          text: ST_LABEL[c.status] || 'NÃO AVALIADO',
          fontSize: 6.5, bold: true, color: ST_COLOR[c.status] || '#64748B', alignment: 'center',
        }]] },
        layout: {
          fillColor: () => ST_BG[c.status] || '#F1F5F9',
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2,
        },
      },
    ]),
  ];

  return {
    stack: [
      sectionHeader('3', 'Matriz de Conformidade Legal', 'Avaliação artigo a artigo · Lei nº 14.133/2021'),
      {
        table: {
          headerRows: 1,
          widths: [45, '*', 75],
          body,
        },
        layout: {
          fillColor: (row) => row === 0 ? '#F1F5F9' : null,
          hLineColor: () => '#E2E8F0',
          vLineColor: () => '#E2E8F0',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
    ],
    pageBreak: 'before',
  };
}

function buildSignaturePage(data, logo) {
  const hash = data.workspaceHash || '—';

  const sealBox = {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          {
            columns: [
              {
                width: 34,
                stack: [
                  {
                    canvas: [
                      { type: 'ellipse', x: 15, y: 15, r1: 15, r2: 15, color: '#0D9488', fillColor: '#0D9488' },
                      { type: 'line', x1: 8, y1: 15, x2: 13, y2: 20, lineWidth: 2, lineColor: '#FFFFFF', lineCap: 'round' },
                      { type: 'line', x1: 13, y1: 20, x2: 23, y2: 9, lineWidth: 2, lineColor: '#FFFFFF', lineCap: 'round' },
                    ],
                  },
                ],
              },
              {
                width: '*',
                stack: [
                  { text: 'SELO DIGITAL DO WORKSPACE', fontSize: 10, bold: true, color: '#0D9488', letterSpacing: 1.4 },
                  { text: 'Autenticação criptográfica via SHA-256', fontSize: 8, color: '#475569', margin: [0, 2, 0, 0] },
                ],
                margin: [10, 6, 0, 0],
              },
            ],
          },
          { ...RULE('#0D9488', 0.6), margin: [0, 14, 0, 10] },
          { text: 'HASH SHA-256 GLOBAL', fontSize: 7, bold: true, color: '#64748B', letterSpacing: 1 },
          { text: hash, fontSize: 9, color: '#0F172A', margin: [0, 4, 0, 0] },
          { text: `Emitido em ${data.geradoEmBR}`, fontSize: 8, color: '#475569', margin: [0, 10, 0, 0] },
        ],
      }]],
    },
    layout: {
      fillColor: () => '#F0FDFA',
      hLineColor: () => '#0D9488',
      vLineColor: () => '#0D9488',
      hLineWidth: () => 0.8,
      vLineWidth: () => 0,
      paddingLeft: () => 16,
      paddingRight: () => 16,
      paddingTop: () => 14,
      paddingBottom: () => 14,
    },
  };

  const summaryBox = {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        { stack: [
          { text: 'MÓDULOS', fontSize: 6.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
          { text: `${data.artefatos.length} / ${SLOTS.length}`, fontSize: 11, bold: true, color: '#0F172A', margin: [0, 2, 0, 0] },
        ], alignment: 'center' },
        { stack: [
          { text: 'CONFORMES', fontSize: 6.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
          { text: String(data.resumo.ok), fontSize: 11, bold: true, color: '#059669', margin: [0, 2, 0, 0] },
        ], alignment: 'center' },
        { stack: [
          { text: 'PENDENTES', fontSize: 6.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
          { text: String(data.resumo.warn + data.resumo.pending), fontSize: 11, bold: true, color: '#D97706', margin: [0, 2, 0, 0] },
        ], alignment: 'center' },
        { stack: [
          { text: 'NÃO CONFORMES', fontSize: 6.5, bold: true, color: '#64748B', letterSpacing: 0.8 },
          { text: String(data.resumo.fail), fontSize: 11, bold: true, color: '#DC2626', margin: [0, 2, 0, 0] },
        ], alignment: 'center' },
      ]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingTop: () => 4, paddingBottom: () => 4,
    },
    margin: [0, 18, 0, 0],
  };

  const signatureLine = (label, role) => ({
    width: '*',
    stack: [
      { text: ' ', margin: [0, 26, 0, 0] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: '#94A3B8' }] },
      { text: label, fontSize: 8, bold: true, color: '#0F172A', margin: [0, 5, 0, 0] },
      { text: role, fontSize: 7, color: '#64748B', margin: [0, 1, 0, 0] },
    ],
    alignment: 'center',
  });

  return {
    stack: [
      {
        columns: [
          logo
            ? { width: 40, image: logo, fit: [40, 40] }
            : { width: 40, text: 'OMNI', fontSize: 10, bold: true, color: '#0D9488', alignment: 'center' },
          {
            width: '*',
            stack: [
              { text: 'ENCERRAMENTO E AUTENTICAÇÃO', fontSize: 12, bold: true, color: '#0F172A' },
              { text: 'Assinatura e carimbo temporal do laudo de auditoria', fontSize: 8, color: '#64748B', margin: [0, 2, 0, 0] },
            ],
            margin: [12, 6, 0, 0],
          },
        ],
      },
      { ...RULE('#0D9488', 1.2), margin: [0, 14, 0, 0] },
      { text: ' ', margin: [0, 14, 0, 0] },
      sealBox,
      summaryBox,
      { text: 'RESPONSÁVEIS PELA AUDITORIA', fontSize: 7.5, bold: true, color: '#0D9488', letterSpacing: 1.2, margin: [0, 40, 0, 0] },
      { ...RULE('#E2E8F0', 0.6), margin: [0, 6, 0, 0] },
      {
        columns: [
          signatureLine('Auditor Responsável', 'Matrícula / Portaria'),
          signatureLine('Autoridade Competente', 'Ordenador de Despesas'),
        ],
        columnGap: 40,
      },
      {
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: 'AVISO LEGAL', fontSize: 7, bold: true, color: '#475569', letterSpacing: 0.8 },
              {
                text: 'Documento gerado automaticamente pelo módulo LicitaAudit do ecossistema OmniLicit. Todo o processamento — extração, cálculo de hash SHA-256 e verificação de integridade — ocorreu integralmente no dispositivo do usuário, sem transmissão de dados a terceiros. A autenticidade deste laudo pode ser confirmada mediante conferência do hash SHA-256 acima com os artefatos originais.',
                fontSize: 7.5, color: '#475569', lineHeight: 1.4, margin: [0, 4, 0, 0],
              },
              { text: `Emitido em ${data.geradoEmBR} · Sessão iniciada em ${fmtDate(new Date(data.iniciadoEm))}`, fontSize: 6.8, color: '#94A3B8', margin: [0, 8, 0, 0] },
            ],
          }]],
        },
        layout: {
          fillColor: () => '#F8FAFC',
          hLineColor: () => '#E2E8F0',
          vLineColor: () => '#E2E8F0',
          hLineWidth: () => 0.5, vLineWidth: () => 0.5,
          paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 10, paddingBottom: () => 10,
        },
        margin: [0, 40, 0, 0],
      },
    ],
    pageBreak: 'before',
  };
}

function laudoHeader(currentPage, data, logo) {
  if (currentPage === 1) return null;
  return {
    margin: [40, 22, 40, 0],
    columns: [
      logo
        ? { width: 22, image: logo, fit: [22, 22] }
        : { width: 22, text: 'O', fontSize: 12, bold: true, color: '#0D9488', alignment: 'center' },
      {
        width: '*',
        stack: [
          { text: 'LAUDO DE AUDITORIA · LicitaAudit', fontSize: 8, bold: true, color: '#0F172A', margin: [8, 0, 0, 0] },
          { text: data.workspaceNome || '—', fontSize: 7, color: '#64748B', margin: [8, 1, 0, 0] },
        ],
      },
      {
        width: 'auto',
        stack: [
          { text: `Processo: ${data.processo || '—'}`, fontSize: 7, color: '#475569', alignment: 'right' },
          { text: data.geradoEmBR, fontSize: 7, color: '#94A3B8', alignment: 'right', margin: [0, 1, 0, 0] },
        ],
      },
    ],
  };
}

function laudoFooter(currentPage, pageCount, data) {
  if (currentPage === 1) return null;
  return {
    margin: [40, 10, 40, 22],
    stack: [
      { ...RULE('#E2E8F0', 0.5), margin: [0, 0, 0, 6] },
      {
        columns: [
          { width: '*', text: `LicitaAudit · OmniLicit — Hash raiz ${shortHash(data.workspaceHash)}`, fontSize: 7, color: '#94A3B8' },
          { width: '*', text: 'Lei nº 14.133/2021', fontSize: 7, color: '#94A3B8', alignment: 'center' },
          { width: '*', text: `Página ${currentPage} de ${pageCount}`, fontSize: 7, color: '#94A3B8', alignment: 'right' },
        ],
      },
    ],
  };
}

async function exportPDF() {
  if (!window.pdfMake) { toast('pdfMake indisponível (offline?).', 'danger'); return; }
  const ws = activeWs();
  if (!ws || !getLoaded().length) { toast('Workspace vazio — nada para exportar.', 'warn'); return; }

  const data = buildPayload();
  data.workspaceNome  = ws.name;
  data.workspaceOrgao = ws.orgao || '—';

  // Enriquecer artefatos com status de selo (para a seção 1)
  const slotByCode = Object.fromEntries(
    Object.entries(ws.slots).map(([sid, s]) => [SLOTS.find(x => x.id === sid)?.code, s])
  );
  data.artefatos = data.artefatos.map(a => {
    const src = slotByCode[a.modulo] || {};
    return {
      ...a,
      sealStatus: src.sealStatus || { status: 'unsigned' },
      tagUnica: src.tagUnique || null,
    };
  });

  const logo = await loadLogoDataURL();

  const docDef = {
    pageSize: 'A4',
    pageMargins: [40, 62, 40, 56],
    info: {
      title: `Laudo de Auditoria — ${ws.name}`,
      author: 'OmniLicit · LicitaAudit',
      subject: 'Auditoria de conformidade — Lei nº 14.133/2021',
      keywords: 'licitação, auditoria, conformidade, omnicit, licitaudit, ' + (data.processo || ''),
      creator: 'OmniLicit LicitaAudit Workspace',
    },
    header: (cp) => laudoHeader(cp, data, logo),
    footer: (cp, pc) => laudoFooter(cp, pc, data),
    content: [
      buildCoverPage(data, logo),
      buildIntegritySection(data),
      buildDivergencesSection(data),
      buildComplianceSection(data),
      buildSignaturePage(data, logo),
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0F172A', lineHeight: 1.3 },
    styles: {
      th: {
        fontSize: 7.5, bold: true, color: '#334155',
        fillColor: '#F1F5F9', letterSpacing: 0.4,
      },
    },
  };

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = (ws.name || 'workspace').replace(/[^\w\-]+/g, '_').slice(0, 40);
    window.pdfMake.createPdf(docDef).download(`laudo-licitaudit-${safeName}-${stamp}.pdf`);
    toast('Laudo executivo gerado em PDF.', 'ok');
  } catch (err) {
    console.error('[LicitaAudit] PDF erro:', err);
    toast('Falha ao gerar PDF. Verifique o console.', 'danger');
  }
}

/* -------------------------------------------------------------
   21. BOOTSTRAP
   ------------------------------------------------------------- */
(function init() {
  Theme.init();
  restoreState();
  bindWorkspaceList();
  bindSidebar();
  bindCompliance();
  bindGlobal();
  renderAll();

  $('#year').textContent = new Date().getFullYear();
  $('#footerSession').textContent = `Sessão iniciada em ${fmtDate()}`;

  if (!window.crypto?.subtle) {
    toast('Web Crypto indisponível. Sirva o módulo via HTTPS ou localhost.', 'danger', 8000);
  }

  console.info(
    '%c LicitaAudit · Multi-Workspace OmniLicit ',
    'background:#14B8A6;color:#062620;font-weight:700;padding:2px 6px;border-radius:4px',
    `\nWorkspaces restaurados: ${Object.keys(STATE.workspaces).length}`,
    `\nWorkspace ativo: ${STATE.activeId || '—'}`
  );
})();
