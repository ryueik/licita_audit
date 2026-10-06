/* ============================================================================
 * LicitaAudit · app.js
 * ----------------------------------------------------------------------------
 * Aplicação de auditoria de conformidade para processos licitatórios com base
 * na Lei nº 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos).
 *
 * Estrutura:
 *   1. Estado global
 *   2. Utilitários (DOM, formatação, normalização de texto)
 *   3. Extração de texto (PDF.js, Mammoth.js, TXT)
 *   4. Motor de regras (Lei 14.133/2021)
 *   5. Renderização do relatório
 *   6. Exportação (JSON / impressão)
 *   7. Eventos e bootstrap
 * ========================================================================== */

'use strict';

/* ==========================================================================
 * 1. ESTADO GLOBAL
 * ======================================================================== */
const state = {
  files: [],          // [{ id, name, ext, size, text, status, error }]
  report: null,       // Resultado da última análise
  isAnalyzing: false,
};

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const els = {
  dropzone:       $('#dropzone'),
  fileInput:      $('#fileInput'),
  fileList:       $('#fileList'),
  analyzeBtn:     $('#analyzeBtn'),
  clearBtn:       $('#clearBtn'),
  printBtn:       $('#printBtn'),
  jsonBtn:        $('#jsonBtn'),
  emptyState:     $('#emptyState'),
  report:         $('#report'),
  loader:         $('#loader'),
  loaderText:     $('#loaderText'),
  toast:          $('#toast'),
  subtitle:       $('#topbarSubtitle'),
  themeToggle:    $('#themeToggle'),
  paramObjeto:    $('#paramObjeto'),
  paramModalidade:$('#paramModalidade'),
  paramCriterio:  $('#paramCriterio'),
};

/* ==========================================================================
 * 2. UTILITÁRIOS
 * ======================================================================== */

/** Gera ID curto e único. */
const uid = () => Math.random().toString(36).slice(2, 10);

/** Formata bytes para leitura humana. */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Extensão (sem ponto) em minúsculas. */
const extOf = (name) => (name.split('.').pop() || '').toLowerCase();

/** Normaliza texto para busca: minúsculas, sem acentos, espaços únicos. */
function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verifica se o texto contém qualquer um dos termos (normalizados). */
function hasAny(text, terms) {
  const t = normalize(text);
  return terms.some((term) => t.includes(normalize(term)));
}

/** Conta quantos termos aparecem no texto. */
function countTerms(text, terms) {
  const t = normalize(text);
  return terms.reduce((acc, term) => acc + (t.includes(normalize(term)) ? 1 : 0), 0);
}

/** Retorna o primeiro trecho (contexto) onde um termo aparece. */
function findContext(text, terms, radius = 90) {
  const t = normalize(text);
  for (const term of terms) {
    const idx = t.indexOf(normalize(term));
    if (idx >= 0) {
      const rawIdx = text.toLowerCase().indexOf(term.toLowerCase());
      const start = Math.max(0, (rawIdx >= 0 ? rawIdx : idx) - radius);
      const end   = Math.min(text.length, (rawIdx >= 0 ? rawIdx : idx) + term.length + radius);
      let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = '…' + snippet;
      if (end < text.length) snippet = snippet + '…';
      return { term, snippet };
    }
  }
  return null;
}

/** Escapa HTML para inserção segura. */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Debounce simples. */
function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ==========================================================================
 * 3. EXTRAÇÃO DE TEXTO
 * ======================================================================== */

/** Configura o worker do PDF.js (CDN compatível com a versão carregada). */
function configurePdfWorker() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

/** Extrai texto de um PDF usando PDF.js. */
async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join(' ');
    parts.push(text);
  }
  return parts.join('\n');
}

/** Extrai texto de DOCX usando Mammoth.js. */
async function extractDocx(file) {
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || '';
}

/** Extrai texto de TXT / MD. */
async function extractText(file) {
  return await file.text();
}

/**
 * Extrai texto de um arquivo, escolhendo o extrator correto.
 * Arquivos .doc (binário legado) não são suportados com precisão.
 */
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
      return await extractText(file);
    case 'doc':
      throw new Error(
        'Formato .doc (binário legado) não é suportado com precisão. ' +
        'Converta para .docx ou .pdf.'
      );
    default:
      throw new Error(`Extensão ".${ext}" não suportada.`);
  }
}

/* ==========================================================================
 * 4. MOTOR DE REGRAS — Lei 14.133/2021
 * ======================================================================== */

/**
 * Base de conhecimento: termos-chave usados para detecção.
 * Cada item mapeia para um conceito normativo da Lei 14.133/2021.
 */
const KB = {
  // -------- Documentos estruturantes --------
  etp: [
    'estudo tecnico preliminar', 'etp', 'estudos preliminares',
    'art. 18', 'artigo 18',
  ],
  tr: [
    'termo de referencia', 'termo de referência',
    'projeto basico', 'projeto básico',
    'anteprojeto', 'art. 6', 'art. 40',
  ],
  orcamento: [
    'estimativa de valor', 'estimativa do valor', 'planilha orcamentaria',
    'planilha orçamentária', 'valor estimado', 'pesquisa de precos',
    'pesquisa de preços', 'art. 23',
  ],
  matrizRiscos: [
    'matriz de risco', 'matriz de riscos', 'gerenciamento de riscos',
    'art. 22', 'art. 100',
  ],
  dotacao: [
    'dotacao orcamentaria', 'dotação orçamentária',
    'adequacao orcamentaria', 'adequação orçamentária',
    'disponibilidade orcamentaria', 'classificacao economica',
  ],
  justificativa: [
    'justificativa', 'motivacao', 'motivação', 'razoabilidade',
    'art. 5', 'art. 18',
  ],

  // -------- Modalidades --------
  pregao:        ['pregao', 'pregão', 'art. 29', 'artigo 29'],
  concorrencia:  ['concorrencia', 'concorrência', 'art. 28', 'artigo 28'],
  concurso:      ['concurso', 'art. 30', 'artigo 30'],
  leilao:        ['leilao', 'leilão', 'art. 31', 'artigo 31'],
  dialogo:       ['dialogo competitivo', 'diálogo competitivo', 'art. 32', 'artigo 32'],
  dispensa:      ['dispensa', 'art. 75', 'artigo 75'],
  inexigibilidade: ['inexigibilidade', 'art. 74', 'artigo 74'],

  // -------- Critérios de julgamento (art. 33) --------
  menorPreco:      ['menor preco', 'menor preço'],
  maiorDesconto:   ['maior desconto'],
  melhorTecnica:   ['melhor tecnica', 'melhor técnica', 'conteudo artistico', 'conteúdo artístico'],
  tecnicaPreco:    ['tecnica e preco', 'técnica e preço'],
  maiorLance:      ['maior lance', 'maior oferta'],
  maiorRetorno:    ['maior retorno economico', 'maior retorno econômico'],

  // -------- Prazos (art. 55) --------
  prazo: [
    'prazo de divulgacao', 'prazo mínimo', 'prazo minimo',
    'dias uteis', 'dias úteis', 'art. 55',
  ],

  // -------- Sinais de alerta --------
  leiAntiga: ['8.666', '8.666/93', '8.666/1993'],
  rdcAntigo: ['12.462', 'rdc'],
  emergencia: ['emergencia', 'emergência', 'calamidade', 'art. 75, viii'],

  // -------- Objeto --------
  obra:      ['obra', 'obras', 'engenharia', 'construcao', 'construção', 'reforma'],
  alienacao: ['alienacao', 'alienação', 'venda de bens', 'leilao de bens'],
  intelectual: ['trabalho tecnico', 'trabalho técnico', 'cientifico', 'científico', 'artistico', 'artístico'],
  inovacao:  ['inovacao', 'inovação', 'tecnologia nova', 'complexidade tecnica'],
};

/** Concatena o texto de todos os arquivos carregados. */
function buildCorpus() {
  return state.files
    .filter((f) => f.status === 'ok' && f.text)
    .map((f) => `\n===== ARQUIVO: ${f.name} =====\n${f.text}`)
    .join('\n');
}

/** Detecta a modalidade predominante. */
function detectModalidade(text) {
  const scores = {
    pregao:         countTerms(text, KB.pregao),
    concorrencia:   countTerms(text, KB.concorrencia),
    concurso:       countTerms(text, KB.concurso),
    leilao:         countTerms(text, KB.leilao),
    dialogo:        countTerms(text, KB.dialogo),
    dispensa:       countTerms(text, KB.dispensa),
    inexigibilidade:countTerms(text, KB.inexigibilidade),
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  if (bestScore === 0) return { value: 'indefinida', confidence: 0, scores };
  return { value: best, confidence: Math.min(1, bestScore / 3), scores };
}

/** Detecta o critério de julgamento predominante. */
function detectCriterio(text) {
  const map = {
    'menor-preco':    KB.menorPreco,
    'maior-desconto': KB.maiorDesconto,
    'melhor-tecnica': KB.melhorTecnica,
    'tecnica-preco':  KB.tecnicaPreco,
    'maior-lance':    KB.maiorLance,
    'maior-retorno':  KB.maiorRetorno,
  };
  let best = { value: 'indefinido', hits: 0 };
  for (const [key, terms] of Object.entries(map)) {
    const hits = countTerms(text, terms);
    if (hits > best.hits) best = { value: key, hits };
  }
  return best.value === 'indefinido' ? 'indefinido' : best.value;
}

/** Detecta o objeto predominante. */
function detectObjeto(text) {
  if (hasAny(text, KB.alienacao))      return 'alienacao';
  if (hasAny(text, KB.intelectual))    return 'intelectual';
  if (hasAny(text, KB.obra))           return 'obras';
  if (hasAny(text, KB.inovacao))       return 'servicos-especiais';
  if (hasAny(text, ['servico comum', 'serviços comuns', 'bens comuns'])) return 'servicos-comuns';
  if (hasAny(text, ['aquisicao de bens', 'aquisição de bens', 'compra de'])) return 'bens';
  return 'indefinido';
}

/** Valida a compatibilidade entre objeto e modalidade (arts. 28-32). */
function checkModalidadeCompatibilidade(objeto, modalidade) {
  const matrix = {
    'bens':              ['pregao', 'concorrencia', 'dispensa', 'inexigibilidade'],
    'servicos-comuns':   ['pregao', 'concorrencia', 'dispensa', 'inexigibilidade'],
    'servicos-especiais':['concorrencia', 'dialogo', 'dispensa', 'inexigibilidade'],
    'obras':             ['concorrencia', 'dialogo', 'dispensa', 'inexigibilidade'],
    'alienacao':         ['leilao', 'concorrencia', 'dispensa'],
    'intelectual':       ['concurso', 'concorrencia', 'dispensa', 'inexigibilidade'],
    'indefinido':        ['pregao', 'concorrencia', 'concurso', 'leilao', 'dialogo', 'dispensa', 'inexigibilidade'],
  };
  const permitidas = matrix[objeto] || matrix['indefinido'];
  return {
    ok: permitidas.includes(modalidade),
    permitidas,
  };
}

/**
 * Avalia a presença de um documento/elemento no corpus.
 * Retorna { present, snippet, terms }
 */
function evalPresence(text, terms) {
  const found = findContext(text, terms);
  return {
    present: !!found,
    snippet: found?.snippet || null,
    term: found?.term || null,
  };
}

/**
 * Executa a bateria completa de verificações.
 * @returns {Object} relatório estruturado
 */
function runAudit() {
  const text = buildCorpus();
  const objetoParam     = els.paramObjeto.value;
  const modalidadeParam = els.paramModalidade.value;
  const criterioParam   = els.paramCriterio.value;

  /* ---- Identificação ---- */
  const objetoDetectado     = detectObjeto(text);
  const modalidadeDetectada = detectModalidade(text);
  const criterioDetectado   = detectCriterio(text);

  const objeto     = objetoParam     === 'auto' ? objetoDetectado     : objetoParam;
  const modalidade = modalidadeParam === 'auto' ? modalidadeDetectada.value : modalidadeParam;
  const criterio   = criterioParam   === 'auto' ? criterioDetectado   : criterioParam;

  /* ---- Checagens ---- */
  const checks = [];

  // 1. Estudo Técnico Preliminar — Art. 18, §1º
  {
    const ev = evalPresence(text, KB.etp);
    checks.push({
      id: 'etp',
      requisito: 'Estudo Técnico Preliminar (ETP)',
      lei: 'Art. 18, §1º, I',
      status: ev.present ? 'ok' : 'danger',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Não foram encontradas referências ao ETP no corpus analisado.',
      correcao: ev.present ? null : 'Incluir capítulo específico de Estudo Técnico Preliminar, com descrição da necessidade, levantamento de mercado e definição da solução.',
    });
  }

  // 2. Termo de Referência / Projeto Básico — Art. 40
  {
    const ev = evalPresence(text, KB.tr);
    checks.push({
      id: 'tr',
      requisito: 'Termo de Referência / Anteprojeto / Projeto Básico',
      lei: 'Art. 6º, XXIII e XXV · Art. 40',
      status: ev.present ? 'ok' : 'danger',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Documento estruturante não identificado.',
      correcao: ev.present ? null : 'Anexar Termo de Referência (bens/serviços) ou Projeto Básico/Executivo (obras), conforme o objeto.',
    });
  }

  // 3. Estimativa de valor — Art. 23
  {
    const ev = evalPresence(text, KB.orcamento);
    checks.push({
      id: 'orcamento',
      requisito: 'Estimativa do valor da contratação',
      lei: 'Art. 23',
      status: ev.present ? 'ok' : 'danger',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Não há menção a valor estimado ou pesquisa de preços.',
      correcao: ev.present ? null : 'Elaborar estimativa de valor com base em pesquisa de preços (painel de preços, contratações similares, mídia especializada).',
    });
  }

  // 4. Adequação orçamentária — Art. 150 da Lei 14.133
  {
    const ev = evalPresence(text, KB.dotacao);
    checks.push({
      id: 'dotacao',
      requisito: 'Adequação orçamentária e indicação de dotação',
      lei: 'Art. 150',
      status: ev.present ? 'ok' : 'warn',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Não foi possível confirmar dotação orçamentária explícita.',
      correcao: ev.present ? null : 'Indicar a dotação orçamentária e o programa de trabalho que suportam a despesa.',
    });
  }

  // 5. Matriz de Riscos — Art. 22 / Art. 100
  {
    const ev = evalPresence(text, KB.matrizRiscos);
    const isObraOuEspecial = ['obras', 'servicos-especiais'].includes(objeto);
    checks.push({
      id: 'matriz',
      requisito: 'Matriz de Riscos',
      lei: 'Art. 22 · Art. 100',
      status: ev.present ? 'ok' : (isObraOuEspecial ? 'danger' : 'warn'),
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Matriz de riscos não identificada.',
      correcao: ev.present ? null : (isObraOuEspecial
        ? 'Obrigatória para obras e serviços de engenharia de grande vulto — incluir matriz de alocação de riscos.'
        : 'Recomenda-se incluir matriz de riscos para clareza contratual, ainda que facultativa.'),
    });
  }

  // 6. Motivação / Justificativa — Art. 5º e Art. 18
  {
    const ev = evalPresence(text, KB.justificativa);
    checks.push({
      id: 'motivacao',
      requisito: 'Motivação e justificativa da contratação',
      lei: 'Art. 5º · Art. 18, §1º',
      status: ev.present ? 'ok' : 'warn',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Não foi possível localizar seção de motivação.',
      correcao: ev.present ? null : 'Explicitar a motivação do ato e a justificativa da escolha da solução.',
    });
  }

  // 7. Compatibilidade objeto × modalidade — Arts. 28 a 32
  {
    const compat = checkModalidadeCompatibilidade(objeto, modalidade);
    checks.push({
      id: 'compat',
      requisito: `Compatibilidade entre objeto (${objeto}) e modalidade (${modalidade})`,
      lei: 'Art. 28 a Art. 32',
      status: compat.ok ? 'ok' : 'danger',
      evidencia: compat.ok
        ? `A modalidade "${modalidade}" é adequada ao objeto "${objeto}".`
        : `A modalidade "${modalidade}" não é a mais adequada ao objeto "${objeto}". Modalidades compatíveis: ${compat.permitidas.join(', ')}.`,
      correcao: compat.ok ? null : `Reavaliar a modalidade. Para o objeto identificado, considere: ${compat.permitidas.join(', ')}.`,
    });
  }

  // 8. Prazos mínimos de divulgação — Art. 55
  {
    const ev = evalPresence(text, KB.prazo);
    checks.push({
      id: 'prazo',
      requisito: 'Prazos mínimos de divulgação do edital',
      lei: 'Art. 55',
      status: ev.present ? 'ok' : 'warn',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : 'Prazos não explicitados de forma clara.',
      correcao: ev.present ? null : 'Explicitar os prazos mínimos conforme Art. 55, observando a modalidade e o critério de julgamento.',
    });
  }

  // 9. Critério de julgamento declarado — Art. 33
  {
    const ev = evalPresence(text, [
      ...KB.menorPreco, ...KB.maiorDesconto, ...KB.melhorTecnica,
      ...KB.tecnicaPreco, ...KB.maiorLance, ...KB.maiorRetorno,
    ]);
    checks.push({
      id: 'criterio',
      requisito: 'Critério de julgamento expresso',
      lei: 'Art. 33',
      status: ev.present ? 'ok' : 'warn',
      evidencia: ev.present ? `Localizado: "${ev.snippet}"` : `Critério detectado: "${criterio}" (sem trecho explícito localizado).`,
      correcao: ev.present ? null : 'Declarar expressamente o critério de julgamento adotado, entre os previstos no Art. 33.',
    });
  }

  // 10. Sinais de uso de lei revogada — Alerta crítico
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

  // 11. Coerência de modalidade com o parâmetro
  if (modalidadeParam !== 'auto' && modalidadeDetectada.value !== 'indefinida' &&
      modalidadeParam !== modalidadeDetectada.value) {
    checks.push({
      id: 'divergencia-modalidade',
      requisito: 'Coerência entre modalidade declarada e conteúdo do documento',
      lei: 'Art. 28 a Art. 32',
      status: 'warn',
      evidencia: `Modalidade declarada: "${modalidadeParam}" · detectada no texto: "${modalidadeDetectada.value}" (${(modalidadeDetectada.confidence * 100).toFixed(0)}% de confiança).`,
      correcao: 'Confirmar qual modalidade é efetivamente aplicada no edital.',
    });
  }

  /* ---- Estatísticas ---- */
  const total  = checks.length;
  const ok     = checks.filter((c) => c.status === 'ok').length;
  const warn   = checks.filter((c) => c.status === 'warn').length;
  const danger = checks.filter((c) => c.status === 'danger').length;
  const score  = Math.round(((ok * 1 + warn * 0.5) / total) * 100);

  let statusGeral;
  if (danger === 0 && warn <= 1) statusGeral = 'aprovado';
  else if (danger <= 2)          statusGeral = 'requer-correcoes';
  else                           statusGeral = 'inconclusivo';

  /* ---- Guia de correção ---- */
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
      objetoDetectado,
      modalidade,
      modalidadeDetectada: modalidadeDetectada.value,
      modalidadeConfianca: modalidadeDetectada.confidence,
      criterio,
      criterioDetectado,
      arquivosAnalisados: state.files.filter((f) => f.status === 'ok').length,
      caracteresAnalisados: text.length,
    },
    checks,
    correcoes,
    corpusPreview: text.slice(0, 4000),
  };
}

/* ==========================================================================
 * 5. RENDERIZAÇÃO
 * ======================================================================== */

const STATUS_LABEL = {
  'aprovado':         { titulo: 'Aprovado',           desc: 'O processo apresenta conformidade com os requisitos essenciais da Lei 14.133/2021.' },
  'requer-correcoes': { titulo: 'Requer Correções',   desc: 'Foram identificadas inconsistências que precisam ser sanadas antes da publicação.' },
  'inconclusivo':     { titulo: 'Inconclusivo',       desc: 'Há divergências relevantes. Recomenda-se revisão aprofundada do processo.' },
};

const STATUS_COLOR = {
  'aprovado':         'var(--ok)',
  'requer-correcoes': 'var(--warn)',
  'inconclusivo':     'var(--danger)',
};

const STATUS_BADGE = {
  ok:     'badge--ok',
  warn:   'badge--warn',
  danger: 'badge--danger',
};

const STATUS_TEXT = { ok: 'Conforme', warn: 'Atenção', danger: 'Não conforme' };

const MODALIDADE_LABEL = {
  pregao: 'Pregão', concorrencia: 'Concorrência', concurso: 'Concurso',
  leilao: 'Leilão', dialogo: 'Diálogo Competitivo',
  dispensa: 'Dispensa', inexigibilidade: 'Inexigibilidade',
  indefinida: 'Não identificada',
};

const CRITERIO_LABEL = {
  'menor-preco': 'Menor preço', 'maior-desconto': 'Maior desconto',
  'melhor-tecnica': 'Melhor técnica ou conteúdo artístico',
  'tecnica-preco': 'Técnica e preço', 'maior-lance': 'Maior lance',
  'maior-retorno': 'Maior retorno econômico', 'indefinido': 'Não identificado',
};

const OBJETO_LABEL = {
  'bens': 'Aquisição de bens', 'servicos-comuns': 'Serviços comuns',
  'servicos-especiais': 'Serviços especiais / técnicos',
  'obras': 'Obras e serviços de engenharia', 'alienacao': 'Alienação de bens',
  'intelectual': 'Trabalho técnico, científico ou artístico',
  'indefinido': 'Não identificado',
};

/** Renderiza o relatório completo na área principal. */
function renderReport(rep) {
  const statusInfo = STATUS_LABEL[rep.statusGeral];
  const statusColor = STATUS_COLOR[rep.statusGeral];

  const dashArray = 2 * Math.PI * 44; // r=44
  const dashValue = (rep.score / 100) * dashArray;

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
        <div class="metric">
          <div class="metric__value ok">${rep.estatisticas.ok}</div>
          <div class="metric__label">Conformes</div>
        </div>
        <div class="metric">
          <div class="metric__value warn">${rep.estatisticas.warn}</div>
          <div class="metric__label">Atenção</div>
        </div>
        <div class="metric">
          <div class="metric__value danger">${rep.estatisticas.danger}</div>
          <div class="metric__label">Divergentes</div>
        </div>
      </div>
    </section>

    <!-- ===================== Identificação ===================== -->
    <div class="grid-2">
      <section class="card">
        <h3 class="card__title">Identificação do processo</h3>
        <div class="kv">
          <div class="kv__row"><span class="kv__key">Objeto predominante</span>
            <span class="kv__val">${OBJETO_LABEL[rep.identificacao.objeto] || rep.identificacao.objeto}</span></div>
          <div class="kv__row"><span class="kv__key">Modalidade</span>
            <span class="kv__val">${MODALIDADE_LABEL[rep.identificacao.modalidade] || rep.identificacao.modalidade}
              ${rep.identificacao.modalidadeConfianca ? `<br><small style="color:var(--text-dim);font-weight:400">confiança: ${(rep.identificacao.modalidadeConfianca * 100).toFixed(0)}%</small>` : ''}
            </span></div>
          <div class="kv__row"><span class="kv__key">Critério de julgamento</span>
            <span class="kv__val">${CRITERIO_LABEL[rep.identificacao.criterio] || rep.identificacao.criterio}</span></div>
        </div>
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
              <th style="width:26%">Requisito legal</th>
              <th style="width:52%">Encontrado no documento</th>
              <th style="width:22%">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rep.checks.map((c) => `
              <tr>
                <td>
                  <span class="req__title">${escapeHtml(c.requisito)}</span>
                  <span class="req__law">${escapeHtml(c.lei)}</span>
                </td>
                <td><div class="evidence">${escapeHtml(c.evidencia)}</div></td>
                <td><span class="badge ${STATUS_BADGE[c.status]}">${STATUS_TEXT[c.status]}</span></td>
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

    <!-- ===================== Rodapé ===================== -->
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

  // Anima o gauge após o render
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

/** Volta ao estado vazio. */
function resetReport() {
  state.report = null;
  els.report.innerHTML = '';
  els.report.classList.add('is-hidden');
  els.emptyState.classList.remove('is-hidden');
  els.printBtn.disabled = true;
  els.jsonBtn.disabled  = true;
}

/* ==========================================================================
 * 6. UI — LISTA DE ARQUIVOS
 * ======================================================================== */

function renderFileList() {
  if (!state.files.length) {
    els.fileList.innerHTML = '';
    els.analyzeBtn.disabled = true;
    els.subtitle.textContent = 'Nenhum documento carregado';
    return;
  }

  els.fileList.innerHTML = state.files.map((f) => `
    <li class="file-item ${f.status === 'error' ? 'is-error' : ''}" data-id="${f.id}">
      <span class="file-item__icon">${escapeHtml(f.ext || '?')}</span>
      <span>
        <span class="file-item__name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="file-item__meta">
          ${f.status === 'error'
            ? escapeHtml(f.error || 'Erro ao ler')
            : `${formatBytes(f.size)} · ${(f.text?.length || 0).toLocaleString('pt-BR')} caracteres`}
        </span>
      </span>
      <button class="file-item__remove" type="button" aria-label="Remover ${escapeHtml(f.name)}" data-remove="${f.id}">×</button>
    </li>
  `).join('');

  const okCount = state.files.filter((f) => f.status === 'ok').length;
  els.analyzeBtn.disabled = okCount === 0;
  els.subtitle.textContent = `${state.files.length} documento(s) carregado(s) · ${okCount} pronto(s) para análise`;
}

/* ==========================================================================
 * 7. CARREGAMENTO DE ARQUIVOS
 * ======================================================================== */

async function addFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  for (const file of files) {
    const ext = extOf(file.name);
    const entry = {
      id: uid(),
      name: file.name,
      ext,
      size: file.size,
      text: '',
      status: 'loading',
      error: null,
    };
    state.files.push(entry);
    renderFileList();
  }

  showLoader('Extraindo texto dos documentos…');

  await Promise.all(
    state.files
      .filter((f) => f.status === 'loading')
      .map(async (entry) => {
        const file = files.find((f) => f.name === entry.name && f.size === entry.size);
        if (!file) return;
        try {
          const text = await extractFileText(file);
          entry.text = text;
          entry.status = 'ok';
        } catch (err) {
          entry.status = 'error';
          entry.error = err.message || 'Erro desconhecido';
          console.warn(`[LicitaAudit] Falha ao ler "${entry.name}":`, err);
        } finally {
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
  if (!state.files.length) {
    resetReport();
  }
}

function clearAll() {
  state.files = [];
  renderFileList();
  resetReport();
  els.fileInput.value = '';
  toast('Documentos removidos.', 'ok');
}

/* ==========================================================================
 * 8. EXPORTAÇÃO
 * ======================================================================== */

function exportJson() {
  if (!state.report) return;
  const payload = {
    ferramenta: 'LicitaAudit',
    versao: '1.0.0',
    baseNormativa: 'Lei nº 14.133/2021',
    geradoEm: state.report.geradoEm,
    ...state.report,
    corpusPreview: undefined,
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

/* ==========================================================================
 * 9. FEEDBACK VISUAL
 * ======================================================================== */

function showLoader(text) {
  els.loaderText.textContent = text || 'Processando…';
  els.loader.classList.remove('is-hidden');
}
function hideLoader() {
  els.loader.classList.add('is-hidden');
}

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

/* ==========================================================================
 * 10. TEMA
 * ======================================================================== */

function initTheme() {
  const stored = localStorage.getItem('licitaudit:theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = stored || (prefersLight ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('licitaudit:theme', next);
}

/* ==========================================================================
 * 11. EVENTOS E BOOTSTRAP
 * ======================================================================== */

function bindEvents() {
  /* ---- Dropzone ---- */
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

  /* ---- Remoção individual (delegação) ---- */
  els.fileList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (btn) removeFile(btn.dataset.remove);
  });

  /* ---- Ações ---- */
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
    }, 350);
  });

  els.clearBtn.addEventListener('click', clearAll);
  els.printBtn.addEventListener('click', () => window.print());
  els.jsonBtn.addEventListener('click', exportJson);
  els.themeToggle.addEventListener('click', toggleTheme);

  /* ---- Atalho: Ctrl/Cmd + Enter analisa ---- */
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
  console.info('%cLicitaAudit','background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700','· v1.0.0 · Lei 14.133/2021');
}

document.addEventListener('DOMContentLoaded', bootstrap);
