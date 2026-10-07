/* ============================================================================
 * LicitaAudit · app.js — v4.0.0 (Core Engine)
 * ----------------------------------------------------------------------------
 * • 30 verificações NUCLEARES com filtragem dinâmica via `aplicavel(ctx)`.
 * • Regras NÃO aplicáveis são excluídas do score (não geram falso-positivo).
 * • Parser de Objeto/Cabeçalho flexível.
 * • Entrada: clique + drag&drop + colar (Ctrl+V).
 * ========================================================================== */
'use strict';

/* ==========================================================================
 * 1. ESTADO / DOM
 * ======================================================================== */
const state = { files: [], report: null, isAnalyzing: false, filtro: 'todos' };
const $ = (s, c = document) => c.querySelector(s);

const els = {
  dropzone:        $('#dropzone'),
  fileInput:       $('#fileInput'),
  fileList:        $('#fileList'),
  analyzeBtn:      $('#analyzeBtn'),
  clearBtn:        $('#clearBtn'),
  pdfBtn:          $('#pdfBtn'),
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
 * 2. CONSTANTES / UTILS
 * ======================================================================== */
const LIMITE_DISPENSA_BENS_SERVICOS = 50000.00;
const LIMITE_DISPENSA_OBRAS          = 100000.00;
const PESOS = { CRITICA: 5, MEDIA: 2, BAIXA: 0.5 };

const uid       = () => Math.random().toString(36).slice(2, 10);
const extOf     = (n) => (n.split('.').pop() || '').toLowerCase();
const formatBytes = (b) => {
  if (!b) return '0 B';
  const u = ['B','KB','MB','GB'], i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b/Math.pow(1024,i)).toFixed(i?1:0)} ${u[i]}`;
};
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const normalize = (s) => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const truncateFileName = (n, max = 30) => {
  const d = n.lastIndexOf('.');
  if (d <= 0) return n.length > max ? n.slice(0,max)+'…' : n;
  const base = n.slice(0,d), ext = n.slice(d);
  if (base.length <= max) return n;
  return base.slice(0, max-1).trimEnd() + '…' + ext;
};
const parseValorBR = (s) => {
  if (!s) return 0;
  const limpo = String(s).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
};
const formatarValorBR = (n) => {
  if (!n || n <= 0) return '';
  return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
};

/* ==========================================================================
 * 3. BASE DE CONHECIMENTO
 * ======================================================================== */
const KB = {
  sinaisModalidade: {
    pregao:          /\bpreg[aã]o(\s+eletr[oô]nico)?\b/i,
    concorrencia:    /\bconcorr[eê]ncia\b/i,
    concurso:        /\bconcurso\b/i,
    leilao:          /\bleil[aã]o\b/i,
    dialogo:         /\bdi[aá]logo\s+competitivo\b/i,
    dispensaEmerg:   /\bdispensa\s+(emergencial|calamidade)/i,
    dispensaValor:   /\bdispensa\s+(por\s+valor|de\s+licita[cç][aã]o)\b/i,
    dispensa:        /\bdispensa\b/i,
    inexigibilidade: /\binexigibilidade\b/i,
  },
  orcamento: [/\bestimativa\s+de\s+valor\b/i, /\bvalor\s+estimado\b/i, /\bvalor\s+global\b/i, /R\$\s*[\d.,]+/i],
  alienacao: /aliena[cç][aã]o|venda\s+de\s+bens|inserv[íi]ve(is|l)|desfazimento|maior\s+lance/i,
  inexigibilidade: /inexig[íi]vel|inviabilidade\s+de\s+competi[cç][aã]o|fornecedor\s+exclusivo|not[oó]ria\s+especializa[cç][aã]o/i,
  emergencia: /emerg[êe]ncial?|emerg[êe]ncia|calamidade|desastre|defesa\s+civil/i,
  tic: /(\bsoftware\b|cloud\s+computing|datacenter|licen[cç]a\s+de\s+software|help\s*desk|service\s*desk|consultoria\s+em\s+ti|desenvolvimento\s+de\s+sistema|\berp\b|aplicativo\s+m[óo]vel|hospedagem\s+em\s+nuvem|suporte\s+t[eé]cnico\s+especializado\s+em\s+ti)/i,
  tiEquipamentos: /(computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|servidor(es)?\s+de\s+rede|switch(es)?\s+gerenci|roteador(es)?|firewall(s)?|nobreak|estabilizador|hd\s+externo|ssd|mem[óo]ria\s+ram|processador|placa\s+de\s+v[íi]deo|mouse|teclado|webcam|tablet(s)?)/i,
  obra: /(obra(s)?|engenharia|reforma|constru[cç][aã]o|pavimenta|saneamento|drenagem|edifica|estrutural)/i,
  tecnicos: /(consultoria|assessoria\s+t[eé]cnica|parecer\s+t[eé]cnico|auditoria|per[íi]cia|laudo|engenharia\s+consultiva)/i,
  comuns: /(material\s+de\s+escrit[oó]rio|material\s+de\s+expediente|papel\s+a4|caneta|t[oô]ner|cartucho|l[ií]mp[eê]za|higiene|aliment[ií]cio|uniforme|mobili[aá]rio|cadeira|mesa|vigil[aâ]ncia|combust[íi]vel)/i,
  empresa: /\b[A-ZÀ-Ú][\wÀ-ú&.'-]*(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú&.'-]*|de|da|do|das|dos|e)){1,6}\s+(?:Ltda\.?|LTDA\.?|S\.A\.?|S\/A|ME|EIRELI|EPP)\b/,
};
const firstMatch = (text, regexes) => {
  for (const rx of regexes) { const m = text.match(rx); if (m) return m; }
  return null;
};

/* ==========================================================================
 * 4. PARSER DE TEXTO
 * ======================================================================== */
function extrairModalidade(corpus) {
  // Rótulo explícito
  const rot = corpus.match(/(?:modalidade\s+(?:de\s+licita[cç][aã]o|licitat[oó]ria|adotada|declarada)|tipo\s+de\s+licita[cç][aã]o)\s*[:\-–—]\s*([^\n\r]{2,80})/i);
  if (rot) {
    const v = rot[1].trim();
    if (/preg[aã]o/i.test(v))                return { chave: 'pregao',          rotulo: 'Pregão Eletrônico' };
    if (/concorr[eê]ncia/i.test(v))          return { chave: 'concorrencia',    rotulo: 'Concorrência' };
    if (/leil[aã]o/i.test(v))                return { chave: 'leilao',          rotulo: 'Leilão Eletrônico' };
    if (/inexigibilidade/i.test(v))          return { chave: 'inexigibilidade', rotulo: 'Inexigibilidade de Licitação' };
    if (/dispensa/i.test(v))                 return { chave: 'dispensa',        rotulo: 'Dispensa de Licitação' };
    if (/di[aá]logo\s+competitivo/i.test(v)) return { chave: 'dialogo',         rotulo: 'Diálogo Competitivo' };
    if (/concurso/i.test(v))                 return { chave: 'concurso',        rotulo: 'Concurso' };
  }
  // Varredura de sinais
  if (KB.sinaisModalidade.inexigibilidade.test(corpus)) return { chave:'inexigibilidade', rotulo:'Inexigibilidade de Licitação' };
  if (KB.sinaisModalidade.dispensaEmerg.test(corpus))   return { chave:'dispensa',        rotulo:'Dispensa de Licitação Emergencial' };
  if (KB.sinaisModalidade.dispensaValor.test(corpus))   return { chave:'dispensa',        rotulo:'Dispensa de Licitação por Valor' };
  if (KB.sinaisModalidade.dispensa.test(corpus))        return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
  if (KB.sinaisModalidade.pregao.test(corpus))          return { chave:'pregao',          rotulo:'Pregão Eletrônico' };
  if (KB.sinaisModalidade.concorrencia.test(corpus))    return { chave:'concorrencia',    rotulo:'Concorrência' };
  if (KB.sinaisModalidade.leilao.test(corpus))          return { chave:'leilao',          rotulo:'Leilão Eletrônico' };
  if (KB.sinaisModalidade.dialogo.test(corpus))         return { chave:'dialogo',         rotulo:'Diálogo Competitivo' };
  if (KB.sinaisModalidade.concurso.test(corpus))        return { chave:'concurso',        rotulo:'Concurso' };
  return { chave: null, rotulo: 'Não identificada' };
}

function classificarObjeto(texto) {
  if (!texto) return 'Não identificado';
  if (KB.alienacao.test(texto))      return 'Alienação de bens';
  if (KB.obra.test(texto))           return 'Obras e serviços de engenharia';
  if (KB.tecnicos.test(texto))       return 'Serviços técnicos especializados';
  if (KB.tic.test(texto))            return 'Tecnologia da Informação (TIC)';
  if (KB.tiEquipamentos.test(texto)) return 'Bens e serviços comuns';
  if (KB.comuns.test(texto))         return 'Bens e serviços comuns';
  return 'Serviços em geral';
}

function extrairObjeto(corpus) {
  const LABEL = '(?:identifica[cç][aã]o\\s+do\\s+objeto|objeto\\s+do\\s+processo|objeto\\s+da\\s+contrata[cç][aã]o|objeto\\s+predominante|natureza\\s+do\\s+objeto|do\\s+objeto|objeto)';
  const NUM   = '(?:\\d+[\\.\\)]\\s*|[IVX]+\\.\\s*)?';

  const RX_BLOCO = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]*\\s*\\n+([^\\n#]{3,600})`, 'i');
  const RX_LINHA = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]+\\s*([^\\n#]{3,600})`, 'i');
  const RX_FRASE = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]+\\s*([^\\n#]{3,300}?)(?:\\.|\\n|#|$)`, 'i');
  const RX_SIMPLES = /(objeto|natureza\s+do\s+objeto|objeto\s+predominante)[\s:]+([^.\n]+)/i;

  const m = firstMatch(corpus, [RX_BLOCO, RX_LINHA, RX_FRASE, RX_SIMPLES]);
  if (!m) return { texto: '', tipo: 'Não identificado' };

  const texto = (m[1] || m[2] || '')
    .replace(/^[\s\-–—:.,;]+/, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  return { texto, tipo: classificarObjeto(texto) };
}

function extrairValor(corpus) {
  const m = corpus.match(/R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
  return m ? parseValorBR(m[1]) : 0;
}

function extrairProcesso(corpus) {
  const RX = /(?:processo\s+administrativo|processo\s+adm(?:inistrativo)?|n[º°]?\s*do\s*processo|n[uú]mero\s+do\s+processo|processo)\s*[:\-–—]?\s*(?:n[º°.]?\s*)?([\d][\d.\/\-\w]{3,40})/i;
  const m = corpus.match(RX);
  if (m) {
    const matched = m[0].toLowerCase();
    let rot = 'Processo';
    if (/administrativo/.test(matched))                 rot = 'Processo Administrativo';
    else if (/n[º°]?\s*do\s*processo/.test(matched))    rot = 'Nº do Processo';
    else if (/n[uú]mero\s+do\s+processo/.test(matched)) rot = 'Número do Processo';
    return `${rot} nº ${m[1].trim()}`;
  }
  const RX2 = /\b(edital|pregao|preg[aã]o|concorr[eê]ncia|concurso|leil[aã]o|dispensa|inexigibilidade|memorando|of[íi]cio|dfd)\s*(?:n[º°.]?|n[uú]mero)?\s*([\d][\d.\/\-\w]{3,30})/i;
  const m2 = corpus.match(RX2);
  if (m2) {
    const rot = m2[1].replace(/^dfd$/i, 'DFD');
    return `${rot.charAt(0).toUpperCase() + rot.slice(1).toLowerCase()} nº ${m2[2]}`;
  }
  return 'Não identificado';
}

function extrairOrgao(corpus) {
  const m = corpus.match(/\b(Minist[ée]rio|Prefeitura(?:\s+Municipal)?|Tribunal|Universidade|Instituto|C[âa]mara(?:\s+Municipal)?|Assembleia|Secretaria|Funda[cç][aã]o|Autarquia)[^\n,.;]{0,80}/i);
  return m ? m[0].replace(/\s+/g,' ').trim() : 'ÓRGÃO / ENTIDADE PÚBLICA';
}
function extrairUnidadeRequisitante(corpus) {
  const m = corpus.match(/(?:unidade\s+requisitante|setor\s+requisitante|remetente|origem)\s*[:\-–—]\s*([^\n]{3,90})/i);
  return m ? m[1].trim() : 'Não informada';
}
function extrairEmpresa(corpus) {
  const m = corpus.match(KB.empresa);
  return m ? m[0].replace(/\s+/g,' ').trim() : null;
}
function extrairCriterio(corpus) {
  const m = {
    'menor-preco':    /\bmenor\s+pre[cç]o\b/i,
    'maior-desconto': /\bmaior\s+desconto\b/i,
    'melhor-tecnica': /\bmelhor\s+t[eé]cnica\b/i,
    'tecnica-preco':  /\bt[eé]cnica\s+e\s+pre[cç]o\b/i,
    'maior-lance':    /\bmaior\s+lance\b/i,
    'maior-retorno':  /\bmaior\s+retorno/i,
  };
  for (const [k, rx] of Object.entries(m)) if (rx.test(corpus)) return k;
  return 'indefinido';
}

function classificarNatureza(corpus, forcar = 'auto') {
  if (forcar && forcar !== 'auto') {
    const mapa = {
      bens: 'Bens e serviços comuns', 'servicos-comuns': 'Bens e serviços comuns',
      'servicos-especiais': 'Serviços técnicos especializados',
      obras: 'Obras e serviços de engenharia', alienacao: 'Alienação de bens',
      intelectual: 'Serviços técnicos especializados',
    };
    return mapa[forcar] || forcar;
  }
  const t = corpus || '';
  if (KB.alienacao.test(t))      return 'Alienação de bens';
  if (KB.obra.test(t))           return 'Obras e serviços de engenharia';
  if (KB.tic.test(t))            return 'Tecnologia da Informação (TIC)';
  if (KB.tecnicos.test(t))       return 'Serviços técnicos especializados';
  if (KB.tiEquipamentos.test(t)) return 'Bens e serviços comuns';
  if (KB.comuns.test(t))         return 'Bens e serviços comuns';
  return 'Bens e serviços comuns';
}

/** Classifica 'bens' ou 'servicos' para desambiguar B5_01 × B5_02. */
function classificarTipoObjeto(meta) {
  const texto = [meta?.objeto?.texto || '', meta?.objetoField || ''].join(' ').toLowerCase();
  const nat   = (meta?.natureza || '').toLowerCase();

  const eBens =
    /(aquisi[cç][aã]o\s+de\s+bens|compra\s+de\s+bens|fornecimento\s+de\s+bens|equipament|material\s+de|computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|mobili[aá]rio|cadeira(s)?|mesa(s)?|arm[aá]rio(s)?|estante(s)?|ve[ií]culo(s)?|uniforme(s)?|medicament(o|os))/i
      .test(texto);

  const eServicos =
    /(presta[cç][aã]o\s+de\s+servi|contrata[cç][aã]o\s+de\s+servi|servi[cç]os?\s+de|servi[cç]o\s+(t[eé]cnico|especializado|continuado)|manuten[cç][aã]o|suporte\s+t[eé]cnico|consultoria|assessoria|treinamento|capacita[cç][aã]o|limpeza|vigil[aâ]ncia|seguran[cç]a)/i
      .test(texto);

  if (eBens && !eServicos) return 'bens';
  if (eServicos && !eBens) return 'servicos';

  if (/aquisic|bens/.test(nat)) return 'bens';
  if (/servic/.test(nat))       return 'servicos';
  return 'servicos';
}

/* ==========================================================================
 * 5. CORE ENGINE — 30 VERIFICAÇÕES NUCLEARES
 * --------------------------------------------------------------------------
 * Cada regra tem:
 *   id, bloco, nome, fundamento, severidade
 *   aplicavel(ctx) → boolean  (se false, regra NÃO é contada no score)
 *   test(ctx) → boolean        (true = CONFORME, false = NÃO conforme)
 * ======================================================================== */

const BLOCO_TITULO = {
  1: 'Fase Preparatória e ETP',
  2: 'Pesquisa de Preços e Dotação',
  3: 'Vedações e Competitividade',
  4: 'Modalidades e Enquadramento',
  5: 'Prazos e Publicação',
  6: 'Gestão Contratual e Fiscalização',
};

const MATRIZ_CORE_30 = [

  /* ============ BLOCO 1 — FASE PREPARATÓRIA E ETP ============ */
  {
    id:'B1_01', bloco:1, nome:'Justificativa da necessidade pública',
    fundamento:'Art. 18, §1º, I — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => /\b(justific|motiva|necessidade\s+p[uú]blica|interesse\s+p[uú]blico|finalidade)/i.test(c.corpus),
    mensagemFalha:'Justificativa da necessidade pública não identificada.',
    recomendacao:'Elaborar seção com motivação fática e jurídica da demanda.',
  },
  {
    id:'B1_02', bloco:1, nome:'Descrição clara e precisa do objeto',
    fundamento:'Art. 18, §1º, II — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => {
      const tipo  = c.meta.objeto.tipo || '';
      const texto = (c.meta.objeto.texto || '').toLowerCase();
      const chave = /(computador|notebook|workstation|equipament|licen[cç]a|suporte\s+t[eé]cnico|impressora|monitor|servidor|switch|roteador|software|sistema|aquisi[cç][aã]o|fornecimento|presta[cç][aã]o\s+de\s+servi|bem|material|servi[çc]o)/i.test(c.corpus);
      return tipo !== 'Não identificado' || (texto.length > 20 && chave) || chave;
    },
    mensagemFalha:'Objeto insuficiente, ambíguo ou ausente.',
    recomendacao:'Descrever com especificações técnicas precisas.',
  },
  {
    id:'B1_03', bloco:1, nome:'Estimativa de quantitativos com memória de cálculo',
    fundamento:'Art. 18, §1º, III — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(quantidade|qtd\.?|unidades?|\blotes?\b|\d+\s*\([^)]{2,60}\)|\d+\s*(unid|un|pç|pc|cx|kg|l|m²|m³|resma|itens?))/i.test(c.corpus),
    mensagemFalha:'Quantitativos não explicitados.',
    recomendacao:'Apresentar planilha quantitativa com metodologia de projeção.',
  },
  {
    id:'B1_04', bloco:1, nome:'ETP ou Termo de Referência anexado',
    fundamento:'Art. 6º, XXIII e XXV · Art. 18, §1º', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => /(estudo\s+t[eé]cnico\s+preliminar|\bETP\b|termo\s+de\s+refer[eê]ncia|\bTR\b|projeto\s+b[aá]sico|\bPB\b|anteprojeto|especifica[cç][õo]es\s+deste\s+edital)/i.test(c.corpus),
    mensagemFalha:'Documento estruturante (ETP/TR) ausente.',
    recomendacao:'Anexar ETP e TR (ou Projeto Básico para obras).',
  },
  {
    id:'B1_05', bloco:1, nome:'Decisão motivada sobre parcelamento do objeto',
    fundamento:'Art. 47 — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(parcelament|divis[aã]o\s+em\s+lotes|indivis[íi]vel|lote\s+[uú]nico|n[aã]o\s+parcel)/i.test(c.corpus),
    mensagemFalha:'Sem decisão motivada sobre parcelamento.',
    recomendacao:'Motivar expressamente o parcelamento ou a indivisibilidade.',
  },

  /* ============ BLOCO 2 — PESQUISA DE PREÇOS E DOTAÇÃO ============ */
  {
    id:'B2_01', bloco:2, nome:'Estimativa de valor e metodologia da pesquisa',
    fundamento:'Art. 23 — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => c.meta.valor > 0 || firstMatch(c.corpus, KB.orcamento),
    mensagemFalha:'Estimativa de valor ausente.',
    recomendacao:'Elaborar planilha orçamentária com múltiplas fontes de pesquisa.',
  },
  {
    id:'B2_02', bloco:2, nome:'Indicação da dotação orçamentária',
    fundamento:'Art. 18, §1º, V · Art. 150 — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => /(dota[cç][aã]o\s+or[cç]ament|programa\s+de\s+trabalho|natureza\s+de\s+despesa|fonte\s+de\s+recurso)/i.test(c.corpus),
    mensagemFalha:'Dotação orçamentária não indicada.',
    recomendacao:'Indicar dotação, programa de trabalho e natureza de despesa.',
  },
  {
    id:'B2_03', bloco:2, nome:'Declaração de adequação orçamentária (LRF/LDO)',
    fundamento:'Art. 150 — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(\bLRF\b|responsabilidade\s+fiscal|\bLDO\b|adequa[cç][aã]o\s+or[cç]ament)/i.test(c.corpus),
    mensagemFalha:'Sem declaração de adequação com LRF/LDO.',
    recomendacao:'Declarar adequação orçamentária e financeira.',
  },
  {
    id:'B2_04', bloco:2, nome:'Limite de dispensa por valor',
    fundamento:'Art. 75, I e II — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: c => /dispensa/i.test(c.modalidade?.modalidade || ''),
    test: c => {
      const obra = /obras?\s+e\s+servi[cç]os\s+de\s+engenharia/i.test(c.natureza);
      const lim  = obra ? LIMITE_DISPENSA_OBRAS : LIMITE_DISPENSA_BENS_SERVICOS;
      if (!c.meta.valor || c.meta.valor <= 0) return false;
      return c.meta.valor <= lim;
    },
    mensagemFalha:'Valor acima do teto legal para dispensa (R$ 50.000 bens/serviços ou R$ 100.000 obras).',
    recomendacao:'Reclassificar a modalidade ou revisar o valor estimado.',
  },
  {
    id:'B2_05', bloco:2, nome:'Referência SINAPI/SICRO para obras',
    fundamento:'Art. 23, §2º — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: c => /obras?\s+e\s+servi[cç]os\s+de\s+engenharia/i.test(c.natureza || ''),
    test: c => /(SINAPI|SICRO|tabela\s+de\s+refer[eê]ncia)/i.test(c.corpus),
    mensagemFalha:'Obras sem referência a SINAPI/SICRO.',
    recomendacao:'Comprovar compatibilidade com as tabelas SINAPI/SICRO.',
  },

  /* ============ BLOCO 3 — VEDAÇÕES E COMPETITIVIDADE ============ */
  {
    id:'B3_01', bloco:3, nome:'Ausência de direcionamento de marca',
    fundamento:'Art. 41, I — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => {
      const marca = /\b(marca|modelo|fabricante)\s*[:\-]?\s*[A-ZÀ-Ú][\w-]+/i.test(c.corpus);
      const padron = /(padroniza|carta\s+de\s+exclusividade|atestado\s+de\s+exclusividade)/i.test(c.corpus);
      return !marca || padron;
    },
    mensagemFalha:'Indicação de marca sem justificativa técnica de padronização.',
    recomendacao:'Apresentar justificativa de padronização OU retirar a indicação de marca.',
  },
  {
    id:'B3_02', bloco:3, nome:'Vedação de participação de servidores',
    fundamento:'Art. 14, I — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(servidor\s+do\s+[óo]rg[ãa]o|impedimento\s+de\s+servidor|v[eé]dado\s+ao\s+servidor)/i.test(c.corpus),
    mensagemFalha:'Cláusula de vedação a servidores ausente.',
    recomendacao:'Incluir cláusula expressa vedando participação de servidores do órgão.',
  },
  {
    id:'B3_03', bloco:3, nome:'Vedação a empresas suspensas (CEIS/CNEP)',
    fundamento:'Art. 14, III — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(impedid[oa]|suspens[ao]|CEIS|CNEP|consulta\s+de\s+san[cç][õo]es)/i.test(c.corpus),
    mensagemFalha:'Sem cláusula de vedação a empresas impedidas/suspensas.',
    recomendacao:'Explicitar vedação (Art. 14, III) e consulta ao CEIS/CNEP.',
  },
  {
    id:'B3_04', bloco:3, nome:'Declaração sobre trabalho infantil',
    fundamento:'Art. 68, VI — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(n[aã]o\s+emprego\s+de\s+menores|trabalho\s+infantil|menor\s+de\s+18)/i.test(c.corpus),
    mensagemFalha:'Sem exigência de declaração sobre trabalho infantil.',
    recomendacao:'Exigir declaração de não emprego de menores de 18 anos.',
  },
  {
    id:'B3_05', bloco:3, nome:'Qualificação técnica proporcional e vistoria declaratória',
    fundamento:'Art. 67 · Art. 63, § único — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => {
      const vistoria = /(vistoria|visita\s+t[eé]cnica)/i.test(c.corpus);
      const declara  = /(declara[cç][aã]o\s+de\s+vistoria|dispensa\s+de\s+vistoria)/i.test(c.corpus);
      const excesso  = /(exig[êe]ncia\s+excessiva|desproporcional)/i.test(c.corpus);
      return !excesso && (!vistoria || declara);
    },
    mensagemFalha:'Exigência técnica excessiva OU vistoria sem alternativa declaratória.',
    recomendacao:'Revisar requisitos técnicos e permitir declaração em substituição à vistoria.',
  },

  /* ============ BLOCO 4 — MODALIDADES E ENQUADRAMENTO ============ */
  {
    id:'B4_01', bloco:4, nome:'Coerência entre modalidade e natureza do objeto',
    fundamento:'Art. 6º, XLI · Art. 28 a 32 — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => {
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      const nat = (c.natureza || '').toLowerCase();
      // Pregão só para bens/serviços comuns
      if (mod.includes('pregão'))     return /bens|comuns|servic/.test(nat) || /aquisi[cç]/.test(nat);
      // Concorrência para obras/técnicos/TIC
      if (mod.includes('concorrência')) return /obra|engenharia|t[eé]cnic|tic|intelectual|especializ/.test(nat);
      // Leilão só para alienação
      if (mod.includes('leilão'))     return /aliena/.test(nat);
      // Inexigibilidade - qualquer natureza tecnicamente
      if (mod.includes('inexigibilidade')) return true;
      // Dispensa - qualquer natureza
      if (mod.includes('dispensa'))   return true;
      return true;
    },
    mensagemFalha:'Modalidade incompatível com a natureza do objeto.',
    recomendacao:'Reavaliar a modalidade à luz dos Arts. 6º, XLI e 28 a 32.',
  },
  {
    id:'B4_02', bloco:4, nome:'Inexigibilidade: inviabilidade de competição',
    fundamento:'Art. 74, I e III — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: c => /inexigibilidade/i.test(c.modalidade?.modalidade || ''),
    test: c => /(inviabilidade\s+de\s+competi|exclusividade|fornecedor\s+exclusivo|not[oó]ria\s+especializa|atestado\s+de\s+exclusividade|carta\s+de\s+exclusividade)/i.test(c.corpus),
    mensagemFalha:'Inexigibilidade sem caracterização de inviabilidade de competição.',
    recomendacao:'Instruir com atestado de exclusividade ou parecer de notória especialização.',
  },
  {
    id:'B4_03', bloco:4, nome:'Inexigibilidade: justificativa de preço por notas/contratos anteriores',
    fundamento:'Art. 74, §2º — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: c => /inexigibilidade/i.test(c.modalidade?.modalidade || ''),
    test: c => /(notas?\s+fiscais?|contratos?\s+anterior|pre[cç]os?\s+praticad)/i.test(c.corpus),
    mensagemFalha:'Sem justificativa de preço por notas fiscais/contratos anteriores.',
    recomendacao:'Juntar notas fiscais ou contratos anteriores do contratado (Art. 74, §2º).',
  },
  {
    id:'B4_04', bloco:4, nome:'Dispensa Emergencial: caracterização e prazo de 1 ano',
    fundamento:'Art. 75, VIII e §1º — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: c => /dispensa/i.test(c.modalidade?.modalidade || '') && KB.emergencia.test(c.corpus),
    test: c => {
      const risco = /(risco\s+iminente|paralisa[cç][aã]o|desabastecimento|risco\s+[àa]\s+vida)/i.test(c.corpus);
      const prazo = /(1\s+ano|12\s+meses|sem\s+prorroga)/i.test(c.corpus);
      return risco && prazo;
    },
    mensagemFalha:'Emergência não caracterizada objetivamente OU prazo superior a 1 ano.',
    recomendacao:'Caracterizar o risco iminente e fixar prazo ≤ 1 ano (vedada prorrogação).',
  },
  {
    id:'B4_05', bloco:4, nome:'Critério de julgamento declarado',
    fundamento:'Art. 33 — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(menor\s+pre[cç]o|maior\s+desconto|melhor\s+t[eé]cnica|t[eé]cnica\s+e\s+pre[cç]o|maior\s+lance|maior\s+retorno)/i.test(c.corpus) || c.criterio !== 'indefinido',
    mensagemFalha:'Critério de julgamento não declarado.',
    recomendacao:'Declarar expressamente o critério entre os do Art. 33.',
  },

  /* ============ BLOCO 5 — PRAZOS E PUBLICAÇÃO ============ */
  {
    id:'B5_01', bloco:5, nome:'Prazo mínimo de 8 dias úteis (Pregão — bens)',
    fundamento:'Art. 55, I, "a" — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: c => /preg[aã]o/i.test(c.modalidade?.modalidade || '') && c.meta?.tipoObjeto === 'bens',
    test: c => /(8\s+dias|oito\s+dias|≥\s*8|pelo\s+menos\s+8)/i.test(c.corpus),
    mensagemFalha:'Pregão de bens sem prazo mínimo de 8 dias úteis.',
    recomendacao:'Fixar prazo mínimo de 8 dias úteis (Art. 55, I, "a").',
  },
  {
    id:'B5_02', bloco:5, nome:'Prazo mínimo de 10 dias úteis (Pregão — serviços)',
    fundamento:'Art. 55, I, "b" — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: c => /preg[aã]o/i.test(c.modalidade?.modalidade || '') && c.meta?.tipoObjeto === 'servicos',
    test: c => /(10\s+dias|dez\s+dias|≥\s*10|pelo\s+menos\s+10)/i.test(c.corpus),
    mensagemFalha:'Pregão de serviços sem prazo mínimo de 10 dias úteis.',
    recomendacao:'Fixar prazo mínimo de 10 dias úteis (Art. 55, I, "b").',
  },
  {
    id:'B5_03', bloco:5, nome:'Prazo mínimo de 35 dias úteis (Concorrência)',
    fundamento:'Art. 55, II — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: c => /concorr[eê]ncia/i.test(c.modalidade?.modalidade || ''),
    test: c => /(35\s+dias|trinta\s+e\s+cinco)/i.test(c.corpus),
    mensagemFalha:'Concorrência sem prazo mínimo de 35 dias úteis.',
    recomendacao:'Fixar prazo mínimo de 35 dias úteis (Art. 55, II).',
  },
  {
    id:'B5_04', bloco:5, nome:'Publicação no PNCP',
    fundamento:'Art. 54 — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => /(PNCP|Portal\s+Nacional\s+de\s+Contrata)/i.test(c.corpus),
    mensagemFalha:'Sem menção à publicação no PNCP.',
    recomendacao:'Prever publicação obrigatória no PNCP (Art. 54).',
  },
  {
    id:'B5_05', bloco:5, nome:'Impugnação e recurso em fase única (3 dias úteis)',
    fundamento:'Art. 164 · Art. 165 — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => {
      const impug = /(impugna[cç][aã]o|esclarecimento)/i.test(c.corpus);
      const rec   = /(3\s+dias\s+[uú]teis|tr[eê]s\s+dias|fase\s+[uú]nica|recurso\s+[uú]nico)/i.test(c.corpus);
      return impug && rec;
    },
    mensagemFalha:'Sem regras claras de impugnação/recurso ou fora do prazo legal.',
    recomendacao:'Fixar impugnação e recurso em fase única com prazo de 3 dias úteis.',
  },

  /* ============ BLOCO 6 — GESTÃO CONTRATUAL ============ */
  {
    id:'B6_01', bloco:6, nome:'Fiscal (titular/substituto) e gestor designados',
    fundamento:'Art. 117 — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => {
      const titular   = /(fiscal\s+titular|fiscaliza[cç][aã]o\s+do\s+contrato)/i.test(c.corpus);
      const substituto = /(fiscal\s+substituto|fiscal\s+suplente|substituto)/i.test(c.corpus);
      const gestor     = /(gestor\s+do\s+contrato|gest[aã]o\s+contratual)/i.test(c.corpus);
      return titular && (substituto || gestor);
    },
    mensagemFalha:'Fiscal titular, substituto e/ou gestor não designados.',
    recomendacao:'Designar expressamente fiscal titular, substituto e gestor do contrato (Art. 117).',
  },
  {
    id:'B6_02', bloco:6, nome:'Segregação de funções',
    fundamento:'Art. 7º, §1º — Lei 14.133/2021', severidade:'CRITICA',
    aplicavel: () => true,
    test: c => /(segrega[cç][aã]o\s+de\s+fun[cç][õo]es|agente\s+de\s+contrata|pregoeiro|equipe\s+de\s+apoio)/i.test(c.corpus),
    mensagemFalha:'Segregação de funções não observada expressamente.',
    recomendacao:'Designar separadamente agente de contratação, pregoeiro e equipe de apoio.',
  },
  {
    id:'B6_03', bloco:6, nome:'Recebimento provisório e definitivo',
    fundamento:'Art. 140 — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(recebimento\s+provis[óo]rio|recebimento\s+definitivo|aceite\s+provis[óo]rio|aceite\s+definitivo)/i.test(c.corpus),
    mensagemFalha:'Prazos e critérios de recebimento não definidos.',
    recomendacao:'Definir recebimento provisório e definitivo (Art. 140).',
  },
  {
    id:'B6_04', bloco:6, nome:'Pagamento em até 30 dias após NF e aceite',
    fundamento:'Art. 141 — Lei 14.133/2021', severidade:'BAIXA',
    aplicavel: () => true,
    test: c => /(30\s+dias|trinta\s+dias).{0,40}(pagamento|nota\s+fiscal|aceite)/i.test(c.corpus) ||
               /(pagamento).{0,40}(30\s+dias|trinta\s+dias)/i.test(c.corpus) ||
               !/pagamento/i.test(c.corpus), // se nem menciona pagamento, não penaliza
    mensagemFalha:'Prazo de pagamento não fixado em até 30 dias após NF e aceite.',
    recomendacao:'Fixar pagamento em até 30 dias após emissão da NF e aceite (Art. 141).',
  },
  {
    id:'B6_05', bloco:6, nome:'Sanções administrativas graduadas',
    fundamento:'Art. 155 — Lei 14.133/2021', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => /(san[cç][õo]es\s+administrativas|multa|advert[êe]ncia|impedimento\s+de\s+contratar)/i.test(c.corpus),
    mensagemFalha:'Regime de sanções administrativas não previsto.',
    recomendacao:'Prever sanções graduadas do Art. 155.',
  },
];

if (MATRIZ_CORE_30.length !== 30) {
  console.error(`[LicitaAudit] Matriz Core com ${MATRIZ_CORE_30.length} regras (esperado 30).`);
}

/* ==========================================================================
 * 6. MOTOR DE AVALIAÇÃO CONDICIONAL
 * ======================================================================== */

/**
 * Executa a auditoria com FILTRAGEM DINÂMICA:
 *   1. Monta o contexto unificado { corpus, meta, natureza, modalidade, criterio }.
 *   2. Filtra as regras por `aplicavel(ctx)`.
 *   3. Roda o `test` apenas nas regras aplicáveis.
 *   4. Calcula o score ponderado SOMENTE sobre as regras aplicáveis.
 */
function executarAuditoriaCustomizada(corpus, meta, natureza, modalidade, criterio) {
  const ctx = { corpus, meta, natureza, modalidade, criterio };

  const resultados = MATRIZ_CORE_30.map((regra) => {
    let aplicavel = false;
    try { aplicavel = !!regra.aplicavel(ctx); } catch (_) { aplicavel = true; }

    if (!aplicavel) {
      return {
        ...regra,
        peso: PESOS[regra.severidade],
        aplicavel: false,
        conforme: null,
        status: 'N/A',
      };
    }

    let conforme = false;
    try { conforme = !!regra.test(ctx); } catch (_) { conforme = false; }

    return {
      ...regra,
      peso: PESOS[regra.severidade],
      aplicavel: true,
      conforme,
      status: conforme ? 'ok' : 'falha',
    };
  });

  const aplicaveis = resultados.filter(r => r.aplicavel);
  const pesoTotal  = aplicaveis.reduce((s, r) => s + r.peso, 0);
  const pesoFalha  = aplicaveis.filter(r => !r.conforme).reduce((s, r) => s + r.peso, 0);

  const score = pesoTotal > 0
    ? Math.max(0, Math.round((100 - (pesoFalha / pesoTotal) * 100) * 10) / 10)
    : 100;

  const criticasFalha = aplicaveis.filter(r => !r.conforme && r.severidade === 'CRITICA').length;
  const mediasFalha   = aplicaveis.filter(r => !r.conforme && r.severidade === 'MEDIA').length;
  const baixasFalha   = aplicaveis.filter(r => !r.conforme && r.severidade === 'BAIXA').length;

  const porBloco = {};
  for (let b = 1; b <= 6; b++) {
    const lista = aplicaveis.filter(r => r.bloco === b);
    porBloco[b] = {
      titulo: BLOCO_TITULO[b],
      total: lista.length,
      ok: lista.filter(r => r.conforme).length,
      falha: lista.filter(r => !r.conforme).length,
      criticas: lista.filter(r => !r.conforme && r.severidade === 'CRITICA').length,
    };
  }

  return {
    resultados,
    aplicaveis,
    totalAplicaveis: aplicaveis.length,
    totalIgnoradas: resultados.length - aplicaveis.length,
    pesoTotal, pesoFalha, score,
    criticasFalha, mediasFalha, baixasFalha,
    porBloco,
  };
}

function classificarRisco(score, criticasFalha) {
  if (criticasFalha > 0 || score < 70) {
    return {
      nivel: 'ALTO', titulo: 'Risco Alto / Inviável',
      descricao: criticasFalha > 0
        ? `${criticasFalha} vício(s) impeditivo(s) — publicação desaconselhada.`
        : 'Conformidade abaixo de 70%.',
      cor: '#dc2626', badge: 'badge--danger', emoji: '🔴',
    };
  }
  if (score >= 90) {
    return {
      nivel: 'BAIXO', titulo: 'Risco Baixo',
      descricao: 'Processo apto à publicação.',
      cor: '#10b981', badge: 'badge--ok', emoji: '🟢',
    };
  }
  return {
    nivel: 'MÉDIO', titulo: 'Risco Médio',
    descricao: 'Saneamento prévio recomendado.',
    cor: '#f59e0b', badge: 'badge--warn', emoji: '🟡',
  };
}

/* ==========================================================================
 * 7. RUN AUDIT
 * ======================================================================== */
function buildCorpus() {
  return state.files
    .filter(f => f.status === 'ok' && f.text)
    .map(f => `\n===== ARQUIVO: ${f.name} =====\n${f.text}`)
    .join('\n');
}

function runAudit() {
  const corpus = buildCorpus();

  // Parser
  const metaBase = {
    modalidade: extrairModalidade(corpus),
    objeto:     extrairObjeto(corpus),
    valor:      extrairValor(corpus),
    processo:   extrairProcesso(corpus),
    orgao:      extrairOrgao(corpus),
    unidade:    extrairUnidadeRequisitante(corpus),
    empresa:    extrairEmpresa(corpus),
  };

  // Overrides de parâmetros UI
  const naturezaBase = classificarNatureza(corpus, els.paramObjeto.value);
  const modalidadeLabel = els.paramModalidade.value !== 'auto'
    ? (() => {
        const m = {
          pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência', concurso: 'Concurso',
          leilao: 'Leilão Eletrônico', dialogo: 'Diálogo Competitivo',
          dispensa: 'Dispensa de Licitação', inexigibilidade: 'Inexigibilidade de Licitação',
        };
        return m[els.paramModalidade.value] || metaBase.modalidade.rotulo;
      })()
    : metaBase.modalidade.rotulo;

  const criterio = els.paramCriterio.value !== 'auto' ? els.paramCriterio.value : extrairCriterio(corpus);

  const tipoObjeto = classificarTipoObjeto({ objeto: metaBase.objeto, natureza: naturezaBase });

  const meta = {
    ...metaBase,
    natureza: naturezaBase,
    modalidade: modalidadeLabel,
    criterio,
    tipoObjeto,
  };

  // Núcleo condicional
  const auditoria = executarAuditoriaCustomizada(corpus, meta, naturezaBase, { modalidade: modalidadeLabel }, criterio);
  const risco = classificarRisco(auditoria.score, auditoria.criticasFalha);

  let statusGeral;
  if (auditoria.criticasFalha > 0)                                 statusGeral = 'requer-correcoes';
  else if (auditoria.score >= 90 && auditoria.aplicaveis.every(r => r.conforme)) statusGeral = 'aprovado';
  else if (auditoria.score >= 70)                                  statusGeral = 'requer-correcoes';
  else                                                             statusGeral = 'inconclusivo';

  const dataGeracao = new Date();
  const objetoExibicao = (
    meta.objeto.texto && meta.objeto.texto.trim().length >= 5
      ? meta.objeto.texto.trim().slice(0, 200)
      : meta.objeto.tipo || 'Não identificado'
  );

  return {
    geradoEm: dataGeracao.toISOString(),
    statusGeral,
    score: auditoria.score,
    estatisticas: {
      total: MATRIZ_CORE_30.length,
      aplicaveis: auditoria.totalAplicaveis,
      ignoradas: auditoria.totalIgnoradas,
      ok: auditoria.aplicaveis.filter(r => r.conforme).length,
      falha: auditoria.aplicaveis.filter(r => !r.conforme).length,
      criticas: auditoria.criticasFalha,
      medias: auditoria.mediasFalha,
      baixas: auditoria.baixasFalha,
      porBloco: auditoria.porBloco,
    },
    identificacao: {
      objeto:      objetoExibicao,
      objetoTipo:  meta.objeto.tipo,
      objetoField: meta.objeto.texto,
      tipoObjeto:  meta.tipoObjeto,
      modalidade:  meta.modalidade,
      natureza:    meta.natureza,
      criterio,
      empresa:     meta.empresa,
      arquivosAnalisados: state.files.filter(f => f.status === 'ok').length,
      caracteresAnalisados: corpus.length,
      linhasAnalisadas: corpus.split(/\r?\n/).length,
    },
    auditoria: {
      numeroRelatorio: String(Math.floor(Math.random() * 900) + 100) + '/' + dataGeracao.getFullYear(),
      dataGeracao: dataGeracao.toISOString(),
      risco: risco.nivel,
      riscoInfo: risco,
      processo: meta.processo,
      valor: meta.valor,
      orgao: meta.orgao,
      unidade: meta.unidade,
      temCritico: auditoria.criticasFalha > 0,
    },
    resultados: auditoria.resultados,
    correcoes: auditoria.aplicaveis.filter(r => !r.conforme).map(r => ({
      id: r.id, bloco: r.bloco,
      titulo: r.nome, lei: r.fundamento,
      severidade: r.severidade === 'CRITICA' ? 'alta' : r.severidade === 'MEDIA' ? 'media' : 'baixa',
      descricao: r.mensagemFalha,
      sugestao: r.recomendacao,
    })),
  };
}

/* ==========================================================================
 * 8. RENDERIZAÇÃO
 * ======================================================================== */
const STATUS_LABEL = {
  aprovado:          { titulo: 'Aprovado',         desc: 'Processo atende aos requisitos essenciais.' },
  'requer-correcoes':{ titulo: 'Requer Correções', desc: 'Inconsistências que devem ser sanadas.' },
  inconclusivo:      { titulo: 'Inconclusivo',     desc: 'Divergências relevantes.' },
};
const STATUS_COLOR = { aprovado:'var(--ok)', 'requer-correcoes':'var(--warn)', inconclusivo:'var(--danger)' };
const CRITERIO_LABEL = {
  'menor-preco':'Menor preço','maior-desconto':'Maior desconto',
  'melhor-tecnica':'Melhor técnica ou conteúdo artístico',
  'tecnica-preco':'Técnica e preço','maior-lance':'Maior lance',
  'maior-retorno':'Maior retorno econômico','indefinido':'Não identificado',
};
const SEV_ICON  = { CRITICA:'🔴', MEDIA:'🟡', BAIXA:'🟢' };
const SEV_CLASS = { CRITICA:'sev-pill--alta', MEDIA:'sev-pill--media', BAIXA:'sev-pill--baixa' };

function renderBlocos(resultados, filtro) {
  return [1,2,3,4,5,6].map(b => {
    let lista = resultados.filter(r => r.bloco === b);

    // Filtro
    if (filtro === 'falhas')   lista = lista.filter(r => r.aplicavel && !r.conforme);
    if (filtro === 'criticas') lista = lista.filter(r => r.aplicavel && !r.conforme && r.severidade === 'CRITICA');

    const aplicaveisBloco = resultados.filter(r => r.bloco === b && r.aplicavel);
    const total  = aplicaveisBloco.length;
    const ok     = aplicaveisBloco.filter(r => r.conforme).length;
    const falha  = total - ok;
    const pct    = total ? Math.round((ok / total) * 100) : 100;
    const cor    = pct >= 90 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--danger)';

    const itens = lista.length === 0
      ? `<div class="matrix-empty">${filtro === 'todos' ? 'Nenhum item aplicável neste bloco.' : 'Nenhum item corresponde ao filtro.'}</div>`
      : lista.map(r => {
        if (!r.aplicavel) {
          return `
            <article class="check-item check-item--na">
              <header class="check-item__head">
                <span class="sev-pill ${SEV_CLASS[r.severidade]}">${SEV_ICON[r.severidade]} ${r.severidade}</span>
                <span class="check-item__id">${escapeHtml(r.id)}</span>
                <span class="check-item__status is-na">— N/A</span>
              </header>
              <h4 class="check-item__title">${escapeHtml(r.nome)}</h4>
              <p class="check-item__law">${escapeHtml(r.fundamento)}</p>
              <p class="check-item__body" style="font-style:italic;color:var(--text-dim);">
                Regra não aplicável à modalidade/natureza detectada.
              </p>
            </article>`;
        }
        return `
          <article class="check-item ${r.conforme ? 'check-item--ok' : 'check-item--fail'}">
            <header class="check-item__head">
              <span class="sev-pill ${SEV_CLASS[r.severidade]}">${SEV_ICON[r.severidade]} ${r.severidade}</span>
              <span class="check-item__id">${escapeHtml(r.id)}</span>
              <span class="check-item__status ${r.conforme ? 'is-ok' : 'is-fail'}">${r.conforme ? '✓ Conforme' : '✗ Não conforme'}</span>
            </header>
            <h4 class="check-item__title">${escapeHtml(r.nome)}</h4>
            <p class="check-item__law">${escapeHtml(r.fundamento)}</p>
            ${!r.conforme ? `
              <div class="check-item__body">
                <p><strong>Constatação:</strong> ${escapeHtml(r.mensagemFalha)}</p>
                <p class="check-item__rec"><strong>Recomendação:</strong> ${escapeHtml(r.recomendacao)}</p>
              </div>` : ''}
          </article>`;
      }).join('');

    return `
      <details class="block" ${b === 1 ? 'open' : ''}>
        <summary class="block__summary">
          <span class="block__num">${b}</span>
          <span class="block__cat">${escapeHtml(BLOCO_TITULO[b])}</span>
          <span class="block__stats">
            <span class="block__pill" style="--blk-color:${cor};">${pct}%</span>
            <span class="block__count">${ok}/${total}${falha ? ` · ${falha} falha(s)` : ''}</span>
          </span>
        </summary>
        <div class="block__body">${itens}</div>
      </details>`;
  }).join('');
}

function renderReport(rep) {
  const s   = STATUS_LABEL[rep.statusGeral];
  const cor = STATUS_COLOR[rep.statusGeral];
  const dashArray = 2 * Math.PI * 44;
  const dashValue = (rep.score / 100) * dashArray;
  const risco = rep.auditoria.riscoInfo;
  const meta  = rep.auditoria;

  const alerta = meta.temCritico ? `
    <section class="card" style="border-left:5px solid var(--danger);background:var(--danger-soft);">
      <h3 class="card__title" style="color:var(--danger);">🚨 Alerta Crítico — Vício Impeditivo Detectado</h3>
      <p style="font-size:13px;color:var(--text);line-height:1.6;">
        Uma ou mais verificações CRÍTICAS <strong>aplicáveis</strong> foram reprovadas.
        <strong>Parecer automático: DEVOLVIDO PARA ADEQUAÇÃO.</strong>
      </p>
    </section>` : '';

  const dashboard = `
    <section class="card">
      <h3 class="card__title">Resumo Executivo · ${rep.estatisticas.aplicaveis}/${rep.estatisticas.total} regras aplicáveis</h3>
      <div class="exec-dashboard">
        <div class="risk-card" style="--risk-color:${risco.cor};">
          <span class="risk-card__emoji">${risco.emoji}</span>
          <span class="risk-card__label">Classificação de Risco</span>
          <div class="risk-card__title">${risco.titulo}</div>
          <p class="risk-card__desc">${risco.descricao}</p>
        </div>
        <div class="score-card">
          <div class="score-card__gauge" role="img" aria-label="Índice: ${rep.score}%">
            <svg viewBox="0 0 100 100">
              <circle class="track" cx="50" cy="50" r="44"></circle>
              <circle class="value" cx="50" cy="50" r="44"
                style="stroke:${cor}; stroke-dasharray:${dashValue} ${dashArray};"></circle>
            </svg>
            <div class="score-card__number">${rep.score}<small>%</small></div>
          </div>
          <div class="score-card__legend">
            <h3>${s.titulo}</h3>
            <p>${s.desc}</p>
            <span class="score-card__pill">${rep.estatisticas.ok} conformes · ${rep.estatisticas.falha} falhas (${rep.estatisticas.criticas} críticas · ${rep.estatisticas.medias} médias · ${rep.estatisticas.baixas} baixas) · ${rep.estatisticas.ignoradas} N/A</span>
          </div>
        </div>
      </div>
    </section>`;

  const ficha = `
    <section class="card">
      <h3 class="card__title">Ficha Técnica do Processo</h3>
      <div class="exec-meta">
        <div class="exec-meta__item"><span class="exec-meta__key">Nº do Processo</span><span class="exec-meta__val">${escapeHtml(meta.processo)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Órgão</span><span class="exec-meta__val">${escapeHtml(meta.orgao)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Unidade</span><span class="exec-meta__val">${escapeHtml(meta.unidade)}</span></div>
        <div class="exec-meta__item">
          <span class="exec-meta__key">Objeto</span>
          <span class="exec-meta__val">${escapeHtml(rep.identificacao.objeto)}</span>
          ${rep.identificacao.objetoTipo && rep.identificacao.objetoTipo !== rep.identificacao.objeto
            ? `<br><small style="color:var(--text-dim);font-weight:500;">Classificação: ${escapeHtml(rep.identificacao.objetoTipo)} · Tipo: ${escapeHtml(rep.identificacao.tipoObjeto === 'bens' ? 'Bens' : 'Serviços')}</small>`
            : ''}
        </div>
        <div class="exec-meta__item"><span class="exec-meta__key">Natureza</span><span class="exec-meta__val">${escapeHtml(rep.identificacao.natureza)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Valor</span><span class="exec-meta__val">${meta.valor > 0 ? formatarValorBR(meta.valor) : 'Não informado'}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Modalidade</span><span class="exec-meta__val">${escapeHtml(rep.identificacao.modalidade)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Critério</span><span class="exec-meta__val">${CRITERIO_LABEL[rep.identificacao.criterio] || rep.identificacao.criterio}</span></div>
      </div>
    </section>`;

  const matriz = `
    <section class="card">
      <h3 class="card__title">Matriz Core — 30 verificações · ${rep.estatisticas.aplicaveis} aplicáveis</h3>
      <div class="filters">
        <button class="filters__btn ${state.filtro === 'todos'    ? 'is-active' : ''}" data-filtro="todos">Todos (30)</button>
        <button class="filters__btn ${state.filtro === 'falhas'   ? 'is-active' : ''}" data-filtro="falhas">Inconformidades</button>
        <button class="filters__btn ${state.filtro === 'criticas' ? 'is-active' : ''}" data-filtro="criticas">Apontamentos Críticos</button>
      </div>
      <div class="blocks">${renderBlocos(rep.resultados, state.filtro)}</div>
    </section>`;

  els.report.innerHTML = `${alerta}${dashboard}${ficha}${matriz}
    <footer class="report-footer">
      <span>Relatório nº ${escapeHtml(meta.numeroRelatorio)} · LicitaAudit v4.0.0 · Lei nº 14.133/2021</span>
      <span>${rep.estatisticas.aplicaveis} de ${rep.estatisticas.total} verificações aplicáveis</span>
    </footer>`;

  els.report.querySelectorAll('[data-filtro]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filtro = btn.dataset.filtro;
      renderReport(state.report);
    });
  });

  els.report.classList.remove('is-hidden');
  els.emptyState.classList.add('is-hidden');
  els.pdfBtn.disabled = false;
  els.printBtn.disabled = false;
  els.jsonBtn.disabled = false;

  requestAnimationFrame(() => {
    const c = els.report.querySelector('.score-card__gauge .value');
    if (c) {
      c.style.strokeDasharray = `0 ${dashArray}`;
      requestAnimationFrame(() => { c.style.strokeDasharray = `${dashValue} ${dashArray}`; });
    }
  });
}

function resetReport() {
  state.report = null;
  state.filtro = 'todos';
  els.report.innerHTML = '';
  els.report.classList.add('is-hidden');
  els.emptyState.classList.remove('is-hidden');
  els.pdfBtn.disabled = true;
  els.printBtn.disabled = true;
  els.jsonBtn.disabled = true;
}

/* ==========================================================================
 * 9. LISTA DE ARQUIVOS
 * ======================================================================== */
function renderFileList() {
  if (!state.files.length) {
    els.fileList.innerHTML = '';
    els.analyzeBtn.disabled = true;
    els.subtitle.textContent = 'Nenhum documento carregado';
    return;
  }
  els.fileList.innerHTML = state.files.map(f => `
    <li class="file-item ${f.status === 'error' ? 'is-error' : ''}" data-id="${f.id}">
      <span class="file-item__icon" aria-hidden="true">${escapeHtml(f.ext || '?')}</span>
      <span class="file-item__body">
        <span class="file-item__name" title="${escapeHtml(f.name)}">${escapeHtml(truncateFileName(f.name, 30))}</span>
        <span class="file-item__meta">${f.status === 'error'
          ? escapeHtml(f.error || 'Erro ao ler')
          : `${formatBytes(f.size)} · ${(f.text?.length || 0).toLocaleString('pt-BR')} caracteres`}</span>
      </span>
      <button class="file-item__remove" type="button" aria-label="Remover ${escapeHtml(f.name)}" data-remove="${f.id}">×</button>
    </li>`).join('');

  const ok = state.files.filter(f => f.status === 'ok').length;
  els.analyzeBtn.disabled = ok === 0;
  els.subtitle.textContent = `${state.files.length} documento(s) carregado(s) · ${ok} pronto(s) para análise`;
}

/* ==========================================================================
 * 10. EXTRAÇÃO DE TEXTO
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
      .map(it => ({ str: it.str, y: it.transform?.[5] ?? 0, x: it.transform?.[4] ?? 0 }))
      .filter(it => it.str && it.str.trim());
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    let lastY = null, buf = [];
    for (const it of items) {
      if (lastY !== null && Math.abs(it.y - lastY) > 2) { parts.push(buf.join(' ')); buf = []; }
      buf.push(it.str); lastY = it.y;
    }
    if (buf.length) parts.push(buf.join(' '));
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
    case 'pdf':  if (!window.pdfjsLib) throw new Error('PDF.js não disponível.'); return await extractPdf(file);
    case 'docx': if (!window.mammoth) throw new Error('Mammoth.js não disponível.'); return await extractDocx(file);
    case 'txt': case 'md': return await file.text();
    case 'doc':  throw new Error('Formato .doc não suportado. Converta para .docx ou .pdf.');
    default:     throw new Error(`Extensão ".${ext}" não suportada.`);
  }
}

/* ==========================================================================
 * 11. ADIÇÃO / REMOÇÃO DE ARQUIVOS
 * ======================================================================== */
async function addFiles(fileList) {
  const files = Array.from(fileList).filter(Boolean);
  if (!files.length) return;
  for (const file of files) {
    state.files.push({
      id: uid(), name: file.name || `colado-${Date.now()}`,
      ext: extOf(file.name || ''), size: file.size || 0,
      text: '', status: 'loading', error: null, _ref: file,
    });
  }
  renderFileList();
  showLoader('Extraindo texto dos documentos…');

  await Promise.all(state.files.filter(f => f.status === 'loading').map(async (entry) => {
    try {
      entry.text = await extractFileText(entry._ref);
      entry.status = 'ok';
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message || 'Erro desconhecido';
    } finally {
      delete entry._ref;
      renderFileList();
    }
  }));

  hideLoader();
  const ok = state.files.filter(f => f.status === 'ok').length;
  if (ok) toast(`${ok} arquivo(s) processado(s).`, 'ok');
  else    toast('Nenhum arquivo processado.', 'error');
}
function blobParaFile(blob, nome) {
  const tipo = blob.type || 'application/octet-stream';
  const extPorTipo = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt',
    'text/markdown': '.md',
  };
  return new File([blob], nome || `colado-${Date.now()}${extPorTipo[tipo] || ''}`, { type: tipo });
}
function removeFile(id) {
  state.files = state.files.filter(f => f.id !== id);
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
 * 12. EVENTOS
 * ======================================================================== */
function bindEvents() {
  const dz = els.dropzone;

  els.fileInput.addEventListener('click', (e) => e.stopPropagation());
  dz.addEventListener('click', (e) => {
    if (e.target === els.fileInput) return;
    els.fileInput.click();
  });
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });

  ['dragenter','dragover'].forEach(evt =>
    dz.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('is-dragover'); })
  );
  ['dragleave','drop'].forEach(evt =>
    dz.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
      dz.classList.remove('is-dragover');
    })
  );
  dz.addEventListener('drop', e => {
    const files = e.dataTransfer?.files;
    if (files?.length) addFiles(files);
  });
  ['dragover','drop'].forEach(evt =>
    window.addEventListener(evt, e => { if (!dz.contains(e.target)) e.preventDefault(); })
  );

  els.fileInput.addEventListener('change', e => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  });

  document.addEventListener('paste', e => {
    const alvo = e.target;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const arquivos = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const blob = item.getAsFile();
      if (blob) arquivos.push(blobParaFile(blob));
    }
    if (arquivos.length) {
      e.preventDefault();
      addFiles(arquivos);
      toast(`${arquivos.length} arquivo(s) colado(s).`, 'ok');
    }
  });

  els.fileList.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove]');
    if (btn) removeFile(btn.dataset.remove);
  });

  els.analyzeBtn.addEventListener('click', () => {
    if (state.isAnalyzing) return;
    const ok = state.files.filter(f => f.status === 'ok').length;
    if (!ok) { toast('Carregue ao menos um documento legível.', 'error'); return; }
    state.isAnalyzing = true;
    showLoader('Executando core de 30 verificações condicionais…');
    setTimeout(() => {
      try {
        const rep = runAudit();
        state.report = rep;
        renderReport(rep);
        toast(`Análise concluída · ${rep.estatisticas.aplicaveis}/${rep.estatisticas.total} regras aplicáveis · score ${rep.score}%.`, 'ok');
        els.report.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        console.error(err);
        toast('Erro na análise.', 'error');
      } finally {
        hideLoader();
        state.isAnalyzing = false;
      }
    }, 300);
  });

  els.clearBtn.addEventListener('click', clearAll);
  els.pdfBtn.addEventListener('click', exportarPDF);
  els.printBtn.addEventListener('click', () => window.print());
  els.jsonBtn.addEventListener('click', exportJson);
  els.themeToggle.addEventListener('click', toggleTheme);

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!els.analyzeBtn.disabled) els.analyzeBtn.click();
    }
  });
}

/* ==========================================================================
 * 13. PDF EXECUTIVO
 * ======================================================================== */
function exportarPDF() {
  const rep = state.report;
  if (!rep) return toast('Execute a análise antes de exportar.', 'error');
  if (!window.pdfMake) return toast('pdfMake não carregado.', 'error');

  const risco = rep.auditoria.riscoInfo;
  const meta = rep.auditoria;
  const cor = risco.cor;
  const d = new Date(rep.geradoEm);
  const dataFmt = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

  const resumoBody = [[
    { text:'#', style:'th' }, { text:'BLOCO', style:'th' },
    { text:'APLICÁVEIS', style:'th', alignment:'center' },
    { text:'OK', style:'th', alignment:'center' },
    { text:'CRÍTICAS', style:'th', alignment:'center' },
    { text:'%', style:'th', alignment:'center' },
  ]];
  for (let b = 1; b <= 6; b++) {
    const x = rep.estatisticas.porBloco[b];
    const pct = x.total ? Math.round((x.ok / x.total) * 100) : 100;
    const c = pct >= 90 ? '#059669' : pct >= 70 ? '#d97706' : '#dc2626';
    resumoBody.push([
      { text: String(b), bold:true, alignment:'center' },
      { text: x.titulo },
      { text: String(x.total), alignment:'center' },
      { text: String(x.ok), alignment:'center' },
      { text: String(x.criticas), alignment:'center', color: x.criticas ? '#dc2626' : '#059669', bold: x.criticas > 0 },
      { text: `${pct}%`, alignment:'center', color: c, bold:true },
    ]);
  }

  const falhas = rep.resultados.filter(r => r.aplicavel && !r.conforme);
  const falhasBody = falhas.length === 0
    ? [[
        { text:'—', alignment:'center', color:'#94a3b8' },
        { text:'Nenhuma inconformidade identificada entre as regras aplicáveis.', italics:true, color:'#059669', colSpan:3 }, {}, {}
      ]]
    : falhas.map(r => {
        const bg = r.severidade === 'CRITICA' ? '#fee2e2' : r.severidade === 'MEDIA' ? '#fef3c7' : '#e0f2fe';
        const fg = r.severidade === 'CRITICA' ? '#991b1b' : r.severidade === 'MEDIA' ? '#92400e' : '#075985';
        return [
          { text:`B${r.bloco}·${r.severidade[0]}`, fillColor:bg, color:fg, bold:true, fontSize:7, alignment:'center' },
          { stack:[
              { text:`[${r.id}] ${r.nome}`, bold:true, fontSize:8.5 },
              { text: r.mensagemFalha, fontSize:8, color:'#475569', margin:[0,2,0,2] },
              { text:`→ ${r.recomendacao}`, fontSize:7.5, color:'#0f766e', italics:true },
          ]},
          { text: r.fundamento, fontSize:7, color:'#0284c7', italics:true },
        ];
      });

  const parecerTexto = rep.statusGeral === 'aprovado'
    ? 'APROVADO — Processo apto ao prosseguimento.'
    : rep.statusGeral === 'requer-correcoes'
      ? 'APROVADO COM RESSALVAS — Saneamento prévio necessário.'
      : 'REJEITADO / DEVOLVIDO — Vícios relevantes impedem o prosseguimento.';

  const corParecer = rep.statusGeral === 'aprovado' ? '#d1fae5'
                   : rep.statusGeral === 'requer-correcoes' ? '#fef3c7' : '#fee2e2';

  const dd = {
    pageSize:'A4', pageMargins:[40,60,40,60],
    defaultStyle:{ font:'Roboto', fontSize:9, color:'#1e293b', lineHeight:1.35 },
    header:(p) => p === 1 ? null : {
      margin:[40,20,40,0],
      columns:[
        { text:'LicitaAudit · Relatório · Core Engine', fontSize:7.5, color:'#94a3b8' },
        { text:(meta.orgao||'').toUpperCase(), fontSize:7.5, color:'#94a3b8', alignment:'right' },
      ],
    },
    footer:(p,n) => ({
      margin:[40,10,40,0],
      columns:[
        { text:'Documento gerado pelo LicitaAudit · Lei nº 14.133/2021', fontSize:7, color:'#94a3b8' },
        { text:`Página ${p} de ${n}`, fontSize:7, color:'#94a3b8', alignment:'right' },
      ],
    }),
    content:[
      { columns:[
        { width:55, table:{ body:[[{ text:'LA', color:'white', bold:true, fontSize:22, alignment:'center', fillColor:'#1e3a8a', margin:[0,8,0,8] }]] }, layout:'noBorders' },
        { width:'*', stack:[
          { text:(meta.orgao||'ÓRGÃO / ENTIDADE PÚBLICA').toUpperCase(), fontSize:13, bold:true, color:'#0f172a' },
          { text:'SISTEMA LICITAAUDIT — CORE ENGINE DE AUDITORIA', fontSize:8.5, color:'#64748b', characterSpacing:0.5 },
          { text:'Base normativa: Lei nº 14.133/2021', fontSize:8, color:'#94a3b8', italics:true },
        ], margin:[14,4,0,0] },
      ]},
      { canvas:[{ type:'line', x1:0, y1:0, x2:515, y2:0, lineWidth:1.5, lineColor:'#1e3a8a' }], margin:[0,12,0,0] },
      { text:'RELATÓRIO DE AUDITORIA E CONFORMIDADE LICITATÓRIA', fontSize:12, bold:true, alignment:'center', color:'#0f172a', margin:[0,16,0,2] },
      { text:`Nº ${meta.numeroRelatorio}  ·  ${dataFmt}`, fontSize:9, alignment:'center', color:'#64748b', margin:[0,0,0,16] },
      { table:{ widths:['32%','68%'], body:[
        [{ text:'Nº do Processo', style:'ml' }, { text:meta.processo, style:'mv' }],
        [{ text:'Órgão / Entidade', style:'ml' }, { text:meta.orgao, style:'mv' }],
        [{ text:'Objeto', style:'ml' }, { text:rep.identificacao.objeto, style:'mv' }],
        [{ text:'Modalidade', style:'ml' }, { text:rep.identificacao.modalidade, style:'mv' }],
        [{ text:'Grau de Conformidade', style:'ml' }, { stack:[
          { text:`${rep.score}%`, bold:true, fontSize:13, color:cor },
          { canvas:[
              { type:'rect', x:0, y:0, w:200, h:5, r:2.5, color:'#e2e8f0' },
              { type:'rect', x:0, y:0, w:200*rep.score/100, h:5, r:2.5, color:cor },
          ], margin:[0,4,0,0] },
        ]}],
        [{ text:'Regras aplicáveis', style:'ml' }, { text:`${rep.estatisticas.aplicaveis} de ${rep.estatisticas.total}`, style:'mv' }],
        [{ text:'Nível de Risco', style:'ml' }, { text:risco.nivel, color:cor, bold:true, fontSize:11 }],
      ]},
      layout:{
        fillColor:(i)=> i%2===0 ? '#f8fafc' : '#ffffff',
        hLineWidth:(i,n)=> (i===0||i===n.table.body.length)?1:0.5,
        vLineWidth:()=>0, hLineColor:()=>'#e2e8f0',
        paddingTop:()=>7, paddingBottom:()=>7, paddingLeft:()=>10, paddingRight:()=>10,
      }, margin:[0,0,0,16] },
      { table:{ widths:['*'], body:[[{ stack:[
        { text:'PARECER FINAL', fontSize:8, bold:true, color:'#64748b', characterSpacing:0.5 },
        { text:parecerTexto, fontSize:11, bold:true, color:cor, margin:[0,4,0,4] },
        { text:risco.descricao, fontSize:9, color:'#334155', italics:true },
      ], margin:[12,12,12,12], fillColor:corParecer }]] }, layout:'noBorders', margin:[0,0,0,16] },
      { text:'1. QUADRO RESUMO — 30 VERIFICAÇÕES NUCLEARES', style:'st' },
      { table:{ headerRows:1, widths:['6%','44%','16%','10%','12%','12%'], body:resumoBody }, layout:{
        fillColor:(i)=> i===0 ? '#1e293b' : null,
        hLineWidth:()=>0.4, vLineWidth:()=>0.4,
        hLineColor:()=>'#cbd5e1', vLineColor:()=>'#cbd5e1',
        paddingTop:()=>5, paddingBottom:()=>5, paddingLeft:()=>6, paddingRight:()=>6,
      }, margin:[0,0,0,16] },
      { text:'2. QUADRO DE NÃO CONFORMIDADES', style:'st' },
      { table:{ headerRows:1, dontBreakRows:true, widths:['10%','65%','25%'], body:[
        [
          { text:'GRAU', style:'th', alignment:'center' },
          { text:'ACHADO + RECOMENDAÇÃO', style:'th' },
          { text:'FUNDAMENTO LEGAL', style:'th' },
        ],
        ...falhasBody,
      ]}, layout:{
        fillColor:(i)=> i===0 ? '#1e293b' : null,
        hLineWidth:()=>0.4, vLineWidth:()=>0.4,
        hLineColor:()=>'#cbd5e1', vLineColor:()=>'#cbd5e1',
        paddingTop:()=>5, paddingBottom:()=>5, paddingLeft:()=>7, paddingRight:()=>7,
      }, margin:[0,0,0,16] },
      { table:{ dontBreakRows:true, widths:['*'], body:[[{ stack:[
        { text:' ', margin:[0,20,0,0] },
        { canvas:[{ type:'line', x1:130, y1:0, x2:385, y2:0, lineWidth:0.8, lineColor:'#334155' }] },
        { text:'Equipe de Auditoria de Controle Interno', fontSize:10, bold:true, alignment:'center', margin:[0,6,0,2] },
        { text:'Agente de Auditoria · LicitaAudit', fontSize:9, alignment:'center', color:'#475569' },
        { text:(meta.orgao||'').toUpperCase(), fontSize:8.5, alignment:'center', color:'#64748b', italics:true, margin:[0,2,0,0] },
      ], margin:[0,10,0,10] }]] }, layout:'noBorders', margin:[0,20,0,0] },
    ],
    styles:{
      ml:{ fontSize:8.5, bold:true, color:'#475569' },
      mv:{ fontSize:9, color:'#0f172a' },
      st:{ fontSize:11, bold:true, color:'#0f172a', margin:[0,12,0,6] },
      th:{ fontSize:8, bold:true, color:'#ffffff' },
    },
  };

  const safe = String(meta.processo || 'LicitaAudit').replace(/[/\\?%*:|"<>]/g, '_');
  try {
    pdfMake.createPdf(dd).download(`Relatorio_Auditoria_${safe}_${d.getFullYear()}.pdf`);
    toast('Relatório PDF gerado.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Erro ao gerar PDF.', 'error');
  }
}

/* ==========================================================================
 * 14. JSON / FEEDBACK / TEMA
 * ======================================================================== */
function exportJson() {
  if (!state.report) return;
  const payload = {
    ferramenta: 'LicitaAudit', versao: '4.0.0',
    baseNormativa: 'Lei nº 14.133/2021',
    ...state.report,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `licitaudit-relatorio-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Relatório JSON exportado.', 'ok');
}

function showLoader(t) { els.loaderText.textContent = t || 'Processando…'; els.loader.classList.remove('is-hidden'); }
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
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('licitaudit:theme', next);
}

/* ==========================================================================
 * 15. BOOTSTRAP
 * ======================================================================== */
function bootstrap() {
  initTheme();
  configurePdfWorker();
  bindEvents();
  renderFileList();
  console.info(
    '%cLicitaAudit',
    'background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
    '· v4.0.0 · Core Engine · 30 verificações condicionais'
  );
}
document.addEventListener('DOMContentLoaded', bootstrap);
