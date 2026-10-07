/* ============================================================================
 * LicitaAudit · app.js — v6.7.1
 * ----------------------------------------------------------------------------
 * • Motor abrangente + relatório PDF editorial executivo (v6.6)
 * • Importação múltipla de JSON com merge inteligente (v6.7)
 * • FIX v6.7.1: input file criado dinamicamente (multiple garantido)
 * ========================================================================== */
'use strict';

/* ==========================================================================
 * 1. ESTADO E DOM
 * ======================================================================== */
const state = { processos: [], ativo: null, isBusy: false };

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const els = {
  btnNovoProcesso:      $('#btnNovoProcesso'),
  btnNovoProcessoEmpty: $('#btnNovoProcessoEmpty'),
  btnCarregarExemplo:   $('#btnCarregarExemplo'),
  tabsProcessos:        $('#tabsProcessos'),
  emptyState:           $('#emptyState'),
  workspace:            $('#workspace'),
  subtitle:             $('#topbarSubtitle'),
  themeToggle:          $('#themeToggle'),
  paramObjeto:          $('#paramObjeto'),
  paramModalidade:      $('#paramModalidade'),
  paramCriterio:        $('#paramCriterio'),
  pdfAllBtn:            $('#pdfAllBtn'),
  jsonBtn:              $('#jsonBtn'),
  jsonLoadBtn:          $('#jsonLoadBtn'),
  jsonLoadInput:        $('#jsonLoadInput'),
  loader:               $('#loader'),
  loaderText:           $('#loaderText'),
  toast:                $('#toast'),
  modal:                $('#modal'),
  modalTitulo:          $('#modalTitulo'),
  modalBody:            $('#modalBody'),
  sidebar:              $('#sidebar'),
  sidebarToggle:        $('#sidebarToggle'),
  sidebarOverlay:       $('#sidebarOverlay'),
};

/* ==========================================================================
 * 2. CONSTANTES E UTILITÁRIOS
 * ======================================================================== */
const LIMITE_DISPENSA_BENS_SERVICOS = 50000.00;
const LIMITE_DISPENSA_OBRAS          = 100000.00;
const PESOS = { CRITICA: 5, MEDIA: 2, BAIXA: 0.5 };
const CORES_PRESET = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#64748b'];

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
const formatarValorBR = (n) => !n || n <= 0 ? '' : n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

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
    pregao:          /\bpreg[aã]o(\s+eletr[oô]nico)?\b/i,
    concorrencia:    /\bconcorr[eê]ncia\b/i,
    concurso:        /\bconcurso\b/i,
    leilao:          /\bleil[aã]o\b/i,
    dialogo:         /\bdi[aá]logo\s+competitivo\b/i,
    dispensa:        /\bdispensa\b/i,
    inexigibilidade: /\binexigibilidade\b/i,
  },
  orcamento: [/\bestimativa\s+de\s+valor\b/i, /\bvalor\s+estimado\b/i, /\bvalor\s+global\b/i, /R\$\s*[\d.,]+/i],
  alienacao: /aliena[cç][aã]o|venda\s+de\s+bens|inserv[íi]ve(is|l)|desfazimento|maior\s+lance/i,
  emergencia: /emerg[êe]ncial?|emerg[êe]ncia|calamidade|desastre|defesa\s+civil/i,
  tic: /(\bsoftware\b|cloud\s+computing|datacenter|licen[cç]a\s+de\s+software|help\s*desk|service\s*desk|consultoria\s+em\s+ti|desenvolvimento\s+de\s+sistema|\berp\b|aplicativo\s+m[óo]vel|hospedagem\s+em\s+nuvem|suporte\s+t[eé]cnico\s+especializado\s+em\s+ti)/i,
  tiEquipamentos: /(computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|servidor(es)?\s+de\s+rede|switch(es)?\s+gerenci|roteador(es)?|firewall(s)?|nobreak|estabilizador|hd\s+externo|ssd|mem[óo]ria\s+ram|processador|placa\s+de\s+v[íi]deo|mouse|teclado|webcam|tablet(s)?)/i,
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
 * 4. PARSER DE TEXTO — RADICAL-BASED E ABRANGENTE
 * ======================================================================== */
function extrairModalidade(corpus) {
  const rot = corpus.match(/(?:modalidade\s+(?:de\s+licita[cç][aã]o|licitat[oó]ria|adotada|declarada)|tipo\s+de\s+licita[cç][aã]o)\s*[:\-–—]\s*([^\n\r]{2,80})/i);
  if (rot) {
    const v = rot[1].trim();
    if (/preg[aã]o/i.test(v))                return { chave:'pregao',          rotulo:'Pregão Eletrônico' };
    if (/concorr[eê]ncia/i.test(v))          return { chave:'concorrencia',    rotulo:'Concorrência' };
    if (/leil[aã]o/i.test(v))                return { chave:'leilao',          rotulo:'Leilão Eletrônico' };
    if (/inexigibilidade/i.test(v))          return { chave:'inexigibilidade', rotulo:'Inexigibilidade' };
    if (/dispensa/i.test(v))                 return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
    if (/di[aá]logo\s+competitivo/i.test(v)) return { chave:'dialogo',         rotulo:'Diálogo Competitivo' };
    if (/concurso/i.test(v))                 return { chave:'concurso',        rotulo:'Concurso' };
  }
  if (KB.sinaisModalidade.inexigibilidade.test(corpus)) return { chave:'inexigibilidade', rotulo:'Inexigibilidade' };
  if (KB.sinaisModalidade.dispensa.test(corpus))        return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
  if (KB.sinaisModalidade.pregao.test(corpus))          return { chave:'pregao',          rotulo:'Pregão Eletrônico' };
  if (KB.sinaisModalidade.concorrencia.test(corpus))    return { chave:'concorrencia',    rotulo:'Concorrência' };
  if (KB.sinaisModalidade.leilao.test(corpus))          return { chave:'leilao',          rotulo:'Leilão Eletrônico' };
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
  const rx = /(processo|pa|prt|protocolo|unitau|edital|memorando|of[íi]cio)[\s\wºnº\.:\/-]*?(\d{3,}[\d\/\.\-]+)/i;
  const m = corpus.match(rx);
  if (m && m[2]) {
    const rotulo = m[1].trim();
    const numero = m[2].trim();
    const formatado = `${rotulo.charAt(0).toUpperCase() + rotulo.slice(1).toLowerCase()} ${numero}`;
    return formatado.replace(/\s+/g, ' ').slice(0, 80);
  }
  const fb = corpus.match(/\b(\d{2,}[\.\/]\d{2,}[\.\/\-\d]*)\b/);
  if (fb) return fb[1];
  return 'Não identificado';
}
function extrairValor(corpus) {
  const m = corpus.match(/R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
  return m ? parseValorBR(m[1]) : 0;
}
function extrairOrgao(corpus) {
  const m = corpus.match(/\b(Minist[ée]rio|Prefeitura(?:\s+Municipal)?|Tribunal|Universidade|Instituto|C[âa]mara(?:\s+Municipal)?|Secretaria|Funda[cç][aã]o|Autarquia|Departamento|Coordenadoria)[^\n,.;]{0,80}/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : 'ÓRGÃO / ENTIDADE PÚBLICA';
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
  const eBens = /(aquisi[cç][aã]o\s+de\s+bens|compra\s+de\s+bens|fornecimento\s+de\s+bens|equipament|material\s+de|computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|mobili[aá]rio|cadeira(s)?|mesa(s)?|arm[aá]rio(s)?|estante(s)?|ve[ií]culo(s)?|uniforme(s)?|medicament(o|os)|reativo|insumo|material)/i.test(texto);
  const eServicos = /(presta[cç][aã]o\s+de\s+servi|contrata[cç][aã]o\s+de\s+servi|servi[cç]os?\s+de|servi[cç]o\s+(t[eé]cnico|especializado|continuado)|manuten[cç][aã]o|suporte\s+t[eé]cnico|consultoria|assessoria|treinamento|capacita[cç][aã]o|limpeza|vigil[aâ]ncia|seguran[cç]a)/i.test(texto);
  if (eBens && !eServicos) return 'bens';
  if (eServicos && !eBens) return 'servicos';
  if (/aquisic|bens/.test(nat)) return 'bens';
  if (/servic/.test(nat))       return 'servicos';
  return 'servicos';
}
function ehObjetoEngenharia(meta, natureza, corpus) {
  const blob = [meta?.objeto?.texto || '', meta?.objeto?.tipo || '', natureza || ''].join(' ');
  if (/(obra|engenharia|reforma|constru[cç][aã]o|pavimenta)/i.test(blob)) return true;
  return /(obra\s+p[uú]blica|servi[cç]os?\s+de\s+engenharia|reforma\s+predial|pavimenta[cç][aã]o\s+asf[aá]ltica|constru[cç][aã]o\s+civil)/i.test(corpus);
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
  { id:'B1_01', bloco:1, nome:'Justificativa da necessidade pública', fundamento:'Art. 18, §1º, I', severidade:'CRITICA', aplicavel:()=>true, test:c=>/\b(justific|motiva|necessidade\s+p[uú]blica|interesse\s+p[uú]blico|finalidade)/i.test(c.corpus), mensagemFalha:'Justificativa não identificada.', recomendacao:'Elaborar seção com motivação fática e jurídica.' },
  { id:'B1_02', bloco:1, nome:'Descrição clara e precisa do objeto', fundamento:'Art. 18, §1º, II', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const tipo = c.meta.objeto.tipo || '';
      const texto = (c.meta.objeto.texto || '').toLowerCase();
      const chave = /(computador|notebook|workstation|equipament|licen[cç]a|suporte\s+t[eé]cnico|impressora|monitor|servidor|switch|roteador|software|sistema|aquisi[cç][aã]o|fornecimento|presta[cç][aã]o\s+de\s+servi|bem|material|servi[çc]o|reativo|insumo)/i.test(c.corpus);
      return tipo !== 'Não identificado' || (texto.length > 20 && chave) || chave;
    }, mensagemFalha:'Objeto insuficiente ou ambíguo.', recomendacao:'Descrever com especificações técnicas precisas.' },
  { id:'B1_03', bloco:1, nome:'Estimativa de quantitativos', fundamento:'Art. 18, §1º, III', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(quantidade|qtd\.?|unidades?|\blotes?\b|\d+\s*\([^)]{2,60}\)|\d+\s*(unid|un|pç|pc|cx|kg|l|m²|m³|resma|itens?))/i.test(c.corpus), mensagemFalha:'Quantitativos não explicitados.', recomendacao:'Apresentar planilha quantitativa com metodologia.' },
  { id:'B1_04', bloco:1, nome:'ETP ou Termo de Referência', fundamento:'Art. 6º, XXIII e XXV · Art. 18, §1º', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(estudo\s+t[eé]cnico\s+preliminar|\bETP\b|termo\s+de\s+refer[eê]ncia|\bTR\b|projeto\s+b[aá]sico|\bPB\b|anteprojeto|especifica[cç][õo]es\s+deste\s+edital)/i.test(c.corpus), mensagemFalha:'Documento estruturante ausente.', recomendacao:'Anexar ETP e TR (ou Projeto Básico).' },
  { id:'B1_05', bloco:1, nome:'Decisão motivada sobre parcelamento', fundamento:'Art. 47', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(parcelament|divis[aã]o\s+em\s+lotes|indivis[íi]vel|lote\s+[uú]nico|n[aã]o\s+parcel)/i.test(c.corpus), mensagemFalha:'Sem decisão sobre parcelamento.', recomendacao:'Motivar o parcelamento ou a indivisibilidade.' },
  { id:'B2_01', bloco:2, nome:'Estimativa de valor e metodologia', fundamento:'Art. 23', severidade:'CRITICA', aplicavel:()=>true, test:c=>c.meta.valor > 0 || firstMatch(c.corpus, KB.orcamento), mensagemFalha:'Estimativa de valor ausente.', recomendacao:'Elaborar planilha orçamentária com múltiplas fontes.' },
  { id:'B2_02', bloco:2, nome:'Indicação da dotação orçamentária', fundamento:'Art. 18, §1º, V · Art. 150', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(dota[cç][aã]o\s+or[cç]ament|programa\s+de\s+trabalho|natureza\s+de\s+despesa|fonte\s+de\s+recurso)/i.test(c.corpus), mensagemFalha:'Dotação não indicada.', recomendacao:'Indicar dotação, programa e natureza de despesa.' },
  { id:'B2_03', bloco:2, nome:'Declaração de adequação orçamentária', fundamento:'Art. 150', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(\bLRF\b|responsabilidade\s+fiscal|\bLDO\b|adequa[cç][aã]o\s+or[cç]ament)/i.test(c.corpus), mensagemFalha:'Sem declaração de adequação.', recomendacao:'Declarar adequação orçamentária e financeira.' },
  { id:'B2_04', bloco:2, nome:'Limite de dispensa por valor', fundamento:'Art. 75, I e II', severidade:'CRITICA', aplicavel:c=>/dispensa/i.test(c.modalidade?.modalidade || ''), test:c=>{
      const obra = /obras?\s+e\s+servi[cç]os\s+de\s+engenharia/i.test(c.natureza);
      const lim = obra ? LIMITE_DISPENSA_OBRAS : LIMITE_DISPENSA_BENS_SERVICOS;
      if (!c.meta.valor || c.meta.valor <= 0) return false;
      return c.meta.valor <= lim;
    }, mensagemFalha:'Valor acima do teto para dispensa.', recomendacao:'Reclassificar modalidade ou revisar valor.' },
  { id:'B2_05', bloco:2, nome:'Referência SINAPI/SICRO (obras)', fundamento:'Art. 23, §2º', severidade:'MEDIA',
    aplicavel: c => ehObjetoEngenharia(c.meta, c.natureza, c.corpus),
    test: c => /(SINAPI|SICRO|tabela\s+de\s+refer[eê]ncia|composi[cç][aã]o\s+de\s+custos|or[cç]amento\s+referencial)/i.test(c.corpus),
    mensagemFalha:'Sem referência SINAPI/SICRO.', recomendacao:'Comprovar compatibilidade com SINAPI/SICRO.' },
  { id:'B3_01', bloco:3, nome:'Ausência de direcionamento de marca', fundamento:'Art. 41, I', severidade:'CRITICA',
    aplicavel:()=>true,
    test:c=>{
      const vedacaoA = /(vedad[ao]|proibid[ao]|sem|aus[êe]ncia)\s+.{0,80}?\b(marca|modelo|fabricante)\b/i.test(c.corpus);
      const vedacaoB = /(marca\s+exclusiva|indica[cç][aã]o\s+de\s+marca).{0,80}?\b(vedad[ao]|proibid[ao])/i.test(c.corpus);
      if (vedacaoA || vedacaoB) return true;
      const temMarcaEspecifica = /\b(marca|modelo|fabricante)\s*[:\-]\s*[A-ZÀ-Ú][\w-]{1,30}/i.test(c.corpus);
      if (!temMarcaEspecifica) return true;
      return /(padroniza|carta\s+de\s+exclusividade|atestado\s+de\s+exclusividade|justificativa\s+t[eé]cnica\s+de\s+padroniza|art\.?\s*41\s*,?\s*i\b)/i.test(c.corpus);
    },
    mensagemFalha:'Indicação de marca sem justificativa.',
    recomendacao:'Inserir cláusula de vedação OU justificativa de padronização (Art. 41, I).' },
  { id:'B3_02', bloco:3, nome:'Vedação de participação de servidores', fundamento:'Art. 14, I', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(servidores?\s+do\s+[óo]rg[ãa]o|membros?\s+da\s+comiss[aã]o|art\.?\s*14,?\s*i\b|v[eé]dad[ao]\s+ao\s+servidor|impedimento\s+de\s+servidor|agente\s+p[uú]blico)/i.test(c.corpus), mensagemFalha:'Sem cláusula de vedação a servidores.', recomendacao:'Incluir cláusula vedando participação de servidores (Art. 14, I).' },
  { id:'B3_03', bloco:3, nome:'Vedação a empresas suspensas', fundamento:'Art. 14, III', severidade:'MEDIA',
    aplicavel:()=>true,
    test:c=>/(\bceis\b|\bcnep\b|suspen[sa][oa]?|impedid[ao]|sancionad[ao]|inid[ôo]ne[ao]|art\.?\s*14)/i.test(c.corpus),
    mensagemFalha:'Sem vedação a empresas impedidas.',
    recomendacao:'Explicitar vedação e consulta CEIS/CNEP (Art. 14, III).' },
  { id:'B3_04', bloco:3, nome:'Declaração sobre trabalho infantil', fundamento:'Art. 68, VI', severidade:'MEDIA',
    aplicavel:()=>true,
    test:c=>/(infantil|menor(?:es)?\s+de\s+18|trabalho\s+noturno|perigoso|insalubre|art\.?\s*68|n[aã]o\s+emprego\s+de\s+menores)/i.test(c.corpus),
    mensagemFalha:'Sem declaração sobre trabalho infantil.',
    recomendacao:'Exigir declaração de não emprego de menores (Art. 68, VI).' },
  { id:'B3_05', bloco:3, nome:'Qualificação técnica e vistoria', fundamento:'Art. 67 · Art. 63, § único', severidade:'MEDIA', aplicavel:()=>true, test:c=>{
      if (/(exig[êe]ncia\s+excessiva|desproporcional|afunilad[ao])/i.test(c.corpus)) return false;
      const v = /(vistoria|visita\s+t[eé]cnica)/i.test(c.corpus);
      if (!v) return true;
      return /(declara[cç][aã]o\s+formal|substitui[cç][aã]o\s+d[aa]\s+vistoria|dispensa\s+de\s+vistoria|art\.?\s*63,?\s*§\s*[uú]nico|em\s+substitui[cç][aã]o\s+[àa]\s+vistoria)/i.test(c.corpus);
    }, mensagemFalha:'Exigência excessiva OU vistoria sem alternativa.', recomendacao:'Permitir declaração em substituição à vistoria.' },
  { id:'B4_01', bloco:4, nome:'Coerência modalidade × natureza', fundamento:'Art. 6º, XLI · Art. 28 a 32', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const mod = (c.modalidade?.modalidade || '').toLowerCase();
      const nat = (c.natureza || '').toLowerCase();
      const obj = ((c.meta?.objeto?.texto || '') + ' ' + (c.meta?.objeto?.tipo || '')).toLowerCase();
      if (mod.includes('pregão')) return /bens|comuns|servi[cç]|aquisi[cç]|fornecimento|ti\b|tic\b|tecnologia\s+da\s+informa|equipament|computador|notebook|workstation|impressora|monitor|material|mobili|reativo|insumo/.test(nat) || /bens|comuns|ti\b|tic\b|equipament|computador|notebook|workstation|impressora|monitor|material|mobili|software|hardware|reativo|insumo/.test(obj);
      if (mod.includes('concorrência')) return /obra|engenharia|t[eé]cnic|tic|intelectual|especializ|complexid/.test(nat) || /obra|engenharia|t[eé]cnic|intelectual|especializ|complexid/.test(obj);
      if (mod.includes('leilão')) return /aliena|inserv[íi]vel|desfazimento/.test(nat) || /aliena|inserv[íi]vel|desfazimento/.test(obj);
      return true;
    }, mensagemFalha:'Modalidade incompatível com o objeto.', recomendacao:'Reavaliar modalidade (Arts. 6º, XLI e 28 a 32).' },
  { id:'B4_02', bloco:4, nome:'Inexigibilidade: inviabilidade de competição', fundamento:'Art. 74, I e III', severidade:'CRITICA', aplicavel:c=>/inexigibilidade/i.test(c.modalidade?.modalidade || ''), test:c=>/(inviabilidade\s+de\s+competi|exclusividade|fornecedor\s+exclusivo|not[oó]ria\s+especializa|atestado\s+de\s+exclusividade|carta\s+de\s+exclusividade)/i.test(c.corpus), mensagemFalha:'Inexigibilidade sem caracterização.', recomendacao:'Instruir com atestado de exclusividade ou notória especialização.' },
  { id:'B4_03', bloco:4, nome:'Inexigibilidade: justificativa de preço', fundamento:'Art. 74, §2º', severidade:'MEDIA', aplicavel:c=>/inexigibilidade/i.test(c.modalidade?.modalidade || ''), test:c=>/(notas?\s+fiscais?|contratos?\s+anterior|pre[cç]os?\s+praticad)/i.test(c.corpus), mensagemFalha:'Sem justificativa de preço.', recomendacao:'Juntar notas fiscais ou contratos anteriores.' },
  { id:'B4_04', bloco:4, nome:'Dispensa Emergencial: caracterização', fundamento:'Art. 75, VIII e §1º', severidade:'CRITICA', aplicavel:c=>/dispensa/i.test(c.modalidade?.modalidade || '') && KB.emergencia.test(c.corpus), test:c=>/(risco\s+iminente|paralisa[cç][aã]o|desabastecimento)/i.test(c.corpus) && /(1\s+ano|12\s+meses|sem\s+prorroga)/i.test(c.corpus), mensagemFalha:'Emergência não caracterizada OU prazo > 1 ano.', recomendacao:'Caracterizar risco iminente e prazo ≤ 1 ano.' },
  { id:'B4_05', bloco:4, nome:'Critério de julgamento declarado', fundamento:'Art. 33', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(menor\s+pre[cç]o|maior\s+desconto|melhor\s+t[eé]cnica|t[eé]cnica\s+e\s+pre[cç]o|maior\s+lance|maior\s+retorno)/i.test(c.corpus) || c.criterio !== 'indefinido', mensagemFalha:'Critério não declarado.', recomendacao:'Declarar critério entre os do Art. 33.' },
  { id:'B5_01', bloco:5, nome:'Prazo mínimo de 8 dias úteis (bens)', fundamento:'Art. 55, I, "a"', severidade:'CRITICA', aplicavel:c=>/preg[aã]o/i.test(c.modalidade?.modalidade || '') && c.meta?.tipoObjeto === 'bens', test:c=>/(8\s*\(?[oO]ito\)?\s*dias\s*[uú]teis|prazo\s+m[íi]nimo\s+de\s+8\s+dias|art\.?\s*55,?\s*i,?\s*["']?a["']?|8\s+dias\s+[uú]teis|oito\s+dias)/i.test(c.corpus), mensagemFalha:'Pregão de bens sem prazo de 8 dias.', recomendacao:'Fixar prazo mínimo de 8 dias úteis.' },
  { id:'B5_02', bloco:5, nome:'Prazo mínimo de 10 dias úteis (serviços)', fundamento:'Art. 55, I, "b"', severidade:'CRITICA', aplicavel:c=>/preg[aã]o/i.test(c.modalidade?.modalidade || '') && c.meta?.tipoObjeto === 'servicos', test:c=>/(10\s+dias|dez\s+dias)/i.test(c.corpus), mensagemFalha:'Pregão de serviços sem prazo de 10 dias.', recomendacao:'Fixar prazo mínimo de 10 dias úteis.' },
  { id:'B5_03', bloco:5, nome:'Prazo mínimo de 35 dias úteis (Concorrência)', fundamento:'Art. 55, II', severidade:'CRITICA', aplicavel:c=>/concorr[eê]ncia/i.test(c.modalidade?.modalidade || ''), test:c=>/(35\s+dias|trinta\s+e\s+cinco)/i.test(c.corpus), mensagemFalha:'Concorrência sem prazo de 35 dias.', recomendacao:'Fixar prazo mínimo de 35 dias úteis.' },
  { id:'B5_04', bloco:5, nome:'Publicação no PNCP', fundamento:'Art. 54', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(PNCP|Portal\s+Nacional\s+de\s+Contrata)/i.test(c.corpus), mensagemFalha:'Sem menção ao PNCP.', recomendacao:'Prever publicação obrigatória no PNCP.' },
  { id:'B5_05', bloco:5, nome:'Impugnação e recurso', fundamento:'Art. 164 · Art. 165', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(impugna[cç][õo]es?|esclarecimento|impugn[aá]vel)/i.test(c.corpus) || /(fase\s+[uú]nica|3\s+dias|tr[eê]s\s+dias|recurso|art\.?\s*165)/i.test(c.corpus), mensagemFalha:'Sem regras de impugnação/recurso.', recomendacao:'Fixar impugnação e recurso em fase única.' },
  { id:'B6_01', bloco:6, nome:'Fiscal e gestor designados', fundamento:'Art. 117', severidade:'CRITICA', aplicavel:()=>true, test:c=>{
      const t = /(fiscal\s+titular|fiscaliza[cç][aã]o\s+do\s+contrato)/i.test(c.corpus);
      const s = /(fiscal\s+substituto|fiscal\s+suplente|substituto)/i.test(c.corpus);
      const g = /(gestor\s+do\s+contrato|gest[aã]o\s+contratual)/i.test(c.corpus);
      return t && (s || g);
    }, mensagemFalha:'Fiscal/gestor não designados.', recomendacao:'Designar fiscal titular, substituto e gestor (Art. 117).' },
  { id:'B6_02', bloco:6, nome:'Segregação de funções', fundamento:'Art. 7º, §1º', severidade:'CRITICA', aplicavel:()=>true, test:c=>/(segrega[cç][aã]o\s+de\s+fun[cç][õo]es|agente\s+de\s+contrata|pregoeiro|equipe\s+de\s+apoio)/i.test(c.corpus), mensagemFalha:'Segregação de funções não observada.', recomendacao:'Designar separadamente agente, pregoeiro e equipe.' },
  { id:'B6_03', bloco:6, nome:'Recebimento provisório e definitivo', fundamento:'Art. 140', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(recebido\s+provisoriamente|recebimento\s+definitivo|recebimento\s+provis[óo]rio|aceite\s+provis[óo]rio|aceite\s+definitivo|art\.?\s*140)/i.test(c.corpus), mensagemFalha:'Sem critérios de recebimento.', recomendacao:'Definir recebimento provisório e definitivo.' },
  { id:'B6_04', bloco:6, nome:'Pagamento em até 30 dias', fundamento:'Art. 141', severidade:'BAIXA', aplicavel:()=>true, test:c=>/(30\s+dias|trinta\s+dias).{0,40}(pagamento|nota\s+fiscal|aceite)/i.test(c.corpus) || /(pagamento).{0,40}(30\s+dias|trinta\s+dias)/i.test(c.corpus) || !/pagamento/i.test(c.corpus), mensagemFalha:'Prazo de pagamento não fixado.', recomendacao:'Fixar pagamento em até 30 dias após NF e aceite.' },
  { id:'B6_05', bloco:6, nome:'Sanções administrativas', fundamento:'Art. 155', severidade:'MEDIA', aplicavel:()=>true, test:c=>/(san[cç][õo]es\s+administrativas|multa|advert[êe]ncia|impedimento\s+de\s+contratar)/i.test(c.corpus), mensagemFalha:'Sanções não previstas.', recomendacao:'Prever sanções graduadas do Art. 155.' },
];

/* ==========================================================================
 * 6. MOTOR DE AVALIAÇÃO
 * ======================================================================== */
function executarAuditoriaArquivo(corpus, meta, natureza, modalidade, criterio) {
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
  const risco = calcularRiscoArquivo(score, criticas);

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
  const soma = ok.reduce((s, a) => s + a.score, 0);
  return Math.round((soma / ok.length) * 10) / 10;
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
  for (let b = 1; b <= 6; b++) {
    agg[b] = { titulo: BLOCO_TITULO[b], total: 0, ok: 0, falha: 0, criticas: 0, medias: 0, baixas: 0 };
  }
  arquivos.filter(a => a.status === 'ok' && Array.isArray(a.resultados))
    .forEach(a => {
      a.resultados.filter(r => r.aplicavel).forEach(r => {
        const b = r.bloco;
        if (!agg[b]) return;
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
 * 7. ANÁLISE INDIVIDUAL DE TEXTO
 * ======================================================================== */
function analisarTextoIndividual(corpus, opts = {}) {
  const metaBase = {
    modalidade: extrairModalidade(corpus),
    objeto:     extrairObjeto(corpus),
    valor:      extrairValor(corpus),
    processo:   extrairProcesso(corpus),
    orgao:      extrairOrgao(corpus),
    empresa:    corpus.match(KB.empresa)?.[0]?.trim() || null,
  };
  const naturezaBase = classificarNatureza(corpus, opts.paramObjeto || 'auto');

  const modalidadeLabel = opts.paramModalidade && opts.paramModalidade !== 'auto'
    ? (() => {
        const m = {
          pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência', concurso: 'Concurso',
          leilao: 'Leilão Eletrônico', dialogo: 'Diálogo Competitivo',
          dispensa: 'Dispensa de Licitação', inexigibilidade: 'Inexigibilidade',
        };
        return m[opts.paramModalidade] || metaBase.modalidade.rotulo;
      })()
    : metaBase.modalidade.rotulo;

  const criterio = opts.paramCriterio && opts.paramCriterio !== 'auto'
    ? opts.paramCriterio
    : extrairCriterio(corpus);

  const tipoObjeto = classificarTipoObjeto({ objeto: metaBase.objeto, natureza: naturezaBase });
  const meta = { ...metaBase, natureza: naturezaBase, modalidade: modalidadeLabel, criterio, tipoObjeto };

  const auditoria = executarAuditoriaArquivo(corpus, meta, naturezaBase, { modalidade: modalidadeLabel }, criterio);

  const objetoExibicao = (
    meta.objeto.texto && meta.objeto.texto.trim().length >= 5
      ? meta.objeto.texto.trim().slice(0, 200)
      : meta.objeto.tipo || 'Não identificado'
  );

  return {
    score: auditoria.score,
    risco: auditoria.risco,
    identificacao: {
      objeto: objetoExibicao, objetoTipo: meta.objeto.tipo,
      modalidade: meta.modalidade, natureza: meta.natureza, criterio,
      processo: meta.processo, orgao: meta.orgao, empresa: meta.empresa,
      caracteresAnalisados: corpus.length,
      linhasAnalisadas: corpus.split(/\r?\n/).length,
    },
    estatisticas: {
      total: MATRIZ_CORE_30.length,
      aplicaveis: auditoria.totalAplicaveis,
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
 * 9. CRUD DE PROCESSOS
 * ======================================================================== */
function criarProcesso(nome) {
  const proc = {
    id: uid('proc'),
    nome: nome || `Processo ${state.processos.length + 1}`,
    cor: CORES_PRESET[state.processos.length % CORES_PRESET.length],
    tags: [], arquivos: [], criadoEm: new Date().toISOString(),
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

/* ==========================================================================
 * 10. ADIÇÃO DE ARQUIVOS
 * ======================================================================== */
async function adicionarArquivos(procId, fileList) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  const files = Array.from(fileList).filter(Boolean);
  if (!files.length) return;

  showLoader('Extraindo e analisando…');
  const paramObjeto     = els.paramObjeto.value;
  const paramModalidade = els.paramModalidade.value;
  const paramCriterio   = els.paramCriterio.value;

  for (const file of files) {
    const entry = {
      id: uid('arq'), nomeArquivo: file.name, ext: extOf(file.name),
      tamanho: file.size, texto: '', status: 'loading', erro: null, _ref: file,
    };
    p.arquivos.push(entry);
    renderWorkspace();

    try {
      entry.texto = await extractFileText(entry._ref);
      entry.status = 'ok';
      const res = analisarTextoIndividual(entry.texto, { paramObjeto, paramModalidade, paramCriterio });
      Object.assign(entry, res);
    } catch (err) {
      entry.status = 'erro';
      entry.erro = err.message || 'Erro ao processar.';
    } finally {
      delete entry._ref;
      renderWorkspace();
    }
  }
  hideLoader();
  toast(`${files.length} arquivo(s) adicionado(s).`, 'ok');
}
function removerArquivo(procId, arqId) {
  const p = state.processos.find(x => x.id === procId);
  if (!p) return;
  p.arquivos = p.arquivos.filter(a => a.id !== arqId);
  renderWorkspace();
  toast('Arquivo removido.', 'ok');
}

/* ==========================================================================
 * 11. RENDERIZAÇÃO
 * ======================================================================== */
function renderTudo() {
  renderTabs(); renderEmptyOuWorkspace(); renderSubtitle(); renderBotoesExportacao();
}
function renderSubtitle() {
  const total = state.processos.length;
  const totalArq = state.processos.reduce((s, p) => s + p.arquivos.length, 0);
  els.subtitle.textContent = total === 0 ? 'Nenhum processo criado' : `${total} processo(s) · ${totalArq} arquivo(s)`;
}
function renderBotoesExportacao() {
  els.pdfAllBtn.disabled = !state.processos.some(p => p.arquivos.length > 0);
}
function renderEmptyOuWorkspace() {
  if (!state.processos.length) {
    els.emptyState.classList.remove('is-hidden');
    els.workspace.classList.add('is-hidden');
    return;
  }
  if (!state.ativo || !state.processos.find(p => p.id === state.ativo)) {
    state.ativo = state.processos[0].id;
  }
  els.emptyState.classList.add('is-hidden');
  els.workspace.classList.remove('is-hidden');
  renderWorkspace();
}
function renderTabs() {
  const tabs = state.processos.map(p => {
    const ativo = p.id === state.ativo;
    const risco = calcularRiscoProcesso(p.arquivos);
    const corRisco = risco === 'ALTO' ? 'var(--danger)' : risco === 'MÉDIO' ? 'var(--warn)' : risco === 'BAIXO' ? 'var(--ok)' : 'var(--text-dim)';
    const borderLeftColor = ativo ? p.cor : 'transparent';
    const dotColor = p.cor || corRisco;
    return `
      <button class="tab ${ativo ? 'is-active' : ''}" role="tab" aria-selected="${ativo}"
              data-tab-proc="${p.id}" title="${escapeHtml(p.nome)}"
              style="border-left-color:${borderLeftColor};">
        <span class="tab__dot" style="background:${dotColor};"></span>
        ${escapeHtml(truncate(p.nome, 24))}
      </button>`;
  }).join('');

  const btnNovo = `
    <button class="tab tab--add" data-novo-processo type="button" title="Criar novo processo">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14m-7-7h14" stroke-linecap="round" /></svg>
      Criar Processo
    </button>`;

  els.tabsProcessos.innerHTML = tabs + btnNovo;
  $$('[data-tab-proc]').forEach(btn => {
    btn.addEventListener('click', () => { state.ativo = btn.dataset.tabProc; renderTudo(); });
  });
  $('[data-novo-processo]')?.addEventListener('click', () => criarProcesso());
}
function renderBlocoCard(num, dados) {
  const pct = dados.total > 0 ? Math.round((dados.ok / dados.total) * 100) : 100;
  const nivel = nivelConformidade(pct);
  return `
    <article class="bloco-card" data-bloco="${num}">
      <header class="bloco-card__head">
        <span class="bloco-card__num">B${num}</span>
        <h4 class="bloco-card__titulo" title="${escapeHtml(dados.titulo)}">${escapeHtml(dados.titulo)}</h4>
        <span class="bloco-card__pct">${pct}%</span>
      </header>
      <div class="bloco-card__progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="bloco-card__progress-bar" data-nivel="${nivel}" style="width:${pct}%;"></div>
      </div>
      <footer class="bloco-card__foot">
        <span class="chip chip--ok">✓ ${dados.ok}/${dados.total}</span>
        ${dados.criticas ? `<span class="chip chip--danger">● ${dados.criticas} crítica${dados.criticas>1?'s':''}</span>` : ''}
        ${dados.medias   ? `<span class="chip chip--warn">● ${dados.medias} média${dados.medias>1?'s':''}</span>`   : ''}
        ${(!dados.criticas && !dados.medias && dados.baixas) ? `<span class="chip">● ${dados.baixas} baixa${dados.baixas>1?'s':''}</span>` : ''}
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

  if (!todos.length) {
    return `<p style="padding:1.1rem 1.25rem;color:var(--ok);font-size:13px;font-weight:600;">✓ Nenhuma inconformidade identificada no processo.</p>`;
  }
  const linhas = todos.map(t => {
    const sev = t.severidade === 'CRITICA' ? 'alto' : t.severidade === 'MEDIA' ? 'medio' : 'baixo';
    const sevLabel = t.severidade === 'CRITICA' ? 'Crítica' : t.severidade === 'MEDIA' ? 'Média' : 'Baixa';
    return `
      <tr>
        <td data-label="Grau"><span class="badge badge--${sev}">${sevLabel}</span></td>
        <td data-label="Bloco"><strong>B${t.bloco}</strong> · ${escapeHtml(t.nome)}</td>
        <td data-label="Arquivo" class="texto-recortado" title="${escapeHtml(t.arquivo)}">${escapeHtml(truncate(t.arquivo, 30))}</td>
        <td data-label="Fundamento" class="texto-longo-quebra">
          <em style="color:var(--brand);font-family:var(--font-mono);font-size:11px;">${escapeHtml(t.fundamento)}</em>
        </td>
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
function renderWorkspace() {
  const p = getProcessoAtivo();
  if (!p) return;

  const scoreConsolidado  = calcularScoreProcesso(p.arquivos);
  const riscoConsolidado  = calcularRiscoProcesso(p.arquivos);
  const arquivosOk        = p.arquivos.filter(a => a.status === 'ok');

  const corRisco = riscoConsolidado === 'ALTO' ? 'var(--danger)' : riscoConsolidado === 'MÉDIO' ? 'var(--warn)' : riscoConsolidado === 'BAIXO' ? 'var(--ok)' : 'var(--text-dim)';
  const badgeCls = riscoConsolidado === 'ALTO' ? 'badge--alto' : riscoConsolidado === 'MÉDIO' ? 'badge--medio' : riscoConsolidado === 'BAIXO' ? 'badge--baixo' : 'badge--neutro';
  const emoji = riscoConsolidado === 'ALTO' ? '🔴' : riscoConsolidado === 'MÉDIO' ? '🟡' : riscoConsolidado === 'BAIXO' ? '🟢' : '⚪';

  const totalArquivos   = p.arquivos.length;
  const totalAplicaveis = arquivosOk.reduce((s, a) => s + (a.estatisticas?.aplicaveis || 0), 0);
  const totalInconf     = arquivosOk.reduce((s, a) => s + (a.estatisticas?.falha || 0), 0);

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
            ${p.tags.map(t => `<span class="tag">${escapeHtml(t)}<b data-remove-tag="${escapeHtml(t)}" data-proc="${p.id}">&times;</b></span>`).join('')}
            <button class="tag-add" data-add-tag="${p.id}" type="button">+ Tag</button>
          </div>
        </div>
        <div class="ws-header__right">
          <input type="color" class="color-picker" value="${p.cor}" data-color="${p.id}" title="Cor de identificação" />
          <button class="btn-icon danger" data-delete-proc="${p.id}" title="Excluir processo" type="button">🗑</button>
        </div>
      </header>

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
          <p>${totalArquivos === 0 ? 'Adicione arquivos para calcular a conformidade.' : `${totalArquivos} documento(s) · ${totalAplicaveis} regras aplicáveis · ${totalInconf} inconformidade(s)`}</p>
          <div class="meta-line">
            <span><strong>${totalArquivos}</strong> arquivo(s)</span>
            <span><strong>${totalAplicaveis}</strong> verificações</span>
            <span><strong>${totalInconf}</strong> achados</span>
          </div>
        </div>
        <div><span class="badge ${badgeCls}">${emoji} ${riscoConsolidado}</span></div>
      </section>

      <section aria-label="Resumo por bloco de verificação">
        <h3 style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;margin:0 0 .75rem;">Resumo por Bloco de Verificação</h3>
        <div class="grid-blocos">${blocosHtml}</div>
      </section>

      ${totalInconf > 0 ? `
        <section class="ws-secao" style="margin-bottom:1.25rem;">
          <header class="ws-secao__head">
            <span class="ws-secao__title">Quadro Consolidado de Não Conformidades</span>
            <span class="ws-secao__count">${totalInconf}</span>
          </header>
          ${renderAchadosConsolidados(arquivosOk)}
        </section>` : ''}

      <section class="ws-secao">
        <header class="ws-secao__head">
          <span class="ws-secao__title">Documentos do Processo</span>
          <span class="ws-secao__count">${totalArquivos}</span>
        </header>
        ${totalArquivos === 0
          ? `<p style="padding:1.25rem 1.1rem;color:var(--text-dim);font-size:13px;font-style:italic;">Nenhum arquivo adicionado. Use a área abaixo para enviar documentos.</p>`
          : `<div class="tabela-responsive-wrapper"><table class="tabela-arquivos">
              <thead><tr><th class="col-arquivo">Arquivo</th><th class="col-score">Conformidade</th><th class="col-risco">Risco</th><th class="col-acoes">Ações</th></tr></thead>
              <tbody>${p.arquivos.map(a => renderLinhaArquivo(p.id, a)).join('')}</tbody>
            </table></div>`}
        <div class="ws-dropzone" data-drop="${p.id}" tabindex="0" role="button">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" stroke-linecap="round"/>
          </svg>
          <p>Arraste arquivos aqui ou <strong>clique para selecionar</strong></p>
          <p style="font-size:11.5px;color:var(--text-dim);">PDF · DOCX · DOC · TXT</p>
        </div>
      </section>

      <div class="ws-actions" style="margin-top:1rem;">
        <button class="btn btn--primary" data-pdf-proc="${p.id}" type="button" ${totalArquivos === 0 ? 'disabled' : ''}>📄 Exportar Relatório do Processo Completo (PDF)</button>
        <button class="btn btn--soft" data-json-proc="${p.id}" type="button" ${totalArquivos === 0 ? 'disabled' : ''}>💾 Salvar este Processo (JSON)</button>
      </div>
    </div>`;

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
          <button class="btn-icon" data-view-arq="${arq.id}" data-proc="${procId}" title="Ver detalhes" ${arq.status !== 'ok' ? 'disabled' : ''}>👁️</button>
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
 * 12. BIND DE EVENTOS NO WORKSPACE
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
  els.workspace.querySelector('[data-delete-proc]')?.addEventListener('click', e => excluirProcesso(e.currentTarget.dataset.deleteProc));
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
  $$('[data-pdf-arq]').forEach(btn => btn.addEventListener('click', () => {
    const p = state.processos.find(x => x.id === btn.dataset.proc);
    const a = p?.arquivos.find(x => x.id === btn.dataset.pdfArq);
    if (a && a.status === 'ok') exportarRelatorioAuditPDF(a);
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
function abrirInput(procId) {
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
 * 13. MODAL DE DETALHES
 * ======================================================================== */
function abrirModalArquivo(procId, arqId) {
  const p = state.processos.find(x => x.id === procId);
  const a = p?.arquivos.find(x => x.id === arqId);
  if (!a || a.status !== 'ok') { toast('Detalhes não disponíveis.', 'error'); return; }
  const emoji = a.risco === 'ALTO' ? '🔴' : a.risco === 'MÉDIO' ? '🟡' : a.risco === 'BAIXO' ? '🟢' : '⚪';
  const corScore = a.risco === 'ALTO' ? 'var(--danger)' : a.risco === 'MÉDIO' ? 'var(--warn)' : 'var(--ok)';
  const id = a.identificacao || {};
  const st = a.estatisticas || {};
  const achadosHtml = (a.resultados || []).filter(r => r.aplicavel).map(r => {
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
  els.modalTitulo.textContent = a.nomeArquivo;
  els.modalBody.innerHTML = `
    <div class="detalhe-score">
      <div class="detalhe-score__numero" style="color:${corScore};">${a.score.toFixed(1)}%</div>
      <div class="detalhe-score__info">
        <strong>${emoji} Risco ${a.risco}</strong>
        <p>${st.ok || 0} conformes · ${st.falha || 0} inconformidades (${st.criticas || 0} críticas · ${st.medias || 0} médias · ${st.baixas || 0} baixas)</p>
        <p>${st.aplicaveis || 0} de ${st.total || 0} regras aplicáveis</p>
      </div>
      <div style="margin-left:auto;"><button class="btn btn--primary btn--sm" id="btnPdfModal" type="button">📄 Baixar PDF Individual</button></div>
    </div>
    <div class="detalhe-meta">
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Processo</span><span class="detalhe-meta__val">${escapeHtml(id.processo || '—')}</span></div>
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Modalidade</span><span class="detalhe-meta__val">${escapeHtml(id.modalidade || '—')}</span></div>
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Natureza</span><span class="detalhe-meta__val">${escapeHtml(id.natureza || '—')}</span></div>
      <div class="detalhe-meta__item"><span class="detalhe-meta__key">Órgão</span><span class="detalhe-meta__val">${escapeHtml(id.orgao || '—')}</span></div>
    </div>
    <h4 style="margin: 6px 0 10px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); font-weight: 800;">Achados</h4>
    <div class="detalhe-lista">${achadosHtml}</div>`;
  els.modal.classList.remove('is-hidden');
  $('#btnPdfModal')?.addEventListener('click', () => exportarRelatorioAuditPDF(a));
}
function fecharModal() {
  els.modal.classList.add('is-hidden');
  els.modalBody.innerHTML = '';
}

/* ==========================================================================
 * 14. PDF INSTITUCIONAL — pdfMake (DESIGN EDITORIAL EXECUTIVO)
 * ======================================================================== */
const PDF_PALETTE = {
  primaria:    '#1e3a8a', secundaria:  '#2563eb', texto:       '#1e293b',
  textoMuted:  '#64748b', textoDim:    '#94a3b8', zebra:       '#f8fafc',
  borda:       '#e2e8f0', headerTexto: '#ffffff',
  okBg:        '#dcfce7',  okFg:     '#15803d',
  warnBg:      '#fef3c7',  warnFg:   '#b45309',
  dangerBg:    '#fee2e2',  dangerFg: '#b91c1c',
  accentTeal:  '#0f766e',
};
function _riscoCor(risco) {
  if (risco === 'ALTO')  return { bg: PDF_PALETTE.dangerBg, fg: PDF_PALETTE.dangerFg };
  if (risco === 'MÉDIO') return { bg: PDF_PALETTE.warnBg,   fg: PDF_PALETTE.warnFg };
  return { bg: PDF_PALETTE.okBg, fg: PDF_PALETTE.okFg };
}
function _severidadeCor(sev) {
  if (sev === 'CRITICA') return { bg: PDF_PALETTE.dangerBg, fg: PDF_PALETTE.dangerFg, label: 'CRÍTICO' };
  if (sev === 'MEDIA')   return { bg: PDF_PALETTE.warnBg,   fg: PDF_PALETTE.warnFg,   label: 'MÉDIO' };
  return { bg: '#e0f2fe', fg: '#075985', label: 'BAIXO' };
}
function gerarDefinicaoPDF(rep, opts = {}) {
  const tipo = opts.tipo || 'arquivo';
  const nome = opts.nome || 'Documento';
  const id = rep.identificacao || {};
  const st = rep.estatisticas || {};
  const risco = rep.risco || 'BAIXO';
  const score = rep.score || 0;
  const coresRisco = _riscoCor(risco);

  const dataGeracao = new Date();
  const dataFmt = dataGeracao.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const numeroRelatorio = String(Math.floor(Math.random() * 900) + 100) + '/' + dataGeracao.getFullYear();

  const PRIMARIA = PDF_PALETTE.primaria, SECUNDARIA = PDF_PALETTE.secundaria;
  const TEXTO = PDF_PALETTE.texto, TEXTO_MUT = PDF_PALETTE.textoMuted, TEXTO_DIM = PDF_PALETTE.textoDim;
  const ZEBRA = PDF_PALETTE.zebra, BORDA = PDF_PALETTE.borda;

  const header = () => ({
    margin: [40, 20, 40, 0],
    columns: [
      { text: '', width: '*' },
      { text: 'SISTEMA LICITAAUDIT · LEI Nº 14.133/2021', alignment: 'right', fontSize: 8, color: TEXTO_MUT, characterSpacing: 0.4 }
    ]
  });
  const footer = (currentPage, pageCount) => ({
    margin: [40, 20, 40, 0],
    columns: [
      { text: `Emitido em ${dataFmt} · Relatório nº ${numeroRelatorio}`, fontSize: 8, color: TEXTO_DIM },
      { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 8, color: TEXTO_DIM }
    ]
  });

  const banner = {
    table: { widths: ['*'], body: [[{
      text: tipo === 'processo' ? 'RELATÓRIO CONSOLIDADO DE PROCESSO' : 'RELATÓRIO DE AUDITORIA DE CONFORMIDADE LICITATÓRIA',
      fillColor: PRIMARIA, color: '#ffffff', fontSize: 13, bold: true, alignment: 'center', margin: [0, 8, 0, 8]
    }]] },
    layout: 'noBorders', margin: [0, 0, 0, 4]
  };
  const subtitulo = { text: nome, fontSize: 10, color: TEXTO_MUT, alignment: 'center', italics: true, margin: [0, 0, 0, 16] };

  const metadados = {
    table: {
      widths: ['22%', '78%'],
      body: [
        [{ text: tipo === 'processo' ? 'Processo / Workspace:' : 'Arquivo:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: nome, fontSize: 9, color: TEXTO }],
        [{ text: 'Órgão / Entidade:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: id.orgao || 'Não informado', fontSize: 9, color: TEXTO }],
        [{ text: 'Nº do Processo:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: id.processo || 'Não identificado', fontSize: 9, color: TEXTO }],
        [{ text: 'Modalidade:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: id.modalidade || 'Não identificada', fontSize: 9, color: TEXTO }],
        [{ text: 'Natureza:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: id.natureza || 'Não identificada', fontSize: 9, color: TEXTO }],
        [{ text: 'Objeto:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: id.objeto || 'Não identificado', fontSize: 9, color: TEXTO }],
        [{ text: 'Data da Análise:', bold: true, color: PRIMARIA, fontSize: 9 }, { text: dataFmt, fontSize: 9, color: TEXTO }]
      ]
    },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => BORDA,
      paddingTop: () => 7, paddingBottom: () => 7, paddingLeft: () => 10, paddingRight: () => 10,
      fillColor: (rowIndex) => rowIndex % 2 === 0 ? ZEBRA : null
    },
    margin: [0, 0, 0, 18]
  };

  const totalInconf = st.falha || 0, totalCriticas = st.criticas || 0, totalMedias = st.medias || 0, totalBaixas = st.baixas || 0;
  const dashboard = {
    table: {
      widths: ['*', '*', '*'],
      body: [[
        { stack: [
          { text: 'GRAU DE CONFORMIDADE', fontSize: 8, bold: true, color: TEXTO_MUT, characterSpacing: 0.5, alignment: 'center' },
          { text: `${score}%`, fontSize: 22, bold: true, color: PRIMARIA, alignment: 'center', margin: [0, 6, 0, 0] }
        ], fillColor: ZEBRA, margin: [8, 12, 8, 12] },
        { stack: [
          { text: 'CLASSIFICAÇÃO DE RISCO', fontSize: 8, bold: true, color: TEXTO_MUT, characterSpacing: 0.5, alignment: 'center' },
          { table: { widths: ['*'], body: [[{ text: risco, fontSize: 12, bold: true, color: coresRisco.fg, fillColor: coresRisco.bg, alignment: 'center', margin: [0, 6, 0, 6] }]] }, layout: 'noBorders', margin: [0, 6, 0, 0] }
        ], fillColor: ZEBRA, margin: [8, 12, 8, 12] },
        { stack: [
          { text: 'INCONFORMIDADES', fontSize: 8, bold: true, color: TEXTO_MUT, characterSpacing: 0.5, alignment: 'center' },
          { text: String(totalInconf), fontSize: 22, bold: true, color: totalInconf > 0 ? PDF_PALETTE.dangerFg : PDF_PALETTE.okFg, alignment: 'center', margin: [0, 6, 0, 0] },
          { text: `${totalCriticas} Críticas · ${totalMedias} Médias · ${totalBaixas} Baixas`, fontSize: 7.5, color: TEXTO_DIM, alignment: 'center', margin: [0, 3, 0, 0] }
        ], fillColor: ZEBRA, margin: [8, 12, 8, 12] }
      ]]
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BORDA, vLineColor: () => BORDA },
    margin: [0, 0, 0, 22]
  };

  const blocos = st.porBloco || {};
  const linhasBlocos = [1, 2, 3, 4, 5, 6].map(b => {
    const x = blocos[b] || { titulo: BLOCO_TITULO[b], total: 0, ok: 0, falha: 0, criticas: 0 };
    const pct = x.total > 0 ? Math.round((x.ok / x.total) * 100) : 100;
    const corPct = pct >= 90 ? PDF_PALETTE.okFg : pct >= 70 ? PDF_PALETTE.warnFg : PDF_PALETTE.dangerFg;
    return [
      { text: `B${b}`, alignment: 'center', fontSize: 9, color: PRIMARIA, bold: true },
      { text: x.titulo, fontSize: 9, color: TEXTO },
      { text: String(x.total), alignment: 'center', fontSize: 9, color: TEXTO_MUT },
      { text: String(x.ok),    alignment: 'center', fontSize: 9, color: PDF_PALETTE.okFg, bold: true },
      { text: String(x.falha), alignment: 'center', fontSize: 9, color: x.falha > 0 ? PDF_PALETTE.dangerFg : TEXTO_MUT, bold: x.falha > 0 },
      { text: `${pct}%`,       alignment: 'center', fontSize: 9, color: corPct, bold: true }
    ];
  });
  const resumoBlocos = {
    table: {
      headerRows: 1,
      widths: ['6%', '44%', '13%', '13%', '12%', '12%'],
      body: [
        [
          { text: '#', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'center', margin: [0, 4, 0, 4] },
          { text: 'BLOCO DE VERIFICAÇÃO', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, margin: [0, 4, 0, 4] },
          { text: 'APLICÁVEIS', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'center', margin: [0, 4, 0, 4] },
          { text: 'OK', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'center', margin: [0, 4, 0, 4] },
          { text: 'FALHAS', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'center', margin: [0, 4, 0, 4] },
          { text: '% OK', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'center', margin: [0, 4, 0, 4] }
        ],
        ...linhasBlocos
      ]
    },
    layout: {
      hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => BORDA, vLineColor: () => BORDA,
      fillColor: (i) => i === 0 ? PRIMARIA : (i % 2 === 0 ? ZEBRA : null),
      paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 6, paddingRight: () => 6
    },
    margin: [0, 0, 0, 20]
  };

  const falhas = (rep.resultados || []).filter(r => r.aplicavel && !r.conforme);
  const falhasBody = falhas.length === 0
    ? [[
        { text: '—', alignment: 'center', color: TEXTO_DIM, fontSize: 9 },
        { text: 'Nenhuma inconformidade identificada entre as regras aplicáveis.', italics: true, color: PDF_PALETTE.okFg, colSpan: 3, fontSize: 9, alignment: 'center', margin: [0, 10, 0, 10] },
        {}, {}
      ]]
    : falhas.map(r => {
        const sc = _severidadeCor(r.severidade);
        return [
          { stack: [
            { text: sc.label, fontSize: 7.5, bold: true, color: sc.fg, alignment: 'center' },
            { text: `[${r.id}]`, fontSize: 7, color: TEXTO_DIM, alignment: 'center', margin: [0, 2, 0, 0] }
          ], fillColor: sc.bg, margin: [2, 5, 2, 5] },
          { stack: [
            { text: r.nome, fontSize: 9, bold: true, color: '#0f172a' },
            { text: r.mensagemFalha, fontSize: 8, color: '#475569', margin: [0, 3, 0, 3] },
            { text: `→ ${r.recomendacao}`, fontSize: 7.5, color: PDF_PALETTE.accentTeal, italics: true }
          ], margin: [4, 3, 4, 3] },
          { text: r.fundamento, fontSize: 7.5, color: SECUNDARIA, italics: true, margin: [4, 3, 4, 3] }
        ];
      });
  const detalhado = {
    table: {
      headerRows: 1, dontBreakRows: true,
      widths: ['14%', '58%', '28%'],
      body: [
        [
          { text: 'GRAU / ID', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'center', margin: [0, 4, 0, 4] },
          { text: 'ACHADO E RECOMENDAÇÃO', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, margin: [0, 4, 0, 4] },
          { text: 'FUNDAMENTO LEGAL', bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, margin: [0, 4, 0, 4] }
        ],
        ...falhasBody
      ]
    },
    layout: {
      hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => BORDA, vLineColor: () => BORDA,
      fillColor: (i) => i === 0 ? PRIMARIA : null,
      paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 7, paddingRight: () => 7
    },
    margin: [0, 0, 0, 22]
  };

  const parecerTexto = risco === 'ALTO'
    ? 'PUBLICAÇÃO DESACONSELHADA — Foram identificados vícios de severidade CRÍTICA/impeditiva que comprometem a legalidade do procedimento. Recomenda-se a devolução imediata dos autos à unidade requisitante para saneamento integral antes de qualquer publicação.'
    : risco === 'MÉDIO'
      ? 'APROVADO COM RESSALVAS — A análise identificou inconformidades de severidade média que devem ser sanadas previamente à publicação do edital. Após saneamento, recomenda-se nova submissão ao controle interno.'
      : 'APROVADO — O processo apresenta conformidade com os requisitos essenciais da Lei nº 14.133/2021, estando apto ao prosseguimento instrucional.';
  const corParecerBg = risco === 'ALTO' ? PDF_PALETTE.dangerBg : risco === 'MÉDIO' ? PDF_PALETTE.warnBg : PDF_PALETTE.okBg;
  const parecer = {
    table: { widths: ['*'], body: [[{
      stack: [
        { text: 'PARECER TÉCNICO DA AUDITORIA', fontSize: 8.5, bold: true, color: PRIMARIA, characterSpacing: 0.6 },
        { text: parecerTexto, fontSize: 9.5, color: TEXTO, margin: [0, 6, 0, 0], alignment: 'justify', lineHeight: 1.45 }
      ], fillColor: corParecerBg, margin: [14, 12, 14, 12]
    }]] },
    layout: 'noBorders', margin: [0, 0, 0, 28]
  };

  const assinatura = {
    table: {
      dontBreakRows: true, widths: ['*'],
      body: [[{
        stack: [
          { text: ' ', margin: [0, 22, 0, 0] },
          { canvas: [{ type: 'line', x1: 130, y1: 0, x2: 385, y2: 0, lineWidth: 0.8, lineColor: '#334155' }] },
          { text: 'Equipe de Auditoria de Controle Interno', fontSize: 10, bold: true, alignment: 'center', margin: [0, 6, 0, 2], color: TEXTO },
          { text: 'Agente de Auditoria · LicitaAudit — Análise Automatizada', fontSize: 8.5, alignment: 'center', color: TEXTO_MUT },
          { text: (id.orgao || '').toUpperCase(), fontSize: 8, alignment: 'center', color: TEXTO_DIM, italics: true, margin: [0, 2, 0, 0] },
          { text: `${dataFmt} · Relatório ${numeroRelatorio}`, fontSize: 7.5, alignment: 'center', color: TEXTO_DIM, margin: [0, 6, 0, 0] }
        ], margin: [0, 8, 0, 10]
      }]]
    },
    layout: 'noBorders'
  };

  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    header, footer,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: TEXTO, lineHeight: 1.35 },
    content: [
      banner, subtitulo, metadados, dashboard,
      { text: 'RESUMO POR BLOCO DE VERIFICAÇÃO', style: 'secaoTitulo', keepWithNext: true },
      resumoBlocos,
      { text: 'QUADRO DETALHADO DE NÃO CONFORMIDADES', style: 'secaoTitulo', keepWithNext: true },
      detalhado, parecer, assinatura
    ],
    styles: {
      secaoTitulo: { fontSize: 11, bold: true, color: PRIMARIA, margin: [0, 10, 0, 6], characterSpacing: 0.4, keepWithNext: true },
      tableHeader: { bold: true, fontSize: 8.5, color: '#ffffff', fillColor: PRIMARIA, alignment: 'left', margin: [0, 3, 0, 3] }
    }
  };
}
function exportarRelatorioAuditPDF(arq) {
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  if (!arq || arq.status !== 'ok') { toast('Arquivo não disponível para exportação.', 'error'); return; }
  const dd = gerarDefinicaoPDF(arq, { tipo: 'arquivo', nome: arq.nomeArquivo });
  const safe = String(arq.nomeArquivo || 'arquivo').replace(/[/\\?%*:|"<>]/g, '_');
  try { pdfMake.createPdf(dd).download(`Relatorio_${safe}.pdf`); toast('PDF individual gerado.', 'ok'); }
  catch (err) { console.error(err); toast('Erro ao gerar PDF.', 'error'); }
}
function exportarRelatorioProcessoConsolidadoPDF(processo) {
  const arquivosOk = (processo?.arquivos || []).filter(a => a.status === 'ok');
  if (!arquivosOk.length) { toast('Nenhum arquivo analisado no processo.', 'error'); return; }
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  const corpus = arquivosOk.map(a => `\n===== ${a.nomeArquivo} =====\n${a.texto}`).join('\n');
  const res = analisarTextoIndividual(corpus, { paramObjeto: els.paramObjeto.value, paramModalidade: els.paramModalidade.value, paramCriterio: els.paramCriterio.value });
  const dd = gerarDefinicaoPDF(res, { tipo: 'processo', nome: processo.nome });
  const safe = String(processo.nome || 'processo').replace(/[/\\?%*:|"<>]/g, '_');
  try { pdfMake.createPdf(dd).download(`Relatorio_Processo_${safe}.pdf`); toast('PDF consolidado do processo gerado.', 'ok'); }
  catch (err) { console.error(err); toast('Erro ao gerar PDF do processo.', 'error'); }
}
function exportarPDFTodos() {
  if (!window.pdfMake) { toast('pdfMake não carregado.', 'error'); return; }
  const processosComArquivo = state.processos.filter(p => p.arquivos.some(a => a.status === 'ok'));
  if (!processosComArquivo.length) { toast('Nenhum processo com arquivos analisados.', 'error'); return; }
  const contents = [];
  processosComArquivo.forEach((p, idx) => {
    const arquivosOk = p.arquivos.filter(a => a.status === 'ok');
    const corpus = arquivosOk.map(a => `\n===== ${a.nomeArquivo} =====\n${a.texto}`).join('\n');
    const res = analisarTextoIndividual(corpus, { paramObjeto: els.paramObjeto.value, paramModalidade: els.paramModalidade.value, paramCriterio: els.paramCriterio.value });
    const dd = gerarDefinicaoPDF(res, { tipo: 'processo', nome: p.nome });
    if (idx > 0) contents.push({ text: '', pageBreak: 'before' });
    contents.push(...dd.content);
  });
  const ddFinal = {
    pageSize: 'A4', pageMargins: [40, 50, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_PALETTE.texto, lineHeight: 1.35 },
    header: () => ({
      margin: [40, 20, 40, 0],
      columns: [
        { text: '', width: '*' },
        { text: 'SISTEMA LICITAAUDIT · LOTE DE RELATÓRIOS', alignment: 'right', fontSize: 8, color: PDF_PALETTE.textoMuted, characterSpacing: 0.4 }
      ]
    }),
    footer: (p, n) => ({
      margin: [40, 20, 40, 0],
      columns: [
        { text: 'Documento gerado pelo LicitaAudit · Lei nº 14.133/2021', fontSize: 8, color: PDF_PALETTE.textoDim },
        { text: `Página ${p} de ${n}`, alignment: 'right', fontSize: 8, color: PDF_PALETTE.textoDim }
      ]
    }),
    content: contents
  };
  try { pdfMake.createPdf(ddFinal).download(`LicitaAudit_Lote_${Date.now()}.pdf`); toast(`${processosComArquivo.length} processo(s) em PDF único.`, 'ok'); }
  catch (err) { console.error(err); toast('Erro ao gerar PDF em lote.', 'error'); }
}

/* ==========================================================================
 * 15. JSON — EXPORTAÇÃO E IMPORTAÇÃO MÚLTIPLA (v6.7.1)
 * ======================================================================== */

/* ---------- Exportação ---------- */
function exportarJSON(processos = null) {
  const lista = processos || state.processos;
  const payload = {
    ferramenta: 'LicitaAudit', versao: '6.7.1',
    exportadoEm: new Date().toISOString(),
    processos: lista.map(p => ({
      id: p.id, nome: p.nome, cor: p.cor, tags: p.tags, criadoEm: p.criadoEm,
      arquivos: p.arquivos.filter(a => a.status === 'ok').map(a => ({
        id: a.id, nomeArquivo: a.nomeArquivo, ext: a.ext, tamanho: a.tamanho,
        score: a.score, risco: a.risco, identificacao: a.identificacao,
        estatisticas: a.estatisticas, resultados: a.resultados, correcoes: a.correcoes,
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

/* ---------- Helper: leitura de arquivo como texto ---------- */
function lerArquivoComoTexto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result || '');
    reader.onerror = () => reject(reader.error || new Error('Falha na leitura do arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

/* ---------- Normalizador ---------- */
function normalizarProcessoImportado(proc) {
  const arquivos = Array.isArray(proc?.arquivos) ? proc.arquivos : [];
  return {
    id: proc?.id || uid('proc'),
    nome: (proc?.nome && String(proc.nome).trim()) || 'Processo importado',
    cor: proc?.cor || CORES_PRESET[state.processos.length % CORES_PRESET.length],
    tags: Array.isArray(proc?.tags) ? proc.tags.slice(0, 24) : [],
    criadoEm: proc?.criadoEm || new Date().toISOString(),
    _importadoEm: new Date().toISOString(),
    arquivos: arquivos
      .filter(a => a && typeof a === 'object')
      .map(a => ({
        ...a,
        id: a.id || uid('arq'),
        nomeArquivo: a.nomeArquivo || 'arquivo_importado',
        ext: a.ext || 'txt',
        tamanho: a.tamanho || (a.texto ? a.texto.length : 0),
        status: 'ok',
        resultados: Array.isArray(a.resultados) ? a.resultados : [],
        correcoes: Array.isArray(a.correcoes) ? a.correcoes : [],
        estatisticas: a.estatisticas || {
          total: MATRIZ_CORE_30.length, aplicaveis: 0, ignoradas: 0,
          ok: 0, falha: 0, criticas: 0, medias: 0, baixas: 0, porBloco: {},
        },
        identificacao: a.identificacao || {},
      })),
  };
}

/* ---------- Extrator flexível ---------- */
function extrairProcessosDoJSON(dados) {
  if (dados && Array.isArray(dados.processos)) return dados.processos;
  if (Array.isArray(dados)) return dados;
  if (dados && typeof dados === 'object' && (dados.id || dados.nome || dados.arquivos)) return [dados];
  return [];
}

/* ---------- Importação múltipla com merge inteligente ---------- */
async function importarJSONMultiplos(files) {
  const lista = Array.from(files || []).filter(f => f && /\.json$/i.test(f.name));
  if (!lista.length) { toast('Nenhum arquivo .json válido selecionado.', 'error'); return; }

  showLoader(`Importando ${lista.length} arquivo(s) JSON…`);

  let totalProcessos = 0;
  let totalArquivos  = 0;
  let totalRenomeados = 0;
  let totalColisoesArq = 0;
  const falhas = [];

  for (const file of lista) {
    try {
      const conteudo = await lerArquivoComoTexto(file);
      const dados = JSON.parse(conteudo);
      const brutos = extrairProcessosDoJSON(dados);

      if (!brutos.length) {
        falhas.push(`${file.name}: estrutura não reconhecida`);
        continue;
      }

      for (const bruto of brutos) {
        const novo = normalizarProcessoImportado(bruto);

        const colide = state.processos.some(p => p.id === novo.id);
        if (colide) {
          novo.id = uid('proc');
          novo.nome = `${novo.nome} (Importado)`;
          totalRenomeados++;
        }

        const idsArquivosExistentes = new Set(
          state.processos.flatMap(p => p.arquivos.map(a => a.id))
        );
        novo.arquivos.forEach(a => {
          if (idsArquivosExistentes.has(a.id)) {
            a.id = uid('arq');
            totalColisoesArq++;
          }
          idsArquivosExistentes.add(a.id);
        });

        state.processos.push(novo);
        totalProcessos++;
        totalArquivos += novo.arquivos.length;
      }
    } catch (err) {
      console.error(`Erro ao processar "${file.name}":`, err);
      falhas.push(`${file.name}: ${err.message || 'JSON inválido'}`);
    }
  }

  hideLoader();

  if (totalProcessos > 0) {
    if (!state.ativo) state.ativo = state.processos[0]?.id || null;
    renderTudo();

    const partes = [];
    partes.push(`✅ ${totalProcessos} processo(s)`);
    partes.push(`${totalArquivos} arquivo(s)`);
    partes.push(`de ${lista.length} JSON`);
    if (totalRenomeados > 0)  partes.push(`· ${totalRenomeados} renomeado(s)`);
    if (totalColisoesArq > 0) partes.push(`· ${totalColisoesArq} ID(s) regenerado(s)`);
    if (falhas.length > 0)    partes.push(`· ${falhas.length} ignorado(s)`);

    toast(partes.join(' '), 'ok');

    console.info(
      `%cLicitaAudit · Importação múltipla`,
      'background:#1e3a8a;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
      { processos: totalProcessos, arquivos: totalArquivos, renomeados: totalRenomeados, colisoesArquivo: totalColisoesArq, falhas }
    );
  } else {
    toast(`⚠️ Nenhum processo pôde ser importado. Verifique os ${lista.length} arquivo(s).`, 'error');
  }

  if (falhas.length) console.warn('Arquivos com falha na importação:', falhas);
}

/* ---------- Wrapper de compatibilidade ---------- */
async function importarJSON(file) {
  return importarJSONMultiplos([file]);
}

/* ==========================================================================
 * 16. TEMA
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
 * 17. EXEMPLO
 * ======================================================================== */
function carregarExemplo() {
  const exemploA = `PROCESSO ADMINISTRATIVO: 00000.004512/2026-88
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
Vedada a indicação de marca ou modelo. Vedada a participação de servidores do órgão. Exigência de declaração de trabalho infantil. Vedada a contratação de empresas suspensas no CEIS/CNEP.

8. HABILITAÇÃO
Qualificação técnica. Declaração formal em substituição à vistoria.

9. CRITÉRIO
Menor preço.

10. PRAZOS E PUBLICAÇÃO
Prazo mínimo de 8 (oito) dias úteis. Publicação no PNCP. Impugnação em fase única com 3 dias úteis.

11. GESTÃO CONTRATUAL
Fiscal titular e fiscal substituto designados. Gestor do contrato designado.
Recebimento provisório e definitivo. Pagamento em até 30 dias após aceite. Sanções administrativas previstas.`;

  const p1 = criarProcesso('Processo A — Aquisição de TI');
  p1.cor = CORES_PRESET[0]; p1.tags = ['TI', 'Urgente', '2026'];
  const p2 = criarProcesso('Processo B — Manutenção Predial');
  p2.cor = CORES_PRESET[2]; p2.tags = ['Predial', 'Contínuo'];
  const p3 = criarProcesso('Processo C — Kits de Merenda');
  p3.cor = CORES_PRESET[1]; p3.tags = ['Alimentação', 'Escolas'];

  (async () => {
    const res = analisarTextoIndividual(exemploA, { paramObjeto: 'auto', paramModalidade: 'auto', paramCriterio: 'auto' });
    p1.arquivos.push({
      id: uid('arq'), nomeArquivo: 'Edital_Pregao_00000.004512-2026.txt',
      ext: 'txt', tamanho: new Blob([exemploA]).size,
      texto: exemploA, status: 'ok', ...res,
    });
    state.ativo = p1.id;
    renderTudo();
    toast('Exemplo carregado.', 'ok');
  })();
}

/* ==========================================================================
 * 18. MENU MOBILE
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

/* ==========================================================================
 * 19. IMPORT JSON — v6.7.1 (input criado dinamicamente)
 * ======================================================================== */
function abrirInputJSONMultiplo() {
  // Cria o <input> em runtime para garantir `multiple = true`
  // independentemente do HTML ou de comportamento do navegador.
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.multiple = true;                            // ← garantido
  inp.accept = '.json,application/json,text/plain';
  inp.style.position = 'fixed';
  inp.style.left = '-9999px';
  inp.style.opacity = '0';
  inp.setAttribute('aria-hidden', 'true');
  document.body.appendChild(inp);

  const limpar = () => { if (inp.parentNode) inp.parentNode.removeChild(inp); };

  inp.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    limpar();
    if (!files.length) {
      toast('Nenhum arquivo selecionado.', 'error');
      return;
    }
    if (files.length === 1) {
      console.info('[LicitaAudit] Apenas 1 arquivo foi detectado no input. Use Ctrl/Cmd+clique para selecionar vários.');
    }
    await importarJSONMultiplos(files);
  });

  inp.addEventListener('cancel', limpar);

  inp.click();
}

/* ==========================================================================
 * 20. EVENTOS E BOOTSTRAP
 * ======================================================================== */
function bindEventosGlobais() {
  els.btnNovoProcesso?.addEventListener('click', () => criarProcesso());
  els.btnNovoProcessoEmpty?.addEventListener('click', () => criarProcesso());
  els.btnCarregarExemplo?.addEventListener('click', carregarExemplo);
  els.themeToggle?.addEventListener('click', toggleTheme);
  els.pdfAllBtn?.addEventListener('click', exportarPDFTodos);
  els.jsonBtn?.addEventListener('click', () => exportarJSON());

  /* ---------- IMPORTAÇÃO MÚLTIPLA (v6.7.1) ---------- */
  els.jsonLoadBtn?.addEventListener('click', abrirInputJSONMultiplo);

  // Fallback: input do HTML, se por algum motivo for acionado
  els.jsonLoadInput?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (files.length) await importarJSONMultiplos(files);
    e.target.value = '';
  });

  $$('[data-close-modal]').forEach(el => el.addEventListener('click', fecharModal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.modal.classList.contains('is-hidden')) fecharModal();
    if (e.key === 'Escape') fecharSidebar();
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
      state.processos.forEach(p => {
        p.arquivos.forEach(a => {
          if (a.status === 'ok' && a.texto) {
            const res = analisarTextoIndividual(a.texto, {
              paramObjeto: els.paramObjeto.value,
              paramModalidade: els.paramModalidade.value,
              paramCriterio: els.paramCriterio.value,
            });
            Object.assign(a, res);
          }
        });
      });
      renderWorkspace();
      toast('Parâmetros atualizados.', 'ok');
    });
  });

  ['dragover','drop'].forEach(evt =>
    window.addEventListener(evt, e => {
      if (!e.target.closest?.('[data-drop]')) e.preventDefault();
    })
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
    '· v6.7.1 · Importação múltipla de JSON (input dinâmico garantido)'
  );
}
document.addEventListener('DOMContentLoaded', bootstrap);
