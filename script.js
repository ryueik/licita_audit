/* =============================================================
   LicitaAudit · Workspace — OmniLicit
   Motor de auditoria cruzada · Lei nº 14.133/2021
   ============================================================= */
'use strict';

/* -------------------------------------------------------------
   1. DEFINIÇÃO DOS MÓDULOS DO WORKSPACE
   ------------------------------------------------------------- */
const SLOTS = [
  { id: 'dfd',      code: 'LicitaReq',    label: 'DFD — Formalização de Demanda',      articles: ['Art. 12', 'Art. 18'], required: true  },
  { id: 'etp',      code: 'LicitaETP',    label: 'ETP — Estudo Técnico Preliminar',    articles: ['Art. 18', 'Art. 22'], required: true  },
  { id: 'tr',       code: 'LicitaTR',     label: 'TR — Termo de Referência',           articles: ['Art. 22', 'Art. 23'], required: true  },
  { id: 'edital',   code: 'LicitaEdital', label: 'Edital de Licitação',                articles: ['Art. 25', 'Art. 36'], required: false },
  { id: 'contrato', code: 'LicitaContrato', label: 'Contrato / Ata de Registro',       articles: ['Art. 92', 'Art. 94'], required: false },
];

/* -------------------------------------------------------------
   2. MATRIZ LEGAL — Lei nº 14.133/2021
   ------------------------------------------------------------- */
const LEGAL_MATRIX = [
  { id: 'art5',   art: 'Art. 5º',   title: 'Princípios administrativos',           desc: 'Legalidade, impessoalidade, moralidade, publicidade, eficiência, motivação, razoabilidade, competitividade, planejamento, transparência, segregação de funções.' },
  { id: 'art11',  art: 'Art. 11',   title: 'Objetivos do processo licitatório',    desc: 'Seleção da proposta mais vantajosa, tratamento isonômico e observância da justa competição.' },
  { id: 'art12',  art: 'Art. 12',   title: 'Fases da licitação',                   desc: 'Preparatória, divulgação do edital, apresentação de propostas e lances, julgamento, habilitação, recursal e homologação.' },
  { id: 'art18',  art: 'Art. 18',   title: 'Estudo Técnico Preliminar (ETP)',      desc: 'Caracterização da necessidade, levantamento de mercado, estimativa de quantidades e valor, riscos e sustentabilidade.' },
  { id: 'art22',  art: 'Art. 22',   title: 'Projeto Básico / Termo de Referência', desc: 'Descrição do objeto, fundamentação, prazo, especificações técnicas, critérios de julgamento e forma de pagamento.' },
  { id: 'art23',  art: 'Art. 23',   title: 'Pesquisa de preços',                   desc: 'Painel de preços, contratações similares, mídia especializada ou fornecedores — para composição do TR.' },
  { id: 'art24',  art: 'Art. 24',   title: 'Matriz de Alocação de Riscos',         desc: 'Obrigatória para contratos de grande vulto e obras/engenharia, com identificação de riscos e responsabilidades.' },
  { id: 'art25',  art: 'Art. 25',   title: 'Edital — conteúdo e publicidade',      desc: 'Objeto, regras de participação, critérios de julgamento, valores, prazos e demais elementos do processo.' },
  { id: 'art33',  art: 'Art. 33',   title: 'Adoção do Pregão (preferencial)',      desc: 'Pregão obrigatoriamente eletrônico para bens e serviços comuns.' },
  { id: 'art36',  art: 'Art. 36',   title: 'Publicidade no PNCP',                  desc: 'Divulgação obrigatória no Portal Nacional de Contratações Públicas e no sítio oficial do ente.' },
  { id: 'art63',  art: 'Art. 63',   title: 'Habilitação',                          desc: 'Jurídica, técnica, fiscal e econômico-financeira, com verificação prévia à celebração do contrato.' },
  { id: 'art71',  art: 'Art. 71',   title: 'Encerramento da fase competitiva',     desc: 'Registro dos lances, julgamento das propostas e declaração do vencedor com publicidade.' },
  { id: 'art72',  art: 'Art. 72',   title: 'Homologação e adjudicação',            desc: 'Homologação pela autoridade competente, com verificação de regularidade do processo e da proposta.' },
  { id: 'art75',  art: 'Art. 75',   title: 'Contratação direta — dispensa',        desc: 'Hipóteses de dispensa, justificativa de preço e razão de escolha do contratado.' },
  { id: 'art89',  art: 'Art. 89',   title: 'Contratação direta — procedimento',    desc: 'Justificativa de preço, razão de escolha e instrução processual nos casos de dispensa/inexigibilidade.' },
  { id: 'art92',  art: 'Art. 92',   title: 'Cláusulas necessárias do contrato',    desc: 'Objeto, regime, preço, prazos, garantias, fiscalização, sanções, extinção e demais cláusulas essenciais.' },
  { id: 'art94',  art: 'Art. 94',   title: 'Publicidade do contrato no PNCP',      desc: 'Publicação obrigatória do extrato contratual no Portal Nacional de Contratações Públicas.' },
  { id: 'art174', art: 'Art. 174',  title: 'Portal Nacional de Contratações',      desc: 'Integração e alimentação obrigatória de dados ao PNCP.' },
];

/* -------------------------------------------------------------
   3. ESTADO GLOBAL DO WORKSPACE
   ------------------------------------------------------------- */
const STATE = {
  slots: {},          // id -> { file, hash, text, fields, seal, loadedAt, status }
  divergences: [],
  compliance: {},     // articleId -> 'ok' | 'warn' | 'fail' | null (override manual)
  autoCompliance: {}, // articleId -> status automático
  startedAt: new Date(),
};

/* -------------------------------------------------------------
   4. UTILITÁRIOS
   ------------------------------------------------------------- */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10);

const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};
const fmtDate = (d = new Date()) => d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

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

const escapeHTML = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escapeAttr = (s = '') => escapeHTML(s).replace(/`/g, '&#96;');

/* -------------------------------------------------------------
   5. TEMA (persistente)
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
  toggle() {
    this.apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  },
};

/* -------------------------------------------------------------
   6. HASH SHA-256
   ------------------------------------------------------------- */
async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* -------------------------------------------------------------
   7. EXTRAÇÃO DE TEXTO E CAMPOS
   ------------------------------------------------------------- */
const detectExt = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

async function extractText(file, buffer) {
  const ext = detectExt(file.name);
  // Formatos texto-legíveis → decode UTF-8
  if (['txt', 'csv', 'json', 'xml', 'md', 'html', 'htm'].includes(ext)) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
  // PDF e binários → scan latin1 (captura strings de texto embutidas)
  return new TextDecoder('latin1', { fatal: false }).decode(buffer);
}

function toNumberBR(s) {
  if (s == null) return null;
  const clean = String(s).replace(/[^\d.,-]/g, '').trim();
  if (!clean) return null;
  // Heurística BR: "50.000,00" → 50000.00 ; "50,5" → 50.5 ; "50000" → 50000
  let n;
  if (/,\d{1,2}$/.test(clean)) n = clean.replace(/\./g, '').replace(',', '.');
  else n = clean.replace(/,/g, '');
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}

function extractFields(text, ext, filename) {
  const fields = {};

  // ---- Tentar JSON estruturado (formato canônico OmniLicit) ----
  if (ext === 'json') {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        fields.processo      = obj.processo || obj.processNumber || obj.numeroProcesso || null;
        fields.objeto        = obj.objeto   || obj.object        || null;
        fields.quantidade    = obj.quantidade ?? obj.qtd ?? obj.quantity ?? null;
        fields.unidade       = obj.unidade  || obj.unit || null;
        fields.valorEstimado = obj.valorEstimado ?? obj.valor ?? obj.estimatedValue ?? null;
        fields.orgao         = obj.orgao    || obj.org || obj.unidadeGestora || null;
        fields.uasg          = obj.uasg     || null;
        fields.data          = obj.data     || obj.date || null;
        fields.responsavel   = obj.responsavel || obj.responsible || null;
        fields.modulo        = obj.modulo   || null;
        return cleanFields(fields);
      }
    } catch { /* segue para regex */ }
  }

  // ---- Extração por regex (fallback universal) ----
  const first = (re) => {
    const m = text.match(re);
    return m ? (m[1] || m[2] || '').trim() : null;
  };

  fields.processo = first(/processo(?:\s+n?[º°.:]*)?\s*[:\-]?\s*([\w./-]{4,40})/i);
  fields.objeto   = first(/objeto\s*(?:do\s+processo|da\s+contrata[çc][ãa]o)?\s*[:\-]\s*([^\n\r]{10,300})/i);
  fields.quantidade = first(/(?:quantidade|qtd\.?|quantitativo)\s*[:\-]?\s*([\d.,]{1,20})/i);
  fields.unidade    = first(/unidade\s*(?:de\s*medida)?\s*[:\-]?\s*([A-Za-zçãáéíóúâêô]{1,15})/i);
  fields.valorEstimado = first(/(?:valor\s+(?:estimado|total|global|de\s+refer[êe]ncia)?)\s*[:\-]?\s*R?\$?\s*([\d.,]{3,25})/i);
  fields.orgao  = first(/(?:[óo]rg[ãa]o|unidade\s+gestora|entidade)\s*[:\-]\s*([^\n\r]{3,120})/i);
  fields.uasg   = first(/uasg\s*[:\-]?\s*(\d{6})/i);
  fields.data   = first(/data\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  fields.responsavel = first(/respons[áa]vel\s*[:\-]\s*([^\n\r]{3,120})/i);

  return cleanFields(fields);
}

function cleanFields(f) {
  const out = {};
  for (const k of Object.keys(f)) {
    const v = f[k];
    if (v === null || v === undefined || v === '') continue;
    if (k === 'quantidade')     out[k] = typeof v === 'number' ? v : toNumberBR(v);
    else if (k === 'valorEstimado') out[k] = typeof v === 'number' ? v : toNumberBR(v);
    else out[k] = String(v).trim().replace(/\s+/g, ' ');
  }
  return out;
}

/* -------------------------------------------------------------
   8. LEITURA DE SELOS DIGITAIS
   ------------------------------------------------------------- */
function inspectSeal(file, buffer) {
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

  if (['xml', 'nfe', 'cte'].includes(ext)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (/<Signature[\s>]/i.test(text)) { res.signed = true; res.standard = 'XMLDSig'; res.level = 'basic'; res.details.push('Elemento <Signature>'); }
    if (/ICP-Brasil/i.test(text)) { res.level = 'icp'; res.details.push('Cadeia ICP-Brasil'); }
  }

  if (!res.details.length) res.details.push('Nenhum selo identificado');
  return res;
}

/* -------------------------------------------------------------
   9. ROTEAMENTO AUTOMÁTICO DE ARQUIVO → SLOT
   ------------------------------------------------------------- */
function detectSlotFor(filename, text, fields) {
  const low = (filename + ' ' + text.slice(0, 3000)).toLowerCase();

  // 1) Metadado explícito
  const modulo = (fields?.modulo || '').toLowerCase();
  if (/dfd|licitareq|formaliza/.test(modulo)) return 'dfd';
  if (/etp|estudo/.test(modulo))              return 'etp';
  if (/licitatr|^tr|termo/.test(modulo))      return 'tr';
  if (/edital/.test(modulo))                  return 'edital';
  if (/contrato|ata/.test(modulo))            return 'contrato';

  // 2) Nome do arquivo
  if (/licitareq|[-_ .]dfd|formaliza/.test(low))    return 'dfd';
  if (/licitaetp|[-_ .]etp|estudo\s+t[ée]cnico/.test(low)) return 'etp';
  if (/licitatr|[-_ .]tr[._]|termo\s+de\s+refer/.test(low)) return 'tr';
  if (/edital/.test(low))                            return 'edital';
  if (/contrato|ata\s+de\s+registro/.test(low))      return 'contrato';

  return null;
}

/* -------------------------------------------------------------
   10. PROCESSAMENTO DE ARQUIVO
   ------------------------------------------------------------- */
async function processFile(file) {
  const buffer = await file.arrayBuffer();
  const hash   = await sha256(buffer);
  const ext    = detectExt(file.name);
  const text   = await extractText(file, buffer);
  const seal   = inspectSeal(file, buffer);
  const fields = extractFields(text, ext, file.name);

  return {
    file: { name: file.name, size: file.size, ext, mime: file.type || '' },
    hash, text, seal, fields,
    loadedAt: new Date(),
  };
}

async function loadFileIntoSlot(slotId, file) {
  try {
    const payload = await processFile(file);
    payload.status = 'ok';
    STATE.slots[slotId] = payload;
    toast(`${SLOTS.find(s => s.id === slotId).code}: ${file.name} carregado.`, 'ok');
  } catch (err) {
    console.error('[LicitaAudit] erro', err);
    toast(`Falha ao processar ${file.name}`, 'danger');
  }
  refreshAll();
}

async function loadBulk(files) {
  const list = Array.from(files);
  if (!list.length) return;

  const routing = { matched: [], unmatched: [] };
  for (const file of list) {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('latin1').decode(buffer.slice(0, 4000));
    const ext  = detectExt(file.name);
    const fields = extractFields(await extractText(file, buffer), ext, file.name);
    const target = detectSlotFor(file.name, text, fields);

    if (target) routing.matched.push({ file, slotId: target });
    else routing.unmatched.push(file);
  }

  for (const { file, slotId } of routing.matched) {
    await loadFileIntoSlot(slotId, file);
  }

  if (routing.unmatched.length) {
    toast(`${routing.unmatched.length} arquivo(s) sem módulo identificado. Use os slots individuais.`, 'warn', 5000);
  }
  refreshAll();
}

/* -------------------------------------------------------------
   11. MOTOR DE CRUZAMENTO (CROSS-CHECK)
   ------------------------------------------------------------- */
function getLoaded() {
  return Object.entries(STATE.slots)
    .filter(([, s]) => s && s.file)
    .map(([id, s]) => ({ id, ...s, code: SLOTS.find(x => x.id === id).code }));
}

function jaccard(a = '', b = '') {
  const setA = new Set(String(a).toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const setB = new Set(String(b).toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (!setA.size && !setB.size) return 1;
  let inter = 0;
  setA.forEach(w => { if (setB.has(w)) inter++; });
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

function runCrossChecks() {
  const div = [];
  const loaded = getLoaded();

  const add = (severity, category, title, description, modules, legalRef, field) =>
    div.push({ id: uid(), severity, category, title, description, modules, legalRef, field });

  // --- 1. Campos de identificação por módulo ---
  const byField = (key) => loaded
    .filter(x => x.fields?.[key] != null && x.fields[key] !== '')
    .map(x => ({ id: x.id, code: x.code, value: x.fields[key] }));

  // 1.1 Número do processo
  const processos = byField('processo');
  if (processos.length > 1) {
    const ref = processos[0];
    for (const p of processos.slice(1)) {
      if (p.value !== ref.value) {
        add('critical', 'Identificação',
          'Divergência no número do processo',
          `"${ref.value}" em ${ref.code} difere de "${p.value}" em ${p.code}.`,
          [ref.code, p.code], 'Art. 12', 'processo');
      }
    }
  }

  // 1.2 Órgão / UASG
  const orgaos = byField('orgao');
  if (orgaos.length > 1) {
    const ref = orgaos[0];
    for (const o of orgaos.slice(1)) {
      if (jaccard(ref.value, o.value) < 0.5) {
        add('warning', 'Identificação',
          'Divergência de órgão/unidade gestora',
          `"${ref.value}" (${ref.code}) vs "${o.value}" (${o.code}).`,
          [ref.code, o.code], 'Art. 12', 'orgao');
      }
    }
  }
  const uasgs = byField('uasg');
  if (uasgs.length > 1) {
    const ref = uasgs[0];
    for (const u of uasgs.slice(1)) {
      if (u.value !== ref.value) {
        add('critical', 'Identificação',
          'Divergência de UASG',
          `UASG "${ref.value}" (${ref.code}) vs "${u.value}" (${u.code}).`,
          [ref.code, u.code], 'Art. 12', 'uasg');
      }
    }
  }

  // 1.3 Quantidade
  const qtds = byField('quantidade').map(x => ({ ...x, value: Number(x.value) }))
    .filter(x => Number.isFinite(x.value));
  if (qtds.length > 1) {
    const ref = qtds[0];
    for (const q of qtds.slice(1)) {
      if (q.value !== ref.value) {
        const delta = Math.abs(q.value - ref.value);
        const pct = ref.value ? (delta / ref.value) * 100 : 100;
        const sev = pct > 10 ? 'critical' : 'warning';
        add(sev, 'Consistência',
          'Divergência de quantitativo',
          `Quantidade ${ref.value} (${ref.code}) vs ${q.value} (${q.code}). Diferença de ${delta} (${pct.toFixed(1)}%).`,
          [ref.code, q.code], 'Art. 22', 'quantidade');
      }
    }
  }

  // 1.4 Valor estimado
  const valores = byField('valorEstimado').map(x => ({ ...x, value: Number(x.value) }))
    .filter(x => Number.isFinite(x.value) && x.value > 0);
  if (valores.length > 1) {
    const ref = valores[0];
    for (const v of valores.slice(1)) {
      const delta = Math.abs(v.value - ref.value);
      const pct = ref.value ? (delta / ref.value) * 100 : 100;
      if (pct > 5) {
        const sev = pct > 20 ? 'critical' : 'warning';
        add(sev, 'Consistência',
          'Divergência de valor estimado',
          `R$ ${ref.value.toLocaleString('pt-BR')} (${ref.code}) vs R$ ${v.value.toLocaleString('pt-BR')} (${v.code}). Diferença de ${pct.toFixed(1)}%.`,
          [ref.code, v.code], 'Art. 23', 'valorEstimado');
      }
    }
  }

  // 1.5 Similaridade do objeto
  const objetos = byField('objeto');
  if (objetos.length > 1) {
    const ref = objetos[0];
    for (const o of objetos.slice(1)) {
      const sim = jaccard(ref.value, o.value);
      if (sim < 0.4) {
        add('warning', 'Consistência',
          'Objeto com baixa aderência entre módulos',
          `Similaridade de apenas ${(sim * 100).toFixed(0)}% entre ${ref.code} e ${o.code}. Verificar alinhamento da descrição do objeto.`,
          [ref.code, o.code], 'Art. 22', 'objeto');
      }
    }
  }

  // --- 2. Duplicidade de hashes ---
  const hashMap = new Map();
  loaded.forEach(x => {
    if (!hashMap.has(x.hash)) hashMap.set(x.hash, []);
    hashMap.get(x.hash).push(x.code);
  });
  hashMap.forEach((codes, h) => {
    if (codes.length > 1) {
      add('critical', 'Integridade',
        'Hash SHA-256 duplicado entre módulos',
        `Artefatos idênticos detectados em ${codes.join(', ')}. Possível duplicidade de upload ou arquivo incorreto. Hash: ${h.slice(0, 16)}…`,
        codes, 'Art. 12', 'hash');
    }
  });

  // --- 3. Completude documental ---
  SLOTS.filter(s => s.required).forEach(s => {
    const loaded = STATE.slots[s.id]?.file;
    if (!loaded) {
      add('critical', 'Completude',
        `Módulo obrigatório ausente: ${s.code}`,
        `${s.label} não foi importado no workspace. Sem este artefato, a instrução processual resta incompleta.`,
        [s.code], s.articles[0], 'required');
    }
  });

  // --- 4. Selos digitais ausentes em documentos críticos ---
  loaded.forEach(x => {
    if (!x.seal.signed) {
      add('info', 'Assinatura',
        `Documento sem selo digital: ${x.code}`,
        `${x.file.name} não possui assinatura eletrônica detectada. Recomenda-se exigir assinatura ICP-Brasil para rastreabilidade.`,
        [x.code], 'Art. 5º', 'seal');
    }
  });

  // --- 5. Ausência de campos-chave ---
  const criticalFields = ['processo', 'objeto', 'valorEstimado'];
  loaded.forEach(x => {
    criticalFields.forEach(f => {
      if (!x.fields?.[f]) {
        add('warning', 'Extração',
          `Campo "${f}" não localizado em ${x.code}`,
          `Não foi possível extrair "${f}" automaticamente. Verifique o formato do artefato ou preencha manualmente.`,
          [x.code], 'Art. 12', f);
      }
    });
  });

  STATE.divergences = div;
  return div;
}

/* -------------------------------------------------------------
   12. CÁLCULO DE CONFORMIDADE AUTOMÁTICA
   ------------------------------------------------------------- */
function calcCompliance() {
  const auto = {};
  const loaded = getLoaded();
  const loadedIds = new Set(loaded.map(x => x.id));

  // Mapa artigo → módulos que o cobrem
  const articleCoverage = {};
  SLOTS.forEach(s => {
    s.articles.forEach(a => {
      const key = a.replace(/[^\d]/g, '');
      if (!articleCoverage[key]) articleCoverage[key] = [];
      articleCoverage[key].push(s.id);
    });
  });

  LEGAL_MATRIX.forEach(item => {
    const num = item.art.replace(/[^\d]/g, '');
    const coverModules = articleCoverage[num] || [];
    const covered = coverModules.some(id => loadedIds.has(id));

    // Divergências críticas ligadas a este artigo
    const divCrit = STATE.divergences.filter(d =>
      d.severity === 'critical' && (d.legalRef === item.art || coverModules.includes(d.field))
    );

    let status;
    if (!covered) status = 'warn';
    else if (divCrit.length) status = 'fail';
    else status = 'ok';

    auto[item.id] = status;
  });

  STATE.autoCompliance = auto;
}

/* -------------------------------------------------------------
   13. RENDERS
   ------------------------------------------------------------- */
function renderSidebar() {
  const list = $('#slotList');
  const loadedCount = Object.values(STATE.slots).filter(s => s?.file).length;

  $('#sidebarSub').textContent = `${loadedCount} de ${SLOTS.length} módulos importados`;

  list.innerHTML = SLOTS.map(slot => {
    const st = STATE.slots[slot.id];
    const hasFile = !!st?.file;
    const divsForSlot = STATE.divergences.filter(d => d.modules?.includes(slot.code));
    const hasCritical = divsForSlot.some(d => d.severity === 'critical');
    const hasWarn = divsForSlot.some(d => d.severity === 'warning');

    let cls = 'slot';
    if (hasFile) cls += ' loaded';
    if (hasFile && hasCritical) cls += ' has-alert';
    else if (hasFile && hasWarn) cls += ' has-warn';

    const meta = hasFile
      ? `<span>${fmtBytes(st.file.size)}</span><span>·</span><span>${st.file.ext.toUpperCase()}</span>`
      : `<span class="muted">${slot.required ? 'obrigatório' : 'opcional'}</span>`;

    return `
      <li class="${cls}" data-slot="${slot.id}" tabindex="0" role="button" aria-label="Carregar ${escapeAttr(slot.label)}">
        <div class="slot-icon">${hasFile ? '✓' : '＋'}</div>
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

  // Hash raiz do workspace
  const hashes = getLoaded().map(x => x.hash).sort();
  if (hashes.length) {
    $('#workspaceHashWrap').hidden = false;
    // Hash combinado (re-hash da concatenação ordenada)
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
  const loaded = getLoaded();
  const sealed = loaded.filter(x => x.seal.signed).length;
  const critical = STATE.divergences.filter(d => d.severity === 'critical').length;

  const total = LEGAL_MATRIX.length;
  const ok = LEGAL_MATRIX.filter(i => getEffectiveCompliance(i.id) === 'ok').length;
  const pct = total ? Math.round((ok / total) * 100) : 0;

  $('#kpiModules').textContent = `${loaded.length}/${SLOTS.length}`;
  $('#kpiHashes').textContent = loaded.length;
  $('#kpiSeals').textContent = sealed;
  $('#kpiCompliance').textContent = total ? `${pct}%` : '—';
  $('#kpiCritical').textContent = critical;

  // Status badge
  const badge = $('#statusBadgeText');
  if (!loaded.length) badge.textContent = 'Workspace vazio';
  else if (critical) badge.textContent = `${critical} alerta(s) crítico(s)`;
  else badge.textContent = 'Workspace íntegro';

  // Processo chip
  const processos = loaded.map(x => x.fields?.processo).filter(Boolean);
  $('#processChipValue').textContent = processos[0] || '— não identificado —';
}

function renderIntegrity() {
  const grid = $('#integrityGrid');
  const loaded = getLoaded();

  if (!loaded.length) {
    grid.innerHTML = '<div class="empty">Nenhum artefato carregado no workspace.</div>';
    return;
  }

  grid.innerHTML = loaded.map(x => {
    const short = `${x.hash.slice(0, 10)}…${x.hash.slice(-10)}`;
    const divs = STATE.divergences.filter(d => d.modules?.includes(x.code));
    const hasCrit = divs.some(d => d.severity === 'critical');
    const hasWarn = divs.some(d => d.severity === 'warning');
    const status = hasCrit ? 'alert' : hasWarn ? 'warn' : 'ok';

    const sealLine = x.seal.signed
      ? `<span class="ok">Selo: ${escapeHTML(x.seal.standard || 'detectado')}</span>`
      : `<span class="warn">Sem selo digital</span>`;

    return `
      <div class="int-card" data-status="${status}">
        <div class="int-head">
          <span class="int-code">${x.code}</span>
          <span class="status-dot ${hasCrit ? 'dot-danger' : hasWarn ? 'dot-warn' : 'dot-ok'}"></span>
        </div>
        <div class="int-file" title="${escapeAttr(x.file.name)}">${escapeHTML(x.file.name)}</div>
        <div class="int-hash" data-copy="${x.hash}" title="Clique para copiar o hash SHA-256">SHA-256: ${short}</div>
        <div class="int-foot">
          <span>${fmtBytes(x.file.size)}</span>
          ${sealLine}
        </div>
      </div>
    `;
  }).join('');
}

function renderDivergences() {
  const tbody = $('#divTableBody');
  const divs = STATE.divergences;

  const count = { critical: 0, warning: 0, info: 0 };
  divs.forEach(d => count[d.severity]++);
  $('#chipCritical').textContent = `${count.critical} críticos`;
  $('#chipWarning').textContent = `${count.warning} avisos`;
  $('#chipInfo').textContent = `${count.info} informativos`;

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
      <td><span class="legal-ref">${escapeHTML(d.category)}</span></td>
      <td>
        <strong style="display:block;margin-bottom:3px;color:var(--text-0)">${escapeHTML(d.title)}</strong>
        <span style="color:var(--text-2);font-size:.78rem">${escapeHTML(d.description)}</span>
      </td>
      <td>${(d.modules || []).map(m => `<span class="mod-pill active">${escapeHTML(m)}</span>`).join('')}</td>
      <td><span class="legal-ref">${escapeHTML(d.legalRef || '—')}</span></td>
    </tr>
  `).join('');
}

function getEffectiveCompliance(id) {
  return STATE.compliance[id] || STATE.autoCompliance[id] || null;
}

function renderCompliance() {
  const wrap = $('#complianceList');

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
    const auto = STATE.autoCompliance[item.id];
    const manual = STATE.compliance[item.id];
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

function refreshAll() {
  runCrossChecks();
  calcCompliance();
  renderSidebar();
  renderKPIs();
  renderIntegrity();
  renderDivergences();
  renderCompliance();
}

/* -------------------------------------------------------------
   14. EVENTOS — SIDEBAR E DROPZONE INDIVIDUAL
   ------------------------------------------------------------- */
function bindSidebar() {
  const list = $('#slotList');

  // Click delegation
  list.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const slotId = actionBtn.dataset.slot;
      const action = actionBtn.dataset.action;
      if (action === 'remove') {
        delete STATE.slots[slotId];
        refreshAll();
        toast('Módulo removido do workspace.', 'warn');
      } else if (action === 'upload') {
        openFilePickerFor(slotId);
      }
      return;
    }
    const slotEl = e.target.closest('.slot');
    if (slotEl) openFilePickerFor(slotEl.dataset.slot);
  });

  // Keyboard
  list.addEventListener('keydown', (e) => {
    const slotEl = e.target.closest('.slot');
    if (!slotEl) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFilePickerFor(slotEl.dataset.slot); }
  });

  // Drag & drop por slot
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

  // Bulk
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
   15. EVENTOS — COMPLIANCE MANUAL
   ------------------------------------------------------------- */
function bindCompliance() {
  $('#complianceList').addEventListener('click', (e) => {
    const btn = e.target.closest('.comp-btn');
    if (!btn) return;
    const card = btn.closest('.comp-item');
    const id = card.dataset.id;
    const set = btn.dataset.set;

    if (STATE.compliance[id] === set) delete STATE.compliance[id];
    else STATE.compliance[id] = set;

    renderCompliance();
    renderKPIs();
  });
}

/* -------------------------------------------------------------
   16. EVENTOS — GLOBAIS
   ------------------------------------------------------------- */
function bindGlobal() {
  $('#themeToggle').addEventListener('click', () => Theme.toggle());

  $('#btnReverify').addEventListener('click', () => {
    refreshAll();
    toast('Verificação cruzada reexecutada.', 'ok');
  });

  $('#btnReset').addEventListener('click', () => {
    if (!Object.keys(STATE.slots).length && !STATE.divergences.length) return;
    if (!confirm('Confirma reinício do workspace? Todos os documentos e análises serão descartados.')) return;
    STATE.slots = {};
    STATE.divergences = [];
    STATE.compliance = {};
    STATE.autoCompliance = {};
    STATE.startedAt = new Date();
    refreshAll();
    toast('Workspace reiniciado.', 'ok');
  });

  $('#btnExportJSON').addEventListener('click', exportJSON);
  $('#btnExportPDF').addEventListener('click', exportPDF);

  $('#btnCopyWsHash').addEventListener('click', () => {
    const h = $('#workspaceHash').textContent;
    if (h && h !== '—') navigator.clipboard.writeText(h).then(() => toast('Hash do workspace copiado.', 'ok'));
  });

  // Copiar hashes individuais
  document.addEventListener('click', (e) => {
    const h = e.target.closest('[data-copy]');
    if (!h || !h.dataset.copy) return;
    navigator.clipboard.writeText(h.dataset.copy).then(() => toast('Hash copiado.', 'ok'));
  });
}

/* -------------------------------------------------------------
   17. EXPORTAÇÃO — TRILHA JSON
   ------------------------------------------------------------- */
function buildPayload() {
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
    iniciadoEm: STATE.startedAt.toISOString(),
    norma: 'Lei nº 14.133/2021',
    modulo: 'LicitaAudit Workspace · OmniLicit',
    processo: loaded.find(x => x.fields?.processo)?.fields?.processo || null,
    workspaceHash: $('#workspaceHash').textContent || null,
    artefatos: loaded.map(x => ({
      slot: x.id,
      modulo: x.code,
      nome: x.file.name,
      tamanhoBytes: x.file.size,
      extensao: x.file.ext,
      sha256: x.hash,
      camposExtraidos: x.fields,
      seloDigital: {
        assinado: x.seal.signed,
        padrao: x.seal.standard,
        nivel: x.seal.level,
        detalhes: x.seal.details,
      },
      carregadoEm: x.loadedAt.toISOString(),
    })),
    divergencias: STATE.divergences,
    conformidade: LEGAL_MATRIX.map(i => ({
      id: i.id,
      artigo: i.art,
      titulo: i.title,
      descricao: i.desc,
      status: getEffectiveCompliance(i.id),
      automatico: STATE.autoCompliance[i.id],
      manual: STATE.compliance[i.id] || null,
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
  if (!getLoaded().length) { toast('Workspace vazio — nada para exportar.', 'warn'); return; }
  const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(blob, `licitaudit-trilha-${stamp}.json`);
  toast('Trilha JSON exportada.', 'ok');
}

/* -------------------------------------------------------------
   18. EXPORTAÇÃO — LAUDO EM PDF (pdfMake)
   ------------------------------------------------------------- */
function exportPDF() {
  if (!window.pdfMake) { toast('pdfMake indisponível (offline?).', 'danger'); return; }
  if (!getLoaded().length) { toast('Workspace vazio — nada para exportar.', 'warn'); return; }

  const data = buildPayload();
  const criadoEm = data.geradoEmBR;

  const statusLabel = (s) => s === 'ok' ? 'CONFORME' : s === 'warn' ? 'PENDENTE' : s === 'fail' ? 'NÃO CONFORME' : 'NÃO AVALIADO';
  const statusColor = (s) => s === 'ok' ? '#10B981' : s === 'warn' ? '#F59E0B' : s === 'fail' ? '#EF4444' : '#64748B';
  const sevColor = (s) => s === 'critical' ? '#EF4444' : s === 'warning' ? '#F59E0B' : '#38BDF8';

  // --- Cabeçalho ---
  const headerContent = [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'LAUDO DE AUDITORIA', fontSize: 18, bold: true, color: '#0F172A' },
            { text: 'Workspace LicitaAudit · OmniLicit', fontSize: 11, color: '#0D9488', margin: [0, 2, 0, 0] },
            { text: 'Conformidade — Lei nº 14.133/2021', fontSize: 9, color: '#64748B', margin: [0, 1, 0, 0] },
          ],
        },
        {
          width: 'auto',
          stack: [
            { text: `Emitido em: ${criadoEm}`, fontSize: 8, color: '#64748B', alignment: 'right' },
            { text: `Sessão: ${fmtDate(new Date(data.iniciadoEm))}`, fontSize: 8, color: '#64748B', alignment: 'right', margin: [0, 2, 0, 0] },
            { text: `Processo: ${data.processo || '—'}`, fontSize: 8, bold: true, color: '#0D9488', alignment: 'right', margin: [0, 2, 0, 0] },
          ],
        },
      ],
      margin: [0, 0, 0, 16],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#0D9488' }] },
  ];

  // --- Sumário executivo ---
  const summaryBlock = [
    { text: '1 · SUMÁRIO EXECUTIVO', fontSize: 11, bold: true, color: '#0F172A', margin: [0, 20, 0, 8] },
    {
      columns: [
        { width: '*', stack: [
          { text: 'Módulos importados', fontSize: 8, color: '#64748B' },
          { text: `${data.artefatos.length} / ${SLOTS.length}`, fontSize: 18, bold: true, color: '#0D9488' },
        ]},
        { width: '*', stack: [
          { text: 'Conformes', fontSize: 8, color: '#64748B' },
          { text: String(data.resumo.ok), fontSize: 18, bold: true, color: '#10B981' },
        ]},
        { width: '*', stack: [
          { text: 'Pendentes', fontSize: 8, color: '#64748B' },
          { text: String(data.resumo.warn + data.resumo.pending), fontSize: 18, bold: true, color: '#F59E0B' },
        ]},
        { width: '*', stack: [
          { text: 'Não conformes', fontSize: 8, color: '#64748B' },
          { text: String(data.resumo.fail), fontSize: 18, bold: true, color: '#EF4444' },
        ]},
      ],
      margin: [0, 0, 0, 6],
    },
    {
      text: [
        { text: 'Hash do Workspace (SHA-256 raiz): ', fontSize: 8, bold: true, color: '#0F172A' },
        { text: data.workspaceHash || '—', fontSize: 8, font: 'Roboto', color: '#0D9488' },
      ],
      margin: [0, 4, 0, 0],
    },
  ];

  // --- Tabela de artefatos ---
  const artBody = [
    [
      { text: 'Módulo', style: 'th' },
      { text: 'Artefato', style: 'th' },
      { text: 'SHA-256', style: 'th' },
      { text: 'Selo', style: 'th' },
      { text: 'Tamanho', style: 'th' },
    ],
    ...data.artefatos.map(a => [
      { text: a.modulo, fontSize: 8, bold: true, color: '#0D9488' },
      { text: a.nome, fontSize: 8 },
      { text: a.sha256 || '—', fontSize: 7, color: '#334155' },
      { text: a.seloDigital.assinado ? (a.seloDigital.padrao || 'Assinado') : 'sem selo', fontSize: 7, color: a.seloDigital.assinado ? '#10B981' : '#F59E0B' },
      { text: fmtBytes(a.tamanhoBytes), fontSize: 8, alignment: 'right' },
    ]),
  ];

  const artifactsBlock = [
    { text: '2 · INTEGRIDADE DOCUMENTAL', fontSize: 11, bold: true, color: '#0F172A', margin: [0, 20, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: [70, '*', 130, 80, 55],
        body: artBody,
      },
      layout: {
        fillColor: (r) => r === 0 ? '#F1F5F9' : null,
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
      },
    },
  ];

  // --- Tabela de divergências ---
  const divBody = [
    [
      { text: 'Severidade', style: 'th' },
      { text: 'Categoria', style: 'th' },
      { text: 'Descrição', style: 'th' },
      { text: 'Módulos', style: 'th' },
      { text: 'Base legal', style: 'th' },
    ],
    ...(data.divergencias.length
      ? data.divergencias.map(d => [
          { text: d.severity.toUpperCase(), fontSize: 7, bold: true, color: sevColor(d.severity) },
          { text: d.category, fontSize: 7 },
          { stack: [
              { text: d.title, fontSize: 8, bold: true, color: '#0F172A' },
              { text: d.description, fontSize: 7, color: '#334155' },
            ]},
          { text: (d.modules || []).join(', '), fontSize: 7, color: '#0D9488' },
          { text: d.legalRef || '—', fontSize: 7, color: '#64748B' },
        ])
      : [[{ text: 'Nenhuma divergência detectada.', fontSize: 8, italics: true, color: '#64748B', colSpan: 5, alignment: 'center' }, {}, {}, {}, {}]]
    ),
  ];

  const divergencesBlock = [
    { text: '3 · DIVERGÊNCIAS E ALERTAS CRUZADOS', fontSize: 11, bold: true, color: '#0F172A', margin: [0, 20, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: [55, 60, '*', 100, 60],
        body: divBody,
      },
      layout: {
        fillColor: (r) => r === 0 ? '#F1F5F9' : null,
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
      },
    },
  ];

  // --- Matriz de conformidade ---
  const compBody = [
    [
      { text: 'Artigo', style: 'th' },
      { text: 'Requisito', style: 'th' },
      { text: 'Status', style: 'th' },
    ],
    ...data.conformidade.map(c => [
      { text: c.artigo, fontSize: 8, bold: true, color: '#0D9488' },
      { stack: [
          { text: c.titulo, fontSize: 8, bold: true, color: '#0F172A' },
          { text: c.descricao, fontSize: 7, color: '#334155' },
        ]},
      { text: statusLabel(c.status), fontSize: 7, bold: true, color: statusColor(c.status) },
    ]),
  ];

  const complianceBlock = [
    { text: '4 · MATRIZ DE CONFORMIDADE — LEI Nº 14.133/2021', fontSize: 11, bold: true, color: '#0F172A', margin: [0, 20, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: [50, '*', 80],
        body: compBody,
      },
      layout: {
        fillColor: (r) => r === 0 ? '#F1F5F9' : null,
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
      },
    },
  ];

  // --- Encerramento ---
  const footerBlock = [
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#E2E8F0' }], margin: [0, 26, 0, 12] },
    {
      columns: [
        { width: '*', stack: [
            { text: '___________________________________', fontSize: 8, color: '#64748B' },
            { text: 'Auditor responsável', fontSize: 8, color: '#64748B', margin: [0, 2, 0, 0] },
          ]},
        { width: '*', stack: [
            { text: '___________________________________', fontSize: 8, color: '#64748B' },
            { text: 'Autoridade competente', fontSize: 8, color: '#64748B', margin: [0, 2, 0, 0] },
          ]},
      ],
    },
    {
      text: 'Documento gerado automaticamente pelo módulo LicitaAudit · OmniLicit. Processamento 100% local — nenhum artefato foi transmitido a terceiros.',
      fontSize: 7, color: '#94A3B8', italics: true, margin: [0, 20, 0, 0], alignment: 'center',
    },
  ];

  const docDef = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    info: {
      title: 'Laudo de Auditoria — LicitaAudit Workspace',
      author: 'OmniLicit',
      subject: 'Lei nº 14.133/2021',
      keywords: 'licitação, auditoria, conformidade, omnicit, licitaudit',
    },
    content: [
      ...headerContent,
      ...summaryBlock,
      ...artifactsBlock,
      ...divergencesBlock,
      ...complianceBlock,
      ...footerBlock,
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0F172A' },
    styles: {
      th: { fontSize: 8, bold: true, color: '#334155', fillColor: '#F1F5F9' },
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `LicitaAudit · OmniLicit — ${criadoEm}`, fontSize: 7, color: '#94A3B8', margin: [40, 0, 0, 0] },
        { text: `Página ${currentPage} de ${pageCount}`, fontSize: 7, color: '#94A3B8', alignment: 'right', margin: [0, 0, 40, 0] },
      ],
    }),
  };

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    window.pdfMake.createPdf(docDef).download(`laudo-licitaudit-${stamp}.pdf`);
    toast('Laudo executivo gerado em PDF.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Falha ao gerar PDF. Verifique o console.', 'danger');
  }
}

/* -------------------------------------------------------------
   19. BOOTSTRAP
   ------------------------------------------------------------- */
(function init() {
  Theme.init();
  bindSidebar();
  bindCompliance();
  bindGlobal();
  refreshAll();

  // Footer
  $('#year').textContent = new Date().getFullYear();
  $('#footerSession').textContent = `Sessão iniciada em ${fmtDate(STATE.startedAt)}`;

  // Aviso Web Crypto
  if (!window.crypto?.subtle) {
    toast('Web Crypto indisponível. Sirva o módulo via HTTPS ou localhost.', 'danger', 8000);
  }

  console.info(
    '%c LicitaAudit · Workspace OmniLicit ',
    'background:#14B8A6;color:#062620;font-weight:700;padding:2px 6px;border-radius:4px',
    `\nSessão iniciada: ${STATE.startedAt.toISOString()}`,
    `\nMódulos disponíveis: ${SLOTS.map(s => s.code).join(', ')}`
  );
})();
