/* ============================================================================
 * LicitaAudit · app.js — v7.3
 * ----------------------------------------------------------------------------
 * • Requerimentos LicitaReq em seção dedicada + botão "Ver Conteúdo"
 * • Visualizador de texto em modal com scroll
 * • Auditoria híbrida · Notas · Critérios · Matriz dinâmica · PDFs
 * ========================================================================== */
'use strict';

/* ==========================================================================
 * 1. ESTADO E DOM
 * ======================================================================== */
const state = { processos: [], ativo: null };

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const els = {
  btnNovoProcesso: $('#btnNovoProcesso'), btnNovoProcessoEmpty: $('#btnNovoProcessoEmpty'),
  btnCarregarExemplo: $('#btnCarregarExemplo'), tabsProcessos: $('#tabsProcessos'),
  emptyState: $('#emptyState'), workspace: $('#workspace'), subtitle: $('#topbarSubtitle'),
  themeToggle: $('#themeToggle'),
  paramObjeto: $('#paramObjeto'), paramModalidade: $('#paramModalidade'), paramCriterio: $('#paramCriterio'),
  pdfAllBtn: $('#pdfAllBtn'), jsonBtn: $('#jsonBtn'), jsonLoadBtn: $('#jsonLoadBtn'),
  jsonLoadInput: $('#jsonLoadInput'), loader: $('#loader'), loaderText: $('#loaderText'),
  toast: $('#toast'),
  modal: $('#modal'), modalTitulo: $('#modalTitulo'), modalBody: $('#modalBody'),
  modalCriterios: $('#modalCriterios'), modalCriteriosTitulo: $('#modalCriteriosTitulo'), modalCriteriosBody: $('#modalCriteriosBody'),
  modalVisualizador: $('#modalVisualizador'), modalVizTitulo: $('#modalVizTitulo'),
  viewerFileName: $('#viewerFileName'), viewerFileInfo: $('#viewerFileInfo'), viewerText: $('#viewerText'),
  btnCopiarTextoArq: $('#btnCopiarTextoArq'),
  sidebar: $('#sidebar'), sidebarToggle: $('#sidebarToggle'), sidebarOverlay: $('#sidebarOverlay'),
};

/* ==========================================================================
 * 2. CONSTANTES E UTILITÁRIOS
 * ======================================================================== */
const LIMITE_DISPENSA_BENS_SERVICOS = 50000.00;
const LIMITE_DISPENSA_OBRAS = 100000.00;
const PESOS = { CRITICA: 5, MEDIA: 2, BAIXA: 0.5 };
const CORES_PRESET = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#64748b'];
const AVISO_ORIENTATIVO = 'Nota: Os percentuais de conformidade possuem caráter orientativo e indicativo, servindo prioritariamente para identificar pontos e requisitos indispensáveis da instrução processual. A conferência humana e detalhada dos autos permanece obrigatória.';

const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const extOf = (n) => (n.split('.').pop() || '').toLowerCase();
const formatBytes = (b) => {
  if (!b) return '0 B';
  const u = ['B','KB','MB','GB'], i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const truncate = (n, max = 34) => {
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

function toast(msg, kind = 'ok') {
  clearTimeout(toast._t);
  els.toast.textContent = msg;
  els.toast.dataset.kind = kind;
  els.toast.classList.remove('is-hidden');
  requestAnimationFrame(() => els.toast.classList.add('is-visible'));
  toast._t = setTimeout(() => {
    els.toast.classList.remove('is-visible');
    setTimeout(() => els.toast.classList.add('is-hidden'), 250);
  }, 4200);
}
function showLoader(t) { els.loaderText.textContent = t || 'Processando…'; els.loader.classList.remove('is-hidden'); }
function hideLoader() { els.loader.classList.add('is-hidden'); }

/* ==========================================================================
 * 3. BASE DE CONHECIMENTO
 * ======================================================================== */
const KB = {
  sinaisModalidade: {
    pregao: /\bpreg[aã]o(\s+eletr[oô]nico)?\b/i,
    concorrencia: /\bconcorr[eê]ncia\b/i,
    concurso: /\bconcurso\b/i,
    leilao: /\bleil[aã]o\b/i,
    dialogo: /\bdi[aá]logo\s+competitivo\b/i,
    dispensa: /\bdispensa\b/i,
    inexigibilidade: /\binexigibilidade\b/i,
  },
  orcamento: [/\bestimativa\s+de\s+valor\b/i, /\bvalor\s+(estimado|global|total)\b/i, /R\$\s*[\d.,]+/i],
  alienacao: /aliena[cç][aã]o|venda\s+de\s+bens|inserv[íi]ve(is|l)|desfazimento|maior\s+lance/i,
  emergencia: /emerg[êe]ncial?|emerg[êe]ncia|calamidade|desastre|defesa\s+civil/i,
  tic: /(\bsoftware\b|cloud|datacenter|licen[cç]a\s+de\s+software|help\s*desk|service\s*desk|consultoria\s+em\s+ti|desenvolvimento\s+de\s+sistema|\berp\b|aplicativo\s+m[óo]vel|nuvem)/i,
  tiEquipamentos: /(computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|servidor(es)?|switch(es)?|roteador(es)?|firewall(s)?|nobreak|estabilizador|hd\s+externo|ssd|mem[óo]ria\s+ram|processador|placa\s+de\s+v[íi]deo|mouse|teclado|webcam|tablet(s)?)/i,
  obra: /(obra(s)?|engenharia|reforma|constru[cç][aã]o|pavimenta|saneamento|drenagem|edifica|estrutural)/i,
  tecnicos: /(consultoria|assessoria\s+t[eé]cnica|parecer\s+t[eé]cnico|auditoria|per[íi]cia|laudo|engenharia\s+consultiva)/i,
  comuns: /(material\s+de\s+escrit[oó]rio|material\s+de\s+expediente|papel\s+a4|caneta|t[oô]ner|cartucho|l[ií]mp[eê]za|higiene|aliment[ií]cio|uniforme|mobili[aá]rio|cadeira|mesa|vigil[aâ]ncia|combust[íi]vel)/i,
  empresa: /\b[A-ZÀ-Ú][\wÀ-ú&.'-]*(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú&.'-]*|de|da|do|das|dos|e)){1,6}\s+(?:Ltda\.?|LTDA\.?|S\.A\.?|S\/A|ME|EIRELI|EPP)\b/,
};
const firstMatch = (text, rx) => {
  for (const r of rx) { const m = text.match(r); if (m) return m; }
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
    if (/leil[aã]o/i.test(v))                return { chave:'leilao',          rotulo:'Leilão' };
    if (/inexigibilidade/i.test(v))          return { chave:'inexigibilidade', rotulo:'Inexigibilidade' };
    if (/dispensa/i.test(v))                 return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
    if (/di[aá]logo\s+competitivo/i.test(v)) return { chave:'dialogo',         rotulo:'Diálogo Competitivo' };
    if (/concurso/i.test(v))                 return { chave:'concurso',        rotulo:'Concurso' };
  }
  if (KB.sinaisModalidade.inexigibilidade.test(corpus)) return { chave:'inexigibilidade', rotulo:'Inexigibilidade' };
  if (KB.sinaisModalidade.dispensa.test(corpus))        return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
  if (KB.sinaisModalidade.dialogo.test(corpus))         return { chave:'dialogo',         rotulo:'Diálogo Competitivo' };
  if (KB.sinaisModalidade.concurso.test(corpus))        return { chave:'concurso',        rotulo:'Concurso' };
  if (KB.sinaisModalidade.leilao.test(corpus))          return { chave:'leilao',          rotulo:'Leilão' };
  if (KB.sinaisModalidade.pregao.test(corpus))          return { chave:'pregao',          rotulo:'Pregão Eletrônico' };
  if (KB.sinaisModalidade.concorrencia.test(corpus))    return { chave:'concorrencia',    rotulo:'Concorrência' };
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
  const RX1 = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]*\\s*\\n+([^\\n#]{3,600})`, 'i');
  const RX2 = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]+\\s*([^\\n#]{3,600})`, 'i');
  const RX3 = /(objeto|natureza\s+do\s+objeto|objeto\s+predominante)[\s:]+([^.\n]+)/i;
  const m = firstMatch(corpus, [RX1, RX2, RX3]);
  if (!m) return { texto: '', tipo: 'Não identificado' };
  const texto = (m[1] || m[2] || '').replace(/^[\s\-–—:.,;]+/, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  return { texto, tipo: classificarObjeto(texto) };
}
function extrairProcesso(corpus) {
  const rx = /(processo|pa|prt|protocolo|unitau|edital|memorando|of[íi]cio|requerimento)[\s\wºnº\.:\/-]*?(\d{3,}[\d\/\.\-]+)/i;
  const m = corpus.match(rx);
  if (m && m[2]) {
    const rotulo = m[1].trim();
    return `${rotulo.charAt(0).toUpperCase() + rotulo.slice(1).toLowerCase()} ${m[2].trim()}`.replace(/\s+/g, ' ').slice(0, 80);
  }
  const fb = corpus.match(/\b(\d{2,}[\.\/]\d{2,}[\.\/\-\d]*)\b/);
  return fb ? fb[1] : 'Não identificado';
}
function extrairValor(corpus) {
  const m = corpus.match(/R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
  return m ? parseValorBR(m[1]) : 0;
}
function extrairOrgao(corpus) {
  const m = corpus.match(/\b(Minist[ée]rio|Prefeitura(?:\s+Municipal)?|Tribunal|Universidade|Instituto|C[âa]mara(?:\s+Municipal)?|Secretaria|Funda[cç][aã]o|Autarquia|Departamento|Coordenadoria|Diretoria)[^\n,.;]{0,80}/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : 'ÓRGÃO / ENTIDADE PÚBLICA';
}
function extrairCriterio(corpus) {
  const m = {
    'menor-preco':    /\bmenor\s+pre[cç]o\b/i,
    'maior-desconto': /\bmaior\s+desconto\b/i,
    'melhor-tecnica': /\bmelhor\s+t[eé]cnica\b|conte[uú]do\s+art[íi]stico/i,
    'tecnica-preco':  /\bt[eé]cnica\s+e\s+pre[cç]o\b/i,
    'maior-lance':    /\bmaior\s+lance\b/i,
    'maior-retorno':  /\bmaior\s+retorno/i,
  };
  for (const [k, rx] of Object.entries(m)) if (rx.test(corpus)) return k;
  return 'indefinido';
}
function labelModalidade(chave) {
  return {
    pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência', concurso: 'Concurso',
    leilao: 'Leilão', dialogo: 'Diálogo Competitivo',
    dispensa: 'Dispensa de Licitação', inexigibilidade: 'Inexigibilidade de Licitação',
  }[chave] || 'Não identificada';
}
function labelNatureza(chave) {
  return {
    bens: 'Bens comuns', 'servicos-comuns': 'Serviços comuns',
    'servicos-especiais': 'Serviços especiais', obras: 'Obras e serviços de engenharia',
    intelectual: 'Serviços técnicos intelectuais', alienacao: 'Alienação de bens / Concessão',
  }[chave] || 'Não identificada';
}
function labelCriterio(chave) {
  return {
    'menor-preco': 'Menor preço', 'maior-desconto': 'Maior desconto',
    'melhor-tecnica': 'Melhor técnica ou conteúdo artístico',
    'tecnica-preco': 'Técnica e preço', 'maior-lance': 'Maior lance',
    'maior-retorno': 'Maior retorno econômico',
  }[chave] || 'Indefinido';
}
function classificarNatureza(corpus, forcar = 'auto') {
  if (forcar && forcar !== 'auto') return labelNatureza(forcar);
  const t = corpus || '';
  if (KB.alienacao.test(t))      return 'Alienação de bens / Concessão';
  if (KB.obra.test(t))           return 'Obras e serviços de engenharia';
  if (KB.tecnicos.test(t))       return 'Serviços técnicos intelectuais';
  if (KB.tic.test(t))            return 'Tecnologia da Informação (TIC)';
  if (KB.tiEquipamentos.test(t)) return 'Bens e serviços comuns';
  if (KB.comuns.test(t))         return 'Bens e serviços comuns';
  return 'Bens e serviços comuns';
}
function classificarTipoObjeto(meta) {
  const texto = [meta?.objeto?.texto || '', meta?.objetoField || ''].join(' ').toLowerCase();
  const nat   = (meta?.natureza || '').toLowerCase();
  const eBens = /(aquisi[cç][aã]o\s+de\s+bens|compra\s+de\s+bens|fornecimento\s+de\s+bens|equipament|material\s+de|computador(es)?|notebook(s)?|workstation(s)?|monitor(es)?|impressora(s)?|mobili[aá]rio|ve[ií]culo(s)?|uniforme(s)?|medicament(o|os)|reativo|insumo|material|l[aâ]mpada)/i.test(texto);
  const eServicos = /(presta[cç][aã]o\s+de\s+servi|contrata[cç][aã]o\s+de\s+servi|servi[cç]os?\s+de|manuten[cç][aã]o|suporte\s+t[eé]cnico|consultoria|assessoria|treinamento|limpeza|vigil[aâ]ncia)/i.test(texto);
  if (eBens && !eServicos) return 'bens';
  if (eServicos && !eBens) return 'servicos';
  if (/aquisic|bens/.test(nat)) return 'bens';
  if (/servic/.test(nat))       return 'servicos';
  return 'servicos';
}
function ehObjetoEngenharia(meta, natureza, corpus) {
  const blob = [meta?.objeto?.texto || '', meta?.objeto?.tipo || '', natureza || ''].join(' ');
  if (/(obra|engenharia|reforma|constru[cç][aã]o|pavimenta)/i.test(blob)) return true;
  return /(obra\s+p[uú]blica|servi[cç]os?\s+de\s+engenharia|reforma\s+predial|pavimenta[cç][aã]o)/i.test(corpus);
}
function ehObjetoBens(c) {
  const tipo = (c.meta?.tipoObjeto || '').toLowerCase();
  const nat = (c.natureza || '').toLowerCase();
  const mod = (c.modalidade?.modalidade || '').toLowerCase();
  return tipo === 'bens' || /bens|material|equipament|computador|notebook|impressora|insumo|reativo|medicament|l[aâ]mpada/i.test(nat) || mod.includes('pregão');
}
function ehObjetoAlienacao(c) { return /aliena/i.test(c.natureza || '') || /leil[aã]o/i.test(c.modalidade?.modalidade || ''); }
function ehObjetoConcurso(c) { return /concurso/i.test(c.modalidade?.modalidade || ''); }
function ehObjetoInexigibilidade(c) { return /inexigibilidade/i.test(c.modalidade?.modalidade || ''); }
function ehObjetoDispensa(c) { return /dispensa/i.test(c.modalidade?.modalidade || ''); }
function ehObjetoDialogo(c) { return /di[aá]logo/i.test(c.modalidade?.modalidade || ''); }
function ehObjetoServicoIntelectual(c) {
  const blob = [c.natureza || '', c.meta?.objeto?.tipo || '', c.meta?.objeto?.texto || ''].join(' ').toLowerCase();
  return /(intelectual|consultoria|assessoria|parecer\s+t[eé]cnico|auditoria|advocat|jur[íi]dic|not[óo]ria\s+especializa|cient[íi]fic)/i.test(blob);
}

/* ==========================================================================
 * 5. PARSER LICITAREQ
 * ======================================================================== */
const LICITAREQ_SIGNATURES = [
  /licitareq/i,
  /requerimento[_\s-]*licitareq/i,
  /despacho[_\s-]*triagem/i,
  /motor\s+de\s+regras\s+—\s+lei\s+n[º°]?\s*14\.?133/i,
  /documento\s+gerado\s+eletronicamente\s+pelo\s+sistema\s+licitareq/i,
];
const LICITAREQ_KEYWORDS = {
  unidade:    /(?:unidade\s+requisitante|setor\s+requisitante|remetente|origem)\s*[:\-–—]\s*([^\n]{3,90})/i,
  valor:      /R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i,
  objeto:     /(?:objeto|assunto)\s*[:\-–—]\s*([^\n]{6,200})/i,
  objetoFull: /(?:objeto|assunto)\s*[:\\-–—]\s*([\s\S]{6,600}?)(?=\n\s*\n|\n\s*\d+\.|\n\s*---|$)/i,
  emergencia: /(emerg[êe]ncial?|calamidade|desastre|risco\s+iminente|paralisa[çc][ãa]o)/i,
  inexigib:   /(inexigibilidade|not[óo]ria\s+especializa|exclusividade|inviabilidade\s+de\s+competi)/i,
  direc:      /(?:empresa|fornecedor|contrata[çc][aã]o\s+d[aeo]|junto\s+[àa])\s+([A-ZÀ-Ú][\wÀ-ú&.'-]*(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú&.'-]*|de|da|do|e)){0,6}(?:\s+(?:Ltda\.?|S\.A\.?|ME|EIRELI|EPP))?)/i,
};

function ehArquivoLicitaReq(nomeArquivo, texto = '') {
  if (LICITAREQ_SIGNATURES.some(rx => rx.test(nomeArquivo))) return true;
  if (!texto) return false;
  return LICITAREQ_SIGNATURES.some(rx => rx.test(texto));
}

function parseLicitaReq(texto) {
  const out = {
    licitareq: true,
    unidade: '', processo: '', valorTexto: '', valor: 0,
    objeto: '', empresa: '',
    emergencia: false, inexigibilidade: false,
  };
  const mU = texto.match(LICITAREQ_KEYWORDS.unidade);
  if (mU) out.unidade = mU[1].trim().slice(0, 120);

  const mP = texto.match(/(memorando|of[íi]cio|processo|requerimento|expediente|dfd|documento\s+de\s+formaliza[çc][aã]o)\s*(?:n[º°.]?|n[úu]mero)?\s*([\d][\d.\/\-\w]*)/i);
  if (mP) out.processo = `${mP[1]} nº ${mP[2]}`.replace(/\s+/g, ' ').slice(0, 80);

  const mV = texto.match(LICITAREQ_KEYWORDS.valor);
  if (mV) { out.valorTexto = `R$ ${mV[1]}`; out.valor = parseValorBR(mV[1]); }

  const mO = texto.match(LICITAREQ_KEYWORDS.objetoFull) || texto.match(LICITAREQ_KEYWORDS.objeto);
  if (mO) out.objeto = mO[1].replace(/\s+/g, ' ').trim().slice(0, 220);

  const mD = texto.match(LICITAREQ_KEYWORDS.direc);
  if (mD) out.empresa = mD[1].trim().slice(0, 100);

  out.emergencia = LICITAREQ_KEYWORDS.emergencia.test(texto);
  out.inexigibilidade = LICITAREQ_KEYWORDS.inexigib.test(texto);
  return out;
}

/* ==========================================================================
 * 6. MATRIZ UNIFICADA — 30 CHECKPOINTS DINÂMICOS
 * ======================================================================== */
const BLOCO_TITULO = {
  1: 'Planejamento e Justificativa',
  2: 'Recursos e Estimativa de Preços',
  3: 'Vedações e Integridade',
  4: 'Modalidade e Enquadramento',
  5: 'Prazos e Publicidade',
  6: 'Fiscalização e Execução',
};

const MATRIZ_CORE_30 = [
  { id:'B1_01', bloco:1, nome:'Justificativa da necessidade', fundamento:'Art. 18, §1º, I', severidade:'CRITICA', aplicavel:()=>true, test:c=>/\b(justific|motiva|necessidade|interesse\s+p[uú]blico|finalidade)/i.test(c.corpus) || !!(c.licitareq && /(justific|necessidade|interesse)/i.test(c.licitareq.objeto||'')), mensagemFalha:'Justificativa não identificada.', recomendacao:'Elaborar seção com motivação fática e jurídica.' },
  { id:'B1_02', bloco:1, nome:'Descrição clara do objeto', fundamento:'Art. 18, §1º, II', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const tipo = c.meta.objeto.tipo || '';
      const lrObj = c.licitareq?.objeto || '';
      const chave = /(aquisi[cç][aã]o|fornecimento|presta[cç][aã]o|servi[çc]o|bem|material|equipament|software|obra|produto|insumo)/i.test(c.corpus);
      return tipo !== 'Não identificado' || chave || lrObj.length > 15;
    }, mensagemFalha:'Objeto insuficiente.', recomendacao:'Descrever com especificações precisas.' },
  { id:'B1_03', bloco:1, nome:'Estimativa de quantitativos', fundamento:'Art. 18, §1º, III', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(quantidade|qtd|\blotes?\b|\d+\s*(unid|un|pç|pc|cx|kg|l|m²|m³|resma|itens?)|\(\s*\d+\s*\))/i.test(c.corpus), mensagemFalha:'Quantitativos não explicitados.', recomendacao:'Apresentar planilha quantitativa.' },
  { id:'B1_04', bloco:1, nome:'ETP ou Termo de Referência', fundamento:'Art. 6º, XXIII e XXV', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(estudo\s+t[eé]cnico\s+preliminar|\bETP\b|termo\s+de\s+refer[eê]ncia|\bTR\b|projeto\s+b[aá]sico|\bPB\b|anteprojeto)/i.test(c.corpus), mensagemFalha:'Documento estruturante ausente.', recomendacao:'Anexar ETP e TR.' },
  { id:'B1_05', bloco:1, nome:'Decisão sobre parcelamento', fundamento:'Art. 47', severidade:'MEDIA',
    aplicavel: c => !ehObjetoAlienacao(c) && !ehObjetoConcurso(c) && !ehObjetoInexigibilidade(c),
    motivoNA: 'Regra não aplicável a alienações, concursos ou contratações diretas.',
    test: c => /(parcelament|divis[aã]o\s+em\s+lotes|indivis[íi]vel|lote\s+[uú]nico|n[aã]o\s+parcel)/i.test(c.corpus),
    mensagemFalha:'Sem decisão sobre parcelamento.', recomendacao:'Motivar parcelamento ou indivisibilidade.' },
  { id:'B1_06', bloco:1, nome:'Formalização da demanda (LicitaReq)', fundamento:'Art. 18, §§1º e 2º', severidade:'MEDIA',
    aplicavel: () => true,
    test: c => c.arquivo?.licitareq || /(documento\s+de\s+formaliza[çc][aã]o\s+de\s+demanda|\bDFD\b|memorando\s+n|requerimento)/i.test(c.corpus),
    mensagemFalha:'Formalização da demanda não identificada.', recomendacao:'Anexar DFD ou Memorando (Art. 18, §§1º e 2º).' },

  { id:'B2_01', bloco:2, nome:'Estimativa de valor', fundamento:'Art. 23', severidade:'CRITICA', aplicavel:()=>true, test:c=>c.meta.valor > 0 || firstMatch(c.corpus, KB.orcamento) || !!(c.licitareq?.valor > 0), mensagemFalha:'Estimativa de valor ausente.', recomendacao:'Elaborar planilha orçamentária.' },
  { id:'B2_02', bloco:2, nome:'Dotação orçamentária', fundamento:'Art. 18, §1º, V · Art. 150', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(dota[cç][aã]o|programa\s+de\s+trabalho|natureza\s+de\s+despesa|fonte\s+de\s+recurso|previs[aã]o\s+or[cç]ament)/i.test(c.corpus), mensagemFalha:'Dotação não indicada.', recomendacao:'Indicar dotação, programa e natureza.' },
  { id:'B2_03', bloco:2, nome:'Adequação orçamentária', fundamento:'Art. 150', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(\bLRF\b|responsabilidade\s+fiscal|\bLDO\b|adequa[cç][aã]o\s+or[cç]ament)/i.test(c.corpus), mensagemFalha:'Sem declaração de adequação.', recomendacao:'Declarar adequação orçamentária.' },
  { id:'B2_04', bloco:2, nome:'Limite de dispensa por valor', fundamento:'Art. 75, I e II', severidade:'CRITICA',
    aplicavel: c => ehObjetoDispensa(c),
    motivoNA: 'Regra restrita às dispensas (Art. 75).',
    test: c => {
      const obra = ehObjetoEngenharia(c.meta, c.natureza, c.corpus);
      const lim = obra ? LIMITE_DISPENSA_OBRAS : LIMITE_DISPENSA_BENS_SERVICOS;
      const valor = c.meta.valor || (c.licitareq?.valor ?? 0);
      if (!valor || valor <= 0) return false;
      return valor <= lim;
    }, mensagemFalha:'Valor acima do teto para dispensa.', recomendacao:'Reclassificar modalidade.' },
  { id:'B2_05', bloco:2, nome:'Referência SINAPI/SICRO (obras)', fundamento:'Art. 23, §2º', severidade:'MEDIA',
    aplicavel: c => ehObjetoEngenharia(c.meta, c.natureza, c.corpus),
    motivoNA: 'Aplicável exclusivamente a obras e engenharia.',
    test: c => /(SINAPI|SICRO|tabela\s+de\s+refer[eê]ncia|composi[cç][aã]o\s+de\s+custos)/i.test(c.corpus),
    mensagemFalha:'Sem referência SINAPI/SICRO.', recomendacao:'Comprovar compatibilidade com SINAPI/SICRO.' },

  { id:'B3_01', bloco:3, nome:'Vedação a direcionamento de marca', fundamento:'Art. 41, I', severidade:'CRITICA',
    aplicavel: c => ehObjetoBens(c) || !!c.licitareq,
    motivoNA: 'Vedação específica para aquisição de bens.',
    test: c => {
      const vA = /(vedad[ao]|proibid[ao]|sem|aus[êe]ncia)\s+.{0,80}?\b(marca|modelo|fabricante)\b/i.test(c.corpus);
      const vB = /(marca\s+exclusiva|indica[cç][aã]o\s+de\s+marca).{0,80}?\b(vedad[ao]|proibid[ao])/i.test(c.corpus);
      if (vA || vB) return true;
      const temMarca = /\b(marca|modelo|fabricante)\s*[:\-]\s*[A-ZÀ-Ú][\w-]{1,30}/i.test(c.corpus);
      if (!temMarca) return true;
      return /(padroniza|carta\s+de\s+exclusividade|justificativa\s+t[eé]cnica|not[óo]ria\s+especializa)/i.test(c.corpus);
    }, mensagemFalha:'Indicação de marca sem justificativa.', recomendacao:'Vedar ou justificar padronização (Art. 41, I).' },
  { id:'B3_02', bloco:3, nome:'Vedação à participação de servidores', fundamento:'Art. 14, I', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(servidores?|membros?\s+da\s+comiss[aã]o|art\.?\s*14|v[eé]dad[ao]\s+ao\s+servidor|impedimento\s+de\s+servidor)/i.test(c.corpus), mensagemFalha:'Sem vedação a servidores.', recomendacao:'Incluir cláusula (Art. 14, I).' },
  { id:'B3_03', bloco:3, nome:'Vedação a empresas sancionadas', fundamento:'Art. 14, III', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(\bceis\b|\bcnep\b|suspen[sa]|impedid[ao]|sancionad[ao]|inid[ôo]ne[ao]|art\.?\s*14)/i.test(c.corpus), mensagemFalha:'Sem vedação a empresas impedidas.', recomendacao:'Explicitar vedação (Art. 14, III).' },
  { id:'B3_04', bloco:3, nome:'Declaração sobre trabalho infantil', fundamento:'Art. 68, VI', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(infantil|menor(?:es)?\s+de\s+18|trabalho\s+noturno|perigoso|art\.?\s*68)/i.test(c.corpus), mensagemFalha:'Sem declaração.', recomendacao:'Exigir declaração (Art. 68, VI).' },
  { id:'B3_05', bloco:3, nome:'Qualificação técnica e vistoria', fundamento:'Arts. 63 e 67', severidade:'MEDIA', aplicavel:()=>true, test:c=>{
      if (/(exig[êe]ncia\s+excessiva|desproporcional|afunilad[ao])/i.test(c.corpus)) return false;
      const v = /(vistoria|visita\s+t[eé]cnica)/i.test(c.corpus);
      if (!v) return true;
      return /(declara[cç][aã]o\s+formal|substitui[cç][aã]o|dispensa\s+de\s+vistoria|art\.?\s*63)/i.test(c.corpus);
    }, mensagemFalha:'Vistoria sem alternativa.', recomendacao:'Permitir declaração (Art. 63).' },

  { id:'B4_01', bloco:4, nome:'Coerência modalidade × natureza', fundamento:'Art. 6º, XLI · Arts. 28 a 32', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      const nat = (c.natureza || '').toLowerCase();
      const obj = ((c.meta?.objeto?.texto || '') + ' ' + (c.meta?.objeto?.tipo || '')).toLowerCase();
      const blob = nat + ' ' + obj;
      if (mod.includes('pregão')) return /bens|comuns|servi[cç]|aquisi[cç]|fornecimento|ti\b|tic\b|equipament|computador|notebook|material|mobili|insumo|reativo|l[aâ]mpada/.test(blob);
      if (mod.includes('concorrência')) return /obra|engenharia|t[eé]cnic|intelectual|especializ|complexid/.test(blob);
      if (mod.includes('leilão')) return /aliena|inserv[íi]vel|desfazimento/.test(blob);
      if (mod.includes('concurso')) return /art[íi]stic|t[eé]cnic|intelectual|projeto|criativ/.test(blob);
      if (mod.includes('diálogo')) return /inova[cç][aã]o|complexid|tecnolog|especial/.test(blob);
      return true;
    }, mensagemFalha:'Modalidade incompatível.', recomendacao:'Reavaliar (Arts. 28 a 32).' },
  { id:'B4_02', bloco:4, nome:'Critério de julgamento compatível', fundamento:'Art. 33', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const crit = (c.criterio || '').toLowerCase();
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      const blob = [(c.natureza || ''), (c.meta?.objeto?.texto || '')].join(' ').toLowerCase();
      if (!crit || crit === 'indefinido') return false;
      if (mod.includes('leilão') && crit !== 'maior-lance') return false;
      if (mod.includes('concurso') && !/melhor-tecnica|tecnica-preco/.test(crit)) return false;
      if (/intelectual/.test(blob) && !/melhor-tecnica|tecnica-preco/.test(crit)) return false;
      if (/bens\s+comuns/.test(blob) && !/menor-preco|maior-desconto|maior-retorno/.test(crit)) return false;
      return true;
    }, mensagemFalha:'Critério incompatível.', recomendacao:'Declarar critério compatível (Art. 33).' },
  { id:'B4_03', bloco:4, nome:'Rito específico (Concurso/Leilão/Diálogo)', fundamento:'Arts. 30 a 32', severidade:'MEDIA',
    aplicavel: c => ehObjetoConcurso(c) || ehObjetoAlienacao(c) || ehObjetoDialogo(c),
    motivoNA: 'Aplicável a Concurso, Leilão e Diálogo.',
    test: c => {
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      if (mod.includes('leilão'))   return /(maior\s+lance|leiloeiro|edital\s+de\s+leil[aã]o)/i.test(c.corpus);
      if (mod.includes('concurso')) return /(comiss[aã]o|julgadora|banca|concurso)/i.test(c.corpus);
      if (mod.includes('diálogo'))  return /(comiss[aã]o|di[aá]logo|fase\s+de\s+di[aá]logo)/i.test(c.corpus);
      return true;
    }, mensagemFalha:'Rito não caracterizado.', recomendacao:'Documentar rito (Arts. 30 a 32).' },
  { id:'B4_04', bloco:4, nome:'Fundamento de contratação direta', fundamento:'Arts. 74 e 75', severidade:'CRITICA',
    aplicavel: c => ehObjetoInexigibilidade(c) || ehObjetoDispensa(c),
    motivoNA: 'Restrita às contratações diretas (Arts. 74 e 75).',
    test: c => {
      if (ehObjetoInexigibilidade(c)) return /(inviabilidade\s+de\s+competi|exclusividade|not[óo]ria\s+especializa|art\.?\s*74)/i.test(c.corpus);
      if (ehObjetoDispensa(c)) {
        const emerg = KB.emergencia.test(c.corpus);
        if (emerg) return /(risco\s+iminente|paralisa[cç][aã]o|art\.?\s*75,?\s*viii)/i.test(c.corpus);
        return /(art\.?\s*75|dispensa)/i.test(c.corpus);
      }
      return true;
    }, mensagemFalha:'Fundamento não caracterizado.', recomendacao:'Instruir com fundamento (Art. 74 ou 75).' },
  { id:'B4_05', bloco:4, nome:'Notória especialização (serviços intelectuais)', fundamento:'Arts. 74, III e 6º, XVIII', severidade:'MEDIA',
    aplicavel: c => ehObjetoServicoIntelectual(c),
    motivoNA: 'Aplicável a serviços predominantemente intelectuais.',
    test: c => /(not[oó]ria\s+especializa|intelectual|singularidade|inconfundibilidade|confian[cç]a)/i.test(c.corpus),
    mensagemFalha:'Notória especialização não caracterizada.', recomendacao:'Comprovar notória especialização.' },

  { id:'B5_01', bloco:5, nome:'Prazo mínimo de publicidade', fundamento:'Art. 55', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      const tipo = c.meta?.tipoObjeto || '';
      if (mod.includes('pregão')) {
        if (tipo === 'bens') return /(8\s*\(?[oO]ito\)?|oito\s+dias|8\s+dias\s+[uú]teis|art\.?\s*55)/i.test(c.corpus);
        if (tipo === 'servicos') return /(10\s+dias|dez\s+dias)/i.test(c.corpus);
      }
      if (mod.includes('concorrência')) return /(35\s+dias|trinta\s+e\s+cinco)/i.test(c.corpus);
      if (mod.includes('leilão')) return /(15\s+dias|quinze\s+dias)/i.test(c.corpus);
      if (mod.includes('concurso')) return /(45\s+dias|quarenta\s+e\s+cinco)/i.test(c.corpus);
      if (mod.includes('diálogo')) return /(10\s+dias|dez\s+dias)/i.test(c.corpus);
      return /(\d+\s+dias|prazo)/i.test(c.corpus);
    }, mensagemFalha:'Prazo não identificado.', recomendacao:'Observar prazos do Art. 55.' },
  { id:'B5_02', bloco:5, nome:'Publicação no PNCP', fundamento:'Art. 54', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(PNCP|Portal\s+Nacional\s+de\s+Contrata)/i.test(c.corpus), mensagemFalha:'Sem menção ao PNCP.', recomendacao:'Prever publicação (Art. 54).' },
  { id:'B5_03', bloco:5, nome:'Impugnação e esclarecimentos', fundamento:'Arts. 164 e 165', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(impugna[cç][õo]es?|esclarecimento|art\.?\s*164|art\.?\s*165)/i.test(c.corpus), mensagemFalha:'Sem previsão de impugnação.', recomendacao:'Prever prazos (Arts. 164 e 165).' },
  { id:'B5_04', bloco:5, nome:'Modo de disputa e fase recursal', fundamento:'Arts. 56, 165 e 166', severidade:'MEDIA',
    aplicavel: c => /preg[aã]o|concorr[eê]ncia|di[aá]logo/i.test(c.modalidade?.modalidade || ''),
    motivoNA: 'Aplicável a Pregão, Concorrência e Diálogo.',
    test: c => /(aberto|fechado|aberto\s+e\s+fechado|fase\s+[uú]nica|recurso)/i.test(c.corpus),
    mensagemFalha:'Modo de disputa não declarado.', recomendacao:'Declarar modo de disputa (Arts. 56, 165 e 166).' },
  { id:'B5_05', bloco:5, nome:'Regime de execução (obras)', fundamento:'Art. 46', severidade:'MEDIA',
    aplicavel: c => ehObjetoEngenharia(c.meta, c.natureza, c.corpus),
    motivoNA: 'Aplicável exclusivamente a obras e engenharia (Art. 46).',
    test: c => /(empreitada|tarefa|regime\s+de\s+execu[cç][aã]o|pre[cç]o\s+unit[aá]rio|pre[cç]o\s+global|integral)/i.test(c.corpus),
    mensagemFalha:'Regime não declarado.', recomendacao:'Declarar regime (Art. 46).' },

  { id:'B6_01', bloco:6, nome:'Fiscal e gestor designados', fundamento:'Art. 117', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const t = /(fiscal\s+titular|fiscaliza[cç][aã]o)/i.test(c.corpus);
      const s = /(fiscal\s+substituto|fiscal\s+suplente|substituto)/i.test(c.corpus);
      const g = /(gestor|gest[aã]o\s+contratual)/i.test(c.corpus);
      return t && (s || g);
    }, mensagemFalha:'Fiscal/gestor não designados.', recomendacao:'Designar fiscal e gestor (Art. 117).' },
  { id:'B6_02', bloco:6, nome:'Segregação de funções', fundamento:'Art. 7º, §1º', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(segrega[cç][aã]o\s+de\s+fun[cç][õo]es|agente\s+de\s+contrata|pregoeiro|equipe\s+de\s+apoio)/i.test(c.corpus), mensagemFalha:'Segregação não observada.', recomendacao:'Designar separadamente (Art. 7º, §1º).' },
  { id:'B6_03', bloco:6, nome:'Recebimento provisório e definitivo', fundamento:'Art. 140', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(recebimento|aceite)\s+(provis[óo]ri|definitiv)/i.test(c.corpus) || /art\.?\s*140/i.test(c.corpus), mensagemFalha:'Sem critérios de recebimento.', recomendacao:'Definir recebimento (Art. 140).' },
  { id:'B6_04', bloco:6, nome:'Pagamento em até 30 dias', fundamento:'Art. 141', severidade:'BAIXA', aplicavel:()=>true, test:c=>/(30\s+dias|trinta\s+dias).{0,40}(pagamento|nota\s+fiscal|aceite)/i.test(c.corpus) || !/pagamento/i.test(c.corpus), mensagemFalha:'Prazo não fixado.', recomendacao:'Fixar em até 30 dias (Art. 141).' },
  { id:'B6_05', bloco:6, nome:'Sanções administrativas', fundamento:'Art. 155', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(san[cç][õo]es\s+administrativas|multa|advert[êe]ncia|impedimento\s+de\s+contratar)/i.test(c.corpus), mensagemFalha:'Sanções não previstas.', recomendacao:'Prever sanções (Art. 155).' },
];

/* ==========================================================================
 * 7. MOTOR DE AVALIAÇÃO
 * ======================================================================== */
function executarAuditoriaArquivo(corpus, meta, natureza, modalidade, criterio, licitareq = null, arquivoRef = null) {
  const ctx = { corpus, meta, natureza, modalidade, criterio, licitareq, arquivo: arquivoRef };
  const resultados = MATRIZ_CORE_30.map((regra) => {
    let aplicavel = false;
    try { aplicavel = !!regra.aplicavel(ctx); } catch (_) { aplicavel = true; }
    if (!aplicavel) {
      return { ...regra, peso: PESOS[regra.severidade], aplicavel: false, conforme: null, status: 'N/A', motivoNA: regra.motivoNA || 'Regra não aplicável à combinação declarada.' };
    }
    let conforme = false;
    try { conforme = !!regra.test(ctx); } catch (_) { conforme = false; }
    return { ...regra, peso: PESOS[regra.severidade], aplicavel: true, conforme, status: conforme ? 'ok' : 'falha' };
  });

  const aplicaveis = resultados.filter(r => r.aplicavel);
  const pesoTotal  = aplicaveis.reduce((s, r) => s + r.peso, 0);
  const pesoFalha  = aplicaveis.filter(r => !r.conforme).reduce((s, r) => s + r.peso, 0);
  const score = pesoTotal > 0 ? Math.max(0, Math.round((100 - (pesoFalha / pesoTotal) * 100) * 10) / 10) : 100;
  const criticas = aplicaveis.filter(r => !r.conforme && r.severidade === 'CRITICA').length;
  const medias   = aplicaveis.filter(r => !r.conforme && r.severidade === 'MEDIA').length;
  const baixas   = aplicaveis.filter(r => !r.conforme && r.severidade === 'BAIXA').length;
  const risco = calcularRiscoArquivo(score, criticas);
  const porBloco = {};
  for (let b = 1; b <= 6; b++) {
    const lista = aplicaveis.filter(r => r.bloco === b);
    const listaTodos = resultados.filter(r => r.bloco === b);
    porBloco[b] = {
      titulo: BLOCO_TITULO[b], total: lista.length,
      ok: lista.filter(r => r.conforme).length,
      falha: lista.filter(r => !r.conforme).length,
      criticas: lista.filter(r => !r.conforme && r.severidade === 'CRITICA').length,
      na: listaTodos.length - lista.length,
    };
  }
  return {
    resultados, aplicaveis,
    totalAplicaveis: aplicaveis.length,
    totalIgnoradas: resultados.length - aplicaveis.length,
    pesoTotal, pesoFalha, score,
    criticasFalha: criticas, mediasFalha: medias, baixasFalha: baixas,
    porBloco, risco,
  };
}
function calcularRiscoArquivo(score, criticas) {
  if (criticas > 0) return 'ALTO';
  if (score < 70)   return 'ALTO';
  if (score >= 90)  return 'BAIXO';
  return 'MÉDIO';
}
function calcularScoreProcesso(arquivos) {
  const ok = arquivos.filter(a => a.status === 'ok' && typeof a.score === 'number');
  if (!ok.length) return 0;
  return Math.round((ok.reduce((s, a) => s + a.score, 0) / ok.length) * 10) / 10;
}
function calcularRiscoProcesso(arquivos) {
  const ok = arquivos.filter(a => a.status === 'ok');
  if (!ok.length) return '—';
  if (ok.some(a => a.risco === 'ALTO'))  return 'ALTO';
  if (ok.some(a => a.risco === 'MÉDIO')) return 'MÉDIO';
  return 'BAIXO';
}
function agregarPorBloco(arquivos) {
  const agg = {};
  for (let b = 1; b <= 6; b++) agg[b] = { titulo: BLOCO_TITULO[b], total: 0, ok: 0, falha: 0, criticas: 0, medias: 0, baixas: 0, na: 0 };
  arquivos.filter(a => a.status === 'ok' && Array.isArray(a.resultados)).forEach(a => {
    a.resultados.forEach(r => {
      const b = r.bloco;
      if (!agg[b]) return;
      if (!r.aplicavel) { agg[b].na++; return; }
      agg[b].total++;
      if (r.conforme) agg[b].ok++;
      else {
        agg[b].falha++;
        if (r.severidade === 'CRITICA') agg[b].criticas++;
        else if (r.severidade === 'MEDIA') agg[b].medias++;
        else agg[b].baixas++;
      }
    });
  });
  return agg;
}
function nivelConformidade(pct) {
  if (pct >= 90) return 'baixo';
  if (pct >= 70) return 'medio';
  return 'alto';
}

/* ==========================================================================
 * 8. ANÁLISE INDIVIDUAL HÍBRIDA
 * ======================================================================== */
function analisarTextoIndividual(corpus, opts = {}) {
  const nomeArquivo = opts.nomeArquivo || '';
  const licitareq = ehArquivoLicitaReq(nomeArquivo, corpus) ? parseLicitaReq(corpus) : null;
  const metaBase = {
    modalidade: extrairModalidade(corpus),
    objeto:     extrairObjeto(corpus),
    valor:      extrairValor(corpus),
    processo:   extrairProcesso(corpus),
    orgao:      extrairOrgao(corpus),
    empresa:    corpus.match(KB.empresa)?.[0]?.trim() || licitareq?.empresa || null,
  };
  if (licitareq) {
    if (!metaBase.processo || metaBase.processo === 'Não identificado') metaBase.processo = licitareq.processo || 'Não identificado';
    if (!metaBase.valor && licitareq.valor) metaBase.valor = licitareq.valor;
    if (!metaBase.objeto.texto && licitareq.objeto) {
      metaBase.objeto.texto = licitareq.objeto;
      metaBase.objeto.tipo = classificarObjeto(licitareq.objeto);
    }
  }
  const naturezaBase = classificarNatureza(corpus, opts.paramObjeto || 'auto');
  const modalidadeLabel = (opts.paramModalidade && opts.paramModalidade !== 'auto')
    ? labelModalidade(opts.paramModalidade) : metaBase.modalidade.rotulo;
  const criterio = (opts.paramCriterio && opts.paramCriterio !== 'auto')
    ? opts.paramCriterio : extrairCriterio(corpus);
  const tipoObjeto = classificarTipoObjeto({ objeto: metaBase.objeto, natureza: naturezaBase });
  const meta = { ...metaBase, natureza: naturezaBase, modalidade: modalidadeLabel, criterio, tipoObjeto };
  const auditoria = executarAuditoriaArquivo(corpus, meta, naturezaBase, { modalidade: modalidadeLabel }, criterio, licitareq, { licitareq: !!licitareq, nome: nomeArquivo });
  const objetoExibicao = (meta.objeto.texto && meta.objeto.texto.trim().length >= 5
    ? meta.objeto.texto.trim().slice(0, 200)
    : meta.objeto.tipo || 'Não identificado');
  return {
    score: auditoria.score, risco: auditoria.risco,
    licitareq,
    identificacao: {
      objeto: objetoExibicao, objetoTipo: meta.objeto.tipo,
      modalidade: meta.modalidade, natureza: meta.natureza, criterio,
      processo: meta.processo, orgao: meta.orgao, empresa: meta.empresa,
      caracteresAnalisados: corpus.length,
    },
    estatisticas: {
      total: MATRIZ_CORE_30.length, aplicaveis: auditoria.totalAplicaveis,
      ignoradas: auditoria.totalIgnoradas,
      ok: auditoria.aplicaveis.filter(r => r.conforme).length,
      falha: auditoria.aplicaveis.filter(r => !r.conforme).length,
      criticas: auditoria.criticasFalha, medias: auditoria.mediasFalha, baixas: auditoria.baixasFalha,
      porBloco: auditoria.porBloco,
    },
    resultados: auditoria.resultados,
    correcoes: auditoria.aplicaveis.filter(r => !r.conforme).map(r => ({
      id: r.id, bloco: r.bloco, titulo: r.nome, lei: r.fundamento,
      severidade: r.severidade === 'CRITICA' ? 'alta' : r.severidade === 'MEDIA' ? 'media' : 'baixa',
      descricao: r.mensagemFalha, sugestao: r.recomendacao,
    })),
  };
}

/* ==========================================================================
 * 9. EXTRAÇÃO DE TEXTO
 * ======================================================================== */
function configurePdfWorker() {
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
async function extractPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.map(it => ({ str: it.str, y: it.transform?.[5] ?? 0, x: it.transform?.[4] ?? 0 }))
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
 * 10. CRUD DE PROCESSOS
 * ======================================================================== */
function criarProcesso(nome) {
  const proc = {
    id: uid('proc'),
    nome: nome || `Processo ${state.processos.length + 1}`,
    cor: CORES_PRESET[state.processos.length % CORES_PRESET.length],
    tags: [], arquivos: [],
    notas: '',
    metadados: { modalidade: 'auto', natureza: 'auto', criterio: 'auto' },
    criadoEm: new Date().toISOString(),
  };
  state.processos.push(proc);
  state.ativo = proc.id;
  renderTudo();
  return proc;
}
function excluirProcesso(procId) {
  if (!confirm('Excluir este processo e todos os arquivos?')) return;
  state.processos = state.processos.filter(p => p.id !== procId);
  if (state.ativo === procId) state.ativo = state.processos[0]?.id || null;
  renderTudo();
  toast('Processo excluído.', 'ok');
}
function getProcessoAtivo() { return state.processos.find(p => p.id === state.ativo) || null; }

/* ---------- Separação LicitaReq × Documentos comuns ---------- */
function separarArquivosProcesso(processo) {
  const licitareq = processo.arquivos.filter(a => a.licitareq);
  const comuns    = processo.arquivos.filter(a => !a.licitareq);
  return { licitareq, comuns };
}

/* ---------- Perfil ---------- */
function getPerfilProcesso(processo) {
  const arquivosOk = processo.arquivos.filter(a => a.status === 'ok' && a.identificacao);
  const primeiro = arquivosOk[0];
  const overrideMod = processo.metadados?.modalidade;
  const overrideNat = processo.metadados?.natureza;
  const overrideCri = processo.metadados?.criterio;
  const globalMod = els.paramModalidade?.value;
  const globalNat = els.paramObjeto?.value;
  const globalCri = els.paramCriterio?.value;
  const modFinal = (overrideMod && overrideMod !== 'auto') ? overrideMod : (globalMod && globalMod !== 'auto') ? globalMod : null;
  const natFinal = (overrideNat && overrideNat !== 'auto') ? overrideNat : (globalNat && globalNat !== 'auto') ? globalNat : null;
  const criFinal = (overrideCri && overrideCri !== 'auto') ? overrideCri : (globalCri && globalCri !== 'auto') ? globalCri : null;
  return {
    modalidade: modFinal ? labelModalidade(modFinal) : (primeiro?.identificacao?.modalidade || 'Não identificada'),
    natureza:   natFinal ? labelNatureza(natFinal)   : (primeiro?.identificacao?.natureza   || 'Não identificada'),
    criterio:   criFinal ? criFinal : (primeiro?.identificacao?.criterio || 'indefinido'),
    orgao: primeiro?.identificacao?.orgao || '—',
    processo: primeiro?.identificacao?.processo || '—',
    objeto: primeiro?.identificacao?.objeto || '—',
    _override: {
      modalidade: overrideMod || 'auto',
      natureza: overrideNat || 'auto',
      criterio: overrideCri || 'auto',
    },
    _auto: {
      modalidade: !modFinal, natureza: !natFinal, criterio: !criFinal,
    },
  };
}

/* ==========================================================================
 * 11. ADIÇÃO DE ARQUIVOS
 * ======================================================================== */
async function adicionarArquivos(procId, fileList) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  const files = Array.from(fileList).filter(Boolean);
  if (!files.length) return;
  showLoader('Extraindo e analisando…');
  const paramObjeto     = p.metadados?.natureza  !== 'auto' ? p.metadados.natureza  : els.paramObjeto.value;
  const paramModalidade = p.metadados?.modalidade !== 'auto' ? p.metadados.modalidade : els.paramModalidade.value;
  const paramCriterio   = p.metadados?.criterio   !== 'auto' ? p.metadados.criterio   : els.paramCriterio.value;
  for (const file of files) {
    const entry = {
      id: uid('arq'), nomeArquivo: file.name, ext: extOf(file.name),
      tamanho: file.size, texto: '', status: 'loading', erro: null, licitareq: false, _ref: file,
    };
    p.arquivos.push(entry);
    renderWorkspace();
    try {
      entry.texto = await extractFileText(entry._ref);
      entry.status = 'ok';
      const res = analisarTextoIndividual(entry.texto, { paramObjeto, paramModalidade, paramCriterio, nomeArquivo: file.name });
      Object.assign(entry, res);
      entry.licitareq = !!res.licitareq;
    } catch (err) {
      entry.status = 'erro';
      entry.erro = err.message || 'Erro ao processar.';
    } finally {
      delete entry._ref;
      renderWorkspace();
    }
  }
  hideLoader();
  const lrCount = files.filter(f => ehArquivoLicitaReq(f.name)).length;
  const msg = lrCount > 0
    ? `${files.length} arquivo(s) adicionado(s) — ${lrCount} do LicitaReq.`
    : `${files.length} arquivo(s) adicionado(s).`;
  toast(msg, lrCount > 0 ? 'info' : 'ok');
}
function removerArquivo(procId, arqId) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  p.arquivos = p.arquivos.filter(a => a.id !== arqId);
  renderWorkspace();
  toast('Arquivo removido.', 'ok');
}

/* ==========================================================================
 * 12. RENDERIZAÇÃO
 * ======================================================================== */
function renderTudo() { renderTabs(); renderEmptyOuWorkspace(); renderSubtitle(); renderBotoesExportacao(); }
function renderSubtitle() {
  const total = state.processos.length;
  const totalArq = state.processos.reduce((s, p) => s + p.arquivos.length, 0);
  els.subtitle.textContent = total === 0 ? 'Nenhum processo criado' : `${total} processo(s) · ${totalArq} arquivo(s)`;
}
function renderBotoesExportacao() { els.pdfAllBtn.disabled = !state.processos.some(p => p.arquivos.length > 0); }
function renderEmptyOuWorkspace() {
  if (!state.processos.length) {
    els.emptyState.classList.remove('is-hidden');
    els.workspace.classList.add('is-hidden');
    return;
  }
  if (!state.ativo || !state.processos.find(p => p.id === state.ativo)) state.ativo = state.processos[0].id;
  els.emptyState.classList.add('is-hidden');
  els.workspace.classList.remove('is-hidden');
  renderWorkspace();
}
function renderTabs() {
  const tabs = state.processos.map(p => {
    const ativo = p.id === state.ativo;
    const risco = calcularRiscoProcesso(p.arquivos);
    const corRisco = risco === 'ALTO' ? 'var(--danger)' : risco === 'MÉDIO' ? 'var(--warn)' : risco === 'BAIXO' ? 'var(--ok)' : 'var(--text-dim)';
    const temLR = p.arquivos.some(a => a.licitareq);
    return `
      <button class="tab ${ativo ? 'is-active' : ''}" role="tab" aria-selected="${ativo}"
              data-tab-proc="${p.id}" title="${escapeHtml(p.nome)}"
              style="border-left-color:${ativo ? p.cor : 'transparent'};">
        <span class="tab__dot" style="background:${p.cor || corRisco};"></span>
        ${escapeHtml(truncate(p.nome, 24))}
        ${temLR ? `<span style="color:var(--licitareq);font-size:10px;margin-left:4px;">⬢</span>` : ''}
      </button>`;
  }).join('');
  const btnNovo = `
    <button class="tab tab--add" data-novo-processo type="button" title="Criar novo processo">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14m-7-7h14" stroke-linecap="round" /></svg>
      Criar Processo
    </button>`;
  els.tabsProcessos.innerHTML = tabs + btnNovo;
  $$('[data-tab-proc]').forEach(btn => btn.addEventListener('click', () => { state.ativo = btn.dataset.tabProc; renderTudo(); }));
  $('[data-novo-processo]')?.addEventListener('click', () => criarProcesso());
}
function renderBlocoCard(num, dados) {
  const pct = dados.total > 0 ? Math.round((dados.ok / dados.total) * 100) : 100;
  const nivel = dados.total === 0 ? 'na' : nivelConformidade(pct);
  return `
    <article class="bloco-card" data-bloco="${num}">
      <header class="bloco-card__head">
        <span class="bloco-card__num">B${num}</span>
        <h4 class="bloco-card__titulo" title="${escapeHtml(dados.titulo)}">${escapeHtml(dados.titulo)}</h4>
        <span class="bloco-card__pct">${dados.total > 0 ? `${pct}%` : '—'}</span>
      </header>
      <div class="bloco-card__progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="bloco-card__progress-bar" data-nivel="${nivel}" style="width:${dados.total > 0 ? pct : 0}%;"></div>
      </div>
      <footer class="bloco-card__foot">
        <span class="chip chip--ok">✓ ${dados.ok}/${dados.total}</span>
        ${dados.criticas ? `<span class="chip chip--danger">● ${dados.criticas} crítica${dados.criticas>1?'s':''}</span>` : ''}
        ${dados.medias   ? `<span class="chip chip--warn">● ${dados.medias} média${dados.medias>1?'s':''}</span>`   : ''}
        ${dados.na > 0   ? `<span class="chip chip--na">○ ${dados.na} N/A</span>` : ''}
      </footer>
    </article>`;
}
function renderAchadosConsolidados(arquivos) {
  const todos = [];
  arquivos.filter(a => a.status === 'ok' && Array.isArray(a.resultados)).forEach(a => {
    a.resultados.filter(r => r.aplicavel && !r.conforme).forEach(r => {
      todos.push({ arquivo: a.nomeArquivo, id: r.id, bloco: r.bloco, nome: r.nome, fundamento: r.fundamento, severidade: r.severidade });
    });
  });
  const ordem = { CRITICA: 0, MEDIA: 1, BAIXA: 2 };
  todos.sort((a, b) => (ordem[a.severidade] - ordem[b.severidade]) || (a.bloco - b.bloco));
  if (!todos.length) return `<p style="padding:1.1rem 1.25rem;color:var(--ok);font-size:13px;font-weight:600;">✓ Nenhuma inconformidade identificada.</p>`;
  const linhas = todos.map(t => {
    const sev = t.severidade === 'CRITICA' ? 'alto' : t.severidade === 'MEDIA' ? 'medio' : 'baixo';
    const sevLabel = t.severidade === 'CRITICA' ? 'Crítica' : t.severidade === 'MEDIA' ? 'Média' : 'Baixa';
    return `
      <tr>
        <td data-label="Grau"><span class="badge badge--${sev}">${sevLabel}</span></td>
        <td data-label="Bloco"><strong>B${t.bloco}</strong> · ${escapeHtml(t.nome)}</td>
        <td data-label="Arquivo" class="texto-recortado" title="${escapeHtml(t.arquivo)}">${escapeHtml(truncate(t.arquivo, 30))}</td>
        <td data-label="Fundamento" class="texto-longo-quebra"><em style="color:var(--brand);font-family:var(--font-mono);font-size:11px;">${escapeHtml(t.fundamento)}</em></td>
      </tr>`;
  }).join('');
  return `
    <div class="tabela-responsive-wrapper">
      <table class="tabela-arquivos tabela-auditoria">
        <thead><tr><th style="width:12%;">Grau</th><th style="width:28%;">Bloco / Verificação</th><th style="width:22%;">Arquivo</th><th style="width:38%;">Fundamento Legal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

/* ---------- NOVO: Render da SEÇÃO LICITAREQ dedicada ---------- */
function renderSecaoLicitaReq(processo, arquivosLR) {
  if (!arquivosLR.length) {
    return `
      <section class="ws-licitareq">
        <header class="ws-licitareq__head">
          <span class="ws-licitareq__title">Requerimentos / DFD / LicitaReq</span>
          <span class="ws-licitareq__count">0</span>
        </header>
        <p class="ws-licitareq__empty">
          Nenhum requerimento ou DFD anexado — arraste abaixo um <strong>Requerimento LicitaReq</strong>,
          <strong>DFD</strong> ou <strong>Despacho de Triagem</strong> para auditar a formalização da demanda.
        </p>
        <div class="ws-licitareq__actions">
          <button class="btn btn--licitareq" data-drop-req="${processo.id}" type="button">
            ⬆ Anexar Requerimento / DFD
          </button>
        </div>
      </section>`;
  }

  const itens = arquivosLR.map(a => {
    const score = a.status === 'ok' && typeof a.score === 'number'
      ? `${a.score.toFixed(1)}%` : (a.status === 'erro' ? 'Erro' : '…');
    const risco = a.risco || '—';
    const emoji = risco === 'ALTO' ? '🔴' : risco === 'MÉDIO' ? '🟡' : risco === 'BAIXO' ? '🟢' : '⚪';
    const corScore = risco === 'ALTO' ? 'var(--danger)' : risco === 'MÉDIO' ? 'var(--warn)' : risco === 'BAIXO' ? 'var(--ok)' : 'var(--text-dim)';
    const ref = a.licitareq || {};
    const detalhes = [];
    if (ref.processo) detalhes.push(`<span>📄 <b>${escapeHtml(ref.processo)}</b></span>`);
    if (ref.unidade)  detalhes.push(`<span>🏢 ${escapeHtml(ref.unidade)}</span>`);
    if (ref.valor > 0) detalhes.push(`<span>💰 <b>${escapeHtml(ref.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</b></span>`);
    if (ref.empresa)  detalhes.push(`<span style="color:var(--danger);">⚠ ${escapeHtml(ref.empresa)}</span>`);
    if (ref.emergencia) detalhes.push(`<span>🚨 <b>Emergência</b></span>`);
    if (ref.inexigibilidade) detalhes.push(`<span>⚖️ <b>Inexigibilidade</b></span>`);

    return `
      <div class="req-item" data-req-id="${a.id}">
        <span class="req-item__ext">${escapeHtml(a.ext || 'REQ')}</span>
        <div class="req-item__meta">
          <div class="req-item__name" title="${escapeHtml(a.nomeArquivo)}">
            ${escapeHtml(truncate(a.nomeArquivo, 70))}
          </div>
          <div class="req-item__details">
            <span class="req-item__score" style="color:${corScore};">${emoji} ${score}</span>
            <span>${formatBytes(a.tamanho || 0)}</span>
            ${detalhes.join('')}
          </div>
        </div>
        <div class="req-item__actions">
          <button class="btn-view-content" data-view-text="${a.id}" data-proc="${processo.id}" type="button" title="Ler o conteúdo textual deste requerimento">
            📖 Ver Conteúdo
          </button>
          <button class="btn-icon" data-view-arq="${a.id}" data-proc="${processo.id}" title="Detalhes da análise" ${a.status !== 'ok' ? 'disabled' : ''}>👁️</button>
          <button class="btn-icon" data-pdf-arq="${a.id}" data-proc="${processo.id}" title="PDF individual" ${a.status !== 'ok' ? 'disabled' : ''}>📄</button>
          <button class="btn-icon danger" data-del-arq="${a.id}" data-proc="${processo.id}" title="Remover">🗑</button>
        </div>
      </div>`;
  }).join('');

  return `
    <section class="ws-licitareq">
      <header class="ws-licitareq__head">
        <span class="ws-licitareq__title">Requerimentos / DFD / LicitaReq</span>
        <span class="ws-licitareq__count">${arquivosLR.length}</span>
      </header>
      <div class="ws-licitareq__list">${itens}</div>
      <div class="ws-licitareq__actions">
        <button class="btn btn--licitareq btn--sm" data-drop-req="${processo.id}" type="button">
          ⬆ Anexar outro Requerimento / DFD
        </button>
      </div>
    </section>`;
}

/* ---------- Render principal do workspace ---------- */
function renderWorkspace() {
  const p = getProcessoAtivo();
  if (!p) return;

  const scoreConsolidado = calcularScoreProcesso(p.arquivos);
  const riscoConsolidado = calcularRiscoProcesso(p.arquivos);
  const arquivosOk = p.arquivos.filter(a => a.status === 'ok');
  const perfil = getPerfilProcesso(p);
  const { licitareq: arquivosLR, comuns: arquivosComuns } = separarArquivosProcesso(p);

  const corRisco = riscoConsolidado === 'ALTO' ? 'var(--danger)'
                 : riscoConsolidado === 'MÉDIO' ? 'var(--warn)'
                 : riscoConsolidado === 'BAIXO' ? 'var(--ok)' : 'var(--text-dim)';
  const badgeCls = riscoConsolidado === 'ALTO' ? 'badge--alto'
                 : riscoConsolidado === 'MÉDIO' ? 'badge--medio'
                 : riscoConsolidado === 'BAIXO' ? 'badge--baixo' : 'badge--neutro';
  const emoji = riscoConsolidado === 'ALTO' ? '🔴' : riscoConsolidado === 'MÉDIO' ? '🟡' : riscoConsolidado === 'BAIXO' ? '🟢' : '⚪';

  const totalArquivos = p.arquivos.length;
  const totalAplicaveis = arquivosOk.reduce((s, a) => s + (a.estatisticas?.aplicaveis || 0), 0);
  const totalInconf = arquivosOk.reduce((s, a) => s + (a.estatisticas?.falha || 0), 0);
  const totalNA = arquivosOk.reduce((s, a) => s + (a.estatisticas?.ignoradas || 0), 0);
  const temLicitaReq = arquivosLR.length > 0;

  const dashArray = 2 * Math.PI * 44;
  const dashValue = (scoreConsolidado / 100) * dashArray;
  const blocosAgg = agregarPorBloco(arquivosOk);
  const blocosHtml = [1,2,3,4,5,6].map(b => renderBlocoCard(b, blocosAgg[b])).join('');

  els.workspace.innerHTML = `
    <div class="painel-auditoria">

      <header class="ws-header" style="border-top-color:${p.cor};" data-proc="${p.id}">
        <div class="ws-header__left">
          <input type="text" class="ws-nome" value="${escapeHtml(p.nome)}" data-rename="${p.id}" title="Clique para renomear" />
          <div class="ws-tags">
            <span class="processo-cor-indicator" style="background:${p.cor};" aria-hidden="true"></span>
            ${temLicitaReq ? `<span class="tag tag--licitareq">⬢ LicitaReq</span>` : ''}
            ${p.tags.map(t => `<span class="tag">${escapeHtml(t)}<b data-remove-tag="${escapeHtml(t)}" data-proc="${p.id}">&times;</b></span>`).join('')}
            <button class="tag-add" data-add-tag="${p.id}" type="button">+ Tag</button>
          </div>
        </div>
        <div class="ws-header__right">
          <input type="color" class="color-picker" value="${p.cor}" data-color="${p.id}" title="Cor de identificação" />
          <button class="btn btn--soft btn--sm" data-criterios-proc="${p.id}" type="button" title="Ver critérios avaliativos ativos">
            ⚙️ Critérios
          </button>
          <button class="btn-icon danger" data-delete-proc="${p.id}" title="Excluir processo" type="button">🗑</button>
        </div>
      </header>

      <!-- Perfil da Licitação -->
      <section class="ws-perfil" aria-label="Perfil da Licitação">
        <div class="ws-perfil__item" data-tipo="modalidade">
          <label class="ws-perfil__label">
            <span>Modalidade (Art. 28)</span>
            ${perfil._override.modalidade !== 'auto' ? `<span class="ws-perfil__hint">override</span>` : ''}
          </label>
          <select class="ws-perfil__select" data-perfil="modalidade" data-proc="${p.id}">
            <option value="auto" ${perfil._override.modalidade === 'auto' ? 'selected' : ''}>Auto (${escapeHtml(perfil.modalidade)})</option>
            <option value="pregao" ${perfil._override.modalidade === 'pregao' ? 'selected' : ''}>Pregão</option>
            <option value="concorrencia" ${perfil._override.modalidade === 'concorrencia' ? 'selected' : ''}>Concorrência</option>
            <option value="concurso" ${perfil._override.modalidade === 'concurso' ? 'selected' : ''}>Concurso</option>
            <option value="leilao" ${perfil._override.modalidade === 'leilao' ? 'selected' : ''}>Leilão</option>
            <option value="dialogo" ${perfil._override.modalidade === 'dialogo' ? 'selected' : ''}>Diálogo Competitivo</option>
            <option value="dispensa" ${perfil._override.modalidade === 'dispensa' ? 'selected' : ''}>Dispensa</option>
            <option value="inexigibilidade" ${perfil._override.modalidade === 'inexigibilidade' ? 'selected' : ''}>Inexigibilidade</option>
          </select>
        </div>
        <div class="ws-perfil__item" data-tipo="natureza">
          <label class="ws-perfil__label">
            <span>Natureza (Art. 6º)</span>
            ${perfil._override.natureza !== 'auto' ? `<span class="ws-perfil__hint">override</span>` : ''}
          </label>
          <select class="ws-perfil__select" data-perfil="natureza" data-proc="${p.id}">
            <option value="auto" ${perfil._override.natureza === 'auto' ? 'selected' : ''}>Auto (${escapeHtml(perfil.natureza)})</option>
            <option value="bens" ${perfil._override.natureza === 'bens' ? 'selected' : ''}>Bens comuns</option>
            <option value="servicos-comuns" ${perfil._override.natureza === 'servicos-comuns' ? 'selected' : ''}>Serviços comuns</option>
            <option value="servicos-especiais" ${perfil._override.natureza === 'servicos-especiais' ? 'selected' : ''}>Serviços especiais</option>
            <option value="obras" ${perfil._override.natureza === 'obras' ? 'selected' : ''}>Obras / Engenharia</option>
            <option value="intelectual" ${perfil._override.natureza === 'intelectual' ? 'selected' : ''}>Serviços intelectuais</option>
            <option value="alienacao" ${perfil._override.natureza === 'alienacao' ? 'selected' : ''}>Alienação / Concessão</option>
          </select>
        </div>
        <div class="ws-perfil__item" data-tipo="criterio">
          <label class="ws-perfil__label">
            <span>Critério (Art. 33)</span>
            ${perfil._override.criterio !== 'auto' ? `<span class="ws-perfil__hint">override</span>` : ''}
          </label>
          <select class="ws-perfil__select" data-perfil="criterio" data-proc="${p.id}">
            <option value="auto" ${perfil._override.criterio === 'auto' ? 'selected' : ''}>Auto (${escapeHtml(labelCriterio(perfil.criterio))})</option>
            <option value="menor-preco" ${perfil._override.criterio === 'menor-preco' ? 'selected' : ''}>Menor preço</option>
            <option value="maior-desconto" ${perfil._override.criterio === 'maior-desconto' ? 'selected' : ''}>Maior desconto</option>
            <option value="melhor-tecnica" ${perfil._override.criterio === 'melhor-tecnica' ? 'selected' : ''}>Melhor técnica</option>
            <option value="tecnica-preco" ${perfil._override.criterio === 'tecnica-preco' ? 'selected' : ''}>Técnica e preço</option>
            <option value="maior-lance" ${perfil._override.criterio === 'maior-lance' ? 'selected' : ''}>Maior lance</option>
            <option value="maior-retorno" ${perfil._override.criterio === 'maior-retorno' ? 'selected' : ''}>Maior retorno econômico</option>
          </select>
        </div>
      </section>

      <!-- ★ SEÇÃO LICITAREQ DEDICADA -->
      ${renderSecaoLicitaReq(p, arquivosLR)}

      <!-- Documentos comuns -->
      <section class="ws-secao">
        <header class="ws-secao__head">
          <span class="ws-secao__title">Documentos do Processo</span>
          <span class="ws-secao__count">${arquivosComuns.length}</span>
        </header>

        ${arquivosComuns.length === 0
          ? `<p style="padding:1.25rem 1.1rem;color:var(--text-dim);font-size:13px;font-style:italic;text-align:center;">Nenhum documento comum adicionado — use a área abaixo para enviar arquivos.</p>`
          : `<div class="tabela-responsive-wrapper"><table class="tabela-arquivos">
              <thead><tr>
                <th class="col-arquivo">Arquivo</th>
                <th class="col-score">Conformidade</th>
                <th class="col-risco">Risco</th>
                <th class="col-acoes">Ações</th>
              </tr></thead>
              <tbody>${arquivosComuns.map(a => renderLinhaArquivo(p.id, a)).join('')}</tbody>
            </table></div>`}

        <div class="ws-dropzone" data-drop="${p.id}" tabindex="0" role="button">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" stroke-linecap="round"/>
          </svg>
          <p>Arraste arquivos aqui ou <strong>clique para selecionar</strong></p>
          <p style="font-size:11.5px;color:var(--text-dim);">PDF · DOCX · DOC · TXT</p>
          <p class="ws-dropzone__licitareq">⬢ Arquivos LicitaReq são direcionados à seção dedicada acima</p>
        </div>

        <div class="ws-actions">
          <button class="btn btn--primary" data-pdf-proc="${p.id}" type="button" ${totalArquivos === 0 ? 'disabled' : ''}>📄 Relatório Consolidado (PDF)</button>
          <button class="btn btn--soft" data-json-proc="${p.id}" type="button" ${totalArquivos === 0 ? 'disabled' : ''}>💾 Salvar este Processo (JSON)</button>
        </div>
      </section>

      <!-- Notas -->
      <section class="ws-notas">
        <header class="ws-notas__head">
          <span class="ws-notas__title">
            📝 Notas do Auditor
            ${p.notas ? `<span class="ws-notas__badge">${p.notas.length} caracteres</span>` : ''}
          </span>
          <span style="font-size:11px;color:var(--text-dim);">Salvo automaticamente</span>
        </header>
        <textarea class="ws-notas__textarea" data-notas="${p.id}" placeholder="Registre observações internas: inconsistências detectadas, contatos, dúvidas pendentes, referências documentais, próximos passos…">${escapeHtml(p.notas || '')}</textarea>
      </section>

      <!-- Métricas -->
      <section class="painel-metricas-topo" aria-label="Métricas consolidadas">
        <div class="ws-metrica__gauge" role="img" aria-label="Conformidade: ${scoreConsolidado}%">
          <svg viewBox="0 0 100 100">
            <circle class="track" cx="50" cy="50" r="44"></circle>
            <circle class="value" cx="50" cy="50" r="44" style="stroke:${corRisco}; stroke-dasharray:${dashValue} ${dashArray};" data-score="${scoreConsolidado}"></circle>
          </svg>
          <div class="ws-metrica__numero">${scoreConsolidado}<small>%</small></div>
        </div>
        <div class="ws-metrica__info" style="flex:1;min-width:0;">
          <h3>Conformidade Global do Processo</h3>
          <p>${totalArquivos === 0 ? 'Adicione arquivos para calcular a conformidade.'
            : `${totalArquivos} documento(s) · ${totalAplicaveis} checkpoints aplicáveis · ${totalInconf} inconformidade(s) · ${totalNA} N/A`}</p>
          <div class="meta-line">
            <span><strong>${totalArquivos}</strong> arquivo(s)</span>
            <span><strong>${totalAplicaveis}</strong> aplicáveis</span>
            <span><strong>${totalInconf}</strong> achados</span>
            <span><strong>${totalNA}</strong> N/A</span>
            ${temLicitaReq ? `<span style="color:var(--licitareq);"><strong>⬢ ${arquivosLR.length}</strong> LicitaReq</span>` : ''}
          </div>
        </div>
        <div><span class="badge ${badgeCls}">${emoji} ${riscoConsolidado}</span></div>
      </section>

      <!-- Blocos -->
      <section aria-label="Resumo por bloco de verificação">
        <h3 style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;margin:0 0 .75rem;">Resumo por Bloco de Verificação Essencial</h3>
        <div class="grid-blocos">${blocosHtml}</div>
      </section>

      <!-- Achados -->
      ${totalInconf > 0 ? `
        <section class="ws-secao">
          <header class="ws-secao__head">
            <span class="ws-secao__title">Quadro Consolidado de Não Conformidades</span>
            <span class="ws-secao__count">${totalInconf}</span>
          </header>
          ${renderAchadosConsolidados(arquivosOk)}
        </section>` : ''}

      <div class="aviso-orientativo" role="note">
        <strong>Nota</strong>
        <span>${escapeHtml(AVISO_ORIENTATIVO.replace(/^Nota:\s*/, ''))}</span>
      </div>
    </div>
  `;

  bindEventosWorkspace();
  animarGauge();
}

function renderLinhaArquivo(procId, arq) {
  const score = arq.status === 'ok' && typeof arq.score === 'number' ? `${arq.score.toFixed(1)}%` : (arq.status === 'erro' ? 'Erro' : '…');
  const risco = arq.risco || '—';
  const badgeCls = risco === 'ALTO' ? 'badge--alto' : risco === 'MÉDIO' ? 'badge--medio' : risco === 'BAIXO' ? 'badge--baixo' : 'badge--neutro';
  const emoji = risco === 'ALTO' ? '🔴' : risco === 'MÉDIO' ? '🟡' : risco === 'BAIXO' ? '🟢' : '⚪';
  const corScore = risco === 'ALTO' ? 'var(--danger)' : risco === 'MÉDIO' ? 'var(--warn)' : risco === 'BAIXO' ? 'var(--ok)' : 'var(--text-dim)';
  return `
    <tr>
      <td data-label="Arquivo">
        <div class="arquivo-nome">
          <span class="arquivo-ext">${escapeHtml(arq.ext || 'ARQ')}</span>
          <span class="arquivo-nome__txt">
            <strong title="${escapeHtml(arq.nomeArquivo)}">${escapeHtml(truncate(arq.nomeArquivo, 40))}</strong>
            <small>${formatBytes(arq.tamanho || 0)}${arq.status === 'erro' ? ' · ' + escapeHtml(arq.erro || 'Erro') : ''}</small>
          </span>
        </div>
      </td>
      <td class="col-score" data-label="Conformidade"><span class="arquivo-score" style="color:${corScore};">${score}</span></td>
      <td class="col-risco" data-label="Risco"><span class="badge ${badgeCls}">${emoji} ${risco}</span></td>
      <td data-label="Ações">
        <div class="arquivo-acoes">
          <button class="btn-view-text" data-view-text="${arq.id}" data-proc="${procId}" title="Ver conteúdo do arquivo" ${arq.status === 'erro' ? 'disabled' : ''}>📖</button>
          <button class="btn-icon" data-view-arq="${arq.id}" data-proc="${procId}" title="Detalhes da análise" ${arq.status !== 'ok' ? 'disabled' : ''}>👁️</button>
          <button class="btn-icon" data-pdf-arq="${arq.id}" data-proc="${procId}" title="PDF individual" ${arq.status !== 'ok' ? 'disabled' : ''}>📄</button>
          <button class="btn-icon danger" data-del-arq="${arq.id}" data-proc="${procId}" title="Excluir">🗑</button>
        </div>
      </td>
    </tr>`;
}
function animarGauge() {
  requestAnimationFrame(() => {
    const c = els.workspace.querySelector('.ws-metrica__gauge .value');
    if (!c) return;
    const dashArray = 2 * Math.PI * 44;
    const score = Number(c.dataset.score) || 0;
    c.style.strokeDasharray = `0 ${dashArray}`;
    requestAnimationFrame(() => { c.style.strokeDasharray = `${(score / 100) * dashArray} ${dashArray}`; });
  });
}

/* ==========================================================================
 * 13. BIND DE EVENTOS DO WORKSPACE
 * ======================================================================== */
function bindEventosWorkspace() {
  const inputNome = els.workspace.querySelector('[data-rename]');
  if (inputNome) {
    inputNome.addEventListener('change', () => {
      const p = state.processos.find(x => x.id === inputNome.dataset.rename);
      if (p) { p.nome = inputNome.value.trim() || 'Processo sem nome'; renderTabs(); }
    });
    inputNome.addEventListener('keydown', e => { if (e.key === 'Enter') inputNome.blur(); });
  }
  const colorInput = els.workspace.querySelector('[data-color]');
  if (colorInput) {
    colorInput.addEventListener('input', () => {
      const procId = colorInput.dataset.color;
      const novaCor = colorInput.value;
      const p = state.processos.find(x => x.id === procId);
      if (p) p.cor = novaCor;
      const header = els.workspace.querySelector('.ws-header');
      if (header) header.style.borderTopColor = novaCor;
      const indicador = els.workspace.querySelector('.processo-cor-indicator');
      if (indicador) indicador.style.backgroundColor = novaCor;
      const aba = els.tabsProcessos.querySelector(`[data-tab-proc="${procId}"]`);
      if (aba) {
        aba.style.borderLeftColor = novaCor;
        const dot = aba.querySelector('.tab__dot');
        if (dot) dot.style.background = novaCor;
      }
    });
  }

  $$('[data-perfil]').forEach(sel => {
    sel.addEventListener('change', () => {
      const p = state.processos.find(x => x.id === sel.dataset.proc);
      if (!p) return;
      if (!p.metadados) p.metadados = { modalidade: 'auto', natureza: 'auto', criterio: 'auto' };
      p.metadados[sel.dataset.perfil] = sel.value;
      reanalisarProcesso(p);
      renderWorkspace();
      toast(`Perfil "${sel.dataset.perfil}" atualizado.`, 'ok');
    });
  });

  const notasTA = els.workspace.querySelector('[data-notas]');
  if (notasTA) {
    const procId = notasTA.dataset.notas;
    let saveT;
    notasTA.addEventListener('input', () => {
      const p = state.processos.find(x => x.id === procId);
      if (!p) return;
      p.notas = notasTA.value;
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        const badge = els.workspace.querySelector('.ws-notas__badge');
        if (badge) badge.textContent = `${p.notas.length} caracteres`;
      }, 500);
    });
  }

  els.workspace.querySelector('[data-delete-proc]')?.addEventListener('click', e => excluirProcesso(e.currentTarget.dataset.deleteProc));
  els.workspace.querySelector('[data-criterios-proc]')?.addEventListener('click', e => abrirModalCriterios(e.currentTarget.dataset.criteriosProc));

  /* Botão "Anexar Requerimento / DFD" da seção LicitaReq */
  els.workspace.querySelectorAll('[data-drop-req]').forEach(btn => {
    btn.addEventListener('click', () => abrirInput(btn.dataset.dropReq, { licitareq: true }));
  });

  els.workspace.querySelector('[data-add-tag]')?.addEventListener('click', e => {
    const p = state.processos.find(x => x.id === e.currentTarget.dataset.addTag);
    if (!p) return;
    const tag = prompt('Digite a tag (ex: TI, Urgente):');
    if (!tag || !tag.trim()) return;
    const limpa = tag.trim().slice(0, 24);
    if (!p.tags.includes(limpa)) p.tags.push(limpa);
    renderWorkspace();
  });
  $$('[data-remove-tag]').forEach(el => el.addEventListener('click', () => {
    const p = state.processos.find(x => x.id === el.dataset.proc);
    if (p) { p.tags = p.tags.filter(t => t !== el.dataset.removeTag); renderWorkspace(); }
  }));
  $$('[data-del-arq]').forEach(btn => btn.addEventListener('click', () => removerArquivo(btn.dataset.proc, btn.dataset.delArq)));
  $$('[data-view-arq]').forEach(btn => btn.addEventListener('click', () => abrirModalArquivo(btn.dataset.proc, btn.dataset.viewArq)));
  $$('[data-view-text]').forEach(btn => btn.addEventListener('click', () =>
    abrirModalVisualizador(btn.dataset.proc, btn.dataset.viewText)
  ));
  $$('[data-pdf-arq]').forEach(btn => btn.addEventListener('click', () => {
    const p = state.processos.find(x => x.id === btn.dataset.proc);
    const a = p?.arquivos.find(x => x.id === btn.dataset.pdfArq);
    if (a && a.status === 'ok') exportarRelatorioAuditPDF(a, p);
  }));
  els.workspace.querySelector('[data-pdf-proc]')?.addEventListener('click', e => {
    const p = state.processos.find(x => x.id === e.currentTarget.dataset.pdfProc);
    if (p) exportarRelatorioProcessoConsolidadoPDF(p);
  });
  els.workspace.querySelector('[data-json-proc]')?.addEventListener('click', e => {
    const p = state.processos.find(x => x.id === e.currentTarget.dataset.jsonProc);
    if (p) exportarJSON([p]);
  });
  const dz = els.workspace.querySelector('[data-drop]');
  if (dz) {
    const procId = dz.dataset.drop;
    dz.addEventListener('click', () => abrirInput(procId));
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirInput(procId); } });
    ['dragenter','dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('is-dragover'); }));
    ['dragleave','drop'].forEach(evt => dz.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
      dz.classList.remove('is-dragover');
    }));
    dz.addEventListener('drop', e => {
      const files = e.dataTransfer?.files;
      if (files?.length) adicionarArquivos(procId, files);
    });
  }
}

function reanalisarProcesso(processo) {
  const paramObjeto     = (processo.metadados?.natureza  !== 'auto') ? processo.metadados.natureza  : els.paramObjeto.value;
  const paramModalidade = (processo.metadados?.modalidade !== 'auto') ? processo.metadados.modalidade : els.paramModalidade.value;
  const paramCriterio   = (processo.metadados?.criterio   !== 'auto') ? processo.metadados.criterio   : els.paramCriterio.value;
  processo.arquivos.forEach(a => {
    if (a.status === 'ok' && a.texto) {
      const res = analisarTextoIndividual(a.texto, { paramObjeto, paramModalidade, paramCriterio, nomeArquivo: a.nomeArquivo });
      Object.assign(a, res);
    }
  });
}

function abrirInput(procId, opts = {}) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.accept = '.pdf,.doc,.docx,.txt,.md,application/pdf,text/plain';
  inp.addEventListener('change', e => {
    if (e.target.files?.length) adicionarArquivos(procId, e.target.files);
    inp.value = '';
  });
  inp.click();
}

/* ==========================================================================
 * 14. MODAL DE DETALHES DO ARQUIVO
 * ======================================================================== */
function abrirModalArquivo(procId, arqId) {
  const p = state.processos.find(x => x.id === procId);
  const a = p?.arquivos.find(x => x.id === arqId);
  if (!a || a.status !== 'ok') { toast('Detalhes não disponíveis.', 'error'); return; }
  const emoji = a.risco === 'ALTO' ? '🔴' : a.risco === 'MÉDIO' ? '🟡' : a.risco === 'BAIXO' ? '🟢' : '⚪';
  const corScore = a.risco === 'ALTO' ? 'var(--danger)' : a.risco === 'MÉDIO' ? 'var(--warn)' : 'var(--ok)';
  const id = a.identificacao || {}, st = a.estatisticas || {};

  const achadosAplic = (a.resultados || []).filter(r => r.aplicavel).map(r => {
    const cls = r.conforme ? '' : (r.severidade === 'CRITICA' ? 'achado--fail' : 'achado--warn');
    return `
      <div class="achado ${cls}">
        <div class="achado__head">
          <span class="achado__id">${escapeHtml(r.id)}</span>
          <span class="badge ${r.severidade === 'CRITICA' ? 'badge--alto' : r.severidade === 'MEDIA' ? 'badge--medio' : 'badge--baixo'}">${r.severidade}</span>
          <span style="margin-left:auto;font-weight:800;color:${r.conforme ? 'var(--ok)' : 'var(--danger)'};font-size:14px;">${r.conforme ? '✓' : '✗'}</span>
        </div>
        <div class="achado__title">${escapeHtml(r.nome)}</div>
        <div class="achado__law">${escapeHtml(r.fundamento)}</div>
        ${!r.conforme ? `<div class="achado__body"><strong>Constatação:</strong> ${escapeHtml(r.mensagemFalha)}<div class="achado__rec"><strong>Recomendação:</strong> ${escapeHtml(r.recomendacao)}</div></div>` : ''}
      </div>`;
  }).join('');

  const achadosNA = (a.resultados || []).filter(r => !r.aplicavel).map(r => `
    <div class="achado achado--na">
      <div class="achado__head">
        <span class="achado__id">${escapeHtml(r.id)}</span>
        <span class="badge badge--na">N/A</span>
      </div>
      <div class="achado__title" style="color:var(--text-muted);">${escapeHtml(r.nome)}</div>
      <div class="achado__law">${escapeHtml(r.fundamento)}</div>
      <div class="achado__body" style="font-style:italic;">${escapeHtml(r.motivoNA || 'Regra não aplicável.')}</div>
    </div>`).join('');

  const licitareqBloco = a.licitareq ? `
    <div class="licitareq-info" style="margin: 0 0 var(--sp-4) 0;">
      <strong>⬢ Arquivo LicitaReq reconhecido</strong>
      <div class="licitareq-info__fields">
        ${a.licitareq.processo ? `<span>Processo: <b>${escapeHtml(a.licitareq.processo)}</b></span>` : ''}
        ${a.licitareq.unidade ? `<span>Unidade: <b>${escapeHtml(a.licitareq.unidade)}</b></span>` : ''}
        ${a.licitareq.valor > 0 ? `<span>Valor: <b>${escapeHtml(a.licitareq.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</b></span>` : ''}
        ${a.licitareq.empresa ? `<span style="color:var(--danger);">Empresa: <b>${escapeHtml(a.licitareq.empresa)}</b></span>` : ''}
        ${a.licitareq.emergencia ? '<span>🚨 Emergência</span>' : ''}
        ${a.licitareq.inexigibilidade ? '<span>⚖️ Inexigibilidade</span>' : ''}
      </div>
    </div>` : '';

  els.modalTitulo.textContent = a.nomeArquivo;
  els.modalBody.innerHTML = `
    ${licitareqBloco}
    <div class="detalhe-score">
      <div class="detalhe-score__numero" style="color:${corScore};">${a.score.toFixed(1)}%</div>
      <div class="detalhe-score__info">
        <strong>${emoji} Risco ${a.risco}</strong>
        <p>${st.ok || 0} conformes · ${st.falha || 0} inconformidades (${st.criticas || 0} críticas · ${st.medias || 0} médias · ${st.baixas || 0} baixas)</p>
        <p>${st.aplicaveis || 0} aplicáveis · ${st.ignoradas || 0} N/A de ${st.total || 0} totais</p>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn--licitareq btn--sm" id="btnVerTextoModal" type="button">📖 Ver Texto do Arquivo</button>
        <button class="btn btn--primary btn--sm" id="btnPdfModal" type="button">📄 PDF Individual</button>
      </div>
    </div>
    <div class="detalhe-meta">
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Modalidade</span><span class="detalhe-meta__val">${escapeHtml(id.modalidade || '—')}</span></div>
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Natureza do Objeto</span><span class="detalhe-meta__val">${escapeHtml(id.natureza || '—')}</span></div>
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Critério</span><span class="detalhe-meta__val">${escapeHtml(labelCriterio(id.criterio))}</span></div>
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Órgão</span><span class="detalhe-meta__val">${escapeHtml(id.orgao || '—')}</span></div>
    </div>
    <h4 style="margin:6px 0 10px; font-size:11.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim); font-weight:800;">Checkpoints Aplicáveis (${st.aplicaveis || 0})</h4>
    <div class="detalhe-lista">${achadosAplic}</div>
    ${st.ignoradas > 0 ? `
      <h4 style="margin:22px 0 10px; font-size:11.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim); font-weight:800;">Regras Não Aplicáveis (${st.ignoradas})</h4>
      <div class="detalhe-lista">${achadosNA}</div>` : ''}
    <div class="aviso-orientativo" style="margin-top: 18px;">
      <strong>Nota</strong>
      <span>${escapeHtml(AVISO_ORIENTATIVO.replace(/^Nota:\s*/, ''))}</span>
    </div>`;
  els.modal.classList.remove('is-hidden');
  $('#btnPdfModal')?.addEventListener('click', () => exportarRelatorioAuditPDF(a, p));
  $('#btnVerTextoModal')?.addEventListener('click', () => {
    fecharModal();
    setTimeout(() => abrirModalVisualizador(procId, arqId), 120);
  });
}
function fecharModal() { els.modal.classList.add('is-hidden'); els.modalBody.innerHTML = ''; }

/* ==========================================================================
 * 15. MODAL DE CRITÉRIOS ATIVOS
 * ======================================================================== */
function abrirModalCriterios(procId) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  const arquivosOk = p.arquivos.filter(a => a.status === 'ok');
  const corpus = arquivosOk.map(a => a.texto || '').join('\n\n');
  const perfis = getPerfilProcesso(p);
  const paramObjeto     = (p.metadados?.natureza  !== 'auto') ? p.metadados.natureza  : els.paramObjeto.value;
  const paramModalidade = (p.metadados?.modalidade !== 'auto') ? p.metadados.modalidade : els.paramModalidade.value;
  const paramCriterio   = (p.metadados?.criterio   !== 'auto') ? p.metadados.criterio   : els.paramCriterio.value;
  const res = analisarTextoIndividual(corpus || ' ', { paramObjeto, paramModalidade, paramCriterio, nomeArquivo: '' });

  const totalAplic = res.resultados.filter(r => r.aplicavel).length;
  const totalNA    = res.resultados.filter(r => !r.aplicavel).length;
  const totalOK    = res.resultados.filter(r => r.aplicavel && r.conforme).length;
  const totalFalha = res.resultados.filter(r => r.aplicavel && !r.conforme).length;

  const blocos = {};
  for (let b = 1; b <= 6; b++) blocos[b] = { aplicavel: [], na: [] };
  res.resultados.forEach(r => {
    if (!blocos[r.bloco]) blocos[r.bloco] = { aplicavel: [], na: [] };
    if (r.aplicavel) blocos[r.bloco].aplicavel.push(r);
    else blocos[r.bloco].na.push(r);
  });

  const renderItem = (r) => {
    const cls = !r.aplicavel ? 'criterios-item--na'
              : (r.conforme ? 'criterios-item--ok' : 'criterios-item--fail');
    const bullet = !r.aplicavel ? '○' : (r.conforme ? '✓' : '✗');
    const sevLabel = !r.aplicavel ? 'N/A' : r.severidade;
    return `
      <div class="criterios-item ${cls}">
        <span class="criterios-item__bullet">${bullet}</span>
        <div class="criterios-item__body">
          <div class="criterios-item__nome">${escapeHtml(r.id)} · ${escapeHtml(r.nome)}</div>
          <div class="criterios-item__law">${escapeHtml(r.fundamento)}</div>
          <div class="criterios-item__desc">
            ${r.aplicavel
              ? (r.conforme ? `<em>Conforme.</em>` : `<em>Não conforme:</em> ${escapeHtml(r.mensagemFalha)} <br>→ <b>Recomendação:</b> ${escapeHtml(r.recomendacao)}`)
              : `<em>Não aplicável:</em> ${escapeHtml(r.motivoNA || 'Regra não aplicável.')}`}
          </div>
        </div>
        <span class="criterios-item__sev">${sevLabel}</span>
      </div>`;
  };

  const gruposHtml = [1,2,3,4,5,6].map(b => {
    const dados = blocos[b];
    if (!dados || (dados.aplicavel.length === 0 && dados.na.length === 0)) return '';
    return `
      <div class="criterios-grupo">
        <div class="criterios-grupo__head">
          <span>B${b} · ${escapeHtml(BLOCO_TITULO[b])}</span>
          <span style="font-weight:600;color:var(--text-dim);font-size:11px;text-transform:none;letter-spacing:0;">
            ${dados.aplicavel.length} aplicáveis · ${dados.na.length} N/A
          </span>
        </div>
        <div class="criterios-grupo__body">
          ${dados.aplicavel.map(renderItem).join('')}
          ${dados.na.map(renderItem).join('')}
        </div>
      </div>`;
  }).join('');

  els.modalCriteriosTitulo.textContent = `Critérios Ativos — ${p.nome}`;
  els.modalCriteriosBody.innerHTML = `
    <div class="criterios-resumo">
      <div class="criterios-resumo__item" data-tipo="ok"><span class="criterios-resumo__num" style="color:var(--ok);">${totalOK}</span><span class="criterios-resumo__lbl">Conformes</span></div>
      <div class="criterios-resumo__item" data-tipo="falha"><span class="criterios-resumo__num" style="color:var(--danger);">${totalFalha}</span><span class="criterios-resumo__lbl">Inconformes</span></div>
      <div class="criterios-resumo__item" data-tipo="na"><span class="criterios-resumo__num" style="color:var(--neutral);">${totalNA}</span><span class="criterios-resumo__lbl">N/A</span></div>
      <div class="criterios-resumo__item"><span class="criterios-resumo__num" style="color:var(--brand);">${totalAplic}</span><span class="criterios-resumo__lbl">Aplicáveis</span></div>
    </div>
    <div style="padding: 12px 14px; background: var(--surface-2); border-radius: var(--radius-sm); margin-bottom: var(--sp-5); font-size: 12.5px; color: var(--text-muted); line-height: 1.6;">
      <strong style="color:var(--text);">Contexto aplicado:</strong>
      Modalidade <b>${escapeHtml(perfis.modalidade)}</b> ·
      Natureza <b>${escapeHtml(perfis.natureza)}</b> ·
      Critério <b>${escapeHtml(labelCriterio(perfis.criterio))}</b>
    </div>
    ${gruposHtml || '<p style="text-align:center;color:var(--text-dim);padding:24px;">Nenhum critério a exibir.</p>'}
    <div class="aviso-orientativo" style="margin-top: var(--sp-5);">
      <strong>Nota</strong>
      <span>${escapeHtml(AVISO_ORIENTATIVO.replace(/^Nota:\s*/, ''))}</span>
    </div>`;
  els.modalCriterios.classList.remove('is-hidden');
}
function fecharModalCriterios() { els.modalCriterios.classList.add('is-hidden'); els.modalCriteriosBody.innerHTML = ''; }

/* ==========================================================================
 * 16. VISUALIZADOR DE TEXTO
 * ======================================================================== */
function abrirModalVisualizador(procId, arqId) {
  const p = state.processos.find(x => x.id === procId);
  const a = p?.arquivos.find(x => x.id === arqId);
  if (!a) { toast('Arquivo não encontrado.', 'error'); return; }

  const texto = (a.texto || '').toString();
  const conteudo = texto.length > 0
    ? texto
    : (a.status === 'erro'
        ? `⚠️ Este arquivo não pôde ser processado.\n\nMotivo: ${a.erro || 'erro desconhecido'}`
        : '(Nenhum conteúdo textual disponível para este arquivo.)');

  els.modalVizTitulo.textContent = `Visualização — ${a.nomeArquivo}`;
  els.viewerFileName.textContent = a.nomeArquivo;
  els.viewerFileInfo.textContent = `${formatBytes(a.tamanho || 0)} · ${conteudo.length.toLocaleString('pt-BR')} caracteres · ${a.status === 'ok' ? 'processado' : (a.status === 'erro' ? 'erro' : 'pendente')}${a.licitareq ? ' · LicitaReq' : ''}`;
  els.viewerText.textContent = conteudo;
  els.viewerText.scrollTop = 0;

  els.modalVisualizador.classList.remove('is-hidden');
  setTimeout(() => { try { els.viewerText.focus(); } catch(_){} }, 60);
}
function fecharModalVisualizador() {
  els.modalVisualizador.classList.add('is-hidden');
  els.viewerText.textContent = '';
  els.viewerFileName.textContent = '—';
  els.viewerFileInfo.textContent = '—';
  els.modalVizTitulo.textContent = 'Visualização de Texto';
}
async function copiarTextoVisualizador() {
  const texto = els.viewerText.textContent || '';
  if (!texto.trim()) { toast('Nada para copiar.', 'error'); return; }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
    } else {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast('Texto copiado para a área de transferência.', 'ok');
  } catch (_) { toast('Não foi possível copiar.', 'error'); }
}

/* ==========================================================================
 * 17. PDF (mantido integralmente da v7.2 — resumido aqui por brevidade)
 * ======================================================================== */
const PDF_PALETTE = {
  primaria: '#1e3a8a', secundaria: '#2563eb', texto: '#1e293b',
  textoMuted: '#64748b', textoDim: '#94a3b8', zebra: '#f8fafc', borda: '#e2e8f0',
  headerTexto: '#ffffff',
  okBg: '#dcfce7', okFg: '#15803d', warnBg: '#fef3c7', warnFg: '#b45309',
  dangerBg: '#fee2e2', dangerFg: '#b91c1c', neutralBg: '#e2e8f0', neutralFg: '#475569',
  licitareqBg: '#e0e7ff', licitareqFg: '#4338ca', accentTeal: '#0f766e',
};
function _riscoCor(r) {
  if (r === 'ALTO')  return { bg: PDF_PALETTE.dangerBg, fg: PDF_PALETTE.dangerFg };
  if (r === 'MÉDIO') return { bg: PDF_PALETTE.warnBg,   fg: PDF_PALETTE.warnFg };
  return { bg: PDF_PALETTE.okBg, fg: PDF_PALETTE.okFg };
}
function _severidadeCor(s) {
  if (s === 'CRITICA') return { bg: PDF_PALETTE.dangerBg, fg: PDF_PALETTE.dangerFg, label: 'CRÍTICA' };
  if (s === 'MEDIA')   return { bg: PDF_PALETTE.warnBg,   fg: PDF_PALETTE.warnFg,   label: 'MÉDIA' };
  return { bg: '#e0f2fe', fg: '#075985', label: 'BAIXA' };
}
function gerarDefinicaoPDF(rep, opts = {}) {
  const tipo = opts.tipo || 'arquivo';
  const nome = opts.nome || 'Documento';
  const id = rep.identificacao || {};
  const st = rep.estatisticas || {};
  const risco = rep.risco || 'BAIXO';
  const score = rep.score || 0;
  const coresRisco = _riscoCor(risco);
  const P = PDF_PALETTE;
  const notas = opts.notas || '';
  const licitareqInfo = opts.licitareqInfo || null;
  const dataGeracao = new Date();
  const dataFmt = dataGeracao.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const numRel = String(Math.floor(Math.random() * 900) + 100) + '/' + dataGeracao.getFullYear();

  const header = () => ({ margin: [40, 22, 40, 0], columns: [
    { text: '', width: '*' },
    { text: 'SISTEMA LICITAAUDIT · LEI Nº 14.133/2021', alignment: 'right', fontSize: 8, color: P.textoMuted, characterSpacing: 0.4 }
  ]});
  const footer = (cur, tot) => ({ margin: [40, 20, 40, 0], columns: [
    { text: `Emitido em ${dataFmt} · Relatório nº ${numRel}`, fontSize: 8, color: P.textoDim },
    { text: `Página ${cur} de ${tot}`, alignment: 'right', fontSize: 8, color: P.textoDim }
  ]});
  const banner = { table: { widths: ['*'], body: [[{
    text: tipo === 'processo' ? 'RELATÓRIO CONSOLIDADO DE AUDITORIA' : 'RELATÓRIO DE AUDITORIA DE CONFORMIDADE',
    fillColor: P.primaria, color: '#ffffff', fontSize: 12, bold: true, alignment: 'center', margin: [0, 8, 0, 8]
  }]] }, layout: 'noBorders', margin: [0, 0, 0, 4] };
  const subtitulo = { text: nome, fontSize: 10, color: P.textoMuted, alignment: 'center', italics: true, margin: [0, 0, 0, 14] };
  const perfil = {
    table: { widths: ['22%', '78%'], body: [
      [{ text: 'PERFIL DA LICITAÇÃO', colSpan: 2, bold: true, fontSize: 9, color: '#fff', fillColor: P.secundaria, alignment: 'center', margin: [0, 4, 0, 4] }, {}],
      [{ text: 'Modalidade:', bold: true, color: P.primaria, fontSize: 9 }, { text: id.modalidade || '—', fontSize: 9, color: P.texto }],
      [{ text: 'Natureza do Objeto:', bold: true, color: P.primaria, fontSize: 9 }, { text: id.natureza || '—', fontSize: 9, color: P.texto }],
      [{ text: 'Critério:', bold: true, color: P.primaria, fontSize: 9 }, { text: labelCriterio(id.criterio), fontSize: 9, color: P.texto }],
      [{ text: 'Órgão / Entidade:', bold: true, color: P.primaria, fontSize: 9 }, { text: id.orgao || 'Não informado', fontSize: 9, color: P.texto }],
      [{ text: 'Nº do Processo:', bold: true, color: P.primaria, fontSize: 9 }, { text: id.processo || 'Não identificado', fontSize: 9, color: P.texto }],
      [{ text: 'Objeto:', bold: true, color: P.primaria, fontSize: 9 }, { text: id.objeto || 'Não identificado', fontSize: 9, color: P.texto }],
    ]},
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => P.borda,
      paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 10, paddingRight: () => 10,
      fillColor: (i) => i === 1 ? null : (i % 2 === 0 ? P.zebra : null)
    }, margin: [0, 0, 0, 12]
  };
  const licBloco = licitareqInfo ? {
    table: { widths: ['*'], body: [[{
      stack: [
        { text: '⬢ ARQUIVO LICITAREQ RECONHECIDO', fontSize: 8.5, bold: true, color: P.licitareqFg, characterSpacing: 0.5 },
        { text: [
          licitareqInfo.processo ? `Processo: ${licitareqInfo.processo}. ` : '',
          licitareqInfo.unidade ? `Unidade: ${licitareqInfo.unidade}. ` : '',
          licitareqInfo.valor > 0 ? `Valor: ${licitareqInfo.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. ` : '',
          licitareqInfo.empresa ? `Empresa mencionada: ${licitareqInfo.empresa}. ` : '',
          licitareqInfo.emergencia ? 'Sinalização de EMERGÊNCIA. ' : '',
          licitareqInfo.inexigibilidade ? 'Sinalização de INEXIGIBILIDADE. ' : ''
        ], fontSize: 8.5, color: P.licitareqFg, margin: [0, 4, 0, 0] }
      ], fillColor: P.licitareqBg, margin: [10, 8, 10, 8]
    }]] }, layout: 'noBorders', margin: [0, 0, 0, 12]
  } : { text: '', margin: [0, 0, 0, 0] };

  const totalInconf = st.falha || 0, totalCrit = st.criticas || 0, totalMed = st.medias || 0, totalBai = st.baixas || 0;
  const totalNA = st.ignoradas || 0, totalAplic = st.aplicaveis || 0;
  const dashboard = {
    table: { widths: ['*', '*', '*', '*'], body: [[
      { stack: [
        { text: 'CONFORMIDADE', fontSize: 7.5, bold: true, color: P.textoMuted, characterSpacing: 0.4, alignment: 'center' },
        { text: `${score}%`, fontSize: 20, bold: true, color: P.primaria, alignment: 'center', margin: [0, 4, 0, 0] }
      ], fillColor: P.zebra, margin: [6, 10, 6, 10] },
      { stack: [
        { text: 'RISCO', fontSize: 7.5, bold: true, color: P.textoMuted, characterSpacing: 0.4, alignment: 'center' },
        { table: { widths: ['*'], body: [[{ text: risco, fontSize: 11, bold: true, color: coresRisco.fg, fillColor: coresRisco.bg, alignment: 'center', margin: [0, 5, 0, 5] }]] }, layout: 'noBorders', margin: [0, 6, 0, 0] }
      ], fillColor: P.zebra, margin: [6, 10, 6, 10] },
      { stack: [
        { text: 'ACHADOS', fontSize: 7.5, bold: true, color: P.textoMuted, characterSpacing: 0.4, alignment: 'center' },
        { text: String(totalInconf), fontSize: 20, bold: true, color: totalInconf > 0 ? P.dangerFg : P.okFg, alignment: 'center', margin: [0, 4, 0, 0] },
        { text: `${totalCrit}C · ${totalMed}M · ${totalBai}B`, fontSize: 7, color: P.textoDim, alignment: 'center', margin: [0, 2, 0, 0] }
      ], fillColor: P.zebra, margin: [6, 10, 6, 10] },
      { stack: [
        { text: 'ESCOPO', fontSize: 7.5, bold: true, color: P.textoMuted, characterSpacing: 0.4, alignment: 'center' },
        { text: String(totalAplic), fontSize: 20, bold: true, color: P.secundaria, alignment: 'center', margin: [0, 4, 0, 0] },
        { text: `${totalNA} N/A`, fontSize: 7, color: P.neutralFg, alignment: 'center', margin: [0, 2, 0, 0] }
      ], fillColor: P.zebra, margin: [6, 10, 6, 10] }
    ]]},
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => P.borda, vLineColor: () => P.borda },
    margin: [0, 0, 0, 12]
  };
  const avisoPDF = {
    table: { widths: ['*'], body: [[{
      text: AVISO_ORIENTATIVO, fontSize: 8, color: P.textoMuted, italics: true,
      fillColor: P.zebra, margin: [10, 8, 10, 8], alignment: 'justify'
    }]] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => P.borda, vLineColor: () => P.borda },
    margin: [0, 0, 0, 14]
  };
  const notasBloco = (tipo === 'processo' && notas.trim()) ? {
    table: { widths: ['*'], body: [[{
      stack: [
        { text: '📝 NOTAS DO AUDITOR', fontSize: 8.5, bold: true, color: P.primaria, characterSpacing: 0.5 },
        { text: notas.trim(), fontSize: 9, color: P.texto, margin: [0, 5, 0, 0], alignment: 'justify', lineHeight: 1.4 }
      ], fillColor: P.zebra, margin: [10, 10, 10, 10]
    }]] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => P.borda, vLineColor: () => P.borda },
    margin: [0, 0, 0, 14]
  } : { text: '', margin: [0, 0, 0, 0] };
  const blocos = st.porBloco || {};
  const linhasBlocos = [1, 2, 3, 4, 5, 6].map(b => {
    const x = blocos[b] || { titulo: BLOCO_TITULO[b], total: 0, ok: 0, falha: 0, na: 0 };
    const pct = x.total > 0 ? Math.round((x.ok / x.total) * 100) : 100;
    const corPct = x.total === 0 ? P.neutralFg : (pct >= 90 ? P.okFg : pct >= 70 ? P.warnFg : P.dangerFg);
    return [
      { text: `B${b}`, alignment: 'center', fontSize: 8.5, color: P.primaria, bold: true },
      { text: x.titulo, fontSize: 8.5, color: P.texto },
      { text: `${x.ok}/${x.total}`, alignment: 'center', fontSize: 8.5, color: P.textoMuted },
      { text: String(x.falha), alignment: 'center', fontSize: 8.5, color: x.falha > 0 ? P.dangerFg : P.textoMuted, bold: x.falha > 0 },
      { text: x.na > 0 ? String(x.na) : '—', alignment: 'center', fontSize: 8.5, color: P.neutralFg, italics: true },
      { text: x.total > 0 ? `${pct}%` : 'N/A', alignment: 'center', fontSize: 8.5, color: corPct, bold: x.total > 0 }
    ];
  });
  const resumoBlocos = {
    table: { headerRows: 1, widths: ['6%', '42%', '14%', '12%', '12%', '14%'], body: [
      [
        { text: '#', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: 'BLOCO DE VERIFICAÇÃO', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, margin: [0, 4, 0, 4] },
        { text: 'OK/TOTAL', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: 'FALHAS', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: 'N/A', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: '% OK', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, alignment: 'center', margin: [0, 4, 0, 4] }
      ],
      ...linhasBlocos
    ]},
    layout: {
      hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => P.borda, vLineColor: () => P.borda,
      fillColor: (i) => i === 0 ? P.primaria : (i % 2 === 0 ? P.zebra : null),
      paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 6, paddingRight: () => 6
    }, margin: [0, 0, 0, 14]
  };
  const achadosTodas = (rep.resultados || []).filter(r => r.aplicavel && !r.conforme);
  const achadosPrio = achadosTodas.filter(r => r.severidade !== 'BAIXA');
  const achadosSec = achadosTodas.filter(r => r.severidade === 'BAIXA');
  const mkCellAchado = r => {
    const sc = _severidadeCor(r.severidade);
    return [
      { stack: [
        { text: sc.label, fontSize: 7, bold: true, color: sc.fg, alignment: 'center' },
        { text: `[${r.id}]`, fontSize: 6.5, color: P.textoDim, alignment: 'center', margin: [0, 1, 0, 0] }
      ], fillColor: sc.bg, margin: [2, 4, 2, 4] },
      { stack: [
        { text: r.nome, fontSize: 8.5, bold: true, color: '#0f172a' },
        { text: r.mensagemFalha, fontSize: 7.5, color: '#475569', margin: [0, 2, 0, 2] },
        { text: `→ ${r.recomendacao}`, fontSize: 7, color: P.accentTeal, italics: true }
      ], margin: [4, 3, 4, 3] },
      { text: r.fundamento, fontSize: 7, color: P.secundaria, italics: true, margin: [4, 3, 4, 3] }
    ];
  };
  const achadosBody = achadosTodas.length === 0
    ? [[{ text: '—', alignment: 'center', color: P.textoDim, fontSize: 9 },
        { text: 'Nenhuma inconformidade identificada.', italics: true, color: P.okFg, colSpan: 3, fontSize: 9, alignment: 'center', margin: [0, 10, 0, 10] }, {}, {}]]
    : [...achadosPrio.map(mkCellAchado),
       ...(achadosSec.length > 0 ? [[
         { text: 'BAIXAS', fontSize: 7, bold: true, color: P.textoMuted, alignment: 'center' },
         { text: `${achadosSec.length} inconformidade(s) baixa(s) — vide sistema.`, fontSize: 7.5, color: P.textoMuted, italics: true, colSpan: 2, margin: [4, 3, 4, 3] }, {}
       ]] : [])];
  const detalhado = {
    table: { headerRows: 1, dontBreakRows: true, widths: ['14%', '60%', '26%'], body: [
      [
        { text: 'GRAU', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: 'ACHADO E RECOMENDAÇÃO', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, margin: [0, 4, 0, 4] },
        { text: 'FUNDAMENTO LEGAL', bold: true, fontSize: 8, color: '#fff', fillColor: P.primaria, margin: [0, 4, 0, 4] }
      ], ...achadosBody
    ]},
    layout: {
      hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => P.borda, vLineColor: () => P.borda,
      fillColor: (i) => i === 0 ? P.primaria : null,
      paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 6, paddingRight: () => 6
    }, margin: [0, 0, 0, 16]
  };
  const parecerTexto = risco === 'ALTO'
    ? 'Publicação desaconselhada — vícios críticos/impeditivos. Saneamento integral antes de qualquer publicação.'
    : risco === 'MÉDIO'
      ? 'Aprovado com ressalvas — inconformidades médias devem ser sanadas previamente à publicação.'
      : 'Aprovado — contempla os requisitos essenciais da Lei nº 14.133/2021.';
  const corParecerBg = risco === 'ALTO' ? P.dangerBg : risco === 'MÉDIO' ? P.warnBg : P.okBg;
  const parecer = {
    table: { widths: ['*'], body: [[{
      stack: [
        { text: 'PARECER TÉCNICO', fontSize: 8, bold: true, color: P.primaria, characterSpacing: 0.5 },
        { text: parecerTexto, fontSize: 9, color: P.texto, margin: [0, 5, 0, 0], alignment: 'justify', lineHeight: 1.4 }
      ], fillColor: corParecerBg, margin: [12, 10, 12, 10]
    }]]}, layout: 'noBorders', margin: [0, 0, 0, 20]
  };
  const assinatura = {
    table: { dontBreakRows: true, widths: ['*'], body: [[{
      stack: [
        { text: ' ', margin: [0, 16, 0, 0] },
        { canvas: [{ type: 'line', x1: 130, y1: 0, x2: 385, y2: 0, lineWidth: 0.8, lineColor: '#334155' }] },
        { text: 'Equipe de Auditoria de Controle Interno', fontSize: 9.5, bold: true, alignment: 'center', margin: [0, 5, 0, 2], color: P.texto },
        { text: 'LicitaAudit — Análise Automatizada', fontSize: 8, alignment: 'center', color: P.textoMuted },
        { text: `${dataFmt} · Relatório ${numRel}`, fontSize: 7.5, alignment: 'center', color: P.textoDim, margin: [0, 4, 0, 0] }
      ], margin: [0, 6, 0, 6]
    }]]}, layout: 'noBorders'
  };

  return {
    pageSize: 'A4', pageMargins: [40, 50, 40, 50], header, footer,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: P.texto, lineHeight: 1.3 },
    content: [
      banner, subtitulo, perfil, licBloco, dashboard, avisoPDF, notasBloco,
      { text: 'RESUMO POR BLOCO DE VERIFICAÇÃO', style: 'secaoTitulo', keepWithNext: true },
      resumoBlocos,
      { text: 'ACHADOS PRIORITÁRIOS', style: 'secaoTitulo', keepWithNext: true },
      detalhado, parecer, assinatura
    ],
    styles: { secaoTitulo: { fontSize: 10.5, bold: true, color: P.primaria, margin: [0, 8, 0, 6], characterSpacing: 0.3, keepWithNext: true } }
  };
}
function exportarRelatorioAuditPDF(arq, processo = null) {
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  if (!arq || arq.status !== 'ok') { toast('Arquivo não disponível.', 'error'); return; }
  const dd = gerarDefinicaoPDF(arq, { tipo: 'arquivo', nome: arq.nomeArquivo, licitareqInfo: arq.licitareq || null });
  const safe = String(arq.nomeArquivo || 'arquivo').replace(/[/\\?%*:|"<>]/g, '_');
  try { pdfMake.createPdf(dd).download(`Relatorio_${safe}.pdf`); toast('PDF individual gerado.', 'ok'); }
  catch (e) { console.error(e); toast('Erro ao gerar PDF.', 'error'); }
}
function exportarRelatorioProcessoConsolidadoPDF(processo) {
  const arquivosOk = (processo?.arquivos || []).filter(a => a.status === 'ok');
  if (!arquivosOk.length) { toast('Nenhum arquivo analisado.', 'error'); return; }
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  const corpus = arquivosOk.map(a => `\n===== ${a.nomeArquivo} =====\n${a.texto}`).join('\n');
  const paramObjeto     = (processo.metadados?.natureza  !== 'auto') ? processo.metadados.natureza  : els.paramObjeto.value;
  const paramModalidade = (processo.metadados?.modalidade !== 'auto') ? processo.metadados.modalidade : els.paramModalidade.value;
  const paramCriterio   = (processo.metadados?.criterio   !== 'auto') ? processo.metadados.criterio   : els.paramCriterio.value;
  const res = analisarTextoIndividual(corpus, { paramObjeto, paramModalidade, paramCriterio, nomeArquivo: '' });
  const arquivosLR = processo.arquivos.filter(a => a.licitareq && a.licitareq.licitareq);
  const licInfo = arquivosLR.length ? arquivosLR[0].licitareq : null;
  const dd = gerarDefinicaoPDF(res, { tipo: 'processo', nome: processo.nome, notas: processo.notas || '', licitareqInfo: licInfo });
  const safe = String(processo.nome || 'processo').replace(/[/\\?%*:|"<>]/g, '_');
  try { pdfMake.createPdf(dd).download(`Relatorio_Processo_${safe}.pdf`); toast('PDF consolidado gerado.', 'ok'); }
  catch (e) { console.error(e); toast('Erro ao gerar PDF.', 'error'); }
}
function exportarPDFTodos() {
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  const lista = state.processos.filter(p => p.arquivos.some(a => a.status === 'ok'));
  if (!lista.length) { toast('Nenhum processo com arquivos.', 'error'); return; }
  const contents = [];
  lista.forEach((p, idx) => {
    const arquivosOk = p.arquivos.filter(a => a.status === 'ok');
    const corpus = arquivosOk.map(a => `\n===== ${a.nomeArquivo} =====\n${a.texto}`).join('\n');
    const paramObjeto     = (p.metadados?.natureza  !== 'auto') ? p.metadados.natureza  : els.paramObjeto.value;
    const paramModalidade = (p.metadados?.modalidade !== 'auto') ? p.metadados.modalidade : els.paramModalidade.value;
    const paramCriterio   = (p.metadados?.criterio   !== 'auto') ? p.metadados.criterio   : els.paramCriterio.value;
    const res = analisarTextoIndividual(corpus, { paramObjeto, paramModalidade, paramCriterio, nomeArquivo: '' });
    const arquivosLR = p.arquivos.filter(a => a.licitareq && a.licitareq.licitareq);
    const licInfo = arquivosLR.length ? arquivosLR[0].licitareq : null;
    const dd = gerarDefinicaoPDF(res, { tipo: 'processo', nome: p.nome, notas: p.notas || '', licitareqInfo: licInfo });
    if (idx > 0) contents.push({ text: '', pageBreak: 'before' });
    contents.push(...dd.content);
  });
  const ddFinal = {
    pageSize: 'A4', pageMargins: [40, 50, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_PALETTE.texto, lineHeight: 1.3 },
    header: () => ({ margin: [40, 22, 40, 0], columns: [
      { text: '', width: '*' },
      { text: 'SISTEMA LICITAAUDIT · LOTE DE RELATÓRIOS', alignment: 'right', fontSize: 8, color: PDF_PALETTE.textoMuted, characterSpacing: 0.4 }
    ]}),
    footer: (p, n) => ({ margin: [40, 20, 40, 0], columns: [
      { text: 'Documento gerado pelo LicitaAudit · Lei nº 14.133/2021', fontSize: 8, color: PDF_PALETTE.textoDim },
      { text: `Página ${p} de ${n}`, alignment: 'right', fontSize: 8, color: PDF_PALETTE.textoDim }
    ]}),
    content: contents
  };
  try { pdfMake.createPdf(ddFinal).download(`LicitaAudit_Lote_${Date.now()}.pdf`); toast(`${lista.length} processo(s) em PDF único.`, 'ok'); }
  catch (e) { console.error(e); toast('Erro ao gerar PDF em lote.', 'error'); }
}

/* ==========================================================================
 * 18. JSON
 * ======================================================================== */
function exportarJSON(processos = null) {
  const lista = processos || state.processos;
  const payload = {
    ferramenta: 'LicitaAudit', versao: '7.3.0', exportadoEm: new Date().toISOString(),
    processos: lista.map(p => ({
      id: p.id, nome: p.nome, cor: p.cor, tags: p.tags, criadoEm: p.criadoEm,
      notas: p.notas || '',
      metadados: p.metadados || { modalidade: 'auto', natureza: 'auto', criterio: 'auto' },
      arquivos: p.arquivos.filter(a => a.status === 'ok').map(a => ({
        id: a.id, nomeArquivo: a.nomeArquivo, ext: a.ext, tamanho: a.tamanho,
        score: a.score, risco: a.risco, identificacao: a.identificacao,
        estatisticas: a.estatisticas, resultados: a.resultados, correcoes: a.correcoes,
        licitareq: a.licitareq || null,
        texto: a.texto ? a.texto.slice(0, 200000) : '',
      })),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `licitaudit-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('JSON exportado.', 'ok');
}
function lerArquivoComoTexto(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target?.result || '');
    r.onerror = () => reject(r.error || new Error('Falha na leitura.'));
    r.readAsText(file, 'utf-8');
  });
}
function normalizarProcessoImportado(proc) {
  const arquivos = Array.isArray(proc?.arquivos) ? proc.arquivos : [];
  return {
    id: proc?.id || uid('proc'),
    nome: (proc?.nome && String(proc.nome).trim()) || 'Processo importado',
    cor: proc?.cor || CORES_PRESET[state.processos.length % CORES_PRESET.length],
    tags: Array.isArray(proc?.tags) ? proc.tags.slice(0, 24) : [],
    criadoEm: proc?.criadoEm || new Date().toISOString(),
    notas: proc?.notas || '',
    metadados: proc?.metadados || { modalidade: 'auto', natureza: 'auto', criterio: 'auto' },
    _importadoEm: new Date().toISOString(),
    arquivos: arquivos.filter(a => a && typeof a === 'object').map(a => ({
      ...a,
      id: a.id || uid('arq'),
      nomeArquivo: a.nomeArquivo || 'arquivo_importado',
      ext: a.ext || 'txt',
      tamanho: a.tamanho || (a.texto ? a.texto.length : 0),
      status: 'ok',
      resultados: Array.isArray(a.resultados) ? a.resultados : [],
      correcoes: Array.isArray(a.correcoes) ? a.correcoes : [],
      estatisticas: a.estatisticas || { total: MATRIZ_CORE_30.length, aplicaveis: 0, ignoradas: 0, ok: 0, falha: 0, criticas: 0, medias: 0, baixas: 0, porBloco: {} },
      identificacao: a.identificacao || {},
      licitareq: a.licitareq || false,
    })),
  };
}
function extrairProcessosDoJSON(dados) {
  if (dados && Array.isArray(dados.processos)) return dados.processos;
  if (Array.isArray(dados)) return dados;
  if (dados && typeof dados === 'object' && (dados.id || dados.nome || dados.arquivos)) return [dados];
  return [];
}
async function importarJSONMultiplos(files) {
  const lista = Array.from(files || []).filter(f => f && /\.json$/i.test(f.name));
  if (!lista.length) { toast('Nenhum arquivo .json válido.', 'error'); return; }
  showLoader(`Importando ${lista.length} arquivo(s)…`);
  let totalP = 0, totalA = 0, totalRen = 0, totalColArq = 0;
  const falhas = [];
  for (const file of lista) {
    try {
      const dados = JSON.parse(await lerArquivoComoTexto(file));
      const brutos = extrairProcessosDoJSON(dados);
      if (!brutos.length) { falhas.push(`${file.name}: estrutura não reconhecida`); continue; }
      for (const bruto of brutos) {
        const novo = normalizarProcessoImportado(bruto);
        if (state.processos.some(p => p.id === novo.id)) {
          novo.id = uid('proc');
          novo.nome = `${novo.nome} (Importado)`;
          totalRen++;
        }
        const idsArq = new Set(state.processos.flatMap(p => p.arquivos.map(a => a.id)));
        novo.arquivos.forEach(a => {
          if (idsArq.has(a.id)) { a.id = uid('arq'); totalColArq++; }
          idsArq.add(a.id);
        });
        state.processos.push(novo);
        totalP++; totalA += novo.arquivos.length;
      }
    } catch (err) { console.error(err); falhas.push(`${file.name}: ${err.message || 'JSON inválido'}`); }
  }
  hideLoader();
  if (totalP > 0) {
    if (!state.ativo) state.ativo = state.processos[0]?.id || null;
    renderTudo();
    const partes = [`✅ ${totalP} processo(s)`, `${totalA} arquivo(s)`, `de ${lista.length} JSON`];
    if (totalRen > 0) partes.push(`· ${totalRen} renomeado(s)`);
    if (totalColArq > 0) partes.push(`· ${totalColArq} ID(s) regenerado(s)`);
    if (falhas.length) partes.push(`· ${falhas.length} ignorado(s)`);
    toast(partes.join(' '), 'ok');
  } else {
    toast(`⚠️ Nenhum processo importado (${lista.length} arquivo(s)).`, 'error');
  }
}
async function importarJSON(file) { return importarJSONMultiplos([file]); }

/* ==========================================================================
 * 19. TEMA
 * ======================================================================== */
function initTheme() {
  const stored = localStorage.getItem('licitaudit:theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', stored || (prefersDark ? 'dark' : 'light'));
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('licitaudit:theme', next);
}

/* ==========================================================================
 * 20. EXEMPLO
 * ======================================================================== */
function carregarExemplo() {
  const exemplo = `PROCESSO ADMINISTRATIVO: 00000.004512/2026-88
MODALIDADE: Pregão Eletrônico
OBJETO: Aquisição de Workstations e Notebooks para modernização do parque tecnológico.

1. JUSTIFICATIVA
Necessidade de modernização do parque tecnológico visando eficiência e economicidade.

2. ESTIMATIVA DE QUANTIDADES
30 (trinta) workstations e 20 (vinte) notebooks.

3. PESQUISA DE PREÇOS
Painel de Preços, contratações similares e fornecedores do ramo.

4. DOTAÇÃO ORÇAMENTÁRIA
Programa de trabalho 12.345.6789.0001.

5. ETP e TR
Estudo Técnico Preliminar (ETP) e Termo de Referência (TR) anexos.

6. PARCELAMENTO
Parcelado em 2 lotes por compatibilidade técnica.

7. VEDAÇÕES
Vedada a indicação de marca ou modelo. Vedada a participação de servidores do órgão.
Exigência de declaração de trabalho infantil. Vedada a contratação de empresas suspensas no CEIS/CNEP.

8. HABILITAÇÃO
Qualificação técnica. Declaração formal em substituição à vistoria.

9. CRITÉRIO
Menor preço.

10. PRAZOS E PUBLICAÇÃO
Prazo mínimo de 8 (oito) dias úteis. Publicação no PNCP. Impugnação em fase única com 3 dias úteis.

11. GESTÃO CONTRATUAL
Fiscal titular e fiscal substituto designados. Gestor do contrato designado.
Recebimento provisório e definitivo. Pagamento em até 30 dias após aceite. Sanções administrativas previstas.`;

  const exemploLR = `LicitaReq — Documento de Formalização de Demanda
Memorando nº 042/2026
Unidade Requisitante: Diretoria de Tecnologia da Informação

OBJETO: Aquisição de Lâmpadas LED para modernização da iluminação predial.

Valor estimado: R$ 32.500,00 (trinta e dois mil e quinhentos reais)

Justificativa: Necessidade de modernização do parque tecnológico visando eficiência
energética e economicidade.

Dotação orçamentária prevista no programa de trabalho 12.345.6789.0001.

Documento gerado eletronicamente pelo sistema LicitaReq — Motor de regras Lei 14.133/2021`;

  const p1 = criarProcesso('Processo A — Aquisição de TI');
  p1.cor = CORES_PRESET[0]; p1.tags = ['TI', 'Urgente', '2026'];
  const p2 = criarProcesso('Processo B — Lâmpadas LED (LicitaReq)');
  p2.cor = CORES_PRESET[1]; p2.tags = ['LicitaReq', 'Consumo'];
  const p3 = criarProcesso('Processo C — Obra Pública');
  p3.cor = CORES_PRESET[2]; p3.tags = ['Obra', 'Engenharia'];

  (async () => {
    const res1 = analisarTextoIndividual(exemplo, { paramObjeto: 'auto', paramModalidade: 'auto', paramCriterio: 'auto', nomeArquivo: 'Edital.txt' });
    p1.arquivos.push({
      id: uid('arq'), nomeArquivo: 'Edital_Pregao_00000.004512-2026.txt',
      ext: 'txt', tamanho: new Blob([exemplo]).size,
      texto: exemplo, status: 'ok', ...res1,
    });

    const res2 = analisarTextoIndividual(exemploLR, { paramObjeto: 'auto', paramModalidade: 'auto', paramCriterio: 'auto', nomeArquivo: 'Requerimento_LicitaReq_042.txt' });
    p2.arquivos.push({
      id: uid('arq'), nomeArquivo: 'Requerimento_LicitaReq_042.txt',
      ext: 'txt', tamanho: new Blob([exemploLR]).size,
      texto: exemploLR, status: 'ok', ...res2,
      licitareq: !!res2.licitareq,
    });

    state.ativo = p1.id;
    renderTudo();
    toast('Exemplo carregado com arquivo LicitaReq.', 'ok');
  })();
}

/* ==========================================================================
 * 21. MENU MOBILE + IMPORT JSON
 * ======================================================================== */
function abrirSidebar() {
  els.sidebar?.classList.add('is-open');
  els.sidebarOverlay?.classList.add('is-open');
  els.sidebarToggle?.setAttribute('aria-expanded', 'true');
}
function fecharSidebar() {
  els.sidebar?.classList.remove('is-open');
  els.sidebarOverlay?.classList.remove('is-open');
  els.sidebarToggle?.setAttribute('aria-expanded', 'false');
}
function abrirInputJSONMultiplo() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.accept = '.json,application/json,text/plain';
  inp.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
  inp.setAttribute('aria-hidden', 'true');
  document.body.appendChild(inp);
  const limpar = () => { if (inp.parentNode) inp.parentNode.removeChild(inp); };
  inp.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    limpar();
    if (!files.length) { toast('Nenhum arquivo selecionado.', 'error'); return; }
    await importarJSONMultiplos(files);
  });
  inp.addEventListener('cancel', limpar);
  inp.click();
}

/* ==========================================================================
 * 22. EVENTOS GLOBAIS E BOOTSTRAP
 * ======================================================================== */
function bindEventosGlobais() {
  els.btnNovoProcesso?.addEventListener('click', () => criarProcesso());
  els.btnNovoProcessoEmpty?.addEventListener('click', () => criarProcesso());
  els.btnCarregarExemplo?.addEventListener('click', carregarExemplo);
  els.themeToggle?.addEventListener('click', toggleTheme);
  els.pdfAllBtn?.addEventListener('click', exportarPDFTodos);
  els.jsonBtn?.addEventListener('click', () => exportarJSON());
  els.jsonLoadBtn?.addEventListener('click', abrirInputJSONMultiplo);
  els.jsonLoadInput?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (files.length) await importarJSONMultiplos(files);
    e.target.value = '';
  });

  /* Fechar modais */
  $$('[data-close-modal]').forEach(el => el.addEventListener('click', fecharModal));
  $$('[data-close-modal-crit]').forEach(el => el.addEventListener('click', fecharModalCriterios));
  $$('[data-close-modal-viz]').forEach(el => el.addEventListener('click', fecharModalVisualizador));

  /* Botão copiar do visualizador */
  els.btnCopiarTextoArq?.addEventListener('click', copiarTextoVisualizador);

  /* Esc fecha modal mais alto */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!els.modalVisualizador.classList.contains('is-hidden')) { fecharModalVisualizador(); return; }
    if (!els.modalCriterios.classList.contains('is-hidden'))    { fecharModalCriterios();    return; }
    if (!els.modal.classList.contains('is-hidden'))             { fecharModal();             return; }
    fecharSidebar();
  });

  els.sidebarToggle?.addEventListener('click', () => {
    els.sidebar.classList.contains('is-open') ? fecharSidebar() : abrirSidebar();
  });
  els.sidebarOverlay?.addEventListener('click', fecharSidebar);
  els.sidebar?.addEventListener('click', e => {
    if (window.matchMedia('(max-width: 768px)').matches && e.target.closest('button, .btn')) fecharSidebar();
  });

  ['paramObjeto', 'paramModalidade', 'paramCriterio'].forEach(id => {
    els[id]?.addEventListener('change', () => {
      state.processos.forEach(p => reanalisarProcesso(p));
      renderTudo();
      toast('Parâmetros globais atualizados em tempo real.', 'ok');
    });
  });

  ['dragover','drop'].forEach(evt =>
    window.addEventListener(evt, e => { if (!e.target.closest?.('[data-drop]')) e.preventDefault(); })
  );
}

function bootstrap() {
  initTheme();
  configurePdfWorker();
  bindEventosGlobais();
  renderTudo();
  console.info(
    '%cLicitaAudit',
    'background:#1e3a8a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
    '· v7.3 · Requerimentos/DFD separados + Visualizador de texto'
  );
}
document.addEventListener('DOMContentLoaded', bootstrap);
