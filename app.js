/* ============================================================================
 * LicitaAudit · app.js — v6.0.0 (Workspaces por Processo)
 * ----------------------------------------------------------------------------
 * • Workspaces dinâmicos por Processo (nome, cor, tags, dropzone próprio).
 * • Análise individual por arquivo + consolidada por processo.
 * • Exportação: PDF individual, PDF consolidado por processo, PDF em lote,
 *   JSON exportável/importável.
 * • Core Engine de 30 verificações condicionais (preservado).
 * ========================================================================== */
'use strict';

/* ==========================================================================
 * 1. ESTADO GLOBAL
 * ======================================================================== */
const state = {
  processos: [],         // [{ id, nome, cor, tags:[], arquivos:[], _consolidado:null }]
  isBusy: false,
};

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const els = {
  btnNovoProcesso:  $('#btnNovoProcesso'),
  btnCarregarExemplo: $('#btnCarregarExemplo'),
  gridProcessos:    $('#gridProcessos'),
  emptyState:       $('#emptyState'),
  subtitle:         $('#topbarSubtitle'),
  themeToggle:      $('#themeToggle'),
  paramObjeto:      $('#paramObjeto'),
  paramModalidade:  $('#paramModalidade'),
  paramCriterio:    $('#paramCriterio'),
  pdfAllBtn:        $('#pdfAllBtn'),
  jsonBtn:          $('#jsonBtn'),
  jsonLoadBtn:      $('#jsonLoadBtn'),
  jsonLoadInput:    $('#jsonLoadInput'),
  loader:           $('#loader'),
  loaderText:       $('#loaderText'),
  toast:            $('#toast'),
  modalDetalhes:    $('#modalDetalhes'),
  modalTitulo:      $('#modalTitulo'),
  modalConteudo:    $('#modalConteudo'),
};

/* ==========================================================================
 * 2. CONSTANTES / UTILS
 * ======================================================================== */
const LIMITE_DISPENSA_BENS_SERVICOS = 50000.00;
const LIMITE_DISPENSA_OBRAS          = 100000.00;
const PESOS = { CRITICA: 5, MEDIA: 2, BAIXA: 0.5 };

const CORES_PRESET = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280'];

const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const extOf = (n) => (n.split('.').pop() || '').toLowerCase();

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
const truncateFileName = (n, max = 34) => {
  const d = n.lastIndexOf('.');
  if (d <= 0) return n.length > max ? n.slice(0, max) + '…' : n;
  const base = n.slice(0, d), ext = n.slice(d);
  if (base.length <= max) return n;
  return base.slice(0, max - 1).trimEnd() + '…' + ext;
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

function toast(msg, kind = 'ok') {
  clearTimeout(toast._t);
  els.toast.textContent = msg;
  els.toast.dataset.kind = kind;
  els.toast.classList.remove('is-hidden');
  requestAnimationFrame(() => els.toast.classList.add('is-visible'));
  toast._t = setTimeout(() => {
    els.toast.classList.remove('is-visible');
    setTimeout(() => els.toast.classList.add('is-hidden'), 300);
  }, 2800);
}
function showLoader(t) { els.loaderText.textContent = t || 'Processando…'; els.loader.classList.remove('is-hidden'); }
function hideLoader() { els.loader.classList.add('is-hidden'); }

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
  tiEquipamentos: /(computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|servidor(es)?\s+de\s+rede|switch(es)?\s+gerenci|roteador(es)?|firewall(s)?|nobreak|estabilizador|hd\s+externo|ssd|mem[oó]ria\s+ram|processador|placa\s+de\s+v[íi]deo|mouse|teclado|webcam|tablet(s)?)/i,
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
  const rot = corpus.match(/(?:modalidade\s+(?:de\s+licita[cç][aã]o|licitat[oó]ria|adotada|declarada)|tipo\s+de\s+licita[cç][aã]o)\s*[:\-–—]\s*([^\n\r]{2,80})/i);
  if (rot) {
    const v = rot[1].trim();
    if (/preg[aã]o/i.test(v))                return { chave:'pregao',          rotulo:'Pregão Eletrônico' };
    if (/concorr[eê]ncia/i.test(v))          return { chave:'concorrencia',    rotulo:'Concorrência' };
    if (/leil[aã]o/i.test(v))                return { chave:'leilao',          rotulo:'Leilão Eletrônico' };
    if (/inexigibilidade/i.test(v))          return { chave:'inexigibilidade', rotulo:'Inexigibilidade de Licitação' };
    if (/dispensa/i.test(v))                 return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
    if (/di[aá]logo\s+competitivo/i.test(v)) return { chave:'dialogo',         rotulo:'Diálogo Competitivo' };
    if (/concurso/i.test(v))                 return { chave:'concurso',        rotulo:'Concurso' };
  }
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
    .replace(/^[\s\-–—:.,;]+/, '').replace(/\s+/g,' ').trim().slice(0, 600);
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

function classificarTipoObjeto(meta) {
  const texto = [meta?.objeto?.texto || '', meta?.objetoField || ''].join(' ').toLowerCase();
  const nat   = (meta?.natureza || '').toLowerCase();
  const eBens = /(aquisi[cç][aã]o\s+de\s+bens|compra\s+de\s+bens|fornecimento\s+de\s+bens|equipament|material\s+de|computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|mobili[aá]rio|cadeira(s)?|mesa(s)?|arm[aá]rio(s)?|estante(s)?|ve[ií]culo(s)?|uniforme(s)?|medicament(o|os))/i.test(texto);
  const eServicos = /(presta[cç][aã]o\s+de\s+servi|contrata[cç][aã]o\s+de\s+servi|servi[cç]os?\s+de|servi[cç]o\s+(t[eé]cnico|especializado|continuado)|manuten[cç][aã]o|suporte\s+t[eé]cnico|consultoria|assessoria|treinamento|capacita[cç][aã]o|limpeza|vigil[aâ]ncia|seguran[cç]a)/i.test(texto);

  if (eBens && !eServicos) return 'bens';
  if (eServicos && !eBens) return 'servicos';
  if (/aquisic|bens/.test(nat)) return 'bens';
  if (/servic/.test(nat))       return 'servicos';
  return 'servicos';
}

/* ==========================================================================
 * 5. CORE ENGINE — 30 VERIFICAÇÕES NUCLEARES
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
  { id:'B1_01', bloco:1, nome:'Justificativa da necessidade pública', fundamento:'Art. 18, §1º, I', severidade:'CRITICA', aplicavel: () => true, test: c => /\b(justific|motiva|necessidade\s+p[uú]blica|interesse\s+p[uú]blico|finalidade)/i.test(c.corpus), mensagemFalha:'Justificativa da necessidade pública não identificada.', recomendacao:'Elaborar seção com motivação fática e jurídica da demanda.' },
  { id:'B1_02', bloco:1, nome:'Descrição clara e precisa do objeto', fundamento:'Art. 18, §1º, II', severidade:'CRITICA', aplicavel: () => true,
    test: c => {
      const tipo = c.meta.objeto.tipo || '';
      const texto = (c.meta.objeto.texto || '').toLowerCase();
      const chave = /(computador|notebook|workstation|equipament|licen[cç]a|suporte\s+t[eé]cnico|impressora|monitor|servidor|switch|roteador|software|sistema|aquisi[cç][aã]o|fornecimento|presta[cç][aã]o\s+de\s+servi|bem|material|servi[çc]o)/i.test(c.corpus);
      return tipo !== 'Não identificado' || (texto.length > 20 && chave) || chave;
    }, mensagemFalha:'Objeto insuficiente, ambíguo ou ausente.', recomendacao:'Descrever com especificações técnicas precisas.' },
  { id:'B1_03', bloco:1, nome:'Estimativa de quantitativos', fundamento:'Art. 18, §1º, III', severidade:'MEDIA', aplicavel: () => true, test: c => /(quantidade|qtd\.?|unidades?|\blotes?\b|\d+\s*\([^)]{2,60}\)|\d+\s*(unid|un|pç|pc|cx|kg|l|m²|m³|resma|itens?))/i.test(c.corpus), mensagemFalha:'Quantitativos não explicitados.', recomendacao:'Apresentar planilha quantitativa com metodologia de projeção.' },
  { id:'B1_04', bloco:1, nome:'ETP ou Termo de Referência anexado', fundamento:'Art. 6º, XXIII e XXV · Art. 18, §1º', severidade:'CRITICA', aplicavel: () => true, test: c => /(estudo\s+t[eé]cnico\s+preliminar|\bETP\b|termo\s+de\s+refer[eê]ncia|\bTR\b|projeto\s+b[aá]sico|\bPB\b|anteprojeto|especifica[cç][õo]es\s+deste\s+edital)/i.test(c.corpus), mensagemFalha:'Documento estruturante (ETP/TR) ausente.', recomendacao:'Anexar ETP e TR (ou Projeto Básico para obras).' },
  { id:'B1_05', bloco:1, nome:'Decisão motivada sobre parcelamento', fundamento:'Art. 47', severidade:'MEDIA', aplicavel: () => true, test: c => /(parcelament|divis[aã]o\s+em\s+lotes|indivis[íi]vel|lote\s+[uú]nico|n[aã]o\s+parcel)/i.test(c.corpus), mensagemFalha:'Sem decisão motivada sobre parcelamento.', recomendacao:'Motivar expressamente o parcelamento ou a indivisibilidade.' },

  { id:'B2_01', bloco:2, nome:'Estimativa de valor e metodologia', fundamento:'Art. 23', severidade:'CRITICA', aplicavel: () => true, test: c => c.meta.valor > 0 || firstMatch(c.corpus, KB.orcamento), mensagemFalha:'Estimativa de valor ausente.', recomendacao:'Elaborar planilha orçamentária com múltiplas fontes de pesquisa.' },
  { id:'B2_02', bloco:2, nome:'Indicação da dotação orçamentária', fundamento:'Art. 18, §1º, V · Art. 150', severidade:'CRITICA', aplicavel: () => true, test: c => /(dota[cç][aã]o\s+or[cç]ament|programa\s+de\s+trabalho|natureza\s+de\s+despesa|fonte\s+de\s+recurso)/i.test(c.corpus), mensagemFalha:'Dotação orçamentária não indicada.', recomendacao:'Indicar dotação, programa de trabalho e natureza de despesa.' },
  { id:'B2_03', bloco:2, nome:'Declaração de adequação orçamentária (LRF/LDO)', fundamento:'Art. 150', severidade:'MEDIA', aplicavel: () => true, test: c => /(\bLRF\b|responsabilidade\s+fiscal|\bLDO\b|adequa[cç][aã]o\s+or[cç]ament)/i.test(c.corpus), mensagemFalha:'Sem declaração de adequação com LRF/LDO.', recomendacao:'Declarar adequação orçamentária e financeira.' },
  { id:'B2_04', bloco:2, nome:'Limite de dispensa por valor', fundamento:'Art. 75, I e II', severidade:'CRITICA', aplicavel: c => /dispensa/i.test(c.modalidade?.modalidade || ''),
    test: c => {
      const obra = /obras?\s+e\s+servi[cç]os\s+de\s+engenharia/i.test(c.natureza);
      const lim = obra ? LIMITE_DISPENSA_OBRAS : LIMITE_DISPENSA_BENS_SERVICOS;
      if (!c.meta.valor || c.meta.valor <= 0) return false;
      return c.meta.valor <= lim;
    }, mensagemFalha:'Valor acima do teto legal para dispensa.', recomendacao:'Reclassificar a modalidade ou revisar o valor estimado.' },
  { id:'B2_05', bloco:2, nome:'Referência SINAPI/SICRO para obras', fundamento:'Art. 23, §2º', severidade:'MEDIA', aplicavel: c => /obras?\s+e\s+servi[cç]os\s+de\s+engenharia/i.test(c.natureza || ''), test: c => /(SINAPI|SICRO|tabela\s+de\s+refer[eê]ncia)/i.test(c.corpus), mensagemFalha:'Obras sem referência a SINAPI/SICRO.', recomendacao:'Comprovar compatibilidade com as tabelas SINAPI/SICRO.' },

  { id:'B3_01', bloco:3, nome:'Ausência de direcionamento de marca', fundamento:'Art. 41, I', severidade:'CRITICA', aplicavel: () => true,
    test: c => {
      const vedacaoExplicita = /(vedad[ao]\s+(a\s+)?indica[cç][aã]o\s+de\s+marca|vedad[ao]\s+(a\s+)?marca|sem\s+indica[cç][aã]o\s+de\s+marca|vedad[ao]\s+indica[cç][aã]o\s+de\s+marca\s*,?\s*modelo|n[aã]o\s+ser[aá]\s+admitid[ao]\s+(a\s+)?indica[cç][aã]o\s+de\s+marca)/i.test(c.corpus);
      if (vedacaoExplicita) return true;
      const temMarca = /\b(marca|modelo|fabricante)\s*[:\-]?\s*[A-ZÀ-Ú][\w-]+/i.test(c.corpus);
      if (!temMarca) return true;
      return /(padroniza|carta\s+de\s+exclusividade|atestado\s+de\s+exclusividade|justificativa\s+t[eé]cnica\s+de\s+padroniza)/i.test(c.corpus);
    }, mensagemFalha:'Indicação de marca sem vedação explícita nem justificativa técnica.', recomendacao:'Inserir cláusula "vedada a indicação de marca" OU apresentar justificativa de padronização (Art. 41, I).' },
  { id:'B3_02', bloco:3, nome:'Vedação de participação de servidores', fundamento:'Art. 14, I', severidade:'MEDIA', aplicavel: () => true, test: c => /(servidores?\s+do\s+[óo]rg[ãa]o|membros?\s+da\s+comiss[aã]o|art\.?\s*14,?\s*i\b|v[eé]dad[ao]\s+ao\s+servidor|impedimento\s+de\s+servidor)/i.test(c.corpus), mensagemFalha:'Cláusula de vedação a servidores não identificada.', recomendacao:'Incluir cláusula expressa vedando participação de servidores e membros da comissão (Art. 14, I).' },
  { id:'B3_03', bloco:3, nome:'Vedação a empresas suspensas (CEIS/CNEP)', fundamento:'Art. 14, III', severidade:'MEDIA', aplicavel: () => true, test: c => /(impedid[oa]|suspens[ao]|CEIS|CNEP|consulta\s+de\s+san[cç][õo]es)/i.test(c.corpus), mensagemFalha:'Sem cláusula de vedação a empresas impedidas/suspensas.', recomendacao:'Explicitar vedação (Art. 14, III) e consulta ao CEIS/CNEP.' },
  { id:'B3_04', bloco:3, nome:'Declaração sobre trabalho infantil', fundamento:'Art. 68, VI', severidade:'MEDIA', aplicavel: () => true, test: c => /(n[aã]o\s+emprego\s+de\s+menores|trabalho\s+infantil|menor\s+de\s+18)/i.test(c.corpus), mensagemFalha:'Sem exigência de declaração sobre trabalho infantil.', recomendacao:'Exigir declaração de não emprego de menores de 18 anos.' },
  { id:'B3_05', bloco:3, nome:'Qualificação técnica e vistoria declaratória', fundamento:'Art. 67 · Art. 63, § único', severidade:'MEDIA', aplicavel: () => true,
    test: c => {
      const excesso = /(exig[êe]ncia\s+excessiva|desproporcional|afunilad[ao])/i.test(c.corpus);
      if (excesso) return false;
      const temVistoria = /(vistoria|visita\s+t[eé]cnica)/i.test(c.corpus);
      if (!temVistoria) return true;
      return /(declara[cç][aã]o\s+formal|substitui[cç][aã]o\s+d[aa]\s+vistoria|dispensa\s+de\s+vistoria|art\.?\s*63,?\s*§\s*[uú]nico|em\s+substitui[cç][aã]o\s+[àa]\s+vistoria)/i.test(c.corpus);
    }, mensagemFalha:'Exigência técnica excessiva OU vistoria sem alternativa declaratória.', recomendacao:'Revisar requisitos técnicos e permitir declaração formal (Art. 63, § único).' },

  { id:'B4_01', bloco:4, nome:'Coerência entre modalidade e natureza do objeto', fundamento:'Art. 6º, XLI · Art. 28 a 32', severidade:'CRITICA', aplicavel: () => true,
    test: c => {
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      const nat = (c.natureza || '').toLowerCase();
      const obj = ((c.meta?.objeto?.texto || '') + ' ' + (c.meta?.objeto?.tipo || '')).toLowerCase();
      if (mod.includes('pregão')) return /bens|comuns|servi[cç]|aquisi[cç]|fornecimento|ti\b|tic\b|tecnologia\s+da\s+informa|equipament|computador|notebook|workstation|impressora|monitor|material|mobili/.test(nat) || /bens|comuns|ti\b|tic\b|equipament|computador|notebook|workstation|impressora|monitor|material|mobili|software|hardware/.test(obj);
      if (mod.includes('concorrência')) return /obra|engenharia|t[eé]cnic|tic|intelectual|especializ|complexid/.test(nat) || /obra|engenharia|t[eé]cnic|intelectual|especializ|complexid/.test(obj);
      if (mod.includes('leilão')) return /aliena|inserv[íi]vel|desfazimento/.test(nat) || /aliena|inserv[íi]vel|desfazimento/.test(obj);
      return true;
    }, mensagemFalha:'Modalidade incompatível com a natureza do objeto.', recomendacao:'Reavaliar a modalidade (Arts. 6º, XLI e 28 a 32).' },
  { id:'B4_02', bloco:4, nome:'Inexigibilidade: inviabilidade de competição', fundamento:'Art. 74, I e III', severidade:'CRITICA', aplicavel: c => /inexigibilidade/i.test(c.modalidade?.modalidade || ''), test: c => /(inviabilidade\s+de\s+competi|exclusividade|fornecedor\s+exclusivo|not[oó]ria\s+especializa|atestado\s+de\s+exclusividade|carta\s+de\s+exclusividade)/i.test(c.corpus), mensagemFalha:'Inexigibilidade sem caracterização de inviabilidade.', recomendacao:'Instruir com atestado de exclusividade ou parecer de notória especialização.' },
  { id:'B4_03', bloco:4, nome:'Inexigibilidade: justificativa de preço', fundamento:'Art. 74, §2º', severidade:'MEDIA', aplicavel: c => /inexigibilidade/i.test(c.modalidade?.modalidade || ''), test: c => /(notas?\s+fiscais?|contratos?\s+anterior|pre[cç]os?\s+praticad)/i.test(c.corpus), mensagemFalha:'Sem justificativa de preço por notas/contratos anteriores.', recomendacao:'Juntar notas fiscais ou contratos anteriores do contratado (Art. 74, §2º).' },
  { id:'B4_04', bloco:4, nome:'Dispensa Emergencial: caracterização e prazo', fundamento:'Art. 75, VIII e §1º', severidade:'CRITICA', aplicavel: c => /dispensa/i.test(c.modalidade?.modalidade || '') && KB.emergencia.test(c.corpus),
    test: c => /(risco\s+iminente|paralisa[cç][aã]o|desabastecimento|risco\s+[àa]\s+vida)/i.test(c.corpus) && /(1\s+ano|12\s+meses|sem\s+prorroga)/i.test(c.corpus),
    mensagemFalha:'Emergência não caracterizada OU prazo superior a 1 ano.', recomendacao:'Caracterizar risco iminente e fixar prazo ≤ 1 ano (vedada prorrogação).' },
  { id:'B4_05', bloco:4, nome:'Critério de julgamento declarado', fundamento:'Art. 33', severidade:'MEDIA', aplicavel: () => true, test: c => /(menor\s+pre[cç]o|maior\s+desconto|melhor\s+t[eé]cnica|t[eé]cnica\s+e\s+pre[cç]o|maior\s+lance|maior\s+retorno)/i.test(c.corpus) || c.criterio !== 'indefinido', mensagemFalha:'Critério de julgamento não declarado.', recomendacao:'Declarar expressamente o critério entre os do Art. 33.' },

  { id:'B5_01', bloco:5, nome:'Prazo mínimo de 8 dias úteis (Pregão — bens)', fundamento:'Art. 55, I, "a"', severidade:'CRITICA', aplicavel: c => /preg[aã]o/i.test(c.modalidade?.modalidade || '') && c.meta?.tipoObjeto === 'bens', test: c => /(8\s*\(?[oO]ito\)?\s*dias\s*[uú]teis|prazo\s+m[íi]nimo\s+de\s+8\s+dias|art\.?\s*55,?\s*i,?\s*["']?a["']?|8\s+dias\s+[uú]teis|oito\s+dias|≥\s*8|pelo\s+menos\s+8)/i.test(c.corpus), mensagemFalha:'Pregão de bens sem prazo mínimo de 8 dias úteis.', recomendacao:'Fixar prazo mínimo de 8 dias úteis (Art. 55, I, "a").' },
  { id:'B5_02', bloco:5, nome:'Prazo mínimo de 10 dias úteis (Pregão — serviços)', fundamento:'Art. 55, I, "b"', severidade:'CRITICA', aplicavel: c => /preg[aã]o/i.test(c.modalidade?.modalidade || '') && c.meta?.tipoObjeto === 'servicos', test: c => /(10\s+dias|dez\s+dias|≥\s*10|pelo\s+menos\s+10)/i.test(c.corpus), mensagemFalha:'Pregão de serviços sem prazo mínimo de 10 dias úteis.', recomendacao:'Fixar prazo mínimo de 10 dias úteis (Art. 55, I, "b").' },
  { id:'B5_03', bloco:5, nome:'Prazo mínimo de 35 dias úteis (Concorrência)', fundamento:'Art. 55, II', severidade:'CRITICA', aplicavel: c => /concorr[eê]ncia/i.test(c.modalidade?.modalidade || ''), test: c => /(35\s+dias|trinta\s+e\s+cinco)/i.test(c.corpus), mensagemFalha:'Concorrência sem prazo mínimo de 35 dias úteis.', recomendacao:'Fixar prazo mínimo de 35 dias úteis (Art. 55, II).' },
  { id:'B5_04', bloco:5, nome:'Publicação no PNCP', fundamento:'Art. 54', severidade:'CRITICA', aplicavel: () => true, test: c => /(PNCP|Portal\s+Nacional\s+de\s+Contrata)/i.test(c.corpus), mensagemFalha:'Sem menção à publicação no PNCP.', recomendacao:'Prever publicação obrigatória no PNCP (Art. 54).' },
  { id:'B5_05', bloco:5, nome:'Impugnação e recurso em fase única', fundamento:'Art. 164 · Art. 165', severidade:'MEDIA', aplicavel: () => true,
    test: c => /(impugna[cç][õo]es?|esclarecimento|impugn[aá]vel)/i.test(c.corpus) || /(fase\s+[uú]nica|3\s*\(?[trêeTRÊE]+\)?\s*dias\s*[uú]teis|tr[eê]s\s+dias|recurso[s]?\s+(?:administrativo|em\s+fase|[uú]nico)|art\.?\s*165|fase\s+recursal)/i.test(c.corpus),
    mensagemFalha:'Sem regras claras de impugnação/recurso.', recomendacao:'Fixar impugnação e recurso em fase única com prazo de 3 dias úteis.' },

  { id:'B6_01', bloco:6, nome:'Fiscal (titular/substituto) e gestor designados', fundamento:'Art. 117', severidade:'CRITICA', aplicavel: () => true,
    test: c => {
      const t = /(fiscal\s+titular|fiscaliza[cç][aã]o\s+do\s+contrato)/i.test(c.corpus);
      const s = /(fiscal\s+substituto|fiscal\s+suplente|substituto)/i.test(c.corpus);
      const g = /(gestor\s+do\s+contrato|gest[aã]o\s+contratual)/i.test(c.corpus);
      return t && (s || g);
    }, mensagemFalha:'Fiscal titular, substituto e/ou gestor não designados.', recomendacao:'Designar expressamente fiscal titular, substituto e gestor (Art. 117).' },
  { id:'B6_02', bloco:6, nome:'Segregação de funções', fundamento:'Art. 7º, §1º', severidade:'CRITICA', aplicavel: () => true, test: c => /(segrega[cç][aã]o\s+de\s+fun[cç][õo]es|agente\s+de\s+contrata|pregoeiro|equipe\s+de\s+apoio)/i.test(c.corpus), mensagemFalha:'Segregação de funções não observada expressamente.', recomendacao:'Designar separadamente agente de contratação, pregoeiro e equipe de apoio.' },
  { id:'B6_03', bloco:6, nome:'Recebimento provisório e definitivo', fundamento:'Art. 140', severidade:'MEDIA', aplicavel: () => true, test: c => /(recebido\s+provisoriamente|recebimento\s+definitivo|recebimento\s+provis[óo]rio|aceite\s+provis[óo]rio|aceite\s+definitivo|art\.?\s*140)/i.test(c.corpus), mensagemFalha:'Prazos e critérios de recebimento não definidos.', recomendacao:'Definir recebimento provisório e definitivo (Art. 140).' },
  { id:'B6_04', bloco:6, nome:'Pagamento em até 30 dias', fundamento:'Art. 141', severidade:'BAIXA', aplicavel: () => true, test: c => /(30\s+dias|trinta\s+dias).{0,40}(pagamento|nota\s+fiscal|aceite)/i.test(c.corpus) || /(pagamento).{0,40}(30\s+dias|trinta\s+dias)/i.test(c.corpus) || !/pagamento/i.test(c.corpus), mensagemFalha:'Prazo de pagamento não fixado em até 30 dias.', recomendacao:'Fixar pagamento em até 30 dias após NF e aceite (Art. 141).' },
  { id:'B6_05', bloco:6, nome:'Sanções administrativas graduadas', fundamento:'Art. 155', severidade:'MEDIA', aplicavel: () => true, test: c => /(san[cç][õo]es\s+administrativas|multa|advert[êe]ncia|impedimento\s+de\s+contratar)/i.test(c.corpus), mensagemFalha:'Regime de sanções não previsto.', recomendacao:'Prever sanções graduadas do Art. 155.' },
];

/* ==========================================================================
 * 6. MOTOR DE AVALIAÇÃO
 * ======================================================================== */
function executarAuditoriaCustomizada(corpus, meta, natureza, modalidade, criterio) {
  const ctx = { corpus, meta, natureza, modalidade, criterio };

  const resultados = MATRIZ_CORE_30.map((regra) => {
    let aplicavel = false;
    try { aplicavel = !!regra.aplicavel(ctx); } catch (_) { aplicavel = true; }
    if (!aplicavel) return { ...regra, peso: PESOS[regra.severidade], aplicavel: false, conforme: null, status: 'N/A' };
    let conforme = false;
    try { conforme = !!regra.test(ctx); } catch (_) { conforme = false; }
    return { ...regra, peso: PESOS[regra.severidade], aplicavel: true, conforme, status: conforme ? 'ok' : 'falha' };
  });

  const aplicaveis = resultados.filter(r => r.aplicavel);
  const pesoTotal  = aplicaveis.reduce((s, r) => s + r.peso, 0);
  const pesoFalha  = aplicaveis.filter(r => !r.conforme).reduce((s, r) => s + r.peso, 0);

  const score = pesoTotal > 0
    ? Math.max(0, Math.round((100 - (pesoFalha / pesoTotal) * 100) * 10) / 10)
    : 100;

  const criticas = aplicaveis.filter(r => !r.conforme && r.severidade === 'CRITICA').length;
  const medias   = aplicaveis.filter(r => !r.conforme && r.severidade === 'MEDIA').length;
  const baixas   = aplicaveis.filter(r => !r.conforme && r.severidade === 'BAIXA').length;

  return {
    resultados, aplicaveis,
    totalAplicaveis: aplicaveis.length,
    totalIgnoradas: resultados.length - aplicaveis.length,
    pesoTotal, pesoFalha, score,
    criticasFalha: criticas, mediasFalha: medias, baixasFalha: baixas,
  };
}

function classificarRisco(score, criticas) {
  if (criticas > 0 || score < 70) {
    return { nivel:'ALTO', titulo:'Risco Alto / Inviável', descricao: criticas > 0 ? `${criticas} vício(s) impeditivo(s).` : 'Conformidade abaixo de 70%.', cor:'#dc2626', emoji:'🔴', classe:'alto' };
  }
  if (score >= 90) {
    return { nivel:'BAIXO', titulo:'Risco Baixo', descricao:'Processo apto à publicação.', cor:'#10b981', emoji:'🟢', classe:'baixo' };
  }
  return { nivel:'MÉDIO', titulo:'Risco Médio', descricao:'Saneamento prévio recomendado.', cor:'#f59e0b', emoji:'🟡', classe:'medio' };
}

/* ==========================================================================
 * 7. ANÁLISE INDIVIDUAL DE UM TEXTO
 * ======================================================================== */
function analisarTextoIndividual(corpus, opts = {}) {
  const metaBase = {
    modalidade: extrairModalidade(corpus),
    objeto:     extrairObjeto(corpus),
    valor:      extrairValor(corpus),
    processo:   extrairProcesso(corpus),
    orgao:      extrairOrgao(corpus),
    unidade:    extrairUnidadeRequisitante(corpus),
    empresa:    extrairEmpresa(corpus),
  };

  const naturezaBase = classificarNatureza(corpus, opts.paramObjeto || 'auto');

  const modalidadeLabel = opts.paramModalidade && opts.paramModalidade !== 'auto'
    ? (() => {
        const m = {
          pregao:'Pregão Eletrônico', concorrencia:'Concorrência', concurso:'Concurso',
          leilao:'Leilão Eletrônico', dialogo:'Diálogo Competitivo',
          dispensa:'Dispensa de Licitação', inexigibilidade:'Inexigibilidade de Licitação',
        };
        return m[opts.paramModalidade] || metaBase.modalidade.rotulo;
      })()
    : metaBase.modalidade.rotulo;

  const criterio = opts.paramCriterio && opts.paramCriterio !== 'auto'
    ? opts.paramCriterio
    : extrairCriterio(corpus);

  const tipoObjeto = classificarTipoObjeto({ objeto: metaBase.objeto, natureza: naturezaBase });

  const meta = {
    ...metaBase,
    natureza: naturezaBase,
    modalidade: modalidadeLabel,
    criterio,
    tipoObjeto,
  };

  const auditoria = executarAuditoriaCustomizada(corpus, meta, naturezaBase, { modalidade: modalidadeLabel }, criterio);
  const risco = classificarRisco(auditoria.score, auditoria.criticasFalha);

  let statusGeral;
  if (auditoria.criticasFalha > 0)                                                         statusGeral = 'requer-correcoes';
  else if (auditoria.score >= 90 && auditoria.aplicaveis.every(r => r.conforme))           statusGeral = 'aprovado';
  else if (auditoria.score >= 70)                                                          statusGeral = 'requer-correcoes';
  else                                                                                     statusGeral = 'inconclusivo';

  const objetoExibicao = (
    meta.objeto.texto && meta.objeto.texto.trim().length >= 5
      ? meta.objeto.texto.trim().slice(0, 200)
      : meta.objeto.tipo || 'Não identificado'
  );

  return {
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
      caracteresAnalisados: corpus.length,
      linhasAnalisadas: corpus.split(/\r?\n/).length,
    },
    auditoria: {
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
      id: r.id, bloco: r.bloco, titulo: r.nome, lei: r.fundamento,
      severidade: r.severidade === 'CRITICA' ? 'alta' : r.severidade === 'MEDIA' ? 'media' : 'baixa',
      descricao: r.mensagemFalha,
      sugestao: r.recomendacao,
    })),
  };
}

/* ==========================================================================
 * 8. EXTRAÇÃO DE TEXTO
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
 * 9. PROCESSO — CRUD
 * ======================================================================== */
function criarProcesso(nome = 'Novo Processo') {
  const proc = {
    id: uid('proc'),
    nome,
    cor: CORES_PRESET[state.processos.length % CORES_PRESET.length],
    tags: [],
    arquivos: [],
    _consolidado: null,
    criadoEm: new Date().toISOString(),
  };
  state.processos.push(proc);
  renderGrid();
  return proc;
}

function excluirProcesso(procId) {
  if (!confirm('Excluir este processo e todos os seus arquivos?')) return;
  state.processos = state.processos.filter(p => p.id !== procId);
  renderGrid();
  toast('Processo excluído.', 'ok');
}

function renomearProcesso(procId, novoNome) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  p.nome = novoNome.trim() || 'Processo sem nome';
}

function alterarCorProcesso(procId, novaCor) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  p.cor = novaCor;
  renderGrid();
}

function adicionarTag(procId) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  const tag = prompt('Digite a tag (ex: TI, Urgente, Saúde):');
  if (!tag || !tag.trim()) return;
  const limpa = tag.trim().slice(0, 24);
  if (!p.tags.includes(limpa)) p.tags.push(limpa);
  renderGrid();
}

function removerTag(procId, tag) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  p.tags = p.tags.filter(t => t !== tag);
  renderGrid();
}

/* ==========================================================================
 * 10. ARQUIVOS DENTRO DE UM PROCESSO
 * ======================================================================== */
async function adicionarArquivosAoProcesso(procId, fileList) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  const files = Array.from(fileList).filter(Boolean);
  if (!files.length) return;

  showLoader('Extraindo e analisando arquivos…');
  const paramObjeto     = els.paramObjeto.value;
  const paramModalidade = els.paramModalidade.value;
  const paramCriterio   = els.paramCriterio.value;

  for (const file of files) {
    const entry = {
      id: uid('arq'),
      nomeArquivo: file.name,
      ext: extOf(file.name),
      tamanho: file.size,
      texto: '',
      status: 'loading',
      erro: null,
      _ref: file,
    };
    p.arquivos.push(entry);
    renderGrid();

    try {
      entry.texto = await extractFileText(entry._ref);
      entry.status = 'ok';
      const res = analisarTextoIndividual(entry.texto, { paramObjeto, paramModalidade, paramCriterio });
      entry.score = res.score;
      entry.statusGeral = res.statusGeral;
      entry.risco = res.auditoria.risco;
      entry.riscoInfo = res.auditoria.riscoInfo;
      entry.identificacao = res.identificacao;
      entry.auditoria = res.auditoria;
      entry.estatisticas = res.estatisticas;
      entry.resultados = res.resultados;
      entry.correcoes = res.correcoes;
    } catch (err) {
      entry.status = 'erro';
      entry.erro = err.message || 'Erro ao processar.';
    } finally {
      delete entry._ref;
      renderGrid();
    }
  }

  recalcularConsolidadoDoProcesso(p);
  hideLoader();
  toast(`${files.length} arquivo(s) adicionado(s) ao processo.`, 'ok');
}

function removerArquivoDoProcesso(procId, arquivoId) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  if (!confirm('Remover este arquivo do processo?')) return;
  p.arquivos = p.arquivos.filter(a => a.id !== arquivoId);
  recalcularConsolidadoDoProcesso(p);
  renderGrid();
  toast('Arquivo removido.', 'ok');
}

/* ==========================================================================
 * 11. RECÁLCULO CONSOLIDADO POR PROCESSO
 * ======================================================================== */
function recalcularConsolidadoDoProcesso(p) {
  const arquivosOk = p.arquivos.filter(a => a.status === 'ok' && a.texto);
  if (!arquivosOk.length) {
    p._consolidado = null;
    return;
  }

  const corpus = arquivosOk.map(a => `\n===== ${a.nomeArquivo} =====\n${a.texto}`).join('\n');
  const res = analisarTextoIndividual(corpus, {
    paramObjeto: els.paramObjeto.value,
    paramModalidade: els.paramModalidade.value,
    paramCriterio: els.paramCriterio.value,
  });

  p._consolidado = {
    ...res,
    nomeArquivo: `Consolidado (${arquivosOk.length} arquivo${arquivosOk.length > 1 ? 's' : ''})`,
    arquivosAnalisados: arquivosOk.length,
    dataGeracao: new Date().toISOString(),
    numeroRelatorio: String(Math.floor(Math.random() * 900) + 100) + '/' + new Date().getFullYear(),
  };
}

/* ==========================================================================
 * 12. RENDERIZAÇÃO DO GRID
 * ======================================================================== */
function renderGrid() {
  const total = state.processos.length;
  els.emptyState.classList.toggle('is-hidden', total > 0);
  els.subtitle.textContent = total === 0
    ? 'Nenhum processo criado'
    : `${total} processo(s) · ${state.processos.reduce((s, p) => s + p.arquivos.length, 0)} arquivo(s)`;

  els.gridProcessos.innerHTML = state.processos.map(p => renderCardProcesso(p)).join('');
  bindEventosCards();
}

function renderCardProcesso(proc) {
  const cons = proc._consolidado;
  const scoreCons = cons ? cons.score : 0;
  const riscoCons = cons ? cons.auditoria.riscoInfo : { nivel: '—', emoji: '⚪', classe: 'info' };

  const tagsHtml = proc.tags.map(tag => `
    <span class="tag-badge">
      ${escapeHtml(tag)}
      <b data-remove-tag="${escapeHtml(tag)}" data-proc="${proc.id}">&times;</b>
    </span>
  `).join('');

  const arquivosHtml = proc.arquivos.length === 0
    ? `<p class="empty-msg">Nenhum arquivo adicionado.</p>`
    : `<ul>${proc.arquivos.map(a => renderItemArquivo(proc.id, a)).join('')}</ul>`;

  return `
    <article class="card-processo" style="border-top:6px solid ${proc.cor};" data-proc="${proc.id}">
      <header class="card-processo__header">
        <input
          type="text"
          class="input-titulo-processo"
          value="${escapeHtml(proc.nome)}"
          data-rename="${proc.id}"
          title="Clique para renomear"
        />
        <div class="card-processo__acoes-topo">
          <input
            type="color"
            class="picker-cor"
            value="${proc.cor}"
            data-color="${proc.id}"
            title="Cor de identificação"
          />
          <button class="btn-icon danger" data-delete-proc="${proc.id}" title="Excluir processo">&times;</button>
        </div>
      </header>

      <div class="card-processo__tags">
        ${tagsHtml}
        <button class="btn-add-tag" data-add-tag="${proc.id}" type="button">+ Tag</button>
      </div>

      <div class="card-processo__metricas">
        <div class="score-display">
          <span class="score-numero">${cons ? scoreCons.toFixed(1) : '—'}%</span>
          <span class="score-rotulo">Conformidade Global</span>
        </div>
        <span class="badge badge--${riscoCons.nivel === 'ALTO' ? 'ALTO' : riscoCons.nivel === 'MÉDIO' ? 'MÉDIO' : riscoCons.nivel === 'BAIXO' ? 'BAIXO' : 'info'}">
          ${riscoCons.emoji} ${riscoCons.nivel}
        </span>
      </div>

      <div class="card-processo__arquivos-lista">
        <h6>📄 Documentos do Processo (${proc.arquivos.length})</h6>
        ${arquivosHtml}
      </div>

      <div class="dropzone-processo" data-drop="${proc.id}" tabindex="0">
        <span>➕ Arraste ou clique para adicionar arquivos a este processo</span>
      </div>

      <footer class="card-processo__footer">
        <button class="btn btn--primary btn--block" data-pdf-proc="${proc.id}" type="button" ${!cons ? 'disabled' : ''}>
          📄 Baixar Relatório Consolidado do Processo (PDF)
        </button>
      </footer>
    </article>
  `;
}

function renderItemArquivo(procId, arq) {
  const score = arq.status === 'ok' ? `${(arq.score ?? 0).toFixed(1)}%` : (arq.status === 'erro' ? 'Erro' : '…');
  const riscoCls = arq.risco ? (arq.risco === 'ALTO' ? 'ALTO' : arq.risco === 'MÉDIO' ? 'MÉDIO' : 'BAIXO') : 'info';
  const riscoTxt = arq.riscoInfo ? `${arq.riscoInfo.emoji} ${arq.risco}` : '⏳';

  return `
    <li class="item-arquivo">
      <div class="item-arquivo__info">
        <span class="nome-arq" title="${escapeHtml(arq.nomeArquivo)}">${escapeHtml(truncateFileName(arq.nomeArquivo, 34))}</span>
        <div class="item-arquivo__meta">
          <span class="score-arq">${score}</span>
          <span class="badge badge--${riscoCls}">${riscoTxt}</span>
        </div>
      </div>
      <div class="item-arquivo__acoes">
        <button class="btn-sm btn-view" data-view-arq="${arq.id}" data-proc="${procId}" title="Ver detalhes">👁️</button>
        <button class="btn-sm btn-pdf" data-pdf-arq="${arq.id}" data-proc="${procId}" title="PDF individual">📄</button>
        <button class="btn-sm btn-del" data-del-arq="${arq.id}" data-proc="${procId}" title="Remover">&times;</button>
      </div>
    </li>
  `;
}

/* ==========================================================================
 * 13. BIND DE EVENTOS NOS CARDS
 * ======================================================================== */
function bindEventosCards() {
  // Renomear
  $$('[data-rename]').forEach(inp => {
    inp.addEventListener('change', () => renomearProcesso(inp.dataset.rename, inp.value));
  });

  // Cor
  $$('[data-color]').forEach(inp => {
    inp.addEventListener('change', () => alterarCorProcesso(inp.dataset.color, inp.value));
  });

  // Excluir processo
  $$('[data-delete-proc]').forEach(btn => {
    btn.addEventListener('click', () => excluirProcesso(btn.dataset.deleteProc));
  });

  // Adicionar tag
  $$('[data-add-tag]').forEach(btn => {
    btn.addEventListener('click', () => adicionarTag(btn.dataset.addTag));
  });

  // Remover tag
  $$('[data-remove-tag]').forEach(el => {
    el.addEventListener('click', () => removerTag(el.dataset.proc, el.dataset.removeTag));
  });

  // Remover arquivo
  $$('[data-del-arq]').forEach(btn => {
    btn.addEventListener('click', () => removerArquivoDoProcesso(btn.dataset.proc, btn.dataset.delArq));
  });

  // Ver detalhes do arquivo
  $$('[data-view-arq]').forEach(btn => {
    btn.addEventListener('click', () => abrirModalArquivo(btn.dataset.proc, btn.dataset.viewArq));
  });

  // PDF individual
  $$('[data-pdf-arq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const arq = localizarArquivo(btn.dataset.proc, btn.dataset.pdfArq);
      if (arq && arq.status === 'ok') exportarPDFArquivo(arq);
      else toast('Arquivo não disponível para exportação.', 'error');
    });
  });

  // PDF consolidado do processo
  $$('[data-pdf-proc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = state.processos.find(x => x.id === btn.dataset.pdfProc);
      if (p && p._consolidado) exportarPDFProcesso(p);
    });
  });

  // Dropzone por processo
  $$('[data-drop]').forEach(dz => {
    const procId = dz.dataset.drop;
    dz.addEventListener('click', () => abrirInputProcesso(procId));
    dz.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirInputProcesso(procId); }
    });
    ['dragenter','dragover'].forEach(evt => dz.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add('is-dragover');
    }));
    ['dragleave','drop'].forEach(evt => dz.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
      dz.classList.remove('is-dragover');
    }));
    dz.addEventListener('drop', e => {
      const files = e.dataTransfer?.files;
      if (files?.length) adicionarArquivosAoProcesso(procId, files);
    });
  });

  // Impede que o drop em outras áreas abra arquivos
  ['dragover','drop'].forEach(evt =>
    window.addEventListener(evt, e => {
      if (!e.target.closest?.('[data-drop]')) e.preventDefault();
    })
  );

  // Colar (Ctrl+V) dentro do processo ativo (fallback global para o último processo)
  // Removido o handler global para evitar complexidade — cada card tem seu próprio drop.
}

function abrirInputProcesso(procId) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.multiple = true;
  inp.accept = '.pdf,.doc,.docx,.txt,.md,application/pdf,text/plain';
  inp.addEventListener('change', e => {
    if (e.target.files?.length) adicionarArquivosAoProcesso(procId, e.target.files);
    inp.value = '';
  });
  inp.click();
}

function localizarArquivo(procId, arqId) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return null;
  return p.arquivos.find(a => a.id === arqId) || null;
}

/* ==========================================================================
 * 14. MODAL DE DETALHES DO ARQUIVO
 * ======================================================================== */
function abrirModalArquivo(procId, arqId) {
  const arq = localizarArquivo(procId, arqId);
  if (!arq || arq.status !== 'ok') { toast('Detalhes não disponíveis.', 'error'); return; }

  const rc = arq.riscoInfo || { emoji: '⚪', nivel: '—' };
  const id = arq.identificacao || {};
  const stat = arq.estatisticas || {};

  const achadosHtml = (arq.resultados || [])
    .filter(r => r.aplicavel)
    .map(r => {
      const cls = r.conforme ? 'achado--ok' : (r.severidade === 'CRITICA' ? 'achado--critico' : '');
      const icone = r.conforme ? '✓' : '✗';
      return `
        <div class="achado ${cls}">
          <div class="achado__head">
            <span class="achado__id">${escapeHtml(r.id)}</span>
            <span class="badge badge--${r.severidade === 'CRITICA' ? 'ALTO' : r.severidade === 'MEDIA' ? 'MÉDIO' : 'BAIXO'}">
              ${r.severidade}
            </span>
            <span style="margin-left:auto;font-weight:800;color:${r.conforme ? 'var(--ok)' : 'var(--danger)'};">${icone}</span>
          </div>
          <div class="achado__title">${escapeHtml(r.nome)}</div>
          <div class="achado__law">${escapeHtml(r.fundamento)}</div>
          ${!r.conforme ? `
            <div class="achado__body">
              <strong>Constatação:</strong> ${escapeHtml(r.mensagemFalha)}<br>
              <div class="achado__rec"><strong>Recomendação:</strong> ${escapeHtml(r.recomendacao)}</div>
            </div>` : ''}
        </div>
      `;
    }).join('');

  els.modalTitulo.textContent = `Análise: ${arq.nomeArquivo}`;
  els.modalConteudo.innerHTML = `
    <div class="detalhes-head">
      <div>
        <span class="badge badge--${arq.risco === 'ALTO' ? 'ALTO' : arq.risco === 'MÉDIO' ? 'MÉDIO' : 'BAIXO'}">
          ${rc.emoji} ${rc.nivel}
        </span>
      </div>
      <button class="btn btn--primary btn--sm" id="btnPdfModal" type="button">📄 Baixar PDF Individual</button>
    </div>

    <div class="detalhes-score">
      <div class="detalhes-score__numero">${(arq.score ?? 0).toFixed(1)}%</div>
      <div class="detalhes-score__legenda">
        <strong>Conformidade</strong><br>
        ${stat.ok ?? 0} conformes · ${stat.falha ?? 0} inconformidades
        (${stat.criticas ?? 0} críticas · ${stat.medias ?? 0} médias · ${stat.baixas ?? 0} baixas)<br>
        <small>${stat.aplicaveis ?? 0} de ${stat.total ?? 0} regras aplicáveis</small>
      </div>
    </div>

    <div class="detalhes-meta">
      <div class="meta-item"><span class="meta-item__key">Modalidade</span><span class="meta-item__val">${escapeHtml(id.modalidade || '—')}</span></div>
      <div class="meta-item"><span class="meta-item__key">Natureza</span><span class="meta-item__val">${escapeHtml(id.natureza || '—')}</span></div>
      <div class="meta-item"><span class="meta-item__key">Objeto</span><span class="meta-item__val">${escapeHtml(id.objeto || '—')}</span></div>
      <div class="meta-item"><span class="meta-item__key">Processo</span><span class="meta-item__val">${escapeHtml(arq.auditoria?.processo || '—')}</span></div>
      <div class="meta-item"><span class="meta-item__key">Valor</span><span class="meta-item__val">${arq.auditoria?.valor > 0 ? formatarValorBR(arq.auditoria.valor) : '—'}</span></div>
      <div class="meta-item"><span class="meta-item__key">Caracteres</span><span class="meta-item__val">${(id.caracteresAnalisados || 0).toLocaleString('pt-BR')}</span></div>
    </div>

    <h4 style="margin: 12px 0 10px; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim);">Achados e Verificações</h4>
    <div class="achados-list">${achadosHtml}</div>
  `;

  els.modalDetalhes.classList.remove('is-hidden');

  $('#btnPdfModal').addEventListener('click', () => exportarPDFArquivo(arq));
}

function fecharModal() {
  els.modalDetalhes.classList.add('is-hidden');
  els.modalConteudo.innerHTML = '';
}

/* ==========================================================================
 * 15. EXPORTAÇÃO PDF (pdfMake)
 * ======================================================================== */
function _buildDocDefinition(rep, meta) {
  const risco = rep.auditoria.riscoInfo;
  const cor = risco.cor;
  const id = rep.identificacao;
  const stat = rep.estatisticas;
  const d = new Date(rep.dataGeracao || Date.now());
  const dataFmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const falhas = (rep.resultados || []).filter(r => r.aplicavel && !r.conforme);
  const falhasBody = falhas.length === 0
    ? [[
        { text: '—', alignment: 'center', color: '#94a3b8' },
        { text: 'Nenhuma inconformidade identificada.', italics: true, color: '#059669', colSpan: 3 }, {}, {}
      ]]
    : falhas.map(r => {
        const bg = r.severidade === 'CRITICA' ? '#fee2e2' : r.severidade === 'MEDIA' ? '#fef3c7' : '#e0f2fe';
        const fg = r.severidade === 'CRITICA' ? '#991b1b' : r.severidade === 'MEDIA' ? '#92400e' : '#075985';
        return [
          { text: r.severidade, fillColor: bg, color: fg, bold: true, fontSize: 7.5, alignment: 'center' },
          {
            stack: [
              { text: `[${r.id}] ${r.nome}`, bold: true, fontSize: 8.5 },
              { text: r.mensagemFalha, fontSize: 8, color: '#475569', margin: [0, 2, 0, 2] },
              { text: `→ ${r.recomendacao}`, fontSize: 7.5, color: '#0f766e', italics: true },
            ]
          },
          { text: r.fundamento, fontSize: 7, color: '#0284c7', italics: true },
        ];
      });

  const parecerTexto = rep.statusGeral === 'aprovado'
    ? 'APROVADO — Processo apto ao prosseguimento.'
    : rep.statusGeral === 'requer-correcoes'
      ? 'APROVADO COM RESSALVAS — Saneamento prévio necessário.'
      : 'REJEITADO / DEVOLVIDO — Vícios relevantes impedem o prosseguimento.';

  const corParecer = rep.statusGeral === 'aprovado' ? '#d1fae5'
                   : rep.statusGeral === 'requer-correcoes' ? '#fef3c7' : '#fee2e2';

  return {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1e293b', lineHeight: 1.35 },
    header: (p) => p === 1 ? null : {
      margin: [40, 20, 40, 0],
      columns: [
        { text: 'LicitaAudit · Relatório de Auditoria', fontSize: 7.5, color: '#94a3b8' },
        { text: (rep.auditoria.orgao || '').toUpperCase(), fontSize: 7.5, color: '#94a3b8', alignment: 'right' },
      ],
    },
    footer: (p, n) => ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: 'Documento gerado pelo LicitaAudit · Lei nº 14.133/2021', fontSize: 7, color: '#94a3b8' },
        { text: `Página ${p} de ${n}`, fontSize: 7, color: '#94a3b8', alignment: 'right' },
      ],
    }),
    content: [
      { columns: [
        { width: 55, table: { body: [[{ text: 'LA', color: 'white', bold: true, fontSize: 22, alignment: 'center', fillColor: '#1e3a8a', margin: [0, 8, 0, 8] }]] }, layout: 'noBorders' },
        { width: '*', stack: [
          { text: (rep.auditoria.orgao || 'ÓRGÃO / ENTIDADE PÚBLICA').toUpperCase(), fontSize: 13, bold: true, color: '#0f172a' },
          { text: 'SISTEMA LICITAAUDIT — AUDITORIA DE CONFORMIDADE', fontSize: 8.5, color: '#64748b', characterSpacing: 0.5 },
          { text: 'Base normativa: Lei nº 14.133/2021', fontSize: 8, color: '#94a3b8', italics: true },
        ], margin: [14, 4, 0, 0] },
      ]},
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#1e3a8a' }], margin: [0, 12, 0, 0] },
      { text: 'RELATÓRIO DE AUDITORIA E CONFORMIDADE LICITATÓRIA', fontSize: 12, bold: true, alignment: 'center', color: '#0f172a', margin: [0, 16, 0, 2] },
      { text: `Nº ${rep.numeroRelatorio}  ·  ${dataFmt}`, fontSize: 9, alignment: 'center', color: '#64748b', margin: [0, 0, 0, 8] },
      { text: `Documento: ${rep.nomeArquivo}`, fontSize: 9, alignment: 'center', color: '#475569', margin: [0, 0, 0, 16] },

      { table: { widths: ['32%', '68%'], body: [
        [{ text: 'Nº do Processo', style: 'ml' }, { text: rep.auditoria.processo, style: 'mv' }],
        [{ text: 'Órgão / Entidade', style: 'ml' }, { text: rep.auditoria.orgao, style: 'mv' }],
        [{ text: 'Objeto', style: 'ml' }, { text: id.objeto, style: 'mv' }],
        [{ text: 'Modalidade', style: 'ml' }, { text: id.modalidade, style: 'mv' }],
        [{ text: 'Grau de Conformidade', style: 'ml' }, { stack: [
          { text: `${rep.score}%`, bold: true, fontSize: 13, color: cor },
          { canvas: [
            { type: 'rect', x: 0, y: 0, w: 200, h: 5, r: 2.5, color: '#e2e8f0' },
            { type: 'rect', x: 0, y: 0, w: 200 * rep.score / 100, h: 5, r: 2.5, color: cor },
          ], margin: [0, 4, 0, 0] },
        ]}],
        [{ text: 'Regras aplicáveis', style: 'ml' }, { text: `${stat.aplicaveis} de ${stat.total}`, style: 'mv' }],
        [{ text: 'Nível de Risco', style: 'ml' }, { text: risco.nivel, color: cor, bold: true, fontSize: 11 }],
      ]},
      layout: {
        fillColor: (i) => i % 2 === 0 ? '#f8fafc' : '#ffffff',
        hLineWidth: (i, n) => (i === 0 || i === n.table.body.length) ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#e2e8f0',
        paddingTop: () => 7, paddingBottom: () => 7, paddingLeft: () => 10, paddingRight: () => 10,
      }, margin: [0, 0, 0, 16] },

      { table: { widths: ['*'], body: [[{ stack: [
        { text: 'PARECER FINAL', fontSize: 8, bold: true, color: '#64748b', characterSpacing: 0.5 },
        { text: parecerTexto, fontSize: 11, bold: true, color: cor, margin: [0, 4, 0, 4] },
        { text: risco.descricao, fontSize: 9, color: '#334155', italics: true },
      ], margin: [12, 12, 12, 12], fillColor: corParecer }]] }, layout: 'noBorders', margin: [0, 0, 0, 16] },

      { text: '1. QUADRO DE NÃO CONFORMIDADES', style: 'st' },
      { table: {
        headerRows: 1, dontBreakRows: true,
        widths: ['10%', '65%', '25%'],
        body: [
          [
            { text: 'GRAU', style: 'th', alignment: 'center' },
            { text: 'ACHADO + RECOMENDAÇÃO', style: 'th' },
            { text: 'FUNDAMENTO LEGAL', style: 'th' },
          ],
          ...falhasBody,
        ],
      }, layout: {
        fillColor: (i) => i === 0 ? '#1e293b' : null,
        hLineWidth: () => 0.4, vLineWidth: () => 0.4,
        hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1',
        paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 7, paddingRight: () => 7,
      }, margin: [0, 0, 0, 16] },

      { table: { dontBreakRows: true, widths: ['*'], body: [[{ stack: [
        { text: ' ', margin: [0, 20, 0, 0] },
        { canvas: [{ type: 'line', x1: 130, y1: 0, x2: 385, y2: 0, lineWidth: 0.8, lineColor: '#334155' }] },
        { text: 'Equipe de Auditoria de Controle Interno', fontSize: 10, bold: true, alignment: 'center', margin: [0, 6, 0, 2] },
        { text: 'Agente de Auditoria · LicitaAudit', fontSize: 9, alignment: 'center', color: '#475569' },
        { text: (rep.auditoria.orgao || '').toUpperCase(), fontSize: 8.5, alignment: 'center', color: '#64748b', italics: true, margin: [0, 2, 0, 0] },
      ], margin: [0, 10, 0, 10] }]] }, layout: 'noBorders', margin: [0, 20, 0, 0] },
    ],
    styles: {
      ml: { fontSize: 8.5, bold: true, color: '#475569' },
      mv: { fontSize: 9, color: '#0f172a' },
      st: { fontSize: 11, bold: true, color: '#0f172a', margin: [0, 12, 0, 6] },
      th: { fontSize: 8, bold: true, color: '#ffffff' },
    },
  };
}

function exportarPDFArquivo(arq) {
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  const dd = _buildDocDefinition(arq, arq.identificacao);
  const safe = String(arq.nomeArquivo || 'arquivo').replace(/[/\\?%*:|"<>]/g, '_');
  try {
    pdfMake.createPdf(dd).download(`Relatorio_${safe}.pdf`);
    toast('PDF individual gerado.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Erro ao gerar PDF.', 'error');
  }
}

function exportarPDFProcesso(proc) {
  if (!proc._consolidado) { toast('Processo sem arquivos analisados.', 'error'); return; }
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  const dd = _buildDocDefinition(proc._consolidado, proc._consolidado.identificacao);
  const safe = String(proc.nome || 'processo').replace(/[/\\?%*:|"<>]/g, '_');
  try {
    pdfMake.createPdf(dd).download(`Relatorio_Processo_${safe}.pdf`);
    toast('PDF consolidado gerado.', 'ok');
  } catch (err) {
    console.error(err);
    toast('Erro ao gerar PDF.', 'error');
  }
}

function exportarPDFTodosProcessos() {
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  if (!state.processos.length) { toast('Nenhum processo para exportar.', 'error'); return; }

  const partes = state.processos.filter(p => p._consolidado);
  if (!partes.length) { toast('Nenhum processo com análise consolidada.', 'error'); return; }

  // Concatena todos os documentos num único PDF (pdfMake suporta múltiplas páginas)
  const contents = [];
  partes.forEach((p, idx) => {
    const dd = _buildDocDefinition(p._consolidado, p._consolidado.identificacao);
    if (idx > 0) contents.push({ text: '', pageBreak: 'before' });
    contents.push(...dd.content);
  });

  const ddFinal = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1e293b', lineHeight: 1.35 },
    footer: (p, n) => ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: 'LicitaAudit · Lote de Processos · Lei nº 14.133/2021', fontSize: 7, color: '#94a3b8' },
        { text: `Página ${p} de ${n}`, fontSize: 7, color: '#94a3b8', alignment: 'right' },
      ],
    }),
    content: contents,
  };

  try {
    pdfMake.createPdf(ddFinal).download(`LicitaAudit_Lote_${Date.now()}.pdf`);
    toast(`${partes.length} processo(s) exportado(s) em PDF único.`, 'ok');
  } catch (err) {
    console.error(err);
    toast('Erro ao gerar PDF em lote.', 'error');
  }
}

/* ==========================================================================
 * 16. EXPORTAÇÃO / IMPORTAÇÃO JSON
 * ======================================================================== */
function exportarJSON() {
  const payload = {
    ferramenta: 'LicitaAudit',
    versao: '6.0.0',
    exportadoEm: new Date().toISOString(),
    processos: state.processos.map(p => ({
      id: p.id,
      nome: p.nome,
      cor: p.cor,
      tags: p.tags,
      arquivos: p.arquivos.filter(a => a.status === 'ok').map(a => ({
        id: a.id,
        nomeArquivo: a.nomeArquivo,
        ext: a.ext,
        tamanho: a.tamanho,
        score: a.score,
        risco: a.risco,
        statusGeral: a.statusGeral,
        identificacao: a.identificacao,
        auditoria: a.auditoria,
        estatisticas: a.estatisticas,
        resultados: a.resultados,
        correcoes: a.correcoes,
        texto: a.texto ? a.texto.slice(0, 200000) : '', // limita a 200 KB por arquivo
      })),
      _consolidado: p._consolidado,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `licitaudit-workspaces-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Estrutura JSON exportada.', 'ok');
}

async function importarJSON(file) {
  try {
    const texto = await file.text();
    const dados = JSON.parse(texto);
    if (!dados.processos || !Array.isArray(dados.processos)) {
      toast('Arquivo JSON inválido.', 'error');
      return;
    }
    state.processos = dados.processos.map(p => ({
      ...p,
      arquivos: (p.arquivos || []).map(a => ({ ...a, status: 'ok' })),
    }));
    renderGrid();
    toast(`${state.processos.length} processo(s) carregado(s).`, 'ok');
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar JSON.', 'error');
  }
}

/* ==========================================================================
 * 17. TEMA
 * ======================================================================== */
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
 * 18. EXEMPLO
 * ======================================================================== */
function carregarExemplo() {
  const exemploA = `PROCESSO ADMINISTRATIVO: 00000.004512/2026-88
MODALIDADE: Pregão Eletrônico
OBJETO: Aquisição de Workstations e Notebooks para modernização do parque tecnológico.

1. JUSTIFICATIVA DA NECESSIDADE
A presente demanda visa atender a necessidade de modernização do parque tecnológico, garantindo eficiência e economicidade.

2. ESTIMATIVA DE QUANTIDADES
30 (trinta) workstations e 20 (vinte) notebooks.

3. PESQUISA DE PREÇOS
Foram consultados o Painel de Preços, contratações similares e fornecedores do ramo.

4. DOTAÇÃO ORÇAMENTÁRIA
Programa de trabalho 12.345.6789.0001 com dotação orçamentária específica.

5. ETP e TR
O Estudo Técnico Preliminar (ETP) e o Termo de Referência (TR) seguem anexos. Especificações deste Edital detalhadas.

6. PARCELAMENTO
Optou-se pelo parcelamento em 2 lotes por compatibilidade técnica.

7. VEDAÇÕES
Vedada a indicação de marca ou modelo. Vedada a participação de servidores do órgão. Exigência de declaração de trabalho infantil.

8. HABILITAÇÃO
Qualificação técnica compatível. Aceita declaração formal em substituição à vistoria.

9. CRITÉRIO DE JULGAMENTO
Menor preço.

10. PRAZOS E PUBLICAÇÃO
Prazo mínimo de 8 (oito) dias úteis. Publicação no PNCP e no Diário Oficial. Impugnação em fase única com 3 dias úteis.

11. GESTÃO CONTRATUAL
Fiscal titular e fiscal substituto designados. Gestor do contrato designado. Recebimento provisório e definitivo. Pagamento em até 30 dias após aceite. Sanções administrativas previstas.`;

  const p1 = criarProcesso('Processo A — Aquisição de TI');
  p1.cor = CORES_PRESET[0];
  p1.tags = ['TI', 'Urgente', '2026'];
  p1._exemploTexto = exemploA;

  const p2 = criarProcesso('Processo B — Manutenção Predial');
  p2.cor = CORES_PRESET[2];
  p2.tags = ['Predial', 'Contínuo'];

  // Analisa o exemplo A como arquivo único
  (async () => {
    const res = analisarTextoIndividual(exemploA, { paramObjeto: 'auto', paramModalidade: 'auto', paramCriterio: 'auto' });
    p1.arquivos.push({
      id: uid('arq'),
      nomeArquivo: 'Edital_Pregao_00000.004512-2026.txt',
      ext: 'txt',
      tamanho: new Blob([exemploA]).size,
      texto: exemploA,
      status: 'ok',
      score: res.score,
      statusGeral: res.statusGeral,
      risco: res.auditoria.risco,
      riscoInfo: res.auditoria.riscoInfo,
      identificacao: res.identificacao,
      auditoria: res.auditoria,
      estatisticas: res.estatisticas,
      resultados: res.resultados,
      correcoes: res.correcoes,
    });
    recalcularConsolidadoDoProcesso(p1);
    renderGrid();
    toast('Exemplo carregado.', 'ok');
  })();
}

/* ==========================================================================
 * 19. EVENTOS E BOOTSTRAP
 * ======================================================================== */
function bindEventosGlobais() {
  els.btnNovoProcesso.addEventListener('click', () => {
    criarProcesso(`Processo ${state.processos.length + 1}`);
    toast('Processo criado.', 'ok');
  });

  els.btnCarregarExemplo.addEventListener('click', carregarExemplo);

  els.themeToggle.addEventListener('click', toggleTheme);

  els.pdfAllBtn.addEventListener('click', exportarPDFTodosProcessos);
  els.jsonBtn.addEventListener('click', exportarJSON);
  els.jsonLoadBtn.addEventListener('click', () => els.jsonLoadInput.click());
  els.jsonLoadInput.addEventListener('change', e => {
    if (e.target.files?.[0]) importarJSON(e.target.files[0]);
    e.target.value = '';
  });

  // Modal
  els.modalDetalhes.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', fecharModal);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.modalDetalhes.classList.contains('is-hidden')) fecharModal();
  });

  // Recalcular consolidado quando parâmetros mudarem
  ['paramObjeto', 'paramModalidade', 'paramCriterio'].forEach(id => {
    els[id].addEventListener('change', () => {
      state.processos.forEach(p => {
        if (p.arquivos.length) {
          p.arquivos.forEach(a => {
            if (a.status === 'ok' && a.texto) {
              const res = analisarTextoIndividual(a.texto, {
                paramObjeto: els.paramObjeto.value,
                paramModalidade: els.paramModalidade.value,
                paramCriterio: els.paramCriterio.value,
              });
              a.score = res.score;
              a.statusGeral = res.statusGeral;
              a.risco = res.auditoria.risco;
              a.riscoInfo = res.auditoria.riscoInfo;
              a.identificacao = res.identificacao;
              a.auditoria = res.auditoria;
              a.estatisticas = res.estatisticas;
              a.resultados = res.resultados;
              a.correcoes = res.correcoes;
            }
          });
          recalcularConsolidadoDoProcesso(p);
        }
      });
      renderGrid();
      toast('Parâmetros atualizados.', 'ok');
    });
  });
}

function bootstrap() {
  initTheme();
  configurePdfWorker();
  bindEventosGlobais();
  renderGrid();
  console.info(
    '%cLicitaAudit',
    'background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
    '· v6.0.0 · Workspaces por Processo · 30 verificações · multi-arquivo'
  );
}
document.addEventListener('DOMContentLoaded', bootstrap);
