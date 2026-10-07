/* ============================================================================
 * LicitaAudit · app.js
 * ----------------------------------------------------------------------------
 * v1.5.0 — Correções acumuladas:
 *   • Extração de Objeto resiliente (regex flexível + cascata de padrões).
 *   • Classificação "Serviços comuns / TI" (compatível com Pregão).
 *   • Detecção da Lei 8.666/93 com CONTEXTO DE NEGAÇÃO — evita falso positivo
 *     quando a linha diz "revogada", "não se aplica", "sem referência" etc.
 *   • Análise ISOLADA POR LINHA com marcadores [x] / [ ].
 *   • Avaliação AUTORITATIVA por termo principal (TR, ETP, Matriz, Estimativa).
 *   • Validação jurídica Objeto × Modalidade (Art. 6º, XLI · Art. 28 a 32).
 *   • Truncamento de nome de arquivo preservando a extensão.
 * ========================================================================== */

'use strict';

/* ==========================================================================
 * 1. ESTADO GLOBAL
 * ======================================================================== */
const state = {
  files: [],
  report: null,
  isAnalyzing: false,
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);

const els = {
  dropzone:        $('#dropzone'),
  fileInput:       $('#fileInput'),
  fileList:        $('#fileList'),
  analyzeBtn:      $('#analyzeBtn'),
  clearBtn:        $('#clearBtn'),
  printBtn:        $('#printBtn'),
  jsonBtn:         $('#jsonBtn'),
  emptyState:      $('#emptyState'),
  report:          $('#report'),
  loader:          $('#loader'),
  loaderText:      $('#loaderText'),
  toast:           $('#toast'),
  subtitle:        $('#topbarSubtitle'),
  themeToggle:     $('#themeToggle'),
  paramObjeto:     $('#paramObjeto'),
  paramModalidade: $('#paramModalidade'),
  paramCriterio:   $('#paramCriterio'),
};

/* ==========================================================================
 * 2. UTILITÁRIOS GERAIS
 * ======================================================================== */

const uid = () => Math.random().toString(36).slice(2, 10);

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const extOf = (name) => (name.split('.').pop() || '').toLowerCase();

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countTerms(text, terms) {
  const t = normalize(text);
  return terms.reduce((acc, term) => acc + (t.includes(normalize(term)) ? 1 : 0), 0);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateFileName(name, maxBase = 30) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name.length > maxBase ? name.slice(0, maxBase) + '…' : name;
  const base = name.slice(0, dot);
  const ext  = name.slice(dot);
  if (base.length <= maxBase) return name;
  return base.slice(0, maxBase - 1).trimEnd() + '…' + ext;
}

/* ==========================================================================
 * 3. ANÁLISE ISOLADA POR LINHA
 * ======================================================================== */

const NEGATIVE_MARKERS = [
  'ausente', 'ausencia', 'pendente', 'faltante', 'em falta',
  'nao anexado', 'nao anexa', 'nao anexo',
  'nao incluido', 'nao incluida', 'nao consta', 'nao constam',
  'nao localizado', 'nao localizada', 'nao encontrado', 'nao encontrada',
  'nao apresentado', 'nao apresentada', 'nao elaborado', 'nao elaborada',
  'nao foi possivel', 'nao se aplica', 'nao aplicavel',
  'inexistente', 'omisso', 'omissa',
  'a elaborar', 'a providenciar', 'a anexar',
  'a ser elaborado', 'a ser anexado',
  'deve ser incluido', 'deve ser anexado',
  'necessario incluir', 'necessario anexar',
  'em elaboracao', 'aguardando',
];

const POSITIVE_MARKERS = [
  'presente', 'anexado', 'anexa', 'anexo',
  'incluido', 'incluida', 'consta', 'constam',
  'localizado', 'localizada', 'encontrado', 'encontrada',
  'elaborado', 'elaborada', 'apresentado', 'apresentada',
  'aprovado', 'aprovada', 'conforme', 'ok',
];

function splitLines(corpus) {
  return corpus
    .split(/\r?\n/)
    .map((raw, idx) => ({
      idx, raw, trimmed: raw.trim(), normalized: normalize(raw),
    }))
    .filter((l) => l.trimmed.length > 0 && !/^={3,}/.test(l.trimmed));
}

function detectCheckbox(line) {
  if (/\[\s*[xX]\s*\]/.test(line)) return 'checked';
  if (/\[\s*\]/.test(line))       return 'unchecked';
  return null;
}

function lineContainsTerm(line, term) {
  return normalize(line).includes(normalize(term));
}

function classifyRequirementLine(lineRaw, lineNorm) {
  const checkbox = detectCheckbox(lineRaw);
  if (checkbox === 'checked')   return { status: 'ok',     reason: 'Marcado como [x]' };
  if (checkbox === 'unchecked') return { status: 'danger', reason: 'Marcado como [ ]' };

  const hasNeg = NEGATIVE_MARKERS.some((m) => lineNorm.includes(normalize(m)));
  const hasPos = POSITIVE_MARKERS.some((m) => lineNorm.includes(normalize(m)));

  if (hasNeg && !hasPos) return { status: 'danger', reason: 'Termo de ausência na linha' };
  if (hasPos && !hasNeg) return { status: 'ok',     reason: 'Termo de presença na linha' };
  if (hasPos && hasNeg)  return { status: 'warn',   reason: 'Linha contém termos positivos e negativos' };
  return { status: 'ok', reason: 'Requisito mencionado sem termos negativos' };
}

function evalRequirementByLine(lines, terms) {
  const matches = [];
  for (const line of lines) {
    for (const term of terms) {
      if (lineContainsTerm(line.raw, term)) {
        matches.push({ line, term });
        break;
      }
    }
  }

  if (matches.length === 0) {
    return {
      status: 'warn', line: null, snippet: null, term: null,
      reason: 'Requisito não mencionado no documento', authoritative: false,
    };
  }

  const evaluated = matches.map(({ line, term }) => ({
    line, term, ...classifyRequirementLine(line.raw, line.normalized),
  }));

  const priority = { ok: 0, danger: 1, warn: 2 };
  evaluated.sort((a, b) => priority[a.status] - priority[b.status]);
  const chosen = evaluated[0];

  return {
    status: chosen.status,
    line: chosen.line,
    snippet: chosen.line.trimmed.slice(0, 260),
    term: chosen.term,
    reason: chosen.reason,
    authoritative: false,
  };
}

function evalRequirementWithPrimaryTerm(lines, primaryTerms, fallbackTerms = []) {
  const primaryMatches = [];
  for (const line of lines) {
    for (const term of primaryTerms) {
      if (lineContainsTerm(line.raw, term)) {
        primaryMatches.push({ line, term });
        break;
      }
    }
  }

  if (primaryMatches.length) {
    const evaluated = primaryMatches.map(({ line, term }) => ({
      line, term, ...classifyRequirementLine(line.raw, line.normalized),
    }));

    const explicitDanger = evaluated.find((x) => x.status === 'danger');
    if (explicitDanger) {
      return {
        status: 'danger',
        line: explicitDanger.line,
        snippet: explicitDanger.line.trimmed.slice(0, 260),
        term: explicitDanger.term,
        reason: `Linha autoritativa com ausência — ${explicitDanger.reason}`,
        authoritative: true,
      };
    }

    const chosen = evaluated.find((x) => x.status === 'ok') || evaluated[0];
    return {
      status: chosen.status,
      line: chosen.line,
      snippet: chosen.line.trimmed.slice(0, 260),
      term: chosen.term,
      reason: chosen.reason,
      authoritative: true,
    };
  }

  if (fallbackTerms.length) {
    const weak = evalRequirementByLine(lines, fallbackTerms);
    return { ...weak, authoritative: false };
  }

  return {
    status: 'warn', line: null, snippet: null, term: null,
    reason: 'Requisito não mencionado no documento', authoritative: false,
  };
}

/* ==========================================================================
 * 4. EXTRAÇÃO DE CAMPOS ROTULADOS
 * ======================================================================== */

function extractLabeledField(text, labelPatterns) {
  for (const label of labelPatterns) {
    const rx = new RegExp(
      `(?:^|[\\n\\r;.\\s])${label}\\s*[:\\-–—]\\s*\\n?\\s*([^\\n\\r]{2,300})`,
      'im'
    );
    const m = text.match(rx);
    if (m) {
      const value = m[1].split(/\s*[.;]\s+/)[0].trim();
      if (value && value.length >= 2) return value.slice(0, 200);
    }
  }
  return null;
}

function extractModalidadeField(text) {
  return extractLabeledField(text, [
    'modalidade\\s+de\\s+licita[cç][aã]o',
    'modalidade\\s+licitat[oó]ria',
    'modalidade\\s+adotada',
    'modalidade',
    'tipo\\s+de\\s+licita[cç][aã]o',
  ]);
}

/* ============================================================================
 * v1.5.0 · Extração do campo "Objeto" — regex flexível + cascata de padrões
 * ----------------------------------------------------------------------------
 * Padrão 0: regex EXATA solicitada (resiliente a numeração, títulos e '#').
 * Padrões 1-3: fallbacks que cobrem rótulo+valor em linha única, linha
 *              seguinte e bloco multilinha.
 * ======================================================================== */
function extractObjetoField(text) {
  const patterns = [
    // 0) Regex flexível — aceita "1.", "1)", "I." e quebras de linha
    /(?:^|\n)\s*(?:\d+[\.\)]\s*|[IVX]+\.\s*)?(?:Identificação do Objeto|Objeto do Processo|Objeto da Contratação|Objeto)\s*[:\-–—]*\s*\n?([^\n#]{3,600})/i,

    // 1) Rótulo + valor na MESMA linha
    /(?:^|\n)\s*(?:\d+[\.\)]\s*)?(?:Identifica[cç][aã]o\s+do\s+Objeto|Objeto\s+do\s+Processo|Objeto\s+da\s+Contrata[cç][aã]o|Objeto)\s*[:\-–—]*\s*([^\n#]{3,600})/i,

    // 2) Rótulo + valor na LINHA SEGUINTE
    /(?:^|\n)\s*(?:\d+[\.\)]\s*)?(?:Identifica[cç][aã]o\s+do\s+Objeto|Objeto\s+do\s+Processo|Objeto\s+da\s+Contrata[cç][aã]o|Objeto)\s*[:\-–—]*\s*\n+\s*([^\n#]{3,600})/i,

    // 3) Bloco multilinha — para na próxima seção conhecida
    /(?:^|\n)\s*(?:\d+[\.\)]\s*)?(?:Identifica[cç][aã]o\s+do\s+Objeto|Objeto\s+do\s+Processo|Objeto\s+da\s+Contrata[cç][aã]o|Objeto)\s*[:\-–—]*\s*\n?\s*([\s\S]{3,800}?)(?=\n\s*(?:\d+[\.\)]\s*)?(?:Modalidade|Checklist|Justificativa|Fundamenta|Dota|Estimativa|Crit[eé]rio|Prazo|Do\s+Objeto|Da\s+Contrata)|\n\s*\n|$)/i,
  ];

  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) {
      const value = m[1]
        .replace(/^[\s\-–—:.,;]+|[\s\-–—:.,;]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (value && value.length >= 3) return value.slice(0, 600);
    }
  }
  return null;
}

function classifyModalidadeValue(value) {
  if (!value) return null;
  const v = normalize(value);
  if (/dialogo\s+competitivo|dialogo/.test(v)) return 'dialogo';
  if (/inexigibilidade/.test(v))               return 'inexigibilidade';
  if (/dispensa/.test(v))                      return 'dispensa';
  if (/leil[aã]o/.test(v))                     return 'leilao';
  if (/concorr[eê]ncia/.test(v))               return 'concorrencia';
  if (/concurso/.test(v))                      return 'concurso';
  if (/preg[aã]o/.test(v))                     return 'pregao';
  return null;
}

/* ============================================================================
 * v1.5.0 · Classificação do objeto
 * ----------------------------------------------------------------------------
 * TI, infraestrutura, apoio administrativo, serviços e manutenção → comuns.
 * Compatível com Pregão (Art. 6º, XLI e Art. 29).
 * ======================================================================== */
function classifyObjetoValue(value) {
  if (!value) return null;
  const v = normalize(value);

  // 1) Alienação — prioridade máxima
  if (/(alienacao|venda\s+de\s+bens|leilao\s+de\s+bens|bens\s+moveis?\s+inserviveis?|bens\s+imoveis?\s+da\s+administracao|desfazimento)/.test(v)) {
    return 'alienacao';
  }
  // 2) Obras / engenharia
  if (/(obra|obras|engenharia|construcao|reforma|pavimentacao|edificacao|saneamento|terraplenagem)/.test(v)) {
    return 'obras';
  }
  // 3) Trabalho técnico / científico / artístico
  if (/(trabalho\s+tecnico|trabalho\s+cientifico|trabalho\s+artistico|projeto\s+arquitetonico|conteudo\s+artistico)/.test(v)) {
    return 'intelectual';
  }
  // 4) ⭐ TI · infraestrutura · apoio administrativo · serviços · manutenção
  if (
    /(\bti\b|tecnologia\s+da\s+informacao|infraestrutura|servicos?\s+de\s+ti|servicos?\s+de\s+apoio|apoio\s+administrativo|informatica|software|sistema\s+informat|computador|notebook|servidor|datacenter|nuvem|cloud|licencas?\s+de\s+software|hardware|suporte\s+tecnico|help\s*desk|service\s*desk|manutencao|conservacao|limpeza|vigilancia|porteiro|recepcionista|jardinagem|motorista|copeira|servicos?\s+gerais|assistencia\s+administrativa|secretaria|servicos?\s+comuns?)/.test(v)
  ) {
    return 'servicos-comuns';
  }
  // 5) Bens comuns
  if (/(bens?\s+comuns?|material\s+de\s+escritorio|generos?\s+alimenticios?|mobiliario|papelaria|uniformes|medicamentos?|equipamentos?|aquisicao\s+de\s+bens|compra\s+de\s+bens)/.test(v)) {
    return 'bens';
  }
  // 6) Serviços genéricos (rede de segurança)
  if (/(contratacao\s+de\s+servicos|prestacao\s+de\s+servicos|servicos?\s+de\s+\w+|servicos?)/.test(v)) {
    return 'servicos-comuns';
  }
  return null;
}

/* ==========================================================================
 * 5. MATRIZ LEGAL — Compatibilidade Objeto × Modalidade
 * ======================================================================== */

const MODALIDADE_OBJETO_MATRIX = {
  pregao:          ['bens', 'servicos-comuns'],
  concorrencia:    ['bens', 'servicos-comuns', 'servicos-especiais', 'obras', 'alienacao', 'intelectual'],
  concurso:        ['intelectual'],
  leilao:          ['alienacao'],
  dialogo:         ['servicos-especiais', 'obras'],
  dispensa:        ['bens', 'servicos-comuns', 'servicos-especiais', 'obras', 'alienacao', 'intelectual'],
  inexigibilidade: ['bens', 'servicos-comuns', 'servicos-especiais', 'obras', 'intelectual'],
};

const MODALIDADE_LABEL_PT = {
  pregao: 'Pregão', concorrencia: 'Concorrência', concurso: 'Concurso',
  leilao: 'Leilão', dialogo: 'Diálogo Competitivo',
  dispensa: 'Dispensa', inexigibilidade: 'Inexigibilidade',
};

const OBJETO_LABEL_PT = {
  bens:                 'Aquisição de bens',
  'servicos-comuns':    'Serviços comuns / TI',
  'servicos-especiais': 'Serviços especiais',
  obras:                'Obras e serviços de engenharia',
  alienacao:            'Alienação de bens',
  intelectual:          'Trabalho técnico, científico ou artístico',
  indefinido:           'Não identificado',
};

function checkModalidadeCompatibilidade(objeto, modalidade) {
  const permitidas = MODALIDADE_OBJETO_MATRIX[modalidade];
  if (!permitidas) return { ok: true, permitidas: [] };
  return { ok: permitidas.includes(objeto), permitidas };
}

/* ============================================================================
 * v1.5.0 · Verificação da Lei 8.666/93 com CONTEXTO DE NEGAÇÃO
 * ----------------------------------------------------------------------------
 * Antes: qualquer menção a "8.666" disparava alerta (falso positivo).
 * Agora: a linha é ignorada se contiver termos de negação/exclusão
 *        ("revogada", "não se aplica", "sem referência", "exclusiva na
 *         Lei 14.133", "substituída" etc.). Verifica também ±1 linha de
 *        contexto para pegar o caso "a Lei 8.666/93 foi\nrevogada...".
 * ======================================================================== */
const RX_LEI_ANTIGA = /\b8\.?\s?666\b/;
const RX_NEGACAO_LEI_ANTIGA =
  /(sem\s+refer[eê]ncia|sem\s+men[cç][aã]o|sem\s+uso|sem\s+aplica[cç][aã]o|n[aã]o\s+se\s+aplica|n[aã]o\s+aplic[aá]vel|revogad[ao]s?|substitu[ií]d[ao]s?|exclusiv[ao]s?|exclusivamente|somente\s+a\s+lei\s+14\.?133|apenas\s+a\s+lei\s+14\.?133|n[aã]o\s+mais|obsolet[ao]s?|n[aã]o\s+utilizad[ao]s?|aus[eê]ncia\s+de|n[aã]o\s+h[aá]|n[aã]o\s+consta|n[aã]o\s+cita|n[aã]o\s+se\s+trata|deixa\s+de|superad[ao]s?|ultrapassad[ao]s?)/i;

function verificarLeiAntiga(textoCompleto) {
  const linhas = String(textoCompleto || '').split(/\r?\n/);

  for (let i = 0; i < linhas.length; i++) {
    const linhaRaw = linhas[i];
    if (!RX_LEI_ANTIGA.test(linhaRaw)) continue;

    // Verifica a própria linha + 1 linha acima + 1 linha abaixo
    const ctxStart = Math.max(0, i - 1);
    const ctxEnd   = Math.min(linhas.length - 1, i + 1);
    const contexto = linhas.slice(ctxStart, ctxEnd + 1).join(' ');

    if (RX_NEGACAO_LEI_ANTIGA.test(contexto)) continue; // citação negada → ignora

    return {
      status:  'danger',
      line:    i,
      snippet: linhaRaw.replace(/\s+/g, ' ').trim().slice(0, 260),
      reason:  'Referência indevida à Lei 8.666/93 (revogada) encontrada',
    };
  }

  return {
    status:  'ok',
    line:    null,
    snippet: null,
    reason:  'Nenhuma referência indevida à Lei 8.666/93 foi identificada.',
  };
}

/* ==========================================================================
 * 6. EXTRAÇÃO DE TEXTO (PDF.js / Mammoth.js / TXT)
 * ======================================================================== */

function configurePdfWorker() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const items = content.items
      .map((it) => ({ str: it.str, y: it.transform?.[5] ?? 0, x: it.transform?.[4] ?? 0 }))
      .filter((it) => it.str && it.str.trim());

    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    let lastY = null;
    let lineBuf = [];
    for (const it of items) {
      if (lastY !== null && Math.abs(it.y - lastY) > 2) {
        parts.push(lineBuf.join(' '));
        lineBuf = [];
      }
      lineBuf.push(it.str);
      lastY = it.y;
    }
    if (lineBuf.length) parts.push(lineBuf.join(' '));
    parts.push('');
  }
  return parts.join('\n');
}

async function extractDocx(file) {
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || '';
}

async function extractFileText(file) {
  const ext = extOf(file.name);
  switch (ext) {
    case 'pdf':
      if (!window.pdfjsLib) throw new Error('Biblioteca PDF.js não disponível.');
      return await extractPdf(file);
    case 'docx':
      if (!window.mammoth) throw new Error('Biblioteca Mammoth.js não disponível.');
      return await extractDocx(file);
    case 'txt':
    case 'md':
      return await file.text();
    case 'doc':
      throw new Error('Formato .doc (binário legado) não é suportado. Converta para .docx ou .pdf.');
    default:
      throw new Error(`Extensão ".${ext}" não suportada.`);
  }
}

/* ==========================================================================
 * 7. BASE DE CONHECIMENTO
 * ======================================================================== */

const KB = {
  etp: ['estudo tecnico preliminar', 'estudo técnico preliminar', 'etp', 'art. 18', 'artigo 18'],
  tr:  ['termo de referencia', 'termo de referência', 'projeto basico', 'projeto básico', 'anteprojeto', 'art. 40'],
  orcamento: ['estimativa de valor', 'estimativa do valor', 'planilha orcamentaria', 'planilha orçamentária', 'valor estimado', 'pesquisa de precos', 'pesquisa de preços', 'art. 23'],
  matrizRiscos: ['matriz de risco', 'matriz de riscos', 'gerenciamento de riscos', 'art. 22', 'art. 100'],
  dotacao: ['dotacao orcamentaria', 'dotação orçamentária', 'adequacao orcamentaria', 'adequação orçamentária', 'disponibilidade orcamentaria', 'classificacao economica'],
  justificativa: ['justificativa', 'motivacao', 'motivação', 'art. 5'],
  prazo: ['prazo de divulgacao', 'prazo mínimo', 'prazo minimo', 'dias uteis', 'dias úteis', 'art. 55'],
  criterio: ['menor preco', 'menor preço', 'maior desconto', 'melhor tecnica', 'melhor técnica', 'tecnica e preco', 'técnica e preço', 'maior lance', 'maior retorno economico', 'maior retorno econômico'],
  leiAntiga: ['8.666', '8.666/93', '8.666/1993'],
};

/* ==========================================================================
 * 8. MOTOR DE REGRAS — Auditoria
 * ======================================================================== */

function buildCorpus() {
  return state.files
    .filter((f) => f.status === 'ok' && f.text)
    .map((f) => `\n===== ARQUIVO: ${f.name} =====\n${f.text}`)
    .join('\n');
}

function runAudit() {
  const corpus = buildCorpus();
  const lines  = splitLines(corpus);

  const objetoParam     = els.paramObjeto.value;
  const modalidadeParam = els.paramModalidade.value;
  const criterioParam   = els.paramCriterio.value;

  const modalidadeField     = extractModalidadeField(corpus);
  const objetoField         = extractObjetoField(corpus);
  const modalidadeFromField = classifyModalidadeValue(modalidadeField);
  const objetoFromField     = classifyObjetoValue(objetoField);

  const objeto     = objetoParam     !== 'auto' ? objetoParam
                  : objetoFromField     || 'indefinido';
  const modalidade = modalidadeParam !== 'auto' ? modalidadeParam
                  : modalidadeFromField || 'indefinida';
  const criterio   = criterioParam   !== 'auto' ? criterioParam
                  : detectCriterioHeuristic(corpus);

  const checks = [];

  const fmtEvidence = (r, fallback) => {
    if (!r.snippet) return fallback;
    const prefix = r.status === 'danger' ? '⚠️ ' : r.status === 'warn' ? '⚠️ ' : '✓ ';
    return `${prefix}${r.reason}: "${r.snippet}"`;
  };

  // 1. ETP
  {
    const r = evalRequirementWithPrimaryTerm(
      lines,
      ['estudo tecnico preliminar', 'estudo técnico preliminar'],
      ['etp', 'art. 18', 'artigo 18']
    );
    checks.push({
      id: 'etp',
      requisito: 'Estudo Técnico Preliminar (ETP)',
      lei: 'Art. 18, §1º, I',
      status: r.status,
      evidencia: fmtEvidence(r, 'ETP não mencionado no corpus analisado.'),
      correcao: r.status === 'ok' ? null
        : 'Elaborar e anexar o Estudo Técnico Preliminar com descrição da necessidade, levantamento de mercado e definição da solução.',
    });
  }

  // 2. TR
  {
    const r = evalRequirementWithPrimaryTerm(
      lines,
      ['termo de referencia', 'termo de referência'],
      ['projeto basico', 'projeto básico', 'anteprojeto', 'art. 40']
    );
    checks.push({
      id: 'tr',
      requisito: 'Termo de Referência / Anteprojeto / Projeto Básico',
      lei: 'Art. 6º, XXIII e XXV · Art. 40',
      status: r.status,
      evidencia: fmtEvidence(r, 'Documento estruturante (TR / Projeto Básico) não mencionado.'),
      correcao: r.status === 'ok' ? null
        : 'Anexar Termo de Referência (bens/serviços) ou Projeto Básico/Executivo (obras), conforme o objeto.',
    });
  }

  // 3. Estimativa de valor
  {
    const r = evalRequirementWithPrimaryTerm(
      lines,
      ['estimativa de valor', 'estimativa do valor', 'valor estimado'],
      ['planilha orcamentaria', 'planilha orçamentária', 'pesquisa de precos', 'pesquisa de preços', 'art. 23']
    );
    checks.push({
      id: 'orcamento',
      requisito: 'Estimativa do valor da contratação',
      lei: 'Art. 23',
      status: r.status,
      evidencia: fmtEvidence(r, 'Não há menção a valor estimado ou pesquisa de preços.'),
      correcao: r.status === 'ok' ? null
        : 'Elaborar estimativa de valor com base em pesquisa de preços (painel de preços, contratações similares, mídia especializada).',
    });
  }

  // 4. Dotação
  {
    const r = evalRequirementByLine(lines, KB.dotacao);
    checks.push({
      id: 'dotacao',
      requisito: 'Adequação orçamentária e indicação de dotação',
      lei: 'Art. 150',
      status: r.status,
      evidencia: fmtEvidence(r, 'Não foi possível confirmar dotação orçamentária explícita.'),
      correcao: r.status === 'ok' ? null
        : 'Indicar a dotação orçamentária e o programa de trabalho que suportam a despesa.',
    });
  }

  // 5. Matriz de Riscos
  {
    const r = evalRequirementWithPrimaryTerm(
      lines,
      ['matriz de risco', 'matriz de riscos'],
      ['gerenciamento de riscos', 'art. 22', 'art. 100']
    );
    const isObraOuEspecial = ['obras', 'servicos-especiais'].includes(objeto);
    const finalStatus = (r.status === 'warn' && !r.snippet && isObraOuEspecial) ? 'danger' : r.status;
    checks.push({
      id: 'matriz',
      requisito: 'Matriz de Riscos',
      lei: 'Art. 22 · Art. 100',
      status: finalStatus,
      evidencia: fmtEvidence(r, isObraOuEspecial
        ? 'Matriz de riscos não mencionada — obrigatória para obras/serviços especiais.'
        : 'Matriz de riscos não mencionada.'),
      correcao: r.status === 'ok' ? null
        : (isObraOuEspecial
            ? 'Obrigatória para obras e serviços de engenharia de grande vulto — incluir matriz de alocação de riscos.'
            : 'Recomenda-se incluir matriz de riscos para clareza contratual, ainda que facultativa.'),
    });
  }

  // 6. Motivação
  {
    const r = evalRequirementByLine(lines, KB.justificativa);
    checks.push({
      id: 'motivacao',
      requisito: 'Motivação e justificativa da contratação',
      lei: 'Art. 5º · Art. 18, §1º',
      status: r.status,
      evidencia: fmtEvidence(r, 'Não foi possível localizar seção de motivação.'),
      correcao: r.status === 'ok' ? null
        : 'Explicitar a motivação do ato e a justificativa da escolha da solução.',
    });
  }

  // 7. Compatibilidade Objeto × Modalidade
  {
    const compat = checkModalidadeCompatibilidade(objeto, modalidade);
    let status = compat.ok ? 'ok' : 'danger';
    let evidencia;
    let correcao = null;

    if (modalidade === 'leilao' && objeto !== 'alienacao' && objeto !== 'indefinido') {
      status = 'danger';
      if (objeto === 'servicos-comuns') {
        evidencia =
          `❌ A modalidade 'Leilão' não é compatível com o objeto 'Serviços comuns / TI'. ` +
          `Para serviços comuns e de TI, utilize a modalidade Pregão (Art. 6º, XLI e Art. 29).`;
        correcao =
          `Substituir 'Leilão' por 'Pregão' no edital. ` +
          `Fundamento: Lei 14.133/2021, Art. 6º, XLI e Art. 29.`;
      } else {
        evidencia =
          `❌ A modalidade Leilão é restrita à alienação de bens (móveis inservíveis ou imóveis). ` +
          `O objeto identificado foi "${OBJETO_LABEL_PT[objeto] || objeto}".`;
        correcao =
          `Para "${OBJETO_LABEL_PT[objeto] || objeto}", utilize Pregão (bens/serviços comuns) ` +
          `ou Concorrência (demais casos), conforme Art. 6º, XLI e Art. 29.`;
      }
    } else if (modalidade === 'pregao' && !['bens', 'servicos-comuns', 'indefinido'].includes(objeto)) {
      status = 'danger';
      evidencia =
        `❌ O Pregão é obrigatório apenas para bens e serviços COMUNS. ` +
        `O objeto identificado foi "${OBJETO_LABEL_PT[objeto] || objeto}", incompatível.`;
      correcao = 'Para o objeto identificado, utilize Concorrência (Art. 28) ou Diálogo Competitivo (Art. 32).';
    } else if (modalidade === 'concurso' && objeto !== 'intelectual' && objeto !== 'indefinido') {
      status = 'danger';
      evidencia =
        `❌ O Concurso é restrito a trabalho técnico, científico ou artístico (Art. 30). ` +
        `Objeto identificado: "${OBJETO_LABEL_PT[objeto] || objeto}".`;
      correcao = 'Utilize Pregão ou Concorrência para os demais objetos.';
    } else if (modalidade === 'dialogo' && !['servicos-especiais', 'obras', 'indefinido'].includes(objeto)) {
      status = 'danger';
      evidencia =
        `❌ O Diálogo Competitivo é restrito a inovação, complexidade técnica ou impossibilidade ` +
        `de especificação prévia (Art. 32). Objeto identificado: "${OBJETO_LABEL_PT[objeto] || objeto}".`;
      correcao = 'Utilize Pregão (bens/serviços comuns) ou Concorrência.';
    } else if (compat.ok) {
      evidencia =
        `✓ Modalidade "${MODALIDADE_LABEL_PT[modalidade] || modalidade}" é adequada ao objeto ` +
        `"${OBJETO_LABEL_PT[objeto] || objeto}".`;
    } else {
      evidencia =
        `A modalidade "${MODALIDADE_LABEL_PT[modalidade] || modalidade}" não é compatível com ` +
        `o objeto "${OBJETO_LABEL_PT[objeto] || objeto}".`;
      correcao = `Modalidades compatíveis: ${compat.permitidas.map((m) => MODALIDADE_LABEL_PT[m]).join(', ')}.`;
    }

    checks.push({
      id: 'compat',
      requisito: 'Compatibilidade Objeto × Modalidade',
      lei: 'Art. 6º, XLI · Art. 28 a Art. 32',
      status, evidencia, correcao,
    });
  }

  // 8. Prazos
  {
    const r = evalRequirementByLine(lines, KB.prazo);
    checks.push({
      id: 'prazo',
      requisito: 'Prazos mínimos de divulgação do edital',
      lei: 'Art. 55',
      status: r.status,
      evidencia: fmtEvidence(r, 'Prazos não explicitados de forma clara.'),
      correcao: r.status === 'ok' ? null
        : 'Explicitar os prazos mínimos conforme Art. 55, observando a modalidade e o critério de julgamento.',
    });
  }

  // 9. Critério de julgamento
  {
    const r = evalRequirementByLine(lines, KB.criterio);
    checks.push({
      id: 'criterio',
      requisito: 'Critério de julgamento expresso',
      lei: 'Art. 33',
      status: r.status,
      evidencia: r.status === 'warn' && !r.snippet
        ? `Critério detectado: "${criterio}" (sem trecho explícito localizado).`
        : fmtEvidence(r, 'Critério de julgamento não mencionado.'),
      correcao: r.status === 'ok' ? null
        : 'Declarar expressamente o critério de julgamento adotado, entre os previstos no Art. 33.',
    });
  }

  // 10. Alerta: Lei 8.666/93 revogada — com contexto de negação
  {
    const r = verificarLeiAntiga(corpus);
    checks.push({
      id: 'lei-antiga',
      requisito: 'Ausência de referências à Lei 8.666/93 (revogada)',
      lei: 'Art. 191 · Lei 14.133/2021',
      status: r.status,
      evidencia: r.status === 'danger'
        ? `⚠️ ${r.reason}: "${r.snippet}"`
        : `✓ ${r.reason}`,
      correcao: r.status === 'danger'
        ? 'Substituir todas as menções à Lei 8.666/93 pelas disposições correspondentes da Lei 14.133/2021.'
        : null,
    });
  }

  // 11. Divergência parâmetro × conteúdo
  if (modalidadeParam !== 'auto' && modalidadeFromField && modalidadeParam !== modalidadeFromField) {
    checks.push({
      id: 'divergencia-modalidade',
      requisito: 'Coerência entre modalidade declarada e conteúdo do documento',
      lei: 'Art. 28 a Art. 32',
      status: 'warn',
      evidencia: `Parâmetro: "${MODALIDADE_LABEL_PT[modalidadeParam] || modalidadeParam}" · Encontrado no texto: "${MODALIDADE_LABEL_PT[modalidadeFromField] || modalidadeFromField}".`,
      correcao: 'Confirmar qual modalidade é efetivamente aplicada no edital.',
    });
  }

  /* ---------- Estatísticas ---------- */
  const total  = checks.length;
  const ok     = checks.filter((c) => c.status === 'ok').length;
  const warn   = checks.filter((c) => c.status === 'warn').length;
  const danger = checks.filter((c) => c.status === 'danger').length;
  const score  = Math.round(((ok * 1 + warn * 0.5) / total) * 100);

  let statusGeral;
  if (danger === 0 && warn <= 1) statusGeral = 'aprovado';
  else if (danger <= 2)          statusGeral = 'requer-correcoes';
  else                           statusGeral = 'inconclusivo';

  const correcoes = checks
    .filter((c) => c.status !== 'ok' && c.correcao)
    .map((c) => ({
      id: c.id,
      titulo: c.requisito,
      lei: c.lei,
      severidade: c.status === 'danger' ? 'alta' : 'media',
      descricao: c.evidencia,
      sugestao: c.correcao,
    }));

  return {
    geradoEm: new Date().toISOString(),
    statusGeral, score,
    estatisticas: { total, ok, warn, danger },
    identificacao: {
      objeto, objetoFromField,
      modalidade, modalidadeFromField,
      modalidadeField, objetoField,
      criterio,
      arquivosAnalisados: state.files.filter((f) => f.status === 'ok').length,
      caracteresAnalisados: corpus.length,
      linhasAnalisadas: lines.length,
    },
    checks,
    correcoes,
  };
}

function detectCriterioHeuristic(text) {
  const map = {
    'menor-preco':    ['menor preco', 'menor preço'],
    'maior-desconto': ['maior desconto'],
    'melhor-tecnica': ['melhor tecnica', 'melhor técnica'],
    'tecnica-preco':  ['tecnica e preco', 'técnica e preço'],
    'maior-lance':    ['maior lance'],
    'maior-retorno':  ['maior retorno economico', 'maior retorno econômico'],
  };
  let best = 'indefinido';
  let hits = 0;
  for (const [key, terms] of Object.entries(map)) {
    const c = countTerms(text, terms);
    if (c > hits) { hits = c; best = key; }
  }
  return best;
}

/* ==========================================================================
 * 9. RENDERIZAÇÃO
 * ======================================================================== */

const STATUS_LABEL = {
  'aprovado':         { titulo: 'Aprovado',         desc: 'O processo apresenta conformidade com os requisitos essenciais da Lei 14.133/2021.' },
  'requer-correcoes': { titulo: 'Requer Correções', desc: 'Foram identificadas inconsistências que precisam ser sanadas antes da publicação.' },
  'inconclusivo':     { titulo: 'Inconclusivo',     desc: 'Há divergências relevantes. Recomenda-se revisão aprofundada do processo.' },
};

const STATUS_COLOR = { aprovado: 'var(--ok)', 'requer-correcoes': 'var(--warn)', inconclusivo: 'var(--danger)' };
const STATUS_BADGE = { ok: 'badge--ok', warn: 'badge--warn', danger: 'badge--danger' };
const STATUS_TEXT  = { ok: 'Conforme', warn: 'Atenção', danger: 'Não conforme' };

const CRITERIO_LABEL = {
  'menor-preco': 'Menor preço', 'maior-desconto': 'Maior desconto',
  'melhor-tecnica': 'Melhor técnica ou conteúdo artístico',
  'tecnica-preco': 'Técnica e preço', 'maior-lance': 'Maior lance',
  'maior-retorno': 'Maior retorno econômico', 'indefinido': 'Não identificado',
};

function renderReport(rep) {
  const statusInfo  = STATUS_LABEL[rep.statusGeral];
  const statusColor = STATUS_COLOR[rep.statusGeral];
  const dashArray   = 2 * Math.PI * 44;
  const dashValue   = (rep.score / 100) * dashArray;

  const modalidadeLabel = MODALIDADE_LABEL_PT[rep.identificacao.modalidade]
    || (rep.identificacao.modalidade === 'indefinida' ? 'Não identificada' : rep.identificacao.modalidade);

  const html = `
    <section class="card status-card" aria-label="Status geral da auditoria">
      <div class="status-card__gauge" role="img" aria-label="Índice de conformidade: ${rep.score}%">
        <svg viewBox="0 0 100 100">
          <circle class="track" cx="50" cy="50" r="44"></circle>
          <circle class="value" cx="50" cy="50" r="44"
            style="stroke:${statusColor}; stroke-dasharray:${dashValue} ${dashArray};"></circle>
        </svg>
        <div class="status-card__score">${rep.score}<small>%</small></div>
      </div>
      <div class="status-card__info">
        <span class="badge ${rep.statusGeral === 'aprovado' ? 'badge--ok' : rep.statusGeral === 'requer-correcoes' ? 'badge--warn' : 'badge--danger'}">
          ${statusInfo.titulo}
        </span>
        <h3 style="margin-top:8px">${statusInfo.titulo}</h3>
        <p>${statusInfo.desc}</p>
      </div>
      <div class="status-card__metrics">
        <div class="metric"><div class="metric__value ok">${rep.estatisticas.ok}</div><div class="metric__label">Conformes</div></div>
        <div class="metric"><div class="metric__value warn">${rep.estatisticas.warn}</div><div class="metric__label">Atenção</div></div>
        <div class="metric"><div class="metric__value danger">${rep.estatisticas.danger}</div><div class="metric__label">Divergentes</div></div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <h3 class="card__title">Identificação do processo</h3>
        <div class="kv">
          <div class="kv__row"><span class="kv__key">Objeto predominante</span>
            <span class="kv__val">${OBJETO_LABEL_PT[rep.identificacao.objeto] || rep.identificacao.objeto}</span></div>
          <div class="kv__row"><span class="kv__key">Modalidade</span>
            <span class="kv__val">${modalidadeLabel}</span></div>
          <div class="kv__row"><span class="kv__key">Critério de julgamento</span>
            <span class="kv__val">${CRITERIO_LABEL[rep.identificacao.criterio] || rep.identificacao.criterio}</span></div>
        </div>
        ${rep.identificacao.objetoField ? `
          <div class="field-evidence">
            <span class="field-evidence__label">Campo "Objeto" extraído:</span>
            <span class="field-evidence__value">${escapeHtml(rep.identificacao.objetoField)}</span>
          </div>` : ''}
        ${rep.identificacao.modalidadeField ? `
          <div class="field-evidence">
            <span class="field-evidence__label">Campo "Modalidade" extraído:</span>
            <span class="field-evidence__value">${escapeHtml(rep.identificacao.modalidadeField)}</span>
          </div>` : ''}
      </section>

      <section class="card">
        <h3 class="card__title">Escopo da análise</h3>
        <div class="kv">
          <div class="kv__row"><span class="kv__key">Documentos analisados</span>
            <span class="kv__val">${rep.identificacao.arquivosAnalisados}</span></div>
          <div class="kv__row"><span class="kv__key">Linhas analisadas</span>
            <span class="kv__val">${rep.identificacao.linhasAnalisadas.toLocaleString('pt-BR')}</span></div>
          <div class="kv__row"><span class="kv__key">Caracteres processados</span>
            <span class="kv__val">${rep.identificacao.caracteresAnalisados.toLocaleString('pt-BR')}</span></div>
          <div class="kv__row"><span class="kv__key">Data da análise</span>
            <span class="kv__val">${new Date(rep.geradoEm).toLocaleString('pt-BR')}</span></div>
        </div>
      </section>
    </div>

    <section class="card">
      <h3 class="card__title">Checklist de conformidade — Lei 14.133/2021</h3>
      <div class="table-wrap">
        <table class="checks">
          <thead>
            <tr>
              <th>Requisito legal</th>
              <th>Encontrado no documento</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rep.checks.map((c) => `
              <tr>
                <td data-label="Requisito legal">
                  <span class="req__title">${escapeHtml(c.requisito)}</span>
                  <span class="req__law">${escapeHtml(c.lei)}</span>
                </td>
                <td data-label="Encontrado"><div class="evidence">${escapeHtml(c.evidencia)}</div></td>
                <td data-label="Status"><span class="badge ${STATUS_BADGE[c.status]}">${STATUS_TEXT[c.status]}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>

    ${rep.correcoes.length ? `
      <section class="card">
        <h3 class="card__title">Guia de correção</h3>
        <div class="fix-list">
          ${rep.correcoes.map((f) => `
            <article class="fix-item" data-severity="${f.severidade}">
              <header class="fix-item__head">
                <span class="fix-item__title">${escapeHtml(f.titulo)}</span>
                <span class="badge ${f.severidade === 'alta' ? 'badge--danger' : 'badge--warn'}">
                  ${f.severidade === 'alta' ? 'Prioridade alta' : 'Prioridade média'}
                </span>
              </header>
              <p class="fix-item__body">${escapeHtml(f.descricao)}</p>
              <div class="fix-item__suggest"><strong>Sugestão:</strong> ${escapeHtml(f.sugestao)}</div>
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <footer class="report-footer">
      <span>Análise gerada por LicitaAudit · Base normativa: Lei nº 14.133/2021</span>
      <span>${rep.checks.length} verificações executadas</span>
    </footer>
  `;

  els.report.innerHTML = html;
  els.report.classList.remove('is-hidden');
  els.emptyState.classList.add('is-hidden');
  els.printBtn.disabled = false;
  els.jsonBtn.disabled  = false;

  requestAnimationFrame(() => {
    const circle = els.report.querySelector('.status-card__gauge .value');
    if (circle) {
      circle.style.strokeDasharray = `0 ${dashArray}`;
      requestAnimationFrame(() => {
        circle.style.strokeDasharray = `${dashValue} ${dashArray}`;
      });
    }
  });
}

function resetReport() {
  state.report = null;
  els.report.innerHTML = '';
  els.report.classList.add('is-hidden');
  els.emptyState.classList.remove('is-hidden');
  els.printBtn.disabled = true;
  els.jsonBtn.disabled  = true;
}

/* ==========================================================================
 * 10. LISTA DE ARQUIVOS
 * ======================================================================== */

function renderFileList() {
  if (!state.files.length) {
    els.fileList.innerHTML = '';
    els.analyzeBtn.disabled = true;
    els.subtitle.textContent = 'Nenhum documento carregado';
    return;
  }

  els.fileList.innerHTML = state.files.map((f) => {
    const displayName = truncateFileName(f.name, 30);
    return `
    <li class="file-item ${f.status === 'error' ? 'is-error' : ''}" data-id="${f.id}">
      <span class="file-item__icon" aria-hidden="true">${escapeHtml(f.ext || '?')}</span>
      <span class="file-item__body">
        <span class="file-item__name" title="${escapeHtml(f.name)}">${escapeHtml(displayName)}</span>
        <span class="file-item__meta">
          ${f.status === 'error'
            ? escapeHtml(f.error || 'Erro ao ler')
            : `${formatBytes(f.size)} · ${(f.text?.length || 0).toLocaleString('pt-BR')} caracteres`}
        </span>
      </span>
      <button class="file-item__remove" type="button" aria-label="Remover ${escapeHtml(f.name)}" data-remove="${f.id}">×</button>
    </li>
  `;
  }).join('');

  const okCount = state.files.filter((f) => f.status === 'ok').length;
  els.analyzeBtn.disabled = okCount === 0;
  els.subtitle.textContent = `${state.files.length} documento(s) carregado(s) · ${okCount} pronto(s) para análise`;
}

/* ==========================================================================
 * 11. CARREGAMENTO
 * ======================================================================== */

async function addFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  for (const file of files) {
    state.files.push({
      id: uid(),
      name: file.name,
      ext: extOf(file.name),
      size: file.size,
      text: '',
      status: 'loading',
      error: null,
      _ref: file,
    });
  }
  renderFileList();
  showLoader('Extraindo texto dos documentos…');

  await Promise.all(
    state.files
      .filter((f) => f.status === 'loading')
      .map(async (entry) => {
        try {
          entry.text = await extractFileText(entry._ref);
          entry.status = 'ok';
        } catch (err) {
          entry.status = 'error';
          entry.error = err.message || 'Erro desconhecido';
          console.warn(`[LicitaAudit] Falha ao ler "${entry.name}":`, err);
        } finally {
          delete entry._ref;
          renderFileList();
        }
      })
  );

  hideLoader();
  const ok = state.files.filter((f) => f.status === 'ok').length;
  if (ok) toast(`${ok} arquivo(s) processado(s) com sucesso.`, 'ok');
  else    toast('Nenhum arquivo pôde ser processado.', 'error');
}

function removeFile(id) {
  state.files = state.files.filter((f) => f.id !== id);
  renderFileList();
  if (!state.files.length) resetReport();
}

function clearAll() {
  state.files = [];
  renderFileList();
  resetReport();
  els.fileInput.value = '';
  toast('Documentos removidos.', 'ok');
}

/* ==========================================================================
 * 12. EXPORTAÇÃO / FEEDBACK / TEMA
 * ======================================================================== */

function exportJson() {
  if (!state.report) return;
  const payload = {
    ferramenta: 'LicitaAudit',
    versao: '1.5.0',
    baseNormativa: 'Lei nº 14.133/2021',
    ...state.report,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `licitaudit-relatorio-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Relatório JSON exportado.', 'ok');
}

function showLoader(text) { els.loaderText.textContent = text || 'Processando…'; els.loader.classList.remove('is-hidden'); }
function hideLoader() { els.loader.classList.add('is-hidden'); }

let toastTimer;
function toast(message, kind = 'ok') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.dataset.kind = kind;
  els.toast.classList.remove('is-hidden');
  requestAnimationFrame(() => els.toast.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('is-visible');
    setTimeout(() => els.toast.classList.add('is-hidden'), 300);
  }, 3200);
}

function initTheme() {
  const stored = localStorage.getItem('licitaudit:theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.setAttribute('data-theme', stored || (prefersLight ? 'light' : 'dark'));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('licitaudit:theme', next);
}

/* ==========================================================================
 * 13. EVENTOS / BOOTSTRAP
 * ======================================================================== */

function bindEvents() {
  const dz = els.dropzone;
  dz.addEventListener('click', () => els.fileInput.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((evt) =>
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add('is-dragover'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove('is-dragover'); })
  );
  dz.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files?.length) addFiles(files);
  });

  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  });

  els.fileList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (btn) removeFile(btn.dataset.remove);
  });

  els.analyzeBtn.addEventListener('click', () => {
    if (state.isAnalyzing) return;
    const ok = state.files.filter((f) => f.status === 'ok').length;
    if (!ok) { toast('Carregue ao menos um documento legível.', 'error'); return; }
    state.isAnalyzing = true;
    showLoader('Executando motor de regras da Lei 14.133/2021…');
    setTimeout(() => {
      try {
        const rep = runAudit();
        state.report = rep;
        renderReport(rep);
        toast(`Análise concluída · ${rep.checks.length} verificações.`, 'ok');
        els.report.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        console.error(err);
        toast('Erro ao executar a análise.', 'error');
      } finally {
        hideLoader();
        state.isAnalyzing = false;
      }
    }, 300);
  });

  els.clearBtn.addEventListener('click', clearAll);
  els.printBtn.addEventListener('click', () => window.print());
  els.jsonBtn.addEventListener('click', exportJson);
  els.themeToggle.addEventListener('click', toggleTheme);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!els.analyzeBtn.disabled) els.analyzeBtn.click();
    }
  });
}

function bootstrap() {
  initTheme();
  configurePdfWorker();
  bindEvents();
  renderFileList();
  console.info(
    '%cLicitaAudit',
    'background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
    '· v1.5.0 · Lei 14.133/2021 · objeto resiliente + negação 8.666'
  );
}

document.addEventListener('DOMContentLoaded', bootstrap);
