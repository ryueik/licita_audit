/* ============================================================================
 * LicitaAudit · app.js
 * ----------------------------------------------------------------------------
 * v1.1.0 — Correções:
 *   • Detecção contextual de documentos ausentes (falsos positivos)
 *   • Extração precisa de "Modalidade:" e "Objeto:" via regex
 *   • Validação jurídica robusta Objeto × Modalidade (Art. 6º, XLI · Art. 28-32)
 *   • Truncamento de nome de arquivo preservando a extensão
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

const $  = (sel, ctx = document) => ctx.querySelector(sel);

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
 * 2. UTILITÁRIOS
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

function hasAny(text, terms) {
  const t = normalize(text);
  return terms.some((term) => t.includes(normalize(term)));
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

/**
 * Trunca o nome do arquivo preservando SEMPRE a extensão.
 * Ex.: "Documento_de_Teste_Licitacao_2024_Final.pdf"  →  "Documento_de_Teste_Licita….pdf"
 */
function truncateFileName(name, maxBase = 30) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return name.length > maxBase ? name.slice(0, maxBase) + '…' : name;
  }
  const base = name.slice(0, dot);
  const ext  = name.slice(dot); // inclui o ponto
  if (base.length <= maxBase) return name;
  return base.slice(0, maxBase - 1).trimEnd() + '…' + ext;
}

/* ==========================================================================
 * 3. DETECÇÃO CONTEXTUAL (ANTI-FALSOS-POSITIVOS)
 * ======================================================================== */

/** Marcadores que indicam AUSÊNCIA do documento mesmo que a string exista. */
const NEGATIVE_MARKERS = [
  'ausente', 'ausencia', 'pendente', 'faltante', 'em falta',
  'nao anexado', 'nao anexa', 'nao anexo', 'nao incluido', 'nao incluida',
  'nao localizado', 'nao localizada', 'nao encontrado', 'nao encontrada',
  'nao consta', 'nao constam', 'nao apresentado', 'nao apresentada',
  'nao elaborado', 'nao elaborada', 'nao ha', 'inexistente',
  'omisso', 'omissa', 'a elaborar', 'a providenciar', 'a anexar',
  'a ser elaborado', 'a ser anexado', 'deve ser incluido', 'deve ser anexado',
  'necessario incluir', 'necessario anexar', 'nao foi possivel',
  'nao se aplica', 'nao aplicavel', 'aguardando', 'em elaboracao',
];

/** Encontra todas as posições de um termo (case-insensitive) no texto bruto. */
function findTermPositions(text, term) {
  const lower = text.toLowerCase();
  const tLower = term.toLowerCase();
  const positions = [];
  let idx = 0;
  while ((idx = lower.indexOf(tLower, idx)) !== -1) {
    positions.push(idx);
    idx += tLower.length;
  }
  return positions;
}

/** Verifica se o contexto ao redor de uma ocorrência é negativo (ausência). */
function isNegativeContext(text, pos, termLen, window = 130) {
  const start = Math.max(0, pos - window);
  const end   = Math.min(text.length, pos + termLen + window);
  const ctx   = normalize(text.slice(start, end));
  return NEGATIVE_MARKERS.some((m) => ctx.includes(m));
}

/** Constrói um trecho (snippet) legível em torno de uma posição. */
function makeSnippet(text, pos, termLen, radius = 90) {
  const start = Math.max(0, pos - radius);
  const end   = Math.min(text.length, pos + termLen + radius);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet;
}

/**
 * Avalia presença de um termo com verificação contextual.
 * Retorna:
 *   { present: true,  snippet, term, negative: false }  → conforme
 *   { present: false, snippet, term, negative: true  }  → declarado ausente
 *   { present: false, snippet: null, term: null, negative: false } → não mencionado
 */
function evalPresence(text, terms) {
  for (const term of terms) {
    const positions = findTermPositions(text, term);
    if (!positions.length) continue;

    let positivePos = -1;
    let negativePos = -1;

    for (const pos of positions) {
      if (isNegativeContext(text, pos, term.length)) {
        if (negativePos === -1) negativePos = pos;
      } else {
        positivePos = pos;
        break; // achou uma ocorrência "positiva" — suficiente
      }
    }

    if (positivePos !== -1) {
      return {
        present: true,
        negative: false,
        snippet: makeSnippet(text, positivePos, term.length),
        term,
      };
    }
    if (negativePos !== -1) {
      return {
        present: false,
        negative: true,
        snippet: makeSnippet(text, negativePos, term.length),
        term,
      };
    }
  }
  return { present: false, negative: false, snippet: null, term: null };
}

/* ==========================================================================
 * 4. EXTRAÇÃO DE CAMPOS ROTULADOS (Modalidade / Objeto)
 * ======================================================================== */

/**
 * Extrai o valor de um campo rotulado (ex.: "Modalidade: Leilão").
 * Aceita variações: ":", "-", "–", "—" e quebra de linha opcional após o rótulo.
 */
function extractLabeledField(text, labelPatterns) {
  for (const label of labelPatterns) {
    const rx = new RegExp(
      `(?:^|[\\n\\r;.\\s])${label}\\s*[:\\-–—]\\s*\\n?\\s*([^\\n\\r]{2,300})`,
      'im'
    );
    const m = text.match(rx);
    if (m) {
      // Corta na primeira pontuação forte para não pegar a frase inteira
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

function extractObjetoField(text) {
  return extractLabeledField(text, [
    'identifica[cç][aã]o\\s+do\\s+objeto',
    'objeto\\s+da\\s+contrata[cç][aã]o',
    'objeto\\s+da\\s+licita[cç][aã]o',
    'do\\s+objeto',
    'objeto',
  ]);
}

/** Mapeia o texto do campo "Modalidade" para a chave interna. */
function classifyModalidadeValue(value) {
  if (!value) return null;
  const v = normalize(value);
  if (/dialogo\s+competitivo|dialogo/.test(v))    return 'dialogo';
  if (/inexigibilidade/.test(v))                  return 'inexigibilidade';
  if (/dispensa/.test(v))                         return 'dispensa';
  if (/leil[aã]o/.test(v))                        return 'leilao';
  if (/concorr[eê]ncia/.test(v))                  return 'concorrencia';
  if (/concurso/.test(v))                         return 'concurso';
  if (/preg[aã]o/.test(v))                        return 'pregao';
  return null;
}

/** Mapeia o texto do campo "Objeto" para a chave interna. */
function classifyObjetoValue(value) {
  if (!value) return null;
  const v = normalize(value);

  // 1) Alienação (prioridade máxima — é a que causa o falso positivo atual)
  if (/(alienacao|venda\s+de\s+bens|leilao\s+de\s+bens|bens\s+moveis?\s+inserviveis?|bens\s+imoveis?\s+da\s+administracao)/.test(v)) {
    return 'alienacao';
  }
  // 2) Obras / engenharia
  if (/(obra|obras|engenharia|construcao|reforma|pavimentacao|edificacao|saneamento)/.test(v)) {
    return 'obras';
  }
  // 3) Trabalho técnico/científico/artístico
  if (/(trabalho\s+tecnico|trabalho\s+cientifico|trabalho\s+artistico|projeto\s+arquitetonico|conteudo\s+artistico)/.test(v)) {
    return 'intelectual';
  }
  // 4) TI / complexidade técnica → serviço especial
  if (/(ti\b|tecnologia\s+da\s+informacao|software|sistema\s+informat|computador|notebook|servidor\s+de\s+rede|datacenter|nuvem|cloud|licencas?\s+de\s+software)/.test(v)) {
    return 'servicos-especiais';
  }
  // 5) Serviços comuns (limpeza, vigilância, apoio administrativo)
  if (/(servico\s+comum|servicos\s+comuns|limpeza|conservacao|vigilancia|porteiro|apoio\s+administrativo|recepcionista|jardinagem)/.test(v)) {
    return 'servicos-comuns';
  }
  // 6) Bens comuns
  if (/(bens?\s+comuns?|material\s+de\s+escritorio|generos?\s+alimenticios?|mobiliario|papelaria|uniformes|medicamentos?)/.test(v)) {
    return 'bens';
  }
  // 7) Aquisição genérica de bens
  if (/(aquisicao\s+de\s+bens|compra\s+de\s+bens|aquisicao|compra)/.test(v)) {
    return 'bens';
  }
  // 8) Contratação genérica de serviços
  if (/(contratacao\s+de\s+servicos|prestacao\s+de\s+servicos|servicos)/.test(v)) {
    return 'servicos-comuns';
  }
  return null;
}

/* ==========================================================================
 * 5. MATRIZ LEGAL — Compatibilidade Objeto × Modalidade (Lei 14.133/2021)
 * ======================================================================== */

/**
 * Matriz de compatibilidade.
 * Cada modalidade aponta os objetos PERMITIDOS.
 * Base: Arts. 6º, XXVIII a XLI; Arts. 28 a 32.
 */
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
  bens: 'Aquisição de bens',
  'servicos-comuns': 'Serviços comuns',
  'servicos-especiais': 'Serviços especiais / TI',
  obras: 'Obras e serviços de engenharia',
  alienacao: 'Alienação de bens',
  intelectual: 'Trabalho técnico, científico ou artístico',
  indefinido: 'Não identificado',
};

/** Verifica compatibilidade com base na matriz legal. */
function checkModalidadeCompatibilidade(objeto, modalidade) {
  const permitidas = MODALIDADE_OBJETO_MATRIX[modalidade];
  if (!permitidas) {
    return { ok: true, permitidas: [], motivo: null };
  }
  const ok = permitidas.includes(objeto);
  return { ok, permitidas, motivo: ok ? null : `objeto "${objeto}" não é compatível com a modalidade "${modalidade}".` };
}

/* ==========================================================================
 * 6. DETECÇÃO HEURÍSTICA (fallback quando não há campo rotulado)
 * ======================================================================== */

const KB = {
  etp: ['estudo tecnico preliminar', 'estudo técnico preliminar', 'etp', 'art. 18', 'artigo 18'],
  tr:  ['termo de referencia', 'termo de referência', 'projeto basico', 'projeto básico', 'anteprojeto', 'art. 40'],
  orcamento: ['estimativa de valor', 'estimativa do valor', 'planilha orcamentaria', 'planilha orçamentária', 'valor estimado', 'pesquisa de precos', 'pesquisa de preços', 'art. 23'],
  matrizRiscos: ['matriz de risco', 'matriz de riscos', 'gerenciamento de riscos', 'art. 22', 'art. 100'],
  dotacao: ['dotacao orcamentaria', 'dotação orçamentária', 'adequacao orcamentaria', 'adequação orçamentária', 'disponibilidade orcamentaria', 'classificacao economica'],
  justificativa: ['justificativa', 'motivacao', 'motivação', 'art. 5'],
  prazo: ['prazo de divulgacao', 'prazo mínimo', 'prazo minimo', 'dias uteis', 'dias úteis', 'art. 55'],
  leiAntiga: ['8.666', '8.666/93', '8.666/1993'],
  alienacao: ['alienacao', 'alienação', 'venda de bens', 'leilao de bens'],
  obra: ['obra', 'obras', 'engenharia', 'construcao', 'construção', 'reforma'],
  intelectual: ['trabalho tecnico', 'trabalho técnico', 'cientifico', 'científico', 'artistico', 'artístico'],
  inovacao: ['inovacao', 'inovação', 'complexidade tecnica'],
};

function detectObjetoHeuristic(text) {
  const v = normalize(text);
  // Alienação só se realmente fala de alienação (sem contexto negativo)
  const alienacaoEv = evalPresence(text, KB.alienacao);
  if (alienacaoEv.present) return 'alienacao';
  if (hasAny(v, KB.obra)) return 'obras';
  if (hasAny(v, KB.intelectual)) return 'intelectual';
  if (/(ti\b|tecnologia da informacao|software|sistema informat|computador|notebook)/.test(v)) return 'servicos-especiais';
  if (/(servico comum|servicos comuns|limpeza|vigilancia|apoio administrativo)/.test(v)) return 'servicos-comuns';
  if (/(aquisicao de bens|compra de|bens comuns|material de escritorio)/.test(v)) return 'bens';
  return 'indefinido';
}

/* ==========================================================================
 * 7. EXTRAÇÃO DE TEXTO (PDF.js / Mammoth.js / TXT)
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
    parts.push(content.items.map((it) => it.str).join(' '));
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
 * 8. MOTOR DE REGRAS — Auditoria
 * ======================================================================== */

function buildCorpus() {
  return state.files
    .filter((f) => f.status === 'ok' && f.text)
    .map((f) => `\n===== ARQUIVO: ${f.name} =====\n${f.text}`)
    .join('\n');
}

function runAudit() {
  const text = buildCorpus();
  const objetoParam     = els.paramObjeto.value;
  const modalidadeParam = els.paramModalidade.value;
  const criterioParam   = els.paramCriterio.value;

  /* ---------- Extração explícita dos campos rotulados ---------- */
  const modalidadeField = extractModalidadeField(text);
  const objetoField     = extractObjetoField(text);

  const modalidadeFromField = classifyModalidadeValue(modalidadeField);
  const objetoFromField     = classifyObjetoValue(objetoField);

  /* ---------- Detecção heurística (fallback) ---------- */
  const objetoHeuristico = detectObjetoHeuristic(text);

  /* ---------- Prioridade: parâmetro > campo rotulado > heurística ---------- */
  const objeto     = objetoParam     !== 'auto' ? objetoParam
                  : objetoFromField     || objetoHeuristico;
  const modalidade = modalidadeParam !== 'auto' ? modalidadeParam
                  : modalidadeFromField || 'indefinida';
  const criterio   = criterioParam   !== 'auto' ? criterioParam
                  : detectCriterioHeuristic(text);

  /* ---------- Checagens ---------- */
  const checks = [];

  // 1. ETP
  {
    const ev = evalPresence(text, KB.etp);
    let status = 'danger';
    let evidencia = 'Não foram encontradas referências ao ETP no corpus analisado.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      status = 'danger';
      evidencia = `⚠️ O documento DECLARA AUSÊNCIA do ETP: "${ev.snippet}"`;
    }
    checks.push({
      id: 'etp',
      requisito: 'Estudo Técnico Preliminar (ETP)',
      lei: 'Art. 18, §1º, I',
      status,
      evidencia,
      correcao: ev.present ? null : 'Elaborar e anexar o Estudo Técnico Preliminar com descrição da necessidade, levantamento de mercado e definição da solução.',
    });
  }

  // 2. TR / Projeto Básico
  {
    const ev = evalPresence(text, KB.tr);
    let status = 'danger';
    let evidencia = 'Documento estruturante (TR / Projeto Básico) não identificado.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      status = 'danger';
      evidencia = `⚠️ O documento DECLARA AUSÊNCIA do Termo de Referência / Projeto Básico: "${ev.snippet}"`;
    }
    checks.push({
      id: 'tr',
      requisito: 'Termo de Referência / Anteprojeto / Projeto Básico',
      lei: 'Art. 6º, XXIII e XXV · Art. 40',
      status,
      evidencia,
      correcao: ev.present ? null : 'Anexar Termo de Referência (bens/serviços) ou Projeto Básico/Executivo (obras), conforme o objeto.',
    });
  }

  // 3. Estimativa de valor
  {
    const ev = evalPresence(text, KB.orcamento);
    let status = 'danger';
    let evidencia = 'Não há menção a valor estimado ou pesquisa de preços.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      status = 'danger';
      evidencia = `⚠️ O documento DECLARA AUSÊNCIA da estimativa de valor: "${ev.snippet}"`;
    }
    checks.push({
      id: 'orcamento',
      requisito: 'Estimativa do valor da contratação',
      lei: 'Art. 23',
      status,
      evidencia,
      correcao: ev.present ? null : 'Elaborar estimativa de valor com base em pesquisa de preços (painel de preços, contratações similares, mídia especializada).',
    });
  }

  // 4. Dotação orçamentária
  {
    const ev = evalPresence(text, KB.dotacao);
    let status = 'warn';
    let evidencia = 'Não foi possível confirmar dotação orçamentária explícita.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      status = 'warn';
      evidencia = `⚠️ O documento DECLARA AUSÊNCIA da dotação orçamentária: "${ev.snippet}"`;
    }
    checks.push({
      id: 'dotacao',
      requisito: 'Adequação orçamentária e indicação de dotação',
      lei: 'Art. 150',
      status,
      evidencia,
      correcao: ev.present ? null : 'Indicar a dotação orçamentária e o programa de trabalho que suportam a despesa.',
    });
  }

  // 5. Matriz de Riscos
  {
    const ev = evalPresence(text, KB.matrizRiscos);
    const isObraOuEspecial = ['obras', 'servicos-especiais'].includes(objeto);
    let status = isObraOuEspecial ? 'danger' : 'warn';
    let evidencia = 'Matriz de riscos não identificada.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      evidencia = `⚠️ Matriz de riscos declarada ausente: "${ev.snippet}"`;
    }
    checks.push({
      id: 'matriz',
      requisito: 'Matriz de Riscos',
      lei: 'Art. 22 · Art. 100',
      status,
      evidencia,
      correcao: ev.present ? null : (isObraOuEspecial
        ? 'Obrigatória para obras e serviços de engenharia de grande vulto — incluir matriz de alocação de riscos.'
        : 'Recomenda-se incluir matriz de riscos para clareza contratual, ainda que facultativa.'),
    });
  }

  // 6. Motivação
  {
    const ev = evalPresence(text, KB.justificativa);
    let status = 'warn';
    let evidencia = 'Não foi possível localizar seção de motivação.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      evidencia = `⚠️ Motivação declarada ausente: "${ev.snippet}"`;
    }
    checks.push({
      id: 'motivacao',
      requisito: 'Motivação e justificativa da contratação',
      lei: 'Art. 5º · Art. 18, §1º',
      status,
      evidencia,
      correcao: ev.present ? null : 'Explicitar a motivação do ato e a justificativa da escolha da solução.',
    });
  }

  // 7. ⭐ Compatibilidade Objeto × Modalidade (validação legal REFORÇADA)
  {
    const compat = checkModalidadeCompatibilidade(objeto, modalidade);

    // Regra de ouro do Art. 6º, XLI: Leilão SOMENTE para alienação
    let status = compat.ok ? 'ok' : 'danger';
    let evidencia;
    let correcao = null;

    if (modalidade === 'leilao' && objeto !== 'alienacao' && objeto !== 'indefinido') {
      status = 'danger';
      evidencia =
        `❌ A modalidade Leilão é restrita à alienação de bens (móveis inservíveis ou imóveis). ` +
        `O objeto identificado foi "${OBJETO_LABEL_PT[objeto] || objeto}".`;
      correcao =
        `Para "${OBJETO_LABEL_PT[objeto] || objeto}", utilize Pregão (bens/serviços comuns) ` +
        `ou Concorrência (demais casos), conforme Art. 6º, XLI e Art. 29.`;
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
        `❌ O Diálogo Competitivo é restrito a inovação, complexidade técnica ou impossibilidade de especificação prévia (Art. 32). ` +
        `Objeto identificado: "${OBJETO_LABEL_PT[objeto] || objeto}".`;
      correcao = 'Utilize Pregão (bens/serviços comuns) ou Concorrência.';
    } else if (compat.ok) {
      evidencia = `Modalidade "${MODALIDADE_LABEL_PT[modalidade] || modalidade}" é adequada ao objeto "${OBJETO_LABEL_PT[objeto] || objeto}".`;
    } else {
      evidencia = `A modalidade "${MODALIDADE_LABEL_PT[modalidade] || modalidade}" não é compatível com o objeto "${OBJETO_LABEL_PT[objeto] || objeto}".`;
      correcao = `Modalidades compatíveis: ${compat.permitidas.map((m) => MODALIDADE_LABEL_PT[m]).join(', ')}.`;
    }

    checks.push({
      id: 'compat',
      requisito: `Compatibilidade Objeto × Modalidade`,
      lei: 'Art. 6º, XLI · Art. 28 a Art. 32',
      status,
      evidencia,
      correcao,
    });
  }

  // 8. Prazos (Art. 55)
  {
    const ev = evalPresence(text, KB.prazo);
    let status = 'warn';
    let evidencia = 'Prazos não explicitados de forma clara.';
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    } else if (ev.negative) {
      evidencia = `⚠️ Prazos declarados ausentes: "${ev.snippet}"`;
    }
    checks.push({
      id: 'prazo',
      requisito: 'Prazos mínimos de divulgação do edital',
      lei: 'Art. 55',
      status,
      evidencia,
      correcao: ev.present ? null : 'Explicitar os prazos mínimos conforme Art. 55, observando a modalidade e o critério de julgamento.',
    });
  }

  // 9. Critério de julgamento
  {
    const ev = evalPresence(text, [
      'menor preco', 'menor preço', 'maior desconto', 'melhor tecnica', 'melhor técnica',
      'tecnica e preco', 'técnica e preço', 'maior lance', 'maior retorno economico',
    ]);
    let status = 'warn';
    let evidencia = `Critério detectado: "${criterio}" (sem trecho explícito localizado).`;
    if (ev.present) {
      status = 'ok';
      evidencia = `Localizado: "${ev.snippet}"`;
    }
    checks.push({
      id: 'criterio',
      requisito: 'Critério de julgamento expresso',
      lei: 'Art. 33',
      status,
      evidencia,
      correcao: ev.present ? null : 'Declarar expressamente o critério de julgamento adotado, entre os previstos no Art. 33.',
    });
  }

  // 10. Alerta: Lei 8.666/93 revogada
  {
    const ev = evalPresence(text, KB.leiAntiga);
    checks.push({
      id: 'lei-antiga',
      requisito: 'Ausência de referências à Lei 8.666/93 (revogada)',
      lei: 'Art. 191 · Lei 14.133/2021',
      status: ev.present ? 'danger' : 'ok',
      evidencia: ev.present
        ? `⚠️ Referência à Lei 8.666/93 detectada: "${ev.snippet}"`
        : 'Nenhuma referência à Lei 8.666/93 encontrada.',
      correcao: ev.present
        ? 'Substituir todas as menções à Lei 8.666/93 pelas disposições correspondentes da Lei 14.133/2021.'
        : null,
    });
  }

  // 11. Divergência entre parâmetro declarado e conteúdo
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
    statusGeral,
    score,
    estatisticas: { total, ok, warn, danger },
    identificacao: {
      objeto,
      objetoFromField,
      objetoHeuristico,
      modalidade,
      modalidadeFromField,
      modalidadeField,
      objetoField,
      criterio,
      arquivosAnalisados: state.files.filter((f) => f.status === 'ok').length,
      caracteresAnalisados: text.length,
    },
    checks,
    correcoes,
  };
}

/** Detecção heurística de critério de julgamento (fallback). */
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
    <!-- ===================== Card de status ===================== -->
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

    <!-- ===================== Identificação ===================== -->
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
          <div class="kv__row"><span class="kv__key">Caracteres processados</span>
            <span class="kv__val">${rep.identificacao.caracteresAnalisados.toLocaleString('pt-BR')}</span></div>
          <div class="kv__row"><span class="kv__key">Data da análise</span>
            <span class="kv__val">${new Date(rep.geradoEm).toLocaleString('pt-BR')}</span></div>
        </div>
      </section>
    </div>

    <!-- ===================== Tabela de conformidade ===================== -->
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

    <!-- ===================== Guia de correção ===================== -->
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
    versao: '1.1.0',
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
  console.info('%cLicitaAudit','background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700','· v1.1.0 · Lei 14.133/2021');
}

document.addEventListener('DOMContentLoaded', bootstrap);
