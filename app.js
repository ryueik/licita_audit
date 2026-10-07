/* ============================================================================
 * LicitaAudit · app.js — v3.0.4
 * ----------------------------------------------------------------------------
 * Correções da v3.0.4:
 *   • [B2_27, B4_54, B4_56, B4_63] — só se aplicam quando a modalidade ativa
 *     é Inexigibilidade de Licitação.
 *   • [B2_31, B2_35] — só se aplicam quando a natureza é Obras/Engenharia.
 *   • [B5_66] × [B5_67] — mutuamente exclusivas (bens vs serviços).
 * ========================================================================== */
'use strict';

/* ==========================================================================
 * 1. ESTADO E DOM
 * ======================================================================== */
const state = { files: [], report: null, isAnalyzing: false, filtro: 'todos' };
const $ = (sel, ctx = document) => ctx.querySelector(sel);

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
 * 2. CONSTANTES E UTILITÁRIOS
 * ======================================================================== */
const LIMITE_DISPENSA_BENS_SERVICOS = 50000.00;
const LIMITE_DISPENSA_OBRAS          = 100000.00;
const PESOS = { CRITICA: 5, MEDIA: 2, BAIXA: 0.5 };

const uid = () => Math.random().toString(36).slice(2, 10);
const extOf = (n) => (n.split('.').pop() || '').toLowerCase();

function formatBytes(b) {
  if (!b) return '0 B';
  const u = ['B','KB','MB','GB'], i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function normalize(s) {
  return (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function truncateFileName(n, max = 30) {
  const d = n.lastIndexOf('.');
  if (d <= 0) return n.length > max ? n.slice(0, max) + '…' : n;
  const base = n.slice(0, d), ext = n.slice(d);
  if (base.length <= max) return n;
  return base.slice(0, max - 1).trimEnd() + '…' + ext;
}
function parseValorBR(s) {
  if (!s) return 0;
  const limpo = String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}
function formatarValorBR(n) {
  if (!n || n <= 0) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ==========================================================================
 * 3. BASE DE CONHECIMENTO (KB)
 * ======================================================================== */
const KB = {
  sinaisModalidade: {
    pregao:          /\bpreg[aã]o(\s+eletr[oô]nico)?\b/i,
    concorrencia:    /\bconcorr[eê]ncia\b/i,
    concurso:        /\bconcurso\b/i,
    leilao:          /\bleil[aã]o\b/i,
    dialogo:         /\bdi[aá]logo\s+competitivo\b/i,
    dispensa:        /\bdispensa(\s+por\s+valor|\s+emergencial)?\b/i,
    inexigibilidade: /\binexigibilidade\b/i,
  },
  orcamento: [/\bestimativa\s+de\s+valor\b/i, /\bvalor\s+estimado\b/i, /R\$\s*[\d.,]+/i],
  alienacao:  /aliena[cç][aã]o|venda\s+de\s+bens|inserv[íi]ve(is|l)|desfazimento|maior\s+lance/i,
  inexigibilidade: /inexig[íi]vel|inviabilidade\s+de\s+competi[cç][aã]o|fornecedor\s+exclusivo|not[oó]ria\s+especializa[cç][aã]o/i,
  emergencia: /emerg[êe]ncial?|emerg[êe]ncia|calamidade|desastre|defesa\s+civil/i,
  tic: /(\bsoftware\b|cloud\s+computing|datacenter|licen[cç]a\s+de\s+software|help\s*desk|service\s*desk|consultoria\s+em\s+ti|desenvolvimento\s+de\s+sistema|\berp\b|aplicativo\s+m[óo]vel|hospedagem\s+em\s+nuvem|suporte\s+t[eé]cnico\s+especializado\s+em\s+ti)/i,
  tiEquipamentos: /(computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|servidor(es)?\s+de\s+rede|switch(es)?\s+gerenci|roteador(es)?|firewall(s)?|nobreak|estabilizador|hd\s+externo|ssd|mem[óo]ria\s+ram|processador|placa\s+de\s+v[íi]deo|mouse|teclado|webcam|tablet(s)?)/i,
  obra: /(obra(s)?|engenharia|reforma|constru[cç][aã]o|pavimenta|saneamento|drenagem|edifica|estrutural)/i,
  tecnicos: /(consultoria|assessoria\s+t[eé]cnica|parecer\s+t[eé]cnico|auditoria|per[íi]cia|laudo|engenharia\s+consultiva)/i,
  comuns: /(material\s+de\s+escrit[oó]rio|material\s+de\s+expediente|papel\s+a4|caneta|t[oô]ner|cartucho|l[ií]mp[eê]za|higiene|aliment[ií]cio|uniforme|mobili[aá]rio|cadeira|mesa|vigil[aâ]ncia|combust[íi]vel)/i,
  empresa: /\b[A-ZÀ-Ú][\wÀ-ú&.'-]*(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú&.'-]*|de|da|do|das|dos|e)){1,6}\s+(?:Ltda\.?|LTDA\.?|S\.A\.?|S\/A|ME|EIRELI|EPP)\b/,
  leiAntiga: /\b8\.?\s?666\b/,
  negacaoLeiAntiga: /(sem\s+refer[eê]ncia|revogad[ao]s?|substitu[ií]d[ao]s?|exclusivamente|somente|apenas|n[aã]o\s+se\s+aplica|n[aã]o\s+mais|obsolet[ao]s?|superad[ao]s?|aus[eê]ncia)/i,
};

const firstMatch = (text, regexes) => {
  for (const rx of regexes) { const m = text.match(rx); if (m) return m; }
  return null;
};

/* ==========================================================================
 * 4. PARSER DE TEXTO
 * ======================================================================== */
function extrairModalidade(corpus) {
  const rotulado = corpus.match(/(?:modalidade(?:\s+de\s+licita[cç][aã]o|\s+licitat[oó]ria|\s+adotada|\s+declarada)?|tipo\s+de\s+licita[cç][aã]o)\s*[:\-–—]\s*([^\n\r]{2,80})/i);
  if (rotulado) {
    const v = rotulado[1].trim();
    if (/preg[aã]o/i.test(v))                return { chave:'pregao',          rotulo:'Pregão Eletrônico' };
    if (/concorr[eê]ncia/i.test(v))          return { chave:'concorrencia',    rotulo:'Concorrência' };
    if (/leil[aã]o/i.test(v))                return { chave:'leilao',          rotulo:'Leilão Eletrônico' };
    if (/dispensa/i.test(v))                 return { chave:'dispensa',        rotulo:'Dispensa de Licitação' };
    if (/inexigibilidade/i.test(v))          return { chave:'inexigibilidade', rotulo:'Inexigibilidade de Licitação' };
    if (/di[aá]logo\s+competitivo/i.test(v)) return { chave:'dialogo',         rotulo:'Diálogo Competitivo' };
    if (/concurso/i.test(v))                 return { chave:'concurso',        rotulo:'Concurso' };
  }
  for (const [chave, rx] of Object.entries(KB.sinaisModalidade)) {
    if (rx.test(corpus)) {
      const mapa = {
        pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência', concurso: 'Concurso',
        leilao: 'Leilão Eletrônico', dialogo: 'Diálogo Competitivo',
        dispensa: 'Dispensa de Licitação', inexigibilidade: 'Inexigibilidade de Licitação',
      };
      return { chave, rotulo: mapa[chave] };
    }
  }
  return { chave: null, rotulo: 'Não identificada' };
}

function extrairModalidadeDeclarada(corpus) {
  const m = corpus.match(
    /(?:modalidade\s+(?:declarada|adotada|licitat[óo]ria|de\s+licita[cç][aã]o)|tipo\s+de\s+licita[cç][aã]o)\s*[:\-–—]\s*([^\n\r]{2,80})/i
  );
  if (!m) return null;
  const v = m[1].trim();
  if (/preg[aã]o/i.test(v))       return { chave: 'pregao',          rotulo: 'Pregão Eletrônico' };
  if (/concorr[eê]ncia/i.test(v)) return { chave: 'concorrencia',    rotulo: 'Concorrência' };
  if (/leil[aã]o/i.test(v))       return { chave: 'leilao',          rotulo: 'Leilão Eletrônico' };
  if (/dispensa/i.test(v))        return { chave: 'dispensa',        rotulo: 'Dispensa de Licitação' };
  if (/inexigibilidade/i.test(v)) return { chave: 'inexigibilidade', rotulo: 'Inexigibilidade de Licitação' };
  if (/di[aá]logo/i.test(v))      return { chave: 'dialogo',         rotulo: 'Diálogo Competitivo' };
  if (/concurso/i.test(v))        return { chave: 'concurso',        rotulo: 'Concurso' };
  return null;
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
  const LABEL = '(?:Identifica[cç][aã]o\\s+do\\s+Objeto|Objeto\\s+do\\s+Processo|Objeto\\s+da\\s+Contrata[cç][aã]o|Objeto\\s+Predominante|Do\\s+Objeto|Objeto)';
  const NUM   = '(?:\\d+[\\.\\)]\\s*|[IVX]+\\.\\s*)?';

  const RX_BLOCO = new RegExp(
    `(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]*\\s*\\n+([^\\n#]{3,600})`,
    'i'
  );
  const RX_LINHA = new RegExp(
    `(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]+\\s*([^\\n#]{3,600})`,
    'i'
  );
  const RX_FRASE = new RegExp(
    `(?:^|\\n)\\s*(?:#+\\s*)?${NUM}${LABEL}\\s*[:\\-–—]+\\s*([^\\n#]{3,300}?)(?:\\.|\\n|#|$)`,
    'i'
  );

  const m = firstMatch(corpus, [RX_BLOCO, RX_LINHA, RX_FRASE]);
  if (!m) return { texto: '', tipo: 'Não identificado' };

  const texto = m[1]
    .replace(/^[\s\-–—:.,;]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);

  return { texto, tipo: classificarObjeto(texto) };
}

function extrairValor(corpus) {
  const m = corpus.match(/R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
  return m ? parseValorBR(m[1]) : 0;
}

function extrairProcesso(corpus) {
  const RX_PROC = /(?:processo\s+administrativo|processo\s+adm(?:inistrativo)?|n[º°]?\s*do\s*processo|n[uú]mero\s+do\s+processo|processo)\s*[:\-–—]?\s*(?:n[º°.]?\s*)?([\d][\d.\/\-\w]{3,40})/i;
  let m = corpus.match(RX_PROC);
  if (m) {
    const matched = m[0].toLowerCase();
    let rotulo = 'Processo';
    if (/administrativo/.test(matched))                 rotulo = 'Processo Administrativo';
    else if (/n[º°]?\s*do\s*processo/.test(matched))    rotulo = 'Nº do Processo';
    else if (/n[uú]mero\s+do\s+processo/.test(matched)) rotulo = 'Número do Processo';
    return `${rotulo} nº ${m[1].trim()}`;
  }

  const RX_DOC = /\b(edital|pregao|preg[aã]o|concorr[eê]ncia|concurso|leil[aã]o|dispensa|inexigibilidade|memorando|of[íi]cio|dfd)\s*(?:n[º°.]?|n[uú]mero)?\s*([\d][\d.\/\-\w]{3,30})/i;
  m = corpus.match(RX_DOC);
  if (m) {
    const rot = m[1].replace(/^dfd$/i, 'DFD');
    return `${rot.charAt(0).toUpperCase() + rot.slice(1).toLowerCase()} nº ${m[2]}`;
  }
  return 'Não identificado';
}

function extrairOrgao(corpus) {
  const m = corpus.match(/\b(Minist[ée]rio|Prefeitura(?:\s+Municipal)?|Tribunal|Universidade|Instituto|C[âa]mara(?:\s+Municipal)?|Assembleia|Secretaria|Funda[cç][aã]o|Autarquia)[^\n,.;]{0,80}/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : 'ÓRGÃO / ENTIDADE PÚBLICA';
}

function extrairUnidadeRequisitante(corpus) {
  const m = corpus.match(/(?:unidade\s+requisitante|setor\s+requisitante|remetente|origem)\s*[:\-–—]\s*([^\n]{3,90})/i);
  if (m) return m[1].trim();
  const n = corpus.match(/\b(Diretoria\s+de\s+Tecnologia\s+da\s+Informa[cç][aã]o|Coordena[cç][aã]o[\-\s]*Geral\s+de\s+Tecnologia\s+da\s+Informa[cç][aã]o)\b/i);
  return n ? n[1] : 'Não informada';
}

function extrairEmpresa(corpus) {
  const m = corpus.match(KB.empresa);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

function extrairMetadados(corpus) {
  return {
    modalidade: extrairModalidade(corpus),
    objeto:     extrairObjeto(corpus),
    valor:      extrairValor(corpus),
    processo:   extrairProcesso(corpus),
    orgao:      extrairOrgao(corpus),
    unidade:    extrairUnidadeRequisitante(corpus),
    empresa:    extrairEmpresa(corpus),
  };
}

/* ==========================================================================
 * 5. FUNÇÕES AUXILIARES DO MOTOR
 * ======================================================================== */

function detectarMarcaDireta(corpus) {
  const RX_MARCA_DIRETA = [
    /\bmarca\s*[:\-–—]?\s*[A-ZÀ-Ú][\w-]+/i,
    /\bmodelo\s*[:\-–—]?\s*[A-ZÀ-Ú][\w-]+/i,
    /\bfabricante\s*[:\-–—]?\s*[A-ZÀ-Ú][\w-]+/i,
    /\bda\s+marca\b/i,
    /\bpadr[aã]o\s+marca\b/i,
  ];
  for (const rx of RX_MARCA_DIRETA) {
    const m = corpus.match(rx);
    if (m) return m;
  }
  return null;
}

/** ⭐ v3.0.4 — Helpers de condicionalidade de modalidade/natureza */
function isInexigibilidade(c) {
  return /inexigibilidade/i.test(c?.modalidade?.modalidade || '');
}
function isObraEngenharia(c) {
  return /obras?\s+e\s+servi[cç]os\s+de\s+engenharia/i.test(c?.natureza || '');
}
function isPregaoEletronico(c) {
  return /preg[aã]o\s+eletr[ôo]nico/i.test(c?.modalidade?.modalidade || '');
}

function classificarNatureza(corpus, forcarNatureza = 'auto') {
  if (forcarNatureza && forcarNatureza !== 'auto') {
    const mapa = {
      bens: 'Aquisição de bens',
      'servicos-comuns': 'Bens e serviços comuns',
      'servicos-especificos': 'Serviços técnicos especializados',
      'servicos-especiais': 'Serviços técnicos especializados',
      obras: 'Obras e serviços de engenharia',
      alienacao: 'Alienação de bens',
      intelectual: 'Serviços técnicos especializados',
    };
    return mapa[forcarNatureza] || forcarNatureza;
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

function classificarTipoPregao(meta) {
  const texto = [
    meta?.objeto?.texto || '',
    meta?.objetoField || '',
  ].join(' ').toLowerCase();

  const natureza = (meta?.natureza || '').toLowerCase();

  const eBens =
    /(aquisi[cç][aã]o\s+de\s+bens|compra\s+de\s+bens|fornecimento\s+de\s+bens|fornecimento\s+de|equipament|material\s+de|computador(es)?|notebook(s)?|workstation(s)?|desktop(s)?|monitor(es)?|impressora(s)?|scanner(es)?|mobili[aá]rio|cadeira(s)?|mesa(s)?|arm[aá]rio(s)?|estante(s)?|ve[ií]culo(s)?|uniforme(s)?|medicament(o|os))/i
      .test(texto);

  const eServicos =
    /(presta[cç][aã]o\s+de\s+servi|contrata[cç][aã]o\s+de\s+servi|servi[cç]os?\s+de|servi[cç]o\s+(t[eé]cnico|especializado|continuado)|manuten[cç][aã]o|suporte\s+t[eé]cnico|consultoria|assessoria|treinamento|capacita[cç][aã]o|limpeza|vigil[aâ]ncia|seguran[cç]a|locacao\s+de\s+mao\s+de\s+obra)/i
      .test(texto);

  if (eBens && !eServicos) return 'bens';
  if (eServicos && !eBens) return 'servicos';

  if (/aquisic|bens/.test(natureza)) return 'bens';
  if (/servic/.test(natureza))       return 'servicos';

  return 'servicos';
}

function determinarModalidade(ctx) {
  const {
    objetoTexto = '',
    natureza = 'Bens e serviços comuns',
    valor = 0,
    empresa = null,
    marcaDireta = null,
  } = ctx;

  const corpus = String(ctx.corpus || '');
  const valorFmt = valor > 0
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'não informado';

  /* PRIORIDADE 0: modalidade declarada tem precedência */
  const declarada = extrairModalidadeDeclarada(corpus);
  if (declarada && declarada.chave === 'pregao') {
    return {
      modalidade: 'Pregão Eletrônico',
      baseLegal:  'Art. 6º, XLI e Art. 29 — Lei 14.133/2021',
      cor: 'brand',
      motivo:
        'Modalidade declarada expressamente no documento: Pregão Eletrônico. O objeto é compatível ' +
        'com bens/serviços comuns (Art. 6º, XLI e Art. 29). Verificações de prazo seguem o Art. 55, I.',
      descricao:  'Modalidade declarada — Pregão Eletrônico.',
      observacao: 'Prazo mínimo de divulgação: 8 dias úteis (bens) ou 10 dias úteis (serviços).',
    };
  }

  /* 1. DISPENSA EMERGENCIAL */
  if (KB.emergencia.test(corpus)) {
    return {
      modalidade: 'Dispensa de Licitação Emergencial',
      baseLegal:  'Art. 75, VIII — Lei 14.133/2021',
      cor: 'danger',
      motivo:
        'A situação de emergência ou calamidade pública autoriza a contratação direta para ' +
        'atendimento de risco iminente à vida, à segurança pública ou à paralisação de serviços ' +
        'essenciais (Art. 75, VIII). Prazo máximo de 1 (um) ano, vedada a prorrogação (Art. 75, §1º).' +
        (valor > 0 ? ` Valor estimado: ${valorFmt}.` : ''),
      descricao:  'Contratação direta por emergência ou calamidade pública.',
      observacao: 'A emergência NÃO pode decorrer de falta de planejamento.',
    };
  }

  /* 2. LEILÃO ELETRÔNICO */
  if (KB.alienacao.test(corpus) || KB.alienacao.test(objetoTexto)) {
    return {
      modalidade: 'Leilão Eletrônico',
      baseLegal:  'Art. 6º, XL e Art. 31 — Lei 14.133/2021',
      cor: 'warning',
      motivo:
        'Processo voltado à alienação de bens móveis inservíveis ou de bens imóveis da ' +
        'Administração. Critério: MAIOR LANCE. Modalidade: Leilão, preferencialmente eletrônico.',
      descricao:  'Modalidade obrigatória para alienação de bens públicos.',
      observacao: 'Exige avaliação prévia e autorização legislativa (imóveis).',
    };
  }

  /* 3. INEXIGIBILIDADE */
  if (KB.inexigibilidade.test(corpus)) {
    return {
      modalidade: 'Inexigibilidade de Licitação',
      baseLegal:  'Art. 74 — Lei 14.133/2021',
      cor: 'danger',
      motivo:
        'Inviabilidade de competição caracterizada nos autos (exclusividade, notória ' +
        'especialização ou artista consagrado). O preço pode ser justificado por notas fiscais/' +
        'contratos anteriores do contratado (Art. 74, §2º).' +
        (empresa ? ` ⚠ Empresa mencionada: ${empresa}.` : ''),
      descricao:  'Contratação direta por inviabilidade de competição.',
      observacao: 'Exige parecer técnico circunstanciado (Art. 74, §1º e §2º).',
    };
  }

  /* 4. DISPENSA POR VALOR */
  const eObra = natureza === 'Obras e serviços de engenharia';
  if (eObra && valor > 0 && valor <= LIMITE_DISPENSA_OBRAS) {
    return {
      modalidade: 'Dispensa de Licitação por Valor',
      baseLegal:  'Art. 75, I — Lei 14.133/2021',
      cor: 'success',
      motivo: `Valor de obra/engenharia (${valorFmt}) dentro do limite de R$ ${LIMITE_DISPENSA_OBRAS.toLocaleString('pt-BR')} (Art. 75, I).`,
      descricao:  'Dispensa por pequeno vulto — obras/engenharia.',
      observacao: 'Exige orçamento detalhado e pesquisa de preços (Art. 72).',
    };
  }
  if (!eObra && valor > 0 && valor <= LIMITE_DISPENSA_BENS_SERVICOS) {
    return {
      modalidade: 'Dispensa de Licitação por Valor',
      baseLegal:  'Art. 75, II — Lei 14.133/2021',
      cor: 'success',
      motivo: `Valor total (${valorFmt}) abaixo do limite de R$ ${LIMITE_DISPENSA_BENS_SERVICOS.toLocaleString('pt-BR')} (Art. 75, II).`,
      descricao:  'Dispensa por pequeno vulto — bens/serviços comuns.',
      observacao: 'Exige pesquisa de preços (Art. 72).',
    };
  }

  /* 5. CONCORRÊNCIA — somente obras/técnicos/TIC-serviços */
  const eTecnico = natureza === 'Serviços técnicos especializados';
  const eTIC     = natureza === 'Tecnologia da Informação (TIC)';
  if (eTecnico || eObra || eTIC) {
    const tipo = eTecnico ? 'serviço técnico especializado de natureza intelectual'
                : eObra    ? 'obra ou serviço de engenharia de complexidade relevante'
                            : 'serviço de TIC com especificidade técnica';
    return {
      modalidade: 'Concorrência',
      baseLegal:  'Art. 6º, XXXVIII e Art. 36 — Lei 14.133/2021',
      cor: 'info',
      motivo:
        `Trata-se de ${tipo}. A complexidade técnica recomenda julgamento por "Melhor Técnica" ` +
        'ou "Técnica e Preço" (Art. 36, §1º), afastando o uso do Pregão.',
      descricao:  'Modalidade obrigatória para serviços técnicos e obras acima da dispensa.',
      observacao: 'Admite menor preço, melhor técnica ou técnica e preço.',
    };
  }

  /* 6. PREGÃO ELETRÔNICO (padrão) */
  const comRessalva = !!empresa || !!marcaDireta;
  return {
    modalidade: comRessalva ? 'Pregão Eletrônico (com ressalva)' : 'Pregão Eletrônico',
    baseLegal:  'Art. 6º, XLI e Art. 29 — Lei 14.133/2021',
    cor: comRessalva ? 'warning' : 'brand',
    motivo:
      'O objeto enquadra-se como bem ou serviço comum, cujos padrões podem ser objetivamente ' +
      'definidos no edital (Art. 6º, XLI e Art. 29). O Pregão Eletrônico é a modalidade ' +
      'OBRIGATÓRIA para bens/serviços comuns.' +
      (comRessalva
        ? ` ⚠ Menção direta${empresa ? ` à empresa "${empresa}"` : ''}${marcaDireta ? ' ou marca' : ''}. ` +
          'Caso não seja inexigibilidade (Art. 74), deve ser afastada (Art. 41, I).'
        : ''),
    descricao:  'Modalidade obrigatória para bens/serviços comuns.',
    observacao: 'Aplicável a objetos comuns com padrões usuais de mercado.',
  };
}

/* ==========================================================================
 * 6. TÍTULOS DE BLOCO + REGEX ATÔMICAS
 * ======================================================================== */
const BLOCOS_TITULO = {
  1: 'Fase Preparatória, Planejamento e ETP',
  2: 'Pesquisa de Preços, Orçamento e Dotação',
  3: 'Vedações, Competitividade e Integridade',
  4: 'Modalidades, Enquadramento e Julgamento',
  5: 'Prazos, Edital, Publicação e Recursos',
  6: 'Gestão Contratual, Riscos e Fiscalização',
};

const RX = {
  just: /\b(justific|motiva|necessidade\s+p[uú]blica|interesse\s+p[uú]blico|finalidade)/i,
  obj:  /(objeto|especifica[cç][aã]o\s+t[eé]cnica|descri[cç][aã]o\s+do\s+objeto|computador(es)?|notebook(s)?|workstation(s)?|equipamento(s)?|licen[cç]a(s)?|suporte\s+t[eé]cnico|impressora(s)?|monitor(es)?|servidor(es)?|switch(es)?|roteador(es)?|mouse|teclado|aquisi[cç][aã]o|fornecimento|presta[cç][aã]o\s+de\s+servi)/i,
  quant: /(quantidade|qtd\.?|unidades?|\blotes?\b|\d+\s*\([^)]{2,60}\)|\d+\s*(unid|un|pç|pc|cx|kg|l|m²|m³|resma|itens?))/i,
  mem:  /(mem[oó]ria|s[eé]rie\s+hist[óo]rica|proje[cç][aã]o|metodologia|planilha\s+anal[íi]tica)/i,
  parc: /(parcelament|divis[aã]o\s+em\s+lotes|indivis[íi]vel|lote\s+[uú]nico)/i,
  res:  /(resultado\s+pretendido|efici[eê]ncia|economicidade|benef[íi]cio)/i,
  prov: /(provid[êe]ncias|antes\s+da\s+assinatura|prepara[cç][aã]o\s+pr[eé]via)/i,
  pos:  /(posicionamento\s+conclusivo|conclus[aã]o|considera\s+adequada)/i,
  pca:  /(plano\s+de\s+contrata[cç][õo]es|\bPCA\b)/i,
  reg:  /(regime\s+de\s+execu[cç][aã]o|empreitada|tarefa|pre[cç]o\s+unit[aá]rio)/i,
  manut:/(manuten[cç][aã]o|assist[êe]ncia\s+t[eé]cnica)/i,
  corr: /(contrata[cç][õo]es\s+correlatas|interdepend)/i,
  amb:  /(impacto\s+ambiental|sustentabilid|log[íi]stica\s+reversa)/i,
  sol:  /(solu[cç][õo]es?\s+de\s+mercado|alternativas\s+analisadas|levantamento\s+de\s+mercado)/i,
  req:  /(requisitos\s+da\s+contrata|especifica[cç][aã]o\s+t[eé]cnica)/i,
  dfd:  /(DFD|documento\s+de\s+formaliza[cç][aã]o\s+da\s+demanda)/i,
  tr:   /(termo\s+de\s+refer[eê]ncia|projeto\s+b[aá]sico|anteprojeto|estudo\s+t[eé]cnico\s+preliminar|\bETP\b|\bTR\b|\bPB\b|especifica[cç][õo]es\s+deste\s+edital|especifica[cç][õo]es\s+t[eé]cnicas\s+deste\s+edital)/i,
  aprov:/(aprovad[oa]\s+pela\s+autoridade|aprova[cç][aã]o\s+pr[eé]via|despacho\s+de\s+aprova)/i,
  fin:  /(finalidade\s+institucional|miss[aã]o\s+do\s+[óo]rg[ãa]o|compet[êe]ncia\s+institucional)/i,
  painel:/(painel\s+de\s+pre[cç]os)/i,
  simil:/(contrata[cç][ões]\s+similares|outros\s+[óo]rg[ãa]os)/i,
  midia:/(m[ií]dia\s+especializada|fornecedores?\s+do\s+ramo|pesquisa\s+direta)/i,
  unico:/(fornecedor\s+[uú]nico|or[cç]amento\s+[uú]nico)/i,
  justp:/(notas?\s+fiscais?|contratos?\s+anterior|pre[cç]os?\s+praticad)/i,
  dot:  /(dota[cç][aã]o\s+or[cç]ament|programa\s+de\s+trabalho|natureza\s+de\s+despesa)/i,
  lrf:  /(\bLRF\b|responsabilidade\s+fiscal|\bLDO\b|adequa[cç][aã]o\s+or[cç]ament)/i,
  frac: /(fracionament|somat[óo]rio\s+de\s+dispensas)/i,
  sinapi:/(SINAPI|SICRO)/i,
  qualif:/(qualifica[cç][aã]o\s+t[eé]cnica|atestado\s+de\s+capacidade)/i,
  serv: /(servidor\s+do\s+[óo]rg[ãa]o|impedimento\s+de\s+servidor)/i,
  imped:/(impedid[oa]|suspens[ao]|CEIS|CNEP)/i,
  menor:/(n[aã]o\s+emprego\s+de\s+menores|trabalho\s+infantil)/i,
  econ: /(balan[cç]o\s+patrimonial|[íi]ndices?\s+cont[aá]beis)/i,
  taxa: /(taxa\s+de\s+habilita|emolumento|taxa\s+de\s+cadastr)/i,
  vist: /(vistoria|visita\s+t[eé]cnica)/i,
  sust: /(sustentabilid|log[íi]stica\s+reversa|ambiental)/i,
  mulh: /(mulheres?\s+v[íi]timas?|viol[êe]ncia\s+dom[ée]stica)/i,
  pcd:  /(pessoa\s+com\s+defici[êe]ncia|reabilitad)/i,
  iso:  /(isonomia|competitividade|impessoalidade)/i,
  srp:  /(sistema\s+de\s+registro\s+de\s+pre|\bSRP\b|ata\s+de\s+registro)/i,
  desert:/(deserta|fracassada)/i,
  justcd:/(justificativa\s+de\s+pre[cç]o|raz[aã]o\s+de\s+escolha)/i,
  cred: /(credenciament|pr[eé][- ]qualifica)/i,
  p8:   /(8\s+dias\s+[uú]teis|oito\s+dias)/i,
  p10:  /(10\s+dias\s+[uú]teis|dez\s+dias)/i,
  p35:  /(35\s+dias\s+[uú]teis|trinta\s+e\s+cinco)/i,
  modod:/(modo\s+de\s+disputa|abert[ao]|fechad[ao]|combinad[ao])/i,
  escl: /(impugna[cç][aã]o|esclarecimento)/i,
  rec3: /(3\s+dias\s+[uú]teis|tr[eê]s\s+dias)/i,
  faser:/(fase\s+[uú]nica|recurso\s+[uú]nico)/i,
  desemp:/(desempate|equidade\s+de\s+g[eê]nero|produ[cç][aã]o\s+nacional)/i,
  meepp:/(microempresa|empresa\s+de\s+pequeno\s+porte|ME\/EPP|LC\s*123)/i,
  cons: /(cons[óo]rcio)/i,
  coop: /(cooperativa)/i,
  lance:/(intervalo\s+m[íi]nimo|envio\s+de\s+lances)/i,
  eletr:/(canal\s+eletr[ôo]nico|sess[aã]o\s+p[uú]blica|sistema\s+eletr[ôo]nico)/i,
  fiscal:/(fiscal\s+titular|fiscaliza[cç][aã]o\s+do\s+contrato)/i,
  fisub:/(fiscal\s+substituto|suplente)/i,
  gest: /(gestor\s+do\s+contrato|gest[aã]o\s+contratual)/i,
  seg:  /(segrega[cç][aã]o\s+de\s+fun[cç][õo]es|agente\s+de\s+contrata)/i,
  risco:/(matriz\s+de\s+risco|aloca[cç][aã]o\s+de\s+riscos)/i,
  vig:  /(vig[êe]ncia|prazo\s+de\s+vig[êe]ncia)/i,
  pror: /(prorroga[cç][aã]o|renova[cç][aã]o)/i,
  local:/(local\s+de\s+entrega|local\s+de\s+presta|condi[cç][õo]es\s+de\s+entrega)/i,
  receb:/(recebimento\s+provis[óo]rio|recebimento\s+definitivo|aceite)/i,
  reaj: /(reajust|corre[cç][aã]o\s+monet[aá]ria|[íi]ndice)/i,
  sanc: /(san[cç][õo]es\s+administrativas|multa|advert[êe]ncia)/i,
  gar:  /(garantia\s+contratual|exig[êe]ncia\s+de\s+garantia)/i,
  pag:  /(pagamento\s+em\s+at[eé]\s+30|prazo\s+de\s+pagamento)/i,
  hab:  /(manuten[cç][aã]o\s+das\s+condi[cç][õo]es\s+de\s+habilita)/i,
  aloc: /(aloca[cç][aã]o\s+de\s+riscos|matriz\s+de\s+risco)/i,
  alt:  /(altera[cç][aã]o\s+contratual|termo\s+aditivo)/i,
  subc: /(subcontrata[cç][aã]o)/i,
  ext:  /(extin[cç][aã]o\s+do\s+contrato|rescis[aã]o)/i,
  foro: /(foro\s+competente|comarca)/i,
  nf:   /(nota\s+fiscal|documento\s+fiscal)/i,
  padron:/(padroniza|carta\s+de\s+exclusividade|atestado\s+de\s+exclusividade)/i,
  marca:/\b(marca|modelo|fabricante)\s*[:\-]?\s*[A-ZÀ-Ú][\w-]+/i,
};

/* ==========================================================================
 * 7. MATRIZ DAS 100 VERIFICAÇÕES ATÔMICAS
 * ======================================================================== */
const MATRIZ_100_VERIFICACOES = [
  /* BLOCO 1 — Fase Preparatória, Planejamento e ETP (20) */
  { id:'B1_01', bloco:1, nome:'Justificativa da necessidade pública', fundamento:'Art. 18, §1º, I', severidade:'CRITICA', test:c=>RX.just.test(c.corpus), mensagemFalha:'Justificativa da necessidade pública não identificada.', recomendacao:'Elaborar seção com motivação fática e jurídica da demanda.' },
  { id:'B1_02', bloco:1, nome:'Descrição clara e precisa do objeto', fundamento:'Art. 18, §1º, II', severidade:'CRITICA',
    test: c => {
      const objTexto = (c.meta.objeto.texto || '').toLowerCase();
      const objTipo  = c.meta.objeto.tipo || '';
      const temObjeto = RX.obj.test(c.corpus) && objTexto.length > 30;
      const temPalavraChave = /(computador|notebook|workstation|equipamento|licen[cç]a|suporte\s+t[eé]cnico|impressora|monitor|servidor|switch|roteador|bem|material|servi[çc]o|aquisi[cç][aã]o|fornecimento)/i.test(c.corpus);
      return temObjeto || (objTexto.length > 20 && temPalavraChave) || objTipo !== 'Não identificado';
    },
    mensagemFalha:'Objeto insuficiente, ambíguo ou ausente.',
    recomendacao:'Descrever com especificações técnicas precisas.' },
  { id:'B1_03', bloco:1, nome:'Estimativa de quantitativos com memória de cálculo', fundamento:'Art. 18, §1º, III', severidade:'MEDIA', test:c=>RX.quant.test(c.corpus) && RX.mem.test(c.corpus), mensagemFalha:'Quantitativos sem memória de cálculo.', recomendacao:'Apresentar planilha quantitativa com metodologia de projeção.' },
  { id:'B1_04', bloco:1, nome:'Estimativa do valor e pesquisa de preços', fundamento:'Art. 18, §1º, IV', severidade:'CRITICA', test:c=>c.meta.valor>0 || firstMatch(c.corpus, KB.orcamento), mensagemFalha:'Estimativa de valor ausente.', recomendacao:'Elaborar planilha orçamentária com base em múltiplas fontes.' },
  { id:'B1_05', bloco:1, nome:'Justificativa do parcelamento ou não', fundamento:'Art. 47', severidade:'MEDIA', test:c=>RX.parc.test(c.corpus), mensagemFalha:'Sem decisão motivada sobre parcelamento.', recomendacao:'Motivar expressamente parcelar ou não o objeto.' },
  { id:'B1_06', bloco:1, nome:'Demonstração dos resultados pretendidos', fundamento:'Art. 18, §1º, IX', severidade:'MEDIA', test:c=>RX.res.test(c.corpus), mensagemFalha:'Resultados pretendidos não demonstrados.', recomendacao:'Indicar resultados esperados em eficiência e economicidade.' },
  { id:'B1_07', bloco:1, nome:'Providências prévias à assinatura', fundamento:'Art. 18, §1º, X', severidade:'BAIXA', test:c=>RX.prov.test(c.corpus), mensagemFalha:'Providências preparatórias não previstas.', recomendacao:'Listar providências a serem adotadas antes da assinatura.' },
  { id:'B1_08', bloco:1, nome:'Posicionamento conclusivo do ETP', fundamento:'Art. 18, §1º, XIII', severidade:'MEDIA', test:c=>RX.pos.test(c.corpus), mensagemFalha:'ETP sem posicionamento conclusivo.', recomendacao:'Encerrar o ETP com posicionamento sobre a adequação.' },
  { id:'B1_09', bloco:1, nome:'Alinhamento ao PCA', fundamento:'Art. 12, VII', severidade:'MEDIA', test:c=>RX.pca.test(c.corpus), mensagemFalha:'Sem menção ao Plano de Contratações Anual.', recomendacao:'Demonstrar alinhamento da contratação ao PCA.' },
  { id:'B1_10', bloco:1, nome:'Definição do regime de execução', fundamento:'Art. 18, §1º, VII', severidade:'MEDIA', test:c=>RX.reg.test(c.corpus), mensagemFalha:'Regime de execução não definido.', recomendacao:'Definir regime (empreitada, tarefa, preço unitário…).' },
  { id:'B1_11', bloco:1, nome:'Requisitos de manutenção/assistência', fundamento:'Art. 18, §1º, IV', severidade:'BAIXA', test:c=>RX.manut.test(c.corpus), mensagemFalha:'Requisitos de manutenção e assistência técnica ausentes.', recomendacao:'Explicitar requisitos de manutenção/assistência quando cabíveis.' },
  { id:'B1_12', bloco:1, nome:'Contratações correlatas analisadas', fundamento:'Art. 18, §1º, VI', severidade:'BAIXA', test:c=>RX.corr.test(c.corpus), mensagemFalha:'Não há menção a contratações correlatas.', recomendacao:'Demonstrar análise de contratações correlatas ou interdependentes.' },
  { id:'B1_13', bloco:1, nome:'Impactos ambientais e sustentabilidade', fundamento:'Art. 18, §1º, XII', severidade:'BAIXA', test:c=>RX.amb.test(c.corpus), mensagemFalha:'Impactos ambientais não avaliados.', recomendacao:'Descrever impactos ambientais e critérios de sustentabilidade.' },
  { id:'B1_14', bloco:1, nome:'Soluções de mercado analisadas', fundamento:'Art. 18, §1º, V', severidade:'MEDIA', test:c=>RX.sol.test(c.corpus), mensagemFalha:'Levantamento de mercado ausente.', recomendacao:'Apresentar soluções analisadas no levantamento de mercado.' },
  { id:'B1_15', bloco:1, nome:'Justificativa de não parcelamento', fundamento:'Art. 47, §1º', severidade:'BAIXA', test:c=>!RX.parc.test(c.corpus) || /(indivis[íi]vel|n[aã]o\s+parcel)/i.test(c.corpus), mensagemFalha:'Ausente justificativa para não parcelamento.', recomendacao:'Motivar tecnicamente a indivisibilidade quando aplicável.' },
  { id:'B1_16', bloco:1, nome:'Requisitos e especificação da contratação', fundamento:'Art. 18, §1º, III', severidade:'MEDIA', test:c=>RX.req.test(c.corpus), mensagemFalha:'Requisitos da contratação não especificados.', recomendacao:'Detalhar requisitos e especificações técnicas do objeto.' },
  { id:'B1_17', bloco:1, nome:'Documento de Formalização da Demanda (DFD)', fundamento:'Art. 12, VII', severidade:'MEDIA', test:c=>RX.dfd.test(c.corpus), mensagemFalha:'DFD ausente.', recomendacao:'Anexar o DFD assinado pela unidade requisitante.' },
  { id:'B1_18', bloco:1, nome:'TR / Projeto Básico / Anteprojeto', fundamento:'Art. 6º, XXIII e XXV', severidade:'CRITICA',
    test: c => RX.tr.test(c.corpus) || /(estudo\s+t[eé]cnico\s+preliminar|\bETP\b|especifica[cç][õo]es\s+deste\s+edital|termo\s+de\s+refer[eê]ncia|\bTR\b)/i.test(c.corpus),
    mensagemFalha:'Documento estruturante ausente.',
    recomendacao:'Anexar TR ou Projeto Básico/Executivo.' },
  { id:'B1_19', bloco:1, nome:'Aprovação prévia do TR/ETP', fundamento:'Art. 18, §1º', severidade:'MEDIA', test:c=>RX.aprov.test(c.corpus), mensagemFalha:'Sem registro de aprovação prévia.', recomendacao:'Incluir despacho de aprovação pela autoridade competente.' },
  { id:'B1_20', bloco:1, nome:'Coerência com a finalidade institucional', fundamento:'Art. 5º', severidade:'MEDIA', test:c=>RX.fin.test(c.corpus) || RX.just.test(c.corpus), mensagemFalha:'Objeto sem coerência com a finalidade institucional.', recomendacao:'Relacionar o objeto à missão/competência do órgão.' },

  /* BLOCO 2 — Pesquisa de Preços, Orçamento e Dotação (15) */
  { id:'B2_21', bloco:2, nome:'Uso do Painel de Preços', fundamento:'Art. 23, I', severidade:'MEDIA', test:c=>RX.painel.test(c.corpus), mensagemFalha:'Painel de Preços não consultado.', recomendacao:'Utilizar o Painel de Preços como parâmetro (Art. 23, I).' },
  { id:'B2_22', bloco:2, nome:'Contratações similares de outros órgãos', fundamento:'Art. 23, II', severidade:'MEDIA', test:c=>RX.simil.test(c.corpus), mensagemFalha:'Sem consulta a contratações similares.', recomendacao:'Consultar contratações similares de outros órgãos.' },
  { id:'B2_23', bloco:2, nome:'Pesquisa com fornecedores/mídia especializada', fundamento:'Art. 23, IV', severidade:'MEDIA', test:c=>RX.midia.test(c.corpus), mensagemFalha:'Pesquisa sem consulta a fornecedores/mídia.', recomendacao:'Realizar pesquisa direta com fornecedores do ramo.' },
  { id:'B2_24', bloco:2, nome:'Vedação de cotação com fornecedor único', fundamento:'Art. 23, §1º', severidade:'MEDIA', test:c=>!RX.unico.test(c.corpus), mensagemFalha:'Possível cotação com fornecedor único.', recomendacao:'Ampliar fontes — cotação única é indício de restrição.' },
  { id:'B2_25', bloco:2, nome:'Expurgo de valores inexequíveis', fundamento:'Art. 23, §2º', severidade:'MEDIA', test:c=>!/(valor\s+discrepante|inexequ[íi]vel)/i.test(c.corpus) || /expurgo|desconsiderad/i.test(c.corpus), mensagemFalha:'Sem análise de valores discrepantes.', recomendacao:'Desconsiderar valores discrepantes e registrar o expurgo.' },
  { id:'B2_26', bloco:2, nome:'Memória detalhada do cálculo', fundamento:'Art. 23, §1º', severidade:'MEDIA', test:c=>RX.mem.test(c.corpus), mensagemFalha:'Memória detalhada ausente.', recomendacao:'Apresentar planilha com metodologia do cálculo.' },

  /* ⭐ B2_27 — v3.0.4: SÓ se aplica em Inexigibilidade */
  { id:'B2_27', bloco:2, nome:'Justificativa de preços na Inexigibilidade',
    fundamento:'Art. 74, §2º — Lei 14.133/2021', severidade:'MEDIA',
    test: c => {
      if (!isInexigibilidade(c)) return true;  // N/A em Pregão/Concorrência/Dispensa
      return RX.justp.test(c.corpus);
    },
    mensagemFalha:'Inexigibilidade sem justificativa de preço (notas fiscais/contratos anteriores).',
    recomendacao:'Juntar notas fiscais ou contratos anteriores (Art. 74, §2º).' },

  { id:'B2_28', bloco:2, nome:'Indicação da dotação orçamentária', fundamento:'Art. 18, §1º, V', severidade:'CRITICA', test:c=>RX.dot.test(c.corpus), mensagemFalha:'Dotação orçamentária não indicada.', recomendacao:'Indicar dotação, programa de trabalho e natureza de despesa.' },
  { id:'B2_29', bloco:2, nome:'Adequação orçamentária (LRF/LDO)', fundamento:'Art. 150', severidade:'MEDIA', test:c=>RX.lrf.test(c.corpus), mensagemFalha:'Sem declaração de adequação com LRF/LDO.', recomendacao:'Declarar adequação orçamentária e financeira.' },
  { id:'B2_30', bloco:2, nome:'Limite R$ 50.000 (Dispensa — bens/serviços)',
    fundamento:'Art. 75, II — Lei 14.133/2021', severidade:'CRITICA',
    test: c => {
      const modalidadeAtiva = c.modalidade?.modalidade || '';
      if (!/dispensa/i.test(modalidadeAtiva)) return true;
      if (KB.obra.test(c.corpus)) return true;
      if (c.meta.valor > 0 && c.meta.valor <= 50000) return true;
      return false;
    },
    mensagemFalha:'Dispensa por valor acima de R$ 50.000 (ou sem valor) para bens/serviços.',
    recomendacao:'Reclassificar a modalidade ou revisar o valor (Art. 75, II).' },

  /* ⭐ B2_31 — v3.0.4: SÓ se aplica quando natureza é Obras/Engenharia */
  { id:'B2_31', bloco:2, nome:'Limite R$ 100.000 (obras/engenharia)',
    fundamento:'Art. 75, I — Lei 14.133/2021', severidade:'CRITICA',
    test: c => {
      if (!isObraEngenharia(c)) return true;   // N/A em Bens/Equipamentos/TIC/Serviços
      return c.meta.valor <= 100000;
    },
    mensagemFalha:'Obras acima de R$ 100.000.',
    recomendacao:'Adotar Concorrência.' },

  { id:'B2_32', bloco:2, nome:'Alerta de fracionamento de despesa', fundamento:'Art. 75, §1º', severidade:'CRITICA', test:c=>!RX.frac.test(c.corpus), mensagemFalha:'Indício de fracionamento de despesa.', recomendacao:'Apurar somatório de dispensas no mesmo exercício.' },
  { id:'B2_33', bloco:2, nome:'Atualização dos limites por decreto', fundamento:'Art. 182', severidade:'BAIXA', test:c=>/decreto\s+de\s+atualiza|atualiza[cç][aã]o\s+anual/i.test(c.corpus), mensagemFalha:'Sem menção à atualização anual.', recomendacao:'Consultar decreto vigente de atualização.' },
  { id:'B2_34', bloco:2, nome:'Orçamentos recentes (< 6 meses)', fundamento:'Art. 23, §1º', severidade:'BAIXA', test:c=>/data\s+de\s+emiss[aã]o|recente|6\s+meses/i.test(c.corpus) || !firstMatch(c.corpus, KB.orcamento), mensagemFalha:'Orçamentos possivelmente desatualizados.', recomendacao:'Utilizar cotações emitidas há menos de 6 meses.' },

  /* ⭐ B2_35 — v3.0.4: SÓ se aplica quando natureza é Obras/Engenharia */
  { id:'B2_35', bloco:2, nome:'Compatibilidade com SINAPI/SICRO',
    fundamento:'Art. 23, §2º — Lei 14.133/2021', severidade:'MEDIA',
    test: c => {
      if (!isObraEngenharia(c)) return true;   // N/A em Bens/Equipamentos/TIC/Serviços
      return RX.sinapi.test(c.corpus);
    },
    mensagemFalha:'Obras sem referência a SINAPI/SICRO.',
    recomendacao:'Comprovar compatibilidade com SINAPI/SICRO.' },

  /* BLOCO 3 — Vedações, Competitividade e Integridade (15) */
  { id:'B3_36', bloco:3, nome:'Ausência de marca sem justificativa', fundamento:'Art. 41, I', severidade:'CRITICA', test:c=>!RX.marca.test(c.corpus) || RX.padron.test(c.corpus), mensagemFalha:'Indicação de marca sem justificativa.', recomendacao:'Justificar tecnicamente ou retirar a marca.' },
  { id:'B3_37', bloco:3, nome:'Processo formal de padronização', fundamento:'Art. 41, II', severidade:'MEDIA', test:c=>!RX.marca.test(c.corpus) || RX.padron.test(c.corpus), mensagemFalha:'Sem processo formal de padronização.', recomendacao:'Instaurar processo de padronização.' },
  { id:'B3_38', bloco:3, nome:'Ausência de direcionamento a fornecedor', fundamento:'Art. 5º', severidade:'CRITICA', test:c=>!c.meta.empresa || RX.padron.test(c.corpus) || KB.inexigibilidade.test(c.corpus), mensagemFalha:'Menção direta a empresa sem justificativa.', recomendacao:'Afastar indicação ou fundamentar exclusividade.' },
  { id:'B3_39', bloco:3, nome:'Qualificação técnica proporcional', fundamento:'Art. 67', severidade:'MEDIA', test:c=>!/exig[êe]ncia\s+excessiva|desproporcional/i.test(c.corpus), mensagemFalha:'Possível exigência técnica desproporcional.', recomendacao:'Revisar requisitos de qualificação.' },
  { id:'B3_40', bloco:3, nome:'Vedação de participação de servidor', fundamento:'Art. 14, I', severidade:'CRITICA', test:c=>RX.serv.test(c.corpus), mensagemFalha:'Vedação do Art. 14, I não explicitada.', recomendacao:'Incluir cláusula vedando participação de servidores.' },
  { id:'B3_41', bloco:3, nome:'Vedação de empresa impedida/suspensa', fundamento:'Art. 14, III', severidade:'MEDIA', test:c=>RX.imped.test(c.corpus), mensagemFalha:'Sem cláusula de vedação a empresas impedidas.', recomendacao:'Explicitar vedação (Art. 14, III) e consulta CEIS/CNEP.' },
  { id:'B3_42', bloco:3, nome:'Declaração sobre trabalho infantil', fundamento:'Art. 68, VI', severidade:'MEDIA', test:c=>RX.menor.test(c.corpus), mensagemFalha:'Sem exigência de declaração sobre trabalho infantil.', recomendacao:'Exigir declaração de não emprego de menores.' },
  { id:'B3_43', bloco:3, nome:'Qualificação econômico-financeira', fundamento:'Art. 69', severidade:'MEDIA', test:c=>!RX.econ.test(c.corpus) || /balan[cç]o|índices?\s+cont/i.test(c.corpus), mensagemFalha:'Qualificação econômico-financeira mal dimensionada.', recomendacao:'Adequar índices aos limites do Art. 69.' },
  { id:'B3_44', bloco:3, nome:'Vedação de taxas desnecessárias', fundamento:'Art. 5º', severidade:'BAIXA', test:c=>!RX.taxa.test(c.corpus), mensagemFalha:'Exigência de taxa desnecessária.', recomendacao:'Retirar taxas não previstas em lei.' },
  { id:'B3_45', bloco:3, nome:'Vistoria com alternativa declaratória', fundamento:'Art. 63, § único', severidade:'MEDIA', test:c=>!RX.vist.test(c.corpus) || /declara[cç][aã]o\s+de\s+vistoria|dispensa\s+de\s+vistoria/i.test(c.corpus), mensagemFalha:'Vistoria sem alternativa declaratória.', recomendacao:'Permitir declaração formal em substituição à vistoria.' },
  { id:'B3_46', bloco:3, nome:'Diretrizes ambientais', fundamento:'Art. 26', severidade:'MEDIA', test:c=>RX.sust.test(c.corpus), mensagemFalha:'Critérios de sustentabilidade ausentes.', recomendacao:'Incluir critérios ambientais quando aplicável.' },
  { id:'B3_47', bloco:3, nome:'Reserva para mulheres vítimas', fundamento:'Norma local', severidade:'BAIXA', test:c=>!/norma\s+local|decreto\s+municipal/i.test(c.corpus) || RX.mulh.test(c.corpus), mensagemFalha:'Sem reserva para mulheres vítimas.', recomendacao:'Verificar norma local e incluir reserva.' },
  { id:'B3_48', bloco:3, nome:'Reserva para PCD', fundamento:'Art. 63, IV', severidade:'MEDIA', test:c=>RX.pcd.test(c.corpus) || !/servi[çc]os?\s+cont[íi]nuos?/i.test(c.corpus), mensagemFalha:'Sem reserva para PCD.', recomendacao:'Prever reserva de 5% a 10%.' },
  { id:'B3_49', bloco:3, nome:'Consulta ao CEIS/CNEP', fundamento:'Art. 14, III', severidade:'MEDIA', test:c=>/CEIS|CNEP|consulta\s+de\s+san[cç][õo]es/i.test(c.corpus), mensagemFalha:'Sem comprovação de consulta ao CEIS/CNEP.', recomendacao:'Registrar consulta aos cadastros de sanções.' },
  { id:'B3_50', bloco:3, nome:'Respeito à isonomia e competitividade', fundamento:'Art. 5º', severidade:'CRITICA', test:c=>RX.iso.test(c.corpus) || !c.meta.empresa, mensagemFalha:'Sem manifestação sobre isonomia.', recomendacao:'Demonstrar preservação da competitividade.' },

  /* BLOCO 4 — Modalidades, Enquadramento e Julgamento (15) */
  { id:'B4_51', bloco:4, nome:'Pregão para bens/serviços comuns', fundamento:'Art. 6º, XLI', severidade:'CRITICA',
    test: c => {
      if (/preg[aã]o\s+eletr[ôo]nico/i.test(c.corpus)) return true;
      if (c.modalidade.modalidade !== 'Pregão Eletrônico') return true;
      const natureza = c.natureza || '';
      return natureza === 'Bens e serviços comuns'
          || natureza === 'Aquisição de bens'
          || natureza === 'Serviços em geral';
    },
    mensagemFalha:'Pregão para objeto não comum.',
    recomendacao:'Reavaliar — Pregão é para bens/serviços comuns.' },
  { id:'B4_52', bloco:4, nome:'Concorrência para obras/técnicos', fundamento:'Art. 6º, XXXVIII', severidade:'CRITICA',
    test: c => {
      if (c.modalidade.modalidade !== 'Concorrência') return true;
      const natureza = c.natureza || '';
      return natureza === 'Obras e serviços de engenharia'
          || natureza === 'Serviços técnicos especializados'
          || natureza === 'Tecnologia da Informação (TIC)';
    },
    mensagemFalha:'Concorrência para objeto incompatível.',
    recomendacao:'Reavaliar — obras/técnicos exigem Concorrência.' },
  { id:'B4_53', bloco:4, nome:'Leilão exclusivo para alienação', fundamento:'Art. 31', severidade:'CRITICA', test:c=>c.modalidade.modalidade!=='Leilão Eletrônico' || /aliena|inserv[íi]vel|desfazimento/i.test(c.corpus), mensagemFalha:'Leilão para objeto não alienação.', recomendacao:'Leilão restrito à alienação.' },

  /* ⭐ B4_54 — v3.0.4: SÓ se aplica em Inexigibilidade */
  { id:'B4_54', bloco:4, nome:'Inviabilidade caracterizada (Inexigibilidade)',
    fundamento:'Art. 74 — Lei 14.133/2021', severidade:'CRITICA',
    test: c => {
      if (!isInexigibilidade(c)) return true;  // N/A em Pregão/Concorrência/Dispensa
      return /inviabilidade\s+de\s+competi|exclusividade|not[oó]ria/i.test(c.corpus);
    },
    mensagemFalha:'Inexigibilidade sem caracterização da inviabilidade de competição.',
    recomendacao:'Instruir com documentos da inviabilidade.' },

  { id:'B4_55', bloco:4, nome:'Notória especialização comprovada', fundamento:'Art. 74, III', severidade:'MEDIA', test:c=>!/not[oó]ria\s+especializa/i.test(c.corpus) || /produ[cç][aã]o\s+acad[êe]mica|pr[eê]mio|publica/i.test(c.corpus), mensagemFalha:'Notória especialização sem comprovação.', recomendacao:'Anexar produção acadêmica ou prêmios.' },

  /* ⭐ B4_56 — v3.0.4: SÓ se aplica em Inexigibilidade */
  { id:'B4_56', bloco:4, nome:'Exclusividade atestada',
    fundamento:'Art. 74, I — Lei 14.133/2021', severidade:'MEDIA',
    test: c => {
      if (!isInexigibilidade(c)) return true;  // N/A em Pregão/Concorrência/Dispensa
      if (!/fornecedor\s+exclusivo|representante\s+exclusivo/i.test(c.corpus)) return true;
      return /atestado\s+de\s+sindicato|carta\s+de\s+exclusividade/i.test(c.corpus);
    },
    mensagemFalha:'Exclusividade declarada sem atestado de sindicato/órgão oficial.',
    recomendacao:'Exigir atestado de sindicato ou órgão oficial.' },

  { id:'B4_57', bloco:4, nome:'Emergência caracterizada', fundamento:'Art. 75, VIII', severidade:'CRITICA', test:c=>!KB.emergencia.test(c.corpus) || /risco\s+iminente|paralisa|desabastecimento/i.test(c.corpus), mensagemFalha:'Emergência sem risco iminente.', recomendacao:'Caracterizar objetivamente o risco.' },
  { id:'B4_58', bloco:4, nome:'Prazo máximo de 1 ano (emergencial)', fundamento:'Art. 75, §1º', severidade:'CRITICA', test:c=>!KB.emergencia.test(c.corpus) || /1\s+ano|12\s+meses|sem\s+prorroga/i.test(c.corpus), mensagemFalha:'Contrato emergencial sem prazo máximo de 1 ano.', recomendacao:'Fixar prazo de até 1 ano, vedada prorrogação.' },
  { id:'B4_59', bloco:4, nome:'Critério Menor Preço/Desconto', fundamento:'Art. 33', severidade:'MEDIA', test:c=>/menor\s+pre[cç]o|maior\s+desconto/i.test(c.corpus) || c.criterio !== 'indefinido', mensagemFalha:'Critério de julgamento não declarado.', recomendacao:'Declarar critério entre os do Art. 33.' },
  { id:'B4_60', bloco:4, nome:'Fundamentação de Técnica e Preço', fundamento:'Art. 36', severidade:'MEDIA', test:c=>!/t[eé]cnica\s+e\s+pre[cç]o/i.test(c.corpus) || /justificativa\s+t[eé]cnica|complexidade|natureza\s+intelectual/i.test(c.corpus), mensagemFalha:'Técnica e Preço sem justificativa.', recomendacao:'Motivar adoção de Técnica e Preço.' },
  { id:'B4_61', bloco:4, nome:'SRP quando cabível', fundamento:'Art. 82', severidade:'BAIXA', test:c=>RX.srp.test(c.corpus) || !/entrega\s+parcelada|demanda\s+recorrente/i.test(c.corpus), mensagemFalha:'SRP não avaliado.', recomendacao:'Avaliar SRP para demanda recorrente.' },
  { id:'B4_62', bloco:4, nome:'Justificativa para deserta/fracassada', fundamento:'Art. 75, III', severidade:'MEDIA', test:c=>!RX.desert.test(c.corpus) || /justificativa|nova\s+tentativa/i.test(c.corpus), mensagemFalha:'Deserta/fracassada sem justificativa.', recomendacao:'Justificar contratação direta após licitação deserta.' },

  /* ⭐ B4_63 — v3.0.4: SÓ se aplica em Inexigibilidade */
  { id:'B4_63', bloco:4, nome:'Justificativa de preço e escolha do fornecedor',
    fundamento:'Art. 72, VI e VII — Lei 14.133/2021', severidade:'MEDIA',
    test: c => {
      if (!isInexigibilidade(c)) return true;  // N/A em Pregão/Concorrência/Dispensa
      return RX.justcd.test(c.corpus);
    },
    mensagemFalha:'Inexigibilidade sem justificativa de preço e escolha do fornecedor.',
    recomendacao:'Motivar preço e escolha do fornecedor (Art. 72, VI/VII).' },

  { id:'B4_64', bloco:4, nome:'Credenciamento / pré-qualificação', fundamento:'Art. 78', severidade:'BAIXA', test:c=>RX.cred.test(c.corpus) || !/m[úu]ltiplos\s+fornecedores|todos\s+aptos/i.test(c.corpus), mensagemFalha:'Credenciamento não avaliado.', recomendacao:'Avaliar credenciamento (Art. 78).' },
  { id:'B4_65', bloco:4, nome:'Natureza TIC validada', fundamento:'Art. 6º, XLI', severidade:'MEDIA', test:c=>!KB.tic.test(c.corpus) || /IN\s*\d+|GOV\.?\s*TI|LGPD|seguran[cç]a\s+da\s+informa/i.test(c.corpus), mensagemFalha:'TIC sem normas específicas.', recomendacao:'Referenciar normas GOV-TIC e LGPD.' },

  /* BLOCO 5 — Prazos, Edital, Publicação e Recursos (15) */

  /* ⭐ B5_66 — APENAS bens em Pregão Eletrônico */
  { id:'B5_66', bloco:5, nome:'Prazo mínimo de 8 dias úteis (Pregão — bens)',
    fundamento:'Art. 55, I, "a" — Lei 14.133/2021', severidade:'CRITICA',
    test: c => {
      if (!isPregaoEletronico(c)) return true;
      if (c.meta?.tipoPregao !== 'bens') return true;
      if (RX.p8.test(c.corpus)) return true;
      return /(8\s+dias|oito\s+dias|≥\s*8|pelo\s+menos\s+8)/i.test(c.corpus);
    },
    mensagemFalha:'Pregão Eletrônico de bens sem prazo mínimo de 8 dias úteis.',
    recomendacao:'Fixar prazo mínimo de 8 dias úteis (Art. 55, I, "a").' },

  /* ⭐ B5_67 — APENAS serviços em Pregão Eletrônico */
  { id:'B5_67', bloco:5, nome:'Prazo mínimo de 10 dias úteis (Pregão — serviços)',
    fundamento:'Art. 55, I, "b" — Lei 14.133/2021', severidade:'CRITICA',
    test: c => {
      if (!isPregaoEletronico(c)) return true;
      if (c.meta?.tipoPregao !== 'servicos') return true;
      if (RX.p10.test(c.corpus)) return true;
      return /(10\s+dias|dez\s+dias|≥\s*10|pelo\s+menos\s+10)/i.test(c.corpus);
    },
    mensagemFalha:'Pregão Eletrônico de serviços sem prazo mínimo de 10 dias úteis.',
    recomendacao:'Fixar prazo mínimo de 10 dias úteis (Art. 55, I, "b").' },

  { id:'B5_68', bloco:5, nome:'Prazo mínimo de 35 dias úteis (Concorrência)', fundamento:'Art. 55, II', severidade:'CRITICA',
    test: c => {
      if (!/concorr[eê]ncia/i.test(c.modalidade.modalidade)) return true;
      return RX.p35.test(c.corpus) || /(35\s+dias|trinta\s+e\s+cinco)/i.test(c.corpus);
    },
    mensagemFalha:'Concorrência sem prazo de 35 dias úteis.',
    recomendacao:'Fixar prazo de 35 dias úteis (Art. 55, II).' },

  { id:'B5_69', bloco:5, nome:'Publicação no PNCP', fundamento:'Art. 54', severidade:'CRITICA', test:c=>/PNCP|Portal\s+Nacional\s+de\s+Contrata/i.test(c.corpus), mensagemFalha:'Sem menção ao PNCP.', recomendacao:'Prever publicação no PNCP.' },
  { id:'B5_70', bloco:5, nome:'Publicação no DOU e site', fundamento:'Art. 54, §1º', severidade:'MEDIA', test:c=>/Di[aá]rio\s+Oficial|DOU|DOE|DOM/i.test(c.corpus) || /site\s+institucional|portal\s+do\s+[óo]rg/i.test(c.corpus), mensagemFalha:'Sem menção à publicação no DOU e site.', recomendacao:'Prever publicação no DO e site institucional.' },
  { id:'B5_71', bloco:5, nome:'Modo de disputa definido', fundamento:'Art. 56', severidade:'MEDIA', test:c=>RX.modod.test(c.corpus), mensagemFalha:'Modo de disputa não explicitado.', recomendacao:'Definir aberto, fechado ou combinado.' },
  { id:'B5_72', bloco:5, nome:'Regras de impugnação', fundamento:'Art. 164', severidade:'MEDIA', test:c=>RX.escl.test(c.corpus), mensagemFalha:'Sem regras de impugnação.', recomendacao:'Fixar prazo e procedimento de impugnação.' },
  { id:'B5_73', bloco:5, nome:'Prazo recursal de 3 dias úteis', fundamento:'Art. 165', severidade:'MEDIA', test:c=>RX.rec3.test(c.corpus), mensagemFalha:'Prazo recursal não fixado.', recomendacao:'Fixar prazo de 3 dias úteis.' },
  { id:'B5_74', bloco:5, nome:'Fase recursal única', fundamento:'Art. 165, II', severidade:'BAIXA', test:c=>RX.faser.test(c.corpus) || /fase\s+de\s+recurso/i.test(c.corpus), mensagemFalha:'Sem menção à fase recursal única.', recomendacao:'Observar fase recursal única.' },
  { id:'B5_75', bloco:5, nome:'Regras de desempate', fundamento:'Art. 60', severidade:'MEDIA', test:c=>RX.desemp.test(c.corpus), mensagemFalha:'Sem regras de desempate.', recomendacao:'Prever critérios do Art. 60.' },
  { id:'B5_76', bloco:5, nome:'Benefícios ME/EPP', fundamento:'LC 123/2006', severidade:'MEDIA', test:c=>RX.meepp.test(c.corpus), mensagemFalha:'Sem previsão de benefícios a ME/EPP.', recomendacao:'Aplicar LC 123/2006.' },
  { id:'B5_77', bloco:5, nome:'Regras de consórcio', fundamento:'Art. 15', severidade:'BAIXA', test:c=>RX.cons.test(c.corpus), mensagemFalha:'Sem regra sobre consórcio.', recomendacao:'Admitir ou vedar com justificativa.' },
  { id:'B5_78', bloco:5, nome:'Cooperativas', fundamento:'Art. 16', severidade:'BAIXA', test:c=>RX.coop.test(c.corpus) || !/cooperativa/i.test(c.corpus), mensagemFalha:'Sem regra sobre cooperativas.', recomendacao:'Avaliar admissibilidade.' },
  { id:'B5_79', bloco:5, nome:'Intervalo mínimo entre lances', fundamento:'Art. 56, §2º', severidade:'BAIXA', test:c=>RX.lance.test(c.corpus), mensagemFalha:'Sem intervalo mínimo.', recomendacao:'Fixar intervalo entre lances.' },
  { id:'B5_80', bloco:5, nome:'Canal eletrônico oficial', fundamento:'Art. 56', severidade:'MEDIA', test:c=>RX.eletr.test(c.corpus), mensagemFalha:'Canal eletrônico não definido.', recomendacao:'Definir sistema eletrônico oficial.' },

  /* BLOCO 6 — Gestão Contratual, Riscos e Fiscalização (20) */
  { id:'B6_81', bloco:6, nome:'Fiscal titular designado', fundamento:'Art. 117', severidade:'CRITICA', test:c=>RX.fiscal.test(c.corpus), mensagemFalha:'Fiscal titular não indicado.', recomendacao:'Designar fiscal titular com nome e matrícula.' },
  { id:'B6_82', bloco:6, nome:'Fiscal substituto designado', fundamento:'Art. 117', severidade:'MEDIA', test:c=>RX.fisub.test(c.corpus), mensagemFalha:'Fiscal substituto não indicado.', recomendacao:'Designar fiscal substituto.' },
  { id:'B6_83', bloco:6, nome:'Gestor do contrato indicado', fundamento:'Art. 117', severidade:'MEDIA', test:c=>RX.gest.test(c.corpus), mensagemFalha:'Gestor não indicado.', recomendacao:'Designar gestor do contrato.' },
  { id:'B6_84', bloco:6, nome:'Segregação de funções', fundamento:'Art. 7º, §1º', severidade:'CRITICA', test:c=>RX.seg.test(c.corpus), mensagemFalha:'Segregação não observada.', recomendacao:'Designar separadamente agente de contratação e equipe.' },
  { id:'B6_85', bloco:6, nome:'Matriz de Riscos', fundamento:'Art. 22 e Art. 103', severidade:'CRITICA', test:c=>RX.risco.test(c.corpus) || (!KB.obra.test(c.corpus) && !KB.tic.test(c.corpus)), mensagemFalha:'Matriz de Riscos ausente.', recomendacao:'Anexar Matriz de Alocação de Riscos.' },
  { id:'B6_86', bloco:6, nome:'Vigência contratual', fundamento:'Arts. 105 a 111', severidade:'MEDIA', test:c=>RX.vig.test(c.corpus), mensagemFalha:'Vigência não definida.', recomendacao:'Fixar vigência conforme Arts. 105 a 111.' },
  { id:'B6_87', bloco:6, nome:'Prorrogação (até 10 anos)', fundamento:'Art. 107', severidade:'MEDIA', test:c=>!/servi[çc]os?\s+cont[íi]nuos?/i.test(c.corpus) || RX.pror.test(c.corpus), mensagemFalha:'Sem previsão de prorrogação.', recomendacao:'Prever prorrogação sucessiva até 10 anos.' },
  { id:'B6_88', bloco:6, nome:'Local e condições de entrega', fundamento:'Art. 40, §1º, V', severidade:'MEDIA', test:c=>RX.local.test(c.corpus), mensagemFalha:'Local/condições não definidos.', recomendacao:'Explicitar local e condições.' },
  { id:'B6_89', bloco:6, nome:'Recebimento provisório/definitivo', fundamento:'Art. 140', severidade:'MEDIA', test:c=>RX.receb.test(c.corpus), mensagemFalha:'Aceite não definido.', recomendacao:'Definir recebimento provisório e definitivo.' },
  { id:'B6_90', bloco:6, nome:'Reajuste após 12 meses', fundamento:'Art. 92, V', severidade:'BAIXA', test:c=>RX.reaj.test(c.corpus), mensagemFalha:'Sem previsão de reajuste.', recomendacao:'Prever índice e periodicidade.' },
  { id:'B6_91', bloco:6, nome:'Sanções administrativas', fundamento:'Art. 155', severidade:'MEDIA', test:c=>RX.sanc.test(c.corpus), mensagemFalha:'Sanções não previstas.', recomendacao:'Prever sanções graduadas do Art. 155.' },
  { id:'B6_92', bloco:6, nome:'Garantia contratual (limites)', fundamento:'Art. 98', severidade:'MEDIA', test:c=>!RX.gar.test(c.corpus) || /[5-9]%|10%|cinco\s+por\s+cento|dez\s+por\s+cento/i.test(c.corpus), mensagemFalha:'Garantia fora dos limites.', recomendacao:'Observar 5% (ou 10% com justificativa).' },
  { id:'B6_93', bloco:6, nome:'Prazo de pagamento (30 dias)', fundamento:'Art. 141', severidade:'BAIXA', test:c=>RX.pag.test(c.corpus) || !/pagamento/i.test(c.corpus), mensagemFalha:'Prazo superior a 30 dias.', recomendacao:'Fixar pagamento em até 30 dias.' },
  { id:'B6_94', bloco:6, nome:'Manutenção da habilitação', fundamento:'Art. 92, XV', severidade:'MEDIA', test:c=>RX.hab.test(c.corpus), mensagemFalha:'Sem exigência de manutenção.', recomendacao:'Prever manutenção das condições.' },
  { id:'B6_95', bloco:6, nome:'Alocação de riscos', fundamento:'Art. 103', severidade:'MEDIA', test:c=>RX.aloc.test(c.corpus) || !RX.risco.test(c.corpus), mensagemFalha:'Alocação de riscos não prevista.', recomendacao:'Definir matriz de alocação de riscos.' },
  { id:'B6_96', bloco:6, nome:'Alteração contratual (Art. 124)', fundamento:'Art. 124', severidade:'MEDIA', test:c=>RX.alt.test(c.corpus), mensagemFalha:'Sem previsão de alteração.', recomendacao:'Prever alterações do Art. 124.' },
  { id:'B6_97', bloco:6, nome:'Regras de subcontratação', fundamento:'Art. 122', severidade:'BAIXA', test:c=>RX.subc.test(c.corpus) || !/servi[çc]os?\s+cont[íi]nuos?/i.test(c.corpus), mensagemFalha:'Regras de subcontratação ausentes.', recomendacao:'Definir limites para subcontratação.' },
  { id:'B6_98', bloco:6, nome:'Hipóteses de extinção', fundamento:'Art. 137', severidade:'MEDIA', test:c=>RX.ext.test(c.corpus), mensagemFalha:'Sem previsão de extinção.', recomendacao:'Prever hipóteses do Art. 137.' },
  { id:'B6_99', bloco:6, nome:'Foro competente', fundamento:'Art. 92, §3º', severidade:'BAIXA', test:c=>RX.foro.test(c.corpus), mensagemFalha:'Sem cláusula de foro.', recomendacao:'Incluir cláusula de foro.' },
  { id:'B6_100', bloco:6, nome:'Nota fiscal e pagamento após aceite', fundamento:'Art. 141', severidade:'BAIXA', test:c=>RX.nf.test(c.corpus), mensagemFalha:'Sem menção à NF.', recomendacao:'Dispor sobre NF e pagamento após aceite.' },
];

if (MATRIZ_100_VERIFICACOES.length !== 100) {
  console.error(`[LicitaAudit] Matriz com ${MATRIZ_100_VERIFICACOES.length} regras (esperado 100).`);
}

/* ==========================================================================
 * 8. AVALIAÇÃO E SCORE
 * ======================================================================== */
function avaliarMatriz100(corpus, meta, natureza, modalidade, criterio) {
  const ctx = { corpus, meta, natureza, modalidade, criterio };
  return MATRIZ_100_VERIFICACOES.map((r) => {
    let ok = false;
    try { ok = !!r.test(ctx); } catch (_) { ok = false; }
    return { ...r, peso: PESOS[r.severidade], conforme: ok };
  });
}

function calcularScore100(resultados) {
  const descontos = resultados.filter(r => !r.conforme).reduce((s, r) => s + r.peso, 0);
  const score = Math.max(0, Math.round((100 - descontos) * 10) / 10);
  const total = resultados.length;
  const ok = resultados.filter(r => r.conforme).length;
  const falha = total - ok;
  const criticas = resultados.filter(r => !r.conforme && r.severidade === 'CRITICA').length;
  const medias = resultados.filter(r => !r.conforme && r.severidade === 'MEDIA').length;
  const baixas = resultados.filter(r => !r.conforme && r.severidade === 'BAIXA').length;
  const porBloco = {};
  for (let b = 1; b <= 6; b++) {
    const lista = resultados.filter(r => r.bloco === b);
    porBloco[b] = {
      titulo: BLOCOS_TITULO[b],
      total: lista.length,
      ok: lista.filter(r => r.conforme).length,
      falha: lista.filter(r => !r.conforme).length,
      criticas: lista.filter(r => !r.conforme && r.severidade === 'CRITICA').length,
    };
  }
  return { score, descontos, total, ok, falha, criticas, medias, baixas, porBloco };
}

function classificarRisco100(score, criticas) {
  if (criticas > 0 || score < 70) {
    return {
      nivel: 'ALTO', titulo: 'Risco Alto / Inviável',
      descricao: criticas > 0
        ? `${criticas} vício(s) impeditivo(s) — publicação desaconselhada.`
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
 * 9. MOTOR PRINCIPAL
 * ======================================================================== */
function buildCorpus() {
  return state.files.filter(f => f.status === 'ok' && f.text)
    .map(f => `\n===== ARQUIVO: ${f.name} =====\n${f.text}`).join('\n');
}
function detectarCriterio(t) {
  const m = {
    'menor-preco': /\bmenor\s+pre[cç]o\b/i,
    'maior-desconto': /\bmaior\s+desconto\b/i,
    'melhor-tecnica': /\bmelhor\s+t[eé]cnica\b/i,
    'tecnica-preco': /\bt[eé]cnica\s+e\s+pre[cç]o\b/i,
    'maior-lance': /\bmaior\s+lance\b/i,
    'maior-retorno': /\bmaior\s+retorno/i,
  };
  for (const [k, rx] of Object.entries(m)) if (rx.test(t)) return k;
  return 'indefinido';
}

function runAudit() {
  const corpus = buildCorpus();
  const meta = extrairMetadados(corpus);
  const natureza = classificarNatureza(corpus, els.paramObjeto.value);

  const modalidade = els.paramModalidade.value !== 'auto'
    ? {
        ...determinarModalidade({ corpus, objetoTexto: meta.objeto.texto, natureza, valor: meta.valor, empresa: meta.empresa, marcaDireta: detectarMarcaDireta(corpus) }),
        modalidade: (() => {
          const m = {
            pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência', concurso: 'Concurso',
            leilao: 'Leilão Eletrônico', dialogo: 'Diálogo Competitivo',
            dispensa: 'Dispensa de Licitação', inexigibilidade: 'Inexigibilidade de Licitação',
          };
          return m[els.paramModalidade.value] || meta.modalidade.rotulo;
        })(),
      }
    : determinarModalidade({ corpus, objetoTexto: meta.objeto.texto, natureza, valor: meta.valor, empresa: meta.empresa, marcaDireta: detectarMarcaDireta(corpus) });

  const criterio = els.paramCriterio.value !== 'auto' ? els.paramCriterio.value : detectarCriterio(corpus);

  const tipoPregao = classificarTipoPregao({ ...meta, natureza });

  const metaFull = {
    ...meta,
    natureza,
    modalidade: modalidade.modalidade,
    criterio,
    tipoPregao,
  };

  const resultados = avaliarMatriz100(corpus, metaFull, natureza, modalidade, criterio);
  const stats = calcularScore100(resultados);
  const risco = classificarRisco100(stats.score, stats.criticas);

  let statusGeral;
  if (stats.criticas > 0)                          statusGeral = 'requer-correcoes';
  else if (stats.score >= 90 && stats.falha === 0) statusGeral = 'aprovado';
  else if (stats.score >= 70)                      statusGeral = 'requer-correcoes';
  else                                             statusGeral = 'inconclusivo';

  const dataGeracao = new Date();

  const objetoExibicao = (
    metaFull.objeto.texto && metaFull.objeto.texto.trim().length >= 5
      ? metaFull.objeto.texto.trim().slice(0, 200)
      : metaFull.objeto.tipo || 'Não identificado'
  );

  return {
    geradoEm: dataGeracao.toISOString(),
    statusGeral,
    score: stats.score,
    estatisticas: {
      total: stats.total, ok: stats.ok, falha: stats.falha,
      criticas: stats.criticas, medias: stats.medias, baixas: stats.baixas,
      porBloco: stats.porBloco,
    },
    identificacao: {
      objeto:      objetoExibicao,
      objetoTipo:  metaFull.objeto.tipo,
      objetoField: metaFull.objeto.texto,
      tipoPregao:  metaFull.tipoPregao,
      modalidade:  metaFull.modalidade,
      natureza:    metaFull.natureza,
      criterio,
      empresa:     metaFull.empresa,
      arquivosAnalisados: state.files.filter(f => f.status === 'ok').length,
      caracteresAnalisados: corpus.length,
      linhasAnalisadas: corpus.split(/\r?\n/).length,
    },
    auditoria: {
      numeroRelatorio: String(Math.floor(Math.random() * 900) + 100) + '/' + dataGeracao.getFullYear(),
      dataGeracao: dataGeracao.toISOString(),
      risco: risco.nivel,
      riscoInfo: risco,
      processo: metaFull.processo,
      valor: metaFull.valor,
      orgao: metaFull.orgao,
      unidade: metaFull.unidade,
      temCritico: stats.criticas > 0,
    },
    resultados,
    correcoes: resultados.filter(r => !r.conforme).map(r => ({
      id: r.id, bloco: r.bloco,
      titulo: r.nome, lei: r.fundamento,
      severidade: r.severidade === 'CRITICA' ? 'alta' : r.severidade === 'MEDIA' ? 'media' : 'baixa',
      descricao: r.mensagemFalha,
      sugestao: r.recomendacao,
    })),
  };
}

/* ==========================================================================
 * 10. RENDERIZAÇÃO
 * ======================================================================== */
const STATUS_LABEL = {
  aprovado:          { titulo: 'Aprovado',         desc: 'Processo atende aos requisitos essenciais.' },
  'requer-correcoes':{ titulo: 'Requer Correções', desc: 'Inconsistências que devem ser sanadas.' },
  inconclusivo:      { titulo: 'Inconclusivo',     desc: 'Divergências relevantes.' },
};
const STATUS_COLOR = { aprovado: 'var(--ok)', 'requer-correcoes': 'var(--warn)', inconclusivo: 'var(--danger)' };
const CRITERIO_LABEL = {
  'menor-preco': 'Menor preço', 'maior-desconto': 'Maior desconto',
  'melhor-tecnica': 'Melhor técnica ou conteúdo artístico',
  'tecnica-preco': 'Técnica e preço', 'maior-lance': 'Maior lance',
  'maior-retorno': 'Maior retorno econômico', 'indefinido': 'Não identificado',
};
const SEV_ICON = { CRITICA: '🔴', MEDIA: '🟡', BAIXA: '🟢' };
const SEV_CLASS = { CRITICA: 'sev-pill--alta', MEDIA: 'sev-pill--media', BAIXA: 'sev-pill--baixa' };

function renderMatriz100(resultados, filtro) {
  const blocosHtml = [1,2,3,4,5,6].map((b) => {
    let lista = resultados.filter(r => r.bloco === b);
    if (filtro === 'falhas')   lista = lista.filter(r => !r.conforme);
    if (filtro === 'criticas') lista = lista.filter(r => !r.conforme && r.severidade === 'CRITICA');

    const total = resultados.filter(r => r.bloco === b).length;
    const ok = resultados.filter(r => r.bloco === b && r.conforme).length;
    const falha = total - ok;
    const pct = total ? Math.round((ok / total) * 100) : 100;
    const cor = pct >= 90 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--danger)';

    const itensHtml = lista.length === 0
      ? `<div class="matrix-empty">${filtro === 'todos' ? 'Nenhum item neste bloco.' : 'Nenhum item corresponde ao filtro.'}</div>`
      : lista.map(r => `
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
        </article>`).join('');

    return `
      <details class="block" ${b === 1 ? 'open' : ''}>
        <summary class="block__summary">
          <span class="block__num">${b}</span>
          <span class="block__cat">${escapeHtml(BLOCOS_TITULO[b])}</span>
          <span class="block__stats">
            <span class="block__pill" style="--blk-color:${cor};">${pct}%</span>
            <span class="block__count">${ok}/${total}${falha ? ` · ${falha} falha(s)` : ''}</span>
          </span>
        </summary>
        <div class="block__body">${itensHtml}</div>
      </details>`;
  }).join('');

  return `
    <div class="filters">
      <button class="filters__btn ${filtro === 'todos'    ? 'is-active' : ''}" data-filtro="todos">Exibir Todos (100)</button>
      <button class="filters__btn ${filtro === 'falhas'   ? 'is-active' : ''}" data-filtro="falhas">Inconformidades</button>
      <button class="filters__btn ${filtro === 'criticas' ? 'is-active' : ''}" data-filtro="criticas">Apontamentos Críticos</button>
    </div>
    <div class="blocks">${blocosHtml}</div>`;
}

function renderReport(rep) {
  const s = STATUS_LABEL[rep.statusGeral];
  const cor = STATUS_COLOR[rep.statusGeral];
  const dashArray = 2 * Math.PI * 44;
  const dashValue = (rep.score / 100) * dashArray;
  const risco = rep.auditoria.riscoInfo;
  const meta = rep.auditoria;

  const alerta = meta.temCritico ? `
    <section class="card" style="border-left:5px solid var(--danger);background:var(--danger-soft);">
      <h3 class="card__title" style="color:var(--danger);">🚨 Alerta Crítico — Vício Impeditivo Detectado</h3>
      <p style="font-size:13px;color:var(--text);line-height:1.6;">
        Uma ou mais verificações de severidade CRÍTICA foram reprovadas. <strong>Parecer automático: DEVOLVIDO PARA ADEQUAÇÃO.</strong>
      </p>
    </section>` : '';

  const dashboard = `
    <section class="card">
      <h3 class="card__title">Resumo Executivo · ${rep.estatisticas.total} verificações</h3>
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
            <span class="score-card__pill">${rep.estatisticas.ok} conformes · ${rep.estatisticas.falha} falhas (${rep.estatisticas.criticas} críticas · ${rep.estatisticas.medias} médias · ${rep.estatisticas.baixas} baixas)</span>
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
            ? `<br><small style="color:var(--text-dim);font-weight:500;">Classificação: ${escapeHtml(rep.identificacao.objetoTipo)} · Tipo: ${escapeHtml(rep.identificacao.tipoPregao === 'bens' ? 'Bens' : 'Serviços')}</small>`
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
      <h3 class="card__title">Matriz de Auditoria — 100 verificações · 6 blocos</h3>
      ${renderMatriz100(rep.resultados, state.filtro)}
    </section>`;

  els.report.innerHTML = `${alerta}${dashboard}${ficha}${matriz}
    <footer class="report-footer">
      <span>Relatório nº ${escapeHtml(meta.numeroRelatorio)} · LicitaAudit v3.0.4 · Lei nº 14.133/2021</span>
      <span>${rep.estatisticas.total} verificações executadas</span>
    </footer>`;

  els.report.querySelectorAll('[data-filtro]').forEach((btn) => {
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
 * 11. LISTA DE ARQUIVOS
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
 * 12. EXTRAÇÃO DE TEXTO
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
    case 'pdf':
      if (!window.pdfjsLib) throw new Error('PDF.js não disponível.');
      return await extractPdf(file);
    case 'docx':
      if (!window.mammoth) throw new Error('Mammoth.js não disponível.');
      return await extractDocx(file);
    case 'txt':
    case 'md':
      return await file.text();
    case 'doc':
      throw new Error('Formato .doc não suportado. Converta para .docx ou .pdf.');
    default:
      throw new Error(`Extensão ".${ext}" não suportada.`);
  }
}

/* ==========================================================================
 * 13. ADIÇÃO/REMOÇÃO DE ARQUIVOS
 * ======================================================================== */
async function addFiles(fileList) {
  const files = Array.from(fileList).filter(Boolean);
  if (!files.length) return;
  for (const file of files) {
    state.files.push({
      id: uid(),
      name: file.name || `colado-${Date.now()}`,
      ext: extOf(file.name || ''),
      size: file.size || 0,
      text: '',
      status: 'loading',
      error: null,
      _ref: file,
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
 * 14. EVENTOS
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
    dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('is-dragover'); })
  );
  ['dragleave','drop'].forEach(evt =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
      dz.classList.remove('is-dragover');
    })
  );
  dz.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files?.length) addFiles(files);
  });
  ['dragover','drop'].forEach(evt =>
    window.addEventListener(evt, (e) => { if (!dz.contains(e.target)) e.preventDefault(); })
  );

  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  });

  document.addEventListener('paste', (e) => {
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

  els.fileList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (btn) removeFile(btn.dataset.remove);
  });

  els.analyzeBtn.addEventListener('click', () => {
    if (state.isAnalyzing) return;
    const ok = state.files.filter(f => f.status === 'ok').length;
    if (!ok) { toast('Carregue ao menos um documento legível.', 'error'); return; }
    state.isAnalyzing = true;
    showLoader('Executando matriz de 100 verificações…');
    setTimeout(() => {
      try {
        const rep = runAudit();
        state.report = rep;
        renderReport(rep);
        toast(`Análise concluída · ${rep.estatisticas.total} verificações · score ${rep.score}%.`, 'ok');
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

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!els.analyzeBtn.disabled) els.analyzeBtn.click();
    }
  });
}

/* ==========================================================================
 * 15. PDF EXECUTIVO
 * ======================================================================== */
function exportarPDF() {
  const rep = state.report;
  if (!rep) return toast('Execute a análise antes de exportar.', 'error');
  if (!window.pdfMake) return toast('pdfMake não carregado.', 'error');

  const risco = rep.auditoria.riscoInfo;
  const meta = rep.auditoria;
  const cor = risco.cor;
  const d = new Date(rep.geradoEm);
  const dataFmt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const resumoBody = [[
    { text: '#', style: 'th' }, { text: 'BLOCO', style: 'th' },
    { text: 'OK/TOTAL', style: 'th', alignment: 'center' },
    { text: 'CRÍTICAS', style: 'th', alignment: 'center' },
    { text: '%', style: 'th', alignment: 'center' },
  ]];
  for (let b = 1; b <= 6; b++) {
    const x = rep.estatisticas.porBloco[b];
    const pct = x.total ? Math.round((x.ok / x.total) * 100) : 100;
    const c = pct >= 90 ? '#059669' : pct >= 70 ? '#d97706' : '#dc2626';
    resumoBody.push([
      { text: String(b), bold: true, alignment: 'center' },
      { text: x.titulo },
      { text: `${x.ok}/${x.total}`, alignment: 'center' },
      { text: String(x.criticas), alignment: 'center', color: x.criticas ? '#dc2626' : '#059669', bold: x.criticas > 0 },
      { text: `${pct}%`, alignment: 'center', color: c, bold: true },
    ]);
  }

  const falhas = rep.resultados.filter(r => !r.conforme);
  const falhasBody = falhas.length === 0
    ? [[
        { text: '—', alignment: 'center', color: '#94a3b8' },
        { text: 'Nenhuma inconformidade identificada.', italics: true, color: '#059669', colSpan: 3 }, {}, {}
      ]]
    : falhas.map(r => {
        const bg = r.severidade === 'CRITICA' ? '#fee2e2' : r.severidade === 'MEDIA' ? '#fef3c7' : '#e0f2fe';
        const fg = r.severidade === 'CRITICA' ? '#991b1b' : r.severidade === 'MEDIA' ? '#92400e' : '#075985';
        return [
          { text: `B${r.bloco}·${r.severidade[0]}`, fillColor: bg, color: fg, bold: true, fontSize: 7, alignment: 'center' },
          { stack: [
              { text: `[${r.id}] ${r.nome}`, bold: true, fontSize: 8.5 },
              { text: r.mensagemFalha, fontSize: 8, color: '#475569', margin: [0, 2, 0, 2] },
              { text: `→ ${r.recomendacao}`, fontSize: 7.5, color: '#0f766e', italics: true },
          ]},
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

  const dd = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1e293b', lineHeight: 1.35 },

    header: (p) => p === 1 ? null : {
      margin: [40, 20, 40, 0],
      columns: [
        { text: 'LicitaAudit · Relatório · 100 verificações', fontSize: 7.5, color: '#94a3b8' },
        { text: (meta.orgao || '').toUpperCase(), fontSize: 7.5, color: '#94a3b8', alignment: 'right' },
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
          { text: (meta.orgao || 'ÓRGÃO / ENTIDADE PÚBLICA').toUpperCase(), fontSize: 13, bold: true, color: '#0f172a' },
          { text: 'SISTEMA LICITAAUDIT — MATRIZ DE 100 VERIFICAÇÕES', fontSize: 8.5, color: '#64748b', characterSpacing: 0.5 },
          { text: 'Base normativa: Lei nº 14.133/2021', fontSize: 8, color: '#94a3b8', italics: true },
        ], margin: [14, 4, 0, 0] },
      ]},
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#1e3a8a' }], margin: [0, 12, 0, 0] },
      { text: 'RELATÓRIO DE AUDITORIA E CONFORMIDADE LICITATÓRIA', fontSize: 12, bold: true, alignment: 'center', color: '#0f172a', margin: [0, 16, 0, 2] },
      { text: `Nº ${meta.numeroRelatorio}  ·  ${dataFmt}`, fontSize: 9, alignment: 'center', color: '#64748b', margin: [0, 0, 0, 16] },

      { table: { widths: ['32%', '68%'], body: [
        [{ text: 'Nº do Processo', style: 'ml' }, { text: meta.processo, style: 'mv' }],
        [{ text: 'Órgão / Entidade', style: 'ml' }, { text: meta.orgao, style: 'mv' }],
        [{ text: 'Objeto', style: 'ml' }, { text: rep.identificacao.objeto, style: 'mv' }],
        [{ text: 'Modalidade', style: 'ml' }, { text: rep.identificacao.modalidade, style: 'mv' }],
        [{ text: 'Grau de Conformidade', style: 'ml' }, { stack: [
          { text: `${rep.score}%`, bold: true, fontSize: 13, color: cor },
          { canvas: [
              { type: 'rect', x: 0, y: 0, w: 200, h: 5, r: 2.5, color: '#e2e8f0' },
              { type: 'rect', x: 0, y: 0, w: 200 * rep.score / 100, h: 5, r: 2.5, color: cor },
          ], margin: [0, 4, 0, 0] },
        ]}],
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

      { text: '1. QUADRO RESUMO — 100 VERIFICAÇÕES', style: 'st' },
      { table: {
        headerRows: 1,
        widths: ['6%', '52%', '16%', '12%', '14%'],
        body: resumoBody,
      }, layout: {
        fillColor: (i) => i === 0 ? '#1e293b' : null,
        hLineWidth: () => 0.4, vLineWidth: () => 0.4,
        hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1',
        paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 6, paddingRight: () => 6,
      }, margin: [0, 0, 0, 16] },

      { text: '2. QUADRO DE NÃO CONFORMIDADES', style: 'st' },
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
        { text: (meta.orgao || '').toUpperCase(), fontSize: 8.5, alignment: 'center', color: '#64748b', italics: true, margin: [0, 2, 0, 0] },
      ], margin: [0, 10, 0, 10] }]] }, layout: 'noBorders', margin: [0, 20, 0, 0] },
    ],

    styles: {
      ml: { fontSize: 8.5, bold: true, color: '#475569' },
      mv: { fontSize: 9, color: '#0f172a' },
      st: { fontSize: 11, bold: true, color: '#0f172a', margin: [0, 12, 0, 6] },
      th: { fontSize: 8, bold: true, color: '#ffffff' },
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
 * 16. JSON / FEEDBACK / TEMA
 * ======================================================================== */
function exportJson() {
  if (!state.report) return;
  const payload = { ferramenta: 'LicitaAudit', versao: '3.0.4', baseNormativa: 'Lei nº 14.133/2021', ...state.report };
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
 * 17. BOOTSTRAP
 * ======================================================================== */
function bootstrap() {
  initTheme();
  configurePdfWorker();
  bindEvents();
  renderFileList();
  console.info(
    '%cLicitaAudit',
    'background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
    '· v3.0.4 · 100 verificações · isenções condicionais por modalidade/natureza'
  );
}
document.addEventListener('DOMContentLoaded', bootstrap);
