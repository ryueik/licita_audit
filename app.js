/* ============================================================================
 * LicitaAudit · app.js — v1.8.1
 * ----------------------------------------------------------------------------
 * Correções desta versão:
 *   • [v1.8.1] FIX: clique no dropzone não dispara loop (input fora + stopProp).
 *   • [v1.8.1] NOVO: suporte a COLAR (Ctrl+V) — arquivos e imagens.
 *   • [v1.8.1] NOVO: dica visual de paste + tratamento de erro nas CDNs.
 *   • [v1.8.0] Parser de metadados flexível e árvore de decisão reordenada.
 * ========================================================================== */

'use strict';

/* ==========================================================================
 * 1. ESTADO E DOM
 * ======================================================================== */
const state = { files: [], report: null, isAnalyzing: false };

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
 * 2. CONSTANTES LEGAIS
 * ======================================================================== */
const LIMITE_DISPENSA_BENS_SERVICOS = 50000.00;
const LIMITE_DISPENSA_OBRAS          = 100000.00;

/* ==========================================================================
 * 3. UTILITÁRIOS GERAIS
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
    .toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function countTerms(text, terms) {
  const t = normalize(text);
  return terms.reduce((acc, term) => acc + (t.includes(normalize(term)) ? 1 : 0), 0);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncateFileName(name, maxBase = 30) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name.length > maxBase ? name.slice(0, maxBase) + '…' : name;
  const base = name.slice(0, dot);
  const ext  = name.slice(dot);
  if (base.length <= maxBase) return name;
  return base.slice(0, maxBase - 1).trimEnd() + '…' + ext;
}

function parseValorBR(str) {
  if (!str) return 0;
  const limpo = String(str).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function formatarValorBR(n) {
  if (!n || n <= 0) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ==========================================================================
 * 4. BASE DE CONHECIMENTO
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
  etp: [/\bestudo\s+t[eé]cnico\s+preliminar\b/i, /\betp\b/i],
  tr:  [/\btermo\s+de\s+refer[eê]ncia\b/i, /\btr\b/i, /\bprojeto\s+b[aá]sico\b/i, /\bpb\b/i, /\banteprojeto\b/i],
  orcamento: [
    /\bestimativa\s+de\s+valor\b/i, /\bvalor\s+estimado\b/i,
    /\bpesquisa\s+de\s+pre[cç]os?\b/i, /\bplanilha\s+or[cç]ament[aá]ria\b/i,
    /R\$\s*[\d.,]+/i,
  ],
  quantidade: [
    /\bquantidade\b/i, /\bqtd\.?\b/i, /\bunidades?\b/i, /\blotes?\b/i, /\bitens?\b/i,
    /\d+\s*\([^)]{2,60}\)/i,
    /\d+\s*(unid|un|pç|pc|cx|kg|l|m²|m³|resma|lote|itens?)/i,
    /\b(um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|quarenta|cinquenta|cem|cento)\b/i,
  ],
  tic: [
    /\bsoftware\b/i, /\blicen[cç]a\s+de\s+software\b/i,
    /\bcloud\s+computing\b/i, /\barquitetura\s+de\s+nuvem\b/i,
    /\bdatacenter\b/i, /\bfirewall\b/i, /\bswitch\s+gerenci[aá]vel\b/i,
    /\broteador\b/i, /\bservidor(es)?\s+de\s+rede\b/i,
    /\bcabeamento\s+estruturado\b/i, /\bdesenvolvimento\s+de\s+sistema\b/i,
    /\berp\b/i, /\bhelp\s*desk\b/i, /\bservice\s*desk\b/i,
    /\bsuporte\s+t[eé]cnico\s+especializado\s+em\s+ti\b/i, /\bconsultoria\s+em\s+ti\b/i,
  ],
  obra: [
    /\bobra(s)?\b/i, /\bengenharia\b/i, /\breforma\b/i, /\bconstru[cç][aã]o\b/i,
    /\bpavimenta[cç][aã]o\b/i, /\bsaneamento\b/i, /\bdrenagem\b/i,
    /\bedifica[cç][aã]o\b/i, /\bfunda[cç][aã]o\b/i, /\bestrutural\b/i,
  ],
  tecnicos: [
    /\bconsultoria\b/i, /\bassessoria\s+t[eé]cnica\b/i, /\bparecer\s+t[eé]cnico\b/i,
    /\bauditoria\b/i, /\bper[íi]cia\b/i, /\blaudo\b/i, /\bestudo\s+t[eé]cnico\b/i,
    /\bengenharia\s+consultiva\b/i,
  ],
  comuns: [
    /\bmaterial\s+de\s+escrit[oó]rio\b/i, /\bmaterial\s+de\s+expediente\b/i,
    /\bpapel\s+a4\b/i, /\bcaneta\b/i, /\bt[oô]ner\b/i, /\bcartucho\b/i,
    /\bl[ií]mp[eê]za\b/i, /\bhigiene\b/i, /\baliment[ií]cio\b/i,
    /\buniforme\b/i, /\bmobili[aá]rio\b/i, /\bcadeira\b/i, /\bmesa\b/i,
    /\bvigil[aâ]ncia\b/i, /\bcombust[íi]vel\b/i, /\blocacao\s+de\s+ve[íi]culo\b/i,
  ],
  marcaDireta: [
    /\bmarca\s+[A-ZÀ-Ú][\w-]+/i, /\bmodelo\s+[A-ZÀ-Ú][\w-]+/i,
    /\bfabricante\s*[:\-]\s*\w+/i, /\bda\s+marca\b/i, /\bpadr[aã]o\s+marca\b/i,
  ],
  empresa: [
    /\b[A-ZÀ-Ú][\wÀ-ú&.'-]*(?:\s+(?:[A-ZÀ-Ú][\wÀ-ú&.'-]*|de|da|do|das|dos|e)){1,6}\s+(?:Ltda\.?|LTDA\.?|S\.A\.?|S\/A|ME|EIRELI|EPP)\b/,
  ],
  justificativaExclusividade: [
    /\bnot[oó]ria\s+especializa[cç][aã]o\b/i, /\bexclusividade\b/i,
    /\bfornecedor\s+exclusivo\b/i, /\binviabilidade\s+de\s+competi[cç][aã]o\b/i,
    /\brepresentante\s+exclusivo\b/i, /\b[uú]nico\s+fornecedor\b/i,
    /\bpadroniza[cç][aã]o\b/i, /\bparecer\s+t[eé]cnico\s+de\s+exclusividade\b/i,
    /\bart\.?\s*74\b/i,
  ],
  justificativaPrecoInexigivel: [
    /\bnotas?\s+fiscais?\b/i, /\bcontrato(s)?\s+anterior(es)?\b/i,
    /\bpre[cç]os?\s+praticad[oa]s?\b/i, /\bart\.?\s*74,?\s*§?\s*2/i,
  ],
  leiAntiga: /\b8\.?\s?666\b/,
  negacaoLeiAntiga: /(sem\s+refer[eê]ncia|revogad[ao]s?|substitu[ií]d[ao]s?|exclusivamente|somente|apenas|n[aã]o\s+se\s+aplica|n[aã]o\s+mais|obsolet[ao]s?|superad[ao]s?|ultrapassad[ao]s?|n[aã]o\s+utilizad[ao]s?|aus[eê]ncia)/i,
  emergencia: /emerg[êe]ncial?|emerg[êe]ncia|calamidade|desastre|defesa\s+civil/i,
  alienacao:  /aliena[cç][aã]o|venda\s+de\s+bens|inserv[íi]ve(is|l)|desfazimento|maior\s+lance/i,
  inexigibilidade: /inexig[íi]vel|inviabilidade\s+de\s+competi[cç][aã]o|fornecedor\s+exclusivo|not[oó]ria\s+especializa[cç][aã]o/i,
};

/* ==========================================================================
 * 5. PARSER DE TEXTO
 * ======================================================================== */

function firstMatch(text, regexes) {
  for (const rx of regexes) {
    const m = text.match(rx);
    if (m) return m;
  }
  return null;
}

function extrairModalidade(corpus) {
  const rotulado = corpus.match(
    /(?:modalidade(?:\s+de\s+licita[cç][aã]o|\s+licitat[oó]ria|\s+adotada)?|tipo\s+de\s+licita[cç][aã]o)\s*[:\-–—]\s*([^\n\r]{2,80})/i
  );
  if (rotulado) {
    const v = rotulado[1].trim();
    if (/preg[aã]o/i.test(v))                   return { chave: 'pregao',          rotulo: 'Pregão Eletrônico' };
    if (/concorr[eê]ncia/i.test(v))             return { chave: 'concorrencia',    rotulo: 'Concorrência' };
    if (/leil[aã]o/i.test(v))                   return { chave: 'leilao',          rotulo: 'Leilão Eletrônico' };
    if (/dispensa/i.test(v))                    return { chave: 'dispensa',        rotulo: 'Dispensa de Licitação' };
    if (/inexigibilidade/i.test(v))             return { chave: 'inexigibilidade', rotulo: 'Inexigibilidade de Licitação' };
    if (/di[aá]logo\s+competitivo/i.test(v))    return { chave: 'dialogo',         rotulo: 'Diálogo Competitivo' };
    if (/concurso/i.test(v))                    return { chave: 'concurso',        rotulo: 'Concurso' };
    return { chave: null, rotulo: v.slice(0, 80) };
  }

  for (const [chave, rx] of Object.entries(KB.sinaisModalidade)) {
    if (rx.test(corpus)) {
      const mapa = {
        pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência',
        concurso: 'Concurso', leilao: 'Leilão Eletrônico',
        dialogo: 'Diálogo Competitivo', dispensa: 'Dispensa de Licitação',
        inexigibilidade: 'Inexigibilidade de Licitação',
      };
      return { chave, rotulo: mapa[chave] };
    }
  }
  return { chave: null, rotulo: 'Não identificada' };
}

function extrairObjeto(corpus) {
  const RX_PRINCIPAL =
    /(?:^|\n)\s*(?:#+\s*)?(?:\d+[\.\)]\s*|[IVX]+\.\s*)?(?:Identifica[cç][aã]o\s+do\s+Objeto|Objeto\s+do\s+Processo|Objeto\s+da\s+Contrata[cç][aã]o|Objeto)\s*[:\-–—]*\s*\n+([^\n#]{3,600})/i;
  const RX_MESMA =
    /(?:^|\n)\s*(?:#+\s*)?(?:\d+[\.\)]\s*|[IVX]+\.\s*)?(?:Identifica[cç][aã]o\s+do\s+Objeto|Objeto\s+do\s+Processo|Objeto\s+da\s+Contrata[cç][aã]o|Objeto)\s*[:\-–—]+\s*([^\n#]{3,600})/i;
  const RX_MULTI =
    /(?:^|\n)\s*(?:#+\s*)?(?:\d+[\.\)]\s*|[IVX]+\.\s*)?(?:Identifica[cç][aã]o\s+do\s+Objeto|Objeto\s+do\s+Processo|Objeto\s+da\s+Contrata[cç][aã]o|Objeto)\s*[:\-–—]*\s*\n?\s*([\s\S]{3,800}?)(?=\n\s*(?:#+\s*)?(?:\d+[\.\)]\s*)?(?:Modalidade|Checklist|Justificativa|Fundamenta|Dota|Estimativa|Crit[eé]rio|Prazo)|\n\s*\n|$)/i;

  const m = firstMatch(corpus, [RX_PRINCIPAL, RX_MESMA, RX_MULTI]);
  if (!m) return { texto: '', tipo: 'Não identificado' };

  const texto = m[1].replace(/\s+/g, ' ').replace(/^[\s\-–—:.,;]+|[\s\-–—:.,;]+$/g, '').trim().slice(0, 600);
  if (!texto) return { texto: '', tipo: 'Não identificado' };

  return { texto, tipo: classificarObjeto(texto) };
}

function classificarObjeto(texto) {
  if (!texto) return 'Não identificado';
  if (KB.alienacao.test(texto))       return 'Alienação de bens';
  if (firstMatch(texto, KB.obra))     return 'Obras e serviços de engenharia';
  if (firstMatch(texto, KB.tic))      return 'Tecnologia da Informação (TIC)';
  if (firstMatch(texto, KB.tecnicos)) return 'Serviços técnicos especializados';
  if (firstMatch(texto, KB.comuns))   return 'Bens e serviços comuns';
  return 'Serviços em geral';
}

function extrairValor(corpus) {
  const m = corpus.match(/R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
  return m ? parseValorBR(m[1]) : 0;
}

function extrairProcesso(corpus) {
  const m = corpus.match(
    /\b(processo|edital|pregao|preg[aã]o|concorr[eê]ncia|concurso|leil[aã]o|dispensa|inexigibilidade|memorando|of[íi]cio|dfd)\s*(?:n[º°.]?|n[uú]mero)?\s*([\d][\d.\/\-\w]{3,30})/i
  );
  if (!m) return 'Não identificado';
  const rotuloBase = m[1].replace(/^dfd$/i, 'DFD');
  const rotulo = rotuloBase.charAt(0).toUpperCase() + rotuloBase.slice(1).toLowerCase();
  return `${rotulo} nº ${m[2]}`;
}

function extrairOrgao(corpus) {
  const m = corpus.match(
    /\b(Minist[ée]rio|Prefeitura(?:\s+Municipal)?|Tribunal|Universidade|Instituto|C[âa]mara(?:\s+Municipal)?|Assembleia|Secretaria|Funda[cç][aã]o|Autarquia)[^\n,.;]{0,80}/i
  );
  return m ? m[0].replace(/\s+/g, ' ').trim() : 'ÓRGÃO / ENTIDADE PÚBLICA';
}

function extrairUnidadeRequisitante(corpus) {
  const m = corpus.match(
    /(?:unidade\s+requisitante|setor\s+requisitante|remetente|origem)\s*[:\-–—]\s*([^\n]{3,90})/i
  );
  if (m) return m[1].trim();
  const nome = corpus.match(
    /\b(Diretoria\s+de\s+Tecnologia\s+da\s+Informa[cç][aã]o|Coordena[cç][aã]o[\-\s]*Geral\s+de\s+Tecnologia\s+da\s+Informa[cç][aã]o|Setor\s+Requisitante\s*[\/\-]\s*TI)\b/i
  );
  return nome ? nome[1] : 'Não informada';
}

function extrairEmpresa(corpus) {
  const m = corpus.match(KB.empresa[0]);
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
 * 6. DETECÇÃO DE SINAIS
 * ======================================================================== */

const detectarEmergencia        = (t) => KB.emergencia.test(t);
const detectarAlienacao         = (t) => KB.alienacao.test(t);
const detectarInexigibilidade   = (t) => KB.inexigibilidade.test(t) || firstMatch(t, KB.justificativaExclusividade);
const detectarJustificativaPreco = (t) => firstMatch(t, KB.justificativaPrecoInexigivel);
const detectarJustificativaMarca = (t) => firstMatch(t, KB.justificativaExclusividade);
const detectarMarcaDireta        = (t) => firstMatch(t, KB.marcaDireta);
const detectarQuantidade         = (t) => firstMatch(t, KB.quantidade);

function verificarLeiAntiga(corpus) {
  const linhas = String(corpus || '').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    if (!KB.leiAntiga.test(linhas[i])) continue;
    const ctx = linhas.slice(Math.max(0, i - 1), Math.min(linhas.length, i + 2)).join(' ');
    if (KB.negacaoLeiAntiga.test(ctx)) continue;
    return { status: 'danger', linha: i + 1, snippet: linhas[i].replace(/\s+/g, ' ').trim().slice(0, 260) };
  }
  return { status: 'ok', linha: null, snippet: null };
}

/* ==========================================================================
 * 7. CLASSIFICAÇÃO DE NATUREZA
 * ======================================================================== */

function classificarNatureza(corpus, forcarNatureza = 'auto') {
  if (forcarNatureza && forcarNatureza !== 'auto') {
    const mapa = {
      bens: 'Aquisição de bens', 'servicos-comuns': 'Bens e serviços comuns',
      'servicos-especiais': 'Serviços técnicos especializados',
      obras: 'Obras e serviços de engenharia', alienacao: 'Alienação de bens',
      intelectual: 'Serviços técnicos especializados',
    };
    return mapa[forcarNatureza] || forcarNatureza;
  }
  const txt = corpus || '';
  if (KB.alienacao.test(txt))       return 'Alienação de bens';
  if (firstMatch(txt, KB.obra))     return 'Obras e serviços de engenharia';
  if (firstMatch(txt, KB.tic))      return 'Tecnologia da Informação (TIC)';
  if (firstMatch(txt, KB.tecnicos)) return 'Serviços técnicos especializados';
  if (firstMatch(txt, KB.comuns))   return 'Bens e serviços comuns';
  return 'Bens e serviços comuns';
}

/* ==========================================================================
 * 8. ÁRVORE DE DECISÃO
 * ======================================================================== */

function determinarModalidade(ctx) {
  const { objetoTexto = '', natureza = 'Bens e serviços comuns', valor = 0, empresa = null, marcaDireta = null } = ctx;
  const corpus = String(ctx.corpus || '');
  const valorFmt = valor > 0 ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'não informado';

  /* 1. DISPENSA EMERGENCIAL */
  if (detectarEmergencia(corpus)) {
    return {
      modalidade: 'Dispensa de Licitação Emergencial',
      baseLegal:  'Art. 75, VIII — Lei 14.133/2021',
      cor: 'danger',
      motivo:
        'A situação de emergência ou calamidade pública autoriza a contratação direta para ' +
        'atendimento de risco iminente à vida, à segurança pública ou à paralisação de serviços ' +
        'essenciais. A licitação é dispensável nos termos do Art. 75, VIII da Lei nº 14.133/2021. ' +
        'O prazo máximo é de 1 (um) ano, sendo vedada a prorrogação (Art. 75, §1º).' +
        (valor > 0 ? ` Valor estimado informado: ${valorFmt}.` : ''),
      descricao:  'Contratação direta em razão de emergência ou calamidade pública.',
      observacao: 'A emergência NÃO pode decorrer de falta de planejamento ou desídia do administrador.',
    };
  }

  /* 2. LEILÃO ELETRÔNICO */
  if (detectarAlienacao(corpus) || KB.alienacao.test(objetoTexto)) {
    return {
      modalidade: 'Leilão Eletrônico',
      baseLegal:  'Art. 6º, XL e Art. 31 — Lei 14.133/2021',
      cor: 'warning',
      motivo:
        'Processo voltado à alienação de bens móveis inservíveis ou de bens imóveis da ' +
        'Administração. O critério é o MAIOR LANCE e a modalidade obrigatória é o Leilão, ' +
        'preferencialmente eletrônico (Art. 31).',
      descricao:  'Modalidade obrigatória para alienação de bens públicos.',
      observacao: 'Exige avaliação prévia do bem e autorização legislativa (imóveis).',
    };
  }

  /* 3. INEXIGIBILIDADE */
  if (detectarInexigibilidade(corpus)) {
    const temJustPreco = detectarJustificativaPreco(corpus);
    return {
      modalidade: 'Inexigibilidade de Licitação',
      baseLegal:  'Art. 74 — Lei 14.133/2021',
      cor: 'danger',
      motivo:
        'Há inviabilidade de competição caracterizada nos autos (exclusividade de fornecedor, ' +
        'notória especialização ou artista consagrado). A contratação direta é a única via apta ' +
        'a satisfazer a necessidade pública. ' +
        (temJustPreco
          ? 'O preço é justificado com base em notas fiscais/contratos anteriores do contratado, ' +
            'conforme faculta o Art. 74, §2º, dispensando a pesquisa tradicional de 3 orçamentos.'
          : 'Deve ser instruída com parecer técnico circunstanciado demonstrando a exclusividade ' +
            'ou notória especialização (Art. 74, §1º e §2º).') +
        (empresa ? ` ⚠ Empresa mencionada: ${empresa}.` : ''),
      descricao:  'Contratação direta por inviabilidade de competição.',
      observacao: 'Exige parecer técnico circunstanciado e justificativa de preço.',
    };
  }

  /* 4. DISPENSA POR VALOR */
  const eObra = natureza === 'Obras e serviços de engenharia';

  if (eObra && valor > 0 && valor <= LIMITE_DISPENSA_OBRAS) {
    return {
      modalidade: 'Dispensa de Licitação por Valor',
      baseLegal:  'Art. 75, I — Lei 14.133/2021',
      cor: 'success',
      motivo:
        `O valor estimado da obra/engenharia (${valorFmt}) está dentro do limite legal de ` +
        `R$ ${LIMITE_DISPENSA_OBRAS.toLocaleString('pt-BR')} do Art. 75, I.`,
      descricao:  'Dispensa por pequeno vulto — obras e engenharia.',
      observacao: 'Exige orçamento detalhado e pesquisa de preços (Art. 72).',
    };
  }

  if (!eObra && valor > 0 && valor <= LIMITE_DISPENSA_BENS_SERVICOS) {
    return {
      modalidade: 'Dispensa de Licitação por Valor',
      baseLegal:  'Art. 75, II — Lei 14.133/2021',
      cor: 'success',
      motivo:
        `O valor total (${valorFmt}) está abaixo do limite legal de ` +
        `R$ ${LIMITE_DISPENSA_BENS_SERVICOS.toLocaleString('pt-BR')} do Art. 75, II.`,
      descricao:  'Dispensa por pequeno vulto — bens e serviços comuns.',
      observacao: 'Aplicável a objetos comuns. Exige pesquisa de preços (Art. 72).',
    };
  }

  /* 5. CONCORRÊNCIA */
  const eTecnico  = natureza === 'Serviços técnicos especializados';
  const eEspecial = natureza === 'Tecnologia da Informação (TIC)';

  if (eTecnico || eObra || eEspecial) {
    const tipo = eTecnico
      ? 'serviço técnico especializado de natureza predominantemente intelectual'
      : eObra
        ? 'obra ou serviço de engenharia de complexidade relevante'
        : 'serviço de TIC com especificidade técnica';
    return {
      modalidade: 'Concorrência',
      baseLegal:  'Art. 6º, XXXVIII e Art. 36 — Lei 14.133/2021',
      cor: 'info',
      motivo:
        `Trata-se de ${tipo}, cuja avaliação não se esgota no menor preço. A complexidade ` +
        'recomenda julgamento por "Melhor Técnica" ou "Técnica e Preço" (Art. 36, §1º), ' +
        'afastando o uso do Pregão.',
      descricao:  'Modalidade obrigatória para serviços técnicos e obras acima da dispensa.',
      observacao: 'Admite menor preço, melhor técnica ou técnica e preço.',
    };
  }

  /* 6. PREGÃO ELETRÔNICO */
  const comRessalva = !!empresa || !!marcaDireta;
  return {
    modalidade: comRessalva ? 'Pregão Eletrônico (com ressalva)' : 'Pregão Eletrônico',
    baseLegal:  'Art. 6º, XLI e Art. 29 — Lei 14.133/2021',
    cor: comRessalva ? 'warning' : 'brand',
    motivo:
      'O objeto enquadra-se como bem ou serviço comum, cujos padrões podem ser objetivamente ' +
      'definidos no edital (Art. 6º, XLI e Art. 29).' +
      (comRessalva
        ? ` ⚠ Foi identificada menção direta${empresa ? ` à empresa "${empresa}"` : ''}${marcaDireta ? ' ou a marca' : ''}. ` +
          'Caso não se trate de inexigibilidade (Art. 74), a indicação deve ser afastada por ' +
          'violação ao Art. 41, I.'
        : ''),
    descricao:  'Modalidade obrigatória para bens e serviços comuns.',
    observacao: 'Aplicável a objetos comuns com padrões usuais de mercado.',
  };
}

/* ==========================================================================
 * 9. CHECKLIST
 * ======================================================================== */

function analisarConformidade(corpus, meta) {
  const checks = [];
  const linhas = corpus.split(/\r?\n/);

  const evidencia = (achou, trecho) => ({
    status: achou ? 'ok' : 'warn',
    evidencia: achou ? `Conforme: "${trecho}"` : 'Não localizado no corpus.',
  });

  /* 1. ETP */
  {
    const achou = linhas.find((l) => firstMatch(l, KB.etp));
    const r = evidencia(!!achou, achou ? achou.trim().slice(0, 160) : '');
    checks.push({
      id: 'etp', requisito: 'Estudo Técnico Preliminar (ETP)', lei: 'Art. 18, §1º, I',
      status: r.status, evidencia: r.evidencia,
      correcao: r.status === 'ok' ? null : 'Elaborar e anexar o ETP com descrição da necessidade.',
    });
  }

  /* 2. TR */
  {
    const achou = linhas.find((l) => firstMatch(l, KB.tr));
    const r = evidencia(!!achou, achou ? achou.trim().slice(0, 160) : '');
    checks.push({
      id: 'tr', requisito: 'Termo de Referência / Projeto Básico', lei: 'Art. 6º, XXIII e XXV · Art. 40',
      status: r.status, evidencia: r.evidencia,
      correcao: r.status === 'ok' ? null : 'Anexar TR ou Projeto Básico, conforme o objeto.',
    });
  }

  /* 3. Estimativa de valor */
  {
    const achou = linhas.find((l) => firstMatch(l, KB.orcamento)) || meta.valor > 0;
    const trecho = meta.valor > 0 ? formatarValorBR(meta.valor) : (linhas.find((l) => firstMatch(l, KB.orcamento)) || '').trim().slice(0, 160);
    checks.push({
      id: 'orcamento', requisito: 'Estimativa do valor da contratação', lei: 'Art. 23',
      status: achou ? 'ok' : 'danger',
      evidencia: achou ? `Conforme: "${trecho}"` : 'Não há menção a valor estimado.',
      correcao: achou ? null : 'Elaborar estimativa com base em pesquisa de preços.',
    });
  }

  /* 4. Quantidade */
  {
    const achou = detectarQuantidade(corpus);
    checks.push({
      id: 'quantidade', requisito: 'Estimativa de quantidade', lei: 'Art. 18, §1º, III',
      status: achou ? 'ok' : 'warn',
      evidencia: achou ? `Conforme: "${String(achou[0]).slice(0, 160)}"` : 'Quantidade não explicitada.',
      correcao: achou ? null : 'Detalhar as quantidades ou lotes a serem contratados.',
    });
  }

  /* 5. Dotação */
  {
    const achou = linhas.find((l) => /(dota[cç][aã]o|or[cç]ament|fonte\s+de\s+recurso)/i.test(l));
    checks.push({
      id: 'dotacao', requisito: 'Adequação orçamentária', lei: 'Art. 150',
      status: achou ? 'ok' : 'warn',
      evidencia: achou ? `Conforme: "${achou.trim().slice(0, 160)}"` : 'Dotação orçamentária não mencionada.',
      correcao: achou ? null : 'Indicar a dotação e o programa de trabalho.',
    });
  }

  /* 6. Matriz de Riscos */
  {
    const achou = linhas.find((l) => /matriz\s+de\s+risco/i.test(l));
    const obrig = ['Obras e serviços de engenharia', 'Tecnologia da Informação (TIC)'].includes(meta.natureza);
    const final = achou ? 'ok' : (obrig ? 'danger' : 'warn');
    checks.push({
      id: 'matriz', requisito: 'Matriz de Riscos', lei: 'Art. 22 · Art. 100',
      status: final,
      evidencia: achou ? `Conforme: "${achou.trim().slice(0, 160)}"` : 'Matriz de riscos não identificada.',
      correcao: final === 'ok' ? null
        : (obrig ? 'Obrigatória para obras e serviços de grande vulto.' : 'Recomenda-se matriz de riscos.'),
    });
  }

  /* 7. Prazos */
  {
    const achou = linhas.find((l) => /prazo\s+de\s+divulga|prazo\s+m[íi]nimo|dias\s+[uú]teis|art\.?\s*55/i.test(l));
    checks.push({
      id: 'prazo', requisito: 'Prazos mínimos de divulgação', lei: 'Art. 55',
      status: achou ? 'ok' : 'warn',
      evidencia: achou ? `Conforme: "${achou.trim().slice(0, 160)}"` : 'Prazos não explicitados.',
      correcao: achou ? null : 'Explicitar os prazos do Art. 55.',
    });
  }

  /* 8. Critério */
  {
    const achou = linhas.find((l) => /menor\s+pre[cç]o|maior\s+desconto|melhor\s+t[eé]cnica|t[eé]cnica\s+e\s+pre[cç]o|maior\s+lance|maior\s+retorno/i.test(l));
    checks.push({
      id: 'criterio', requisito: 'Critério de julgamento expresso', lei: 'Art. 33',
      status: achou ? 'ok' : 'warn',
      evidencia: achou ? `Conforme: "${achou.trim().slice(0, 160)}"` : 'Critério não declarado.',
      correcao: achou ? null : 'Declarar expressamente o critério entre os do Art. 33.',
    });
  }

  /* 9. Direcionamento — CRÍTICO */
  {
    const empresa = meta.empresa;
    const marca   = detectarMarcaDireta(corpus);
    const justEx  = detectarJustificativaMarca(corpus);
    const houve   = (empresa || marca);
    const legitima = !!justEx;

    if (houve && !legitima) {
      checks.push({
        id: 'direcionamento',
        requisito: 'Vedação ao direcionamento de fornecedor',
        lei: 'Art. 41, I e Art. 5º',
        status: 'danger',
        evidencia:
          `🚨 INDÍCIO DE DIRECIONAMENTO — ` +
          (empresa ? `Empresa "${empresa}" ` : '') +
          (marca ? `Marca "${String(marca[0]).slice(0, 80)}" ` : '') +
          `mencionada sem justificativa de exclusividade/padronização.`,
        correcao: 'Apresentar parecer técnico comprovando exclusividade, OU retificar o expediente.',
        critico: true,
      });
    } else if (houve && legitima) {
      checks.push({
        id: 'direcionamento', requisito: 'Vedação ao direcionamento de fornecedor',
        lei: 'Art. 41, I e Art. 5º',
        status: 'ok',
        evidencia: 'Menção direta acompanhada de justificativa técnica.',
        correcao: null,
      });
    } else {
      checks.push({
        id: 'direcionamento', requisito: 'Vedação ao direcionamento de fornecedor',
        lei: 'Art. 41, I e Art. 5º',
        status: 'ok',
        evidencia: 'Nenhuma menção direta a empresa/marca.',
        correcao: null,
      });
    }
  }

  /* 10. Lei 8.666/93 */
  {
    const r = verificarLeiAntiga(corpus);
    checks.push({
      id: 'lei-antiga', requisito: 'Ausência de referências à Lei 8.666/93', lei: 'Art. 191',
      status: r.status === 'danger' ? 'danger' : 'ok',
      evidencia: r.status === 'danger' ? `⚠️ Referência indevida: "${r.snippet}"` : '✓ Nenhuma referência indevida.',
      correcao: r.status === 'danger' ? 'Substituir pela Lei 14.133/2021.' : null,
    });
  }

  return checks;
}

/* ==========================================================================
 * 10. MOTOR PRINCIPAL
 * ======================================================================== */

function buildCorpus() {
  return state.files
    .filter((f) => f.status === 'ok' && f.text)
    .map((f) => `\n===== ARQUIVO: ${f.name} =====\n${f.text}`)
    .join('\n');
}

function classificarRisco(score) {
  if (score >= 90) return { nivel: 'BAIXO', titulo: 'Risco Baixo',
    descricao: 'Processo apto para publicação. Nenhum vício impeditivo identificado.',
    cor: '#10b981', badge: 'badge--ok', emoji: '🟢' };
  if (score >= 70) return { nivel: 'MÉDIO', titulo: 'Risco Médio',
    descricao: 'Recomendado saneamento prévio dos apontamentos antes da publicação.',
    cor: '#f59e0b', badge: 'badge--warn', emoji: '🟡' };
  return { nivel: 'ALTO', titulo: 'Risco Alto / Inviável',
    descricao: 'Contém vícios insanáveis ou ilegalidades graves. Publicação desaconselhada.',
    cor: '#dc2626', badge: 'badge--danger', emoji: '🔴' };
}

function detectarCriterio(text) {
  const mapa = {
    'menor-preco':    /\bmenor\s+pre[cç]o\b/i,
    'maior-desconto': /\bmaior\s+desconto\b/i,
    'melhor-tecnica': /\bmelhor\s+t[eé]cnica\b/i,
    'tecnica-preco':  /\bt[eé]cnica\s+e\s+pre[cç]o\b/i,
    'maior-lance':    /\bmaior\s+lance\b/i,
    'maior-retorno':  /\bmaior\s+retorno\s+econ[oô]mico\b/i,
  };
  for (const [k, rx] of Object.entries(mapa)) if (rx.test(text)) return k;
  return 'indefinido';
}

function runAudit() {
  const corpus = buildCorpus();
  const paramObjeto     = els.paramObjeto.value;
  const paramModalidade = els.paramModalidade.value;
  const paramCriterio   = els.paramCriterio.value;

  const meta = extrairMetadados(corpus);
  const natureza = classificarNatureza(corpus, paramObjeto);

  const modalidadeInfo = paramModalidade !== 'auto'
    ? {
        ...determinarModalidade({
          corpus, objetoTexto: meta.objeto.texto, natureza,
          valor: meta.valor, empresa: meta.empresa,
          marcaDireta: detectarMarcaDireta(corpus),
        }),
        modalidade: (() => {
          const mapa = {
            pregao: 'Pregão Eletrônico', concorrencia: 'Concorrência',
            concurso: 'Concurso', leilao: 'Leilão Eletrônico',
            dialogo: 'Diálogo Competitivo', dispensa: 'Dispensa de Licitação',
            inexigibilidade: 'Inexigibilidade de Licitação',
          };
          return mapa[paramModalidade] || meta.modalidade.rotulo;
        })(),
      }
    : determinarModalidade({
        corpus, objetoTexto: meta.objeto.texto, natureza,
        valor: meta.valor, empresa: meta.empresa,
        marcaDireta: detectarMarcaDireta(corpus),
      });

  const metaFull = {
    ...meta,
    natureza,
    modalidade: modalidadeInfo.modalidade,
    criterio: paramCriterio !== 'auto' ? paramCriterio : detectarCriterio(corpus),
  };

  const checks = analisarConformidade(corpus, metaFull);

  const total  = checks.length;
  const ok     = checks.filter((c) => c.status === 'ok').length;
  const warn   = checks.filter((c) => c.status === 'warn').length;
  const danger = checks.filter((c) => c.status === 'danger').length;
  const temCritico = checks.some((c) => c.critico);

  const scoreBase = Math.round(((ok * 1 + warn * 0.5) / total) * 100);
  const score     = temCritico ? Math.min(scoreBase, 60) : scoreBase;
  const risco     = classificarRisco(score);

  let statusGeral;
  if (temCritico)                     statusGeral = 'requer-correcoes';
  else if (danger === 0 && warn <= 1) statusGeral = 'aprovado';
  else if (danger <= 2)               statusGeral = 'requer-correcoes';
  else                                statusGeral = 'inconclusivo';

  const correcoes = checks
    .filter((c) => c.status !== 'ok' && c.correcao)
    .map((c) => ({
      id: c.id, titulo: c.requisito, lei: c.lei,
      severidade: c.critico ? 'alta' : (c.status === 'danger' ? 'alta' : 'media'),
      descricao: c.evidencia, sugestao: c.correcao,
    }));

  const dataGeracao = new Date();
  const numeroRelatorio = String(Math.floor(Math.random() * 900) + 100) + '/' + dataGeracao.getFullYear();

  return {
    geradoEm: dataGeracao.toISOString(),
    statusGeral, score,
    estatisticas: { total, ok, warn, danger },
    identificacao: {
      objeto:             metaFull.objeto.tipo,
      objetoField:        metaFull.objeto.texto,
      modalidade:         metaFull.modalidade,
      natureza:           metaFull.natureza,
      criterio:           metaFull.criterio,
      empresa:            metaFull.empresa,
      arquivosAnalisados: state.files.filter((f) => f.status === 'ok').length,
      caracteresAnalisados: corpus.length,
      linhasAnalisadas:   corpus.split(/\r?\n/).length,
    },
    auditoria: {
      numeroRelatorio, dataGeracao: dataGeracao.toISOString(),
      risco: risco.nivel, riscoInfo: risco,
      processo: metaFull.processo, valor: metaFull.valor,
      orgao: metaFull.orgao, unidade: metaFull.unidade,
      temCritico,
    },
    checks, correcoes,
  };
}

/* ==========================================================================
 * 11. RENDERIZAÇÃO
 * ======================================================================== */

const CRITERIO_LABEL = {
  'menor-preco': 'Menor preço', 'maior-desconto': 'Maior desconto',
  'melhor-tecnica': 'Melhor técnica ou conteúdo artístico',
  'tecnica-preco': 'Técnica e preço', 'maior-lance': 'Maior lance',
  'maior-retorno': 'Maior retorno econômico', 'indefinido': 'Não identificado',
};
const STATUS_LABEL = {
  'aprovado':         { titulo: 'Aprovado',         desc: 'O processo atende aos requisitos essenciais da Lei nº 14.133/2021.' },
  'requer-correcoes': { titulo: 'Requer Correções', desc: 'Foram identificadas inconsistências que devem ser sanadas antes da publicação.' },
  'inconclusivo':     { titulo: 'Inconclusivo',     desc: 'Há divergências relevantes. Revisão aprofundada recomendada.' },
};
const STATUS_COLOR = { aprovado: 'var(--ok)', 'requer-correcoes': 'var(--warn)', inconclusivo: 'var(--danger)' };
const STATUS_BADGE = { ok: 'badge--ok', warn: 'badge--warn', danger: 'badge--danger' };
const STATUS_TEXT  = { ok: 'Conforme', warn: 'Atenção', danger: 'Não conforme' };
const SEV_CLASS    = { alta: 'sev-pill--alta', media: 'sev-pill--media', baixa: 'sev-pill--baixa' };

function renderReport(rep) {
  const statusInfo  = STATUS_LABEL[rep.statusGeral];
  const statusColor = STATUS_COLOR[rep.statusGeral];
  const dashArray   = 2 * Math.PI * 44;
  const dashValue   = (rep.score / 100) * dashArray;
  const risco = rep.auditoria.riscoInfo;
  const meta  = rep.auditoria;

  const alertaCritico = meta.temCritico
    ? `<section class="card" style="border-left:5px solid var(--danger);background:var(--danger-soft);">
        <h3 class="card__title" style="color:var(--danger);">🚨 Alerta Crítico — Vedação ao Direcionamento</h3>
        <p style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:6px;">
          Foi identificada menção direta a
          ${rep.identificacao.empresa ? `<strong>${escapeHtml(rep.identificacao.empresa)}</strong>` : 'marca/empresa privada'}
          sem justificativa formal de exclusividade ou padronização.
        </p>
        <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">
          Fundamento: <strong>Art. 41, I</strong> e <strong>Art. 5º</strong> da Lei nº 14.133/2021.
          <strong>Parecer automático: DEVOLVIDO PARA ADEQUAÇÃO.</strong>
        </p>
      </section>` : '';

  const dashboardHtml = `
    <section class="card">
      <h3 class="card__title">Resumo Executivo</h3>
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
                style="stroke:${statusColor}; stroke-dasharray:${dashValue} ${dashArray};"></circle>
            </svg>
            <div class="score-card__number">${rep.score}<small>%</small></div>
          </div>
          <div class="score-card__legend">
            <h3>${statusInfo.titulo}</h3>
            <p>${statusInfo.desc}</p>
            <span class="score-card__pill">
              ${rep.estatisticas.ok} conformes · ${rep.estatisticas.warn} atenção · ${rep.estatisticas.danger} divergentes
            </span>
          </div>
        </div>
      </div>
    </section>
  `;

  const fichaHtml = `
    <section class="card">
      <h3 class="card__title">Ficha Técnica do Processo</h3>
      <div class="exec-meta">
        <div class="exec-meta__item"><span class="exec-meta__key">Nº do Processo</span>
          <span class="exec-meta__val">${escapeHtml(meta.processo)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Órgão / Entidade</span>
          <span class="exec-meta__val">${escapeHtml(meta.orgao)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Unidade Requisitante</span>
          <span class="exec-meta__val">${escapeHtml(meta.unidade)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Objeto</span>
          <span class="exec-meta__val">${escapeHtml(rep.identificacao.objeto)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Natureza</span>
          <span class="exec-meta__val">${escapeHtml(rep.identificacao.natureza)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Valor Estimado</span>
          <span class="exec-meta__val">${meta.valor > 0 ? formatarValorBR(meta.valor) : 'Não informado'}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Modalidade</span>
          <span class="exec-meta__val">${escapeHtml(rep.identificacao.modalidade)}</span></div>
        <div class="exec-meta__item"><span class="exec-meta__key">Critério de Julgamento</span>
          <span class="exec-meta__val">${CRITERIO_LABEL[rep.identificacao.criterio] || rep.identificacao.criterio}</span></div>
      </div>
    </section>
  `;

  const achados = rep.checks.filter((c) => c.status !== 'ok');
  const matrizHtml = achados.length === 0
    ? `<section class="card">
        <h3 class="card__title">Matriz de Achados e Recomendações</h3>
        <p style="font-size:13px;color:var(--text-muted);">
          ✓ Nenhuma inconformidade identificada. Processo em conformidade formal.
        </p>
      </section>`
    : `<section class="card">
        <h3 class="card__title">Matriz de Achados e Recomendações</h3>
        <div class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th style="width:100px;">Severidade</th>
                <th>Constatação do Auditor</th>
                <th style="width:180px;">Fundamento Legal</th>
                <th style="width:280px;">Recomendação</th>
              </tr>
            </thead>
            <tbody>
              ${achados.map((c) => {
                const sev = c.critico ? 'alta' : (c.status === 'danger' ? 'alta' : 'media');
                return `
                  <tr>
                    <td><span class="sev-pill ${SEV_CLASS[sev]}">${sev === 'alta' ? 'ALTA' : 'MÉDIA'}</span></td>
                    <td>
                      <strong>${escapeHtml(c.requisito)}</strong>
                      <div style="margin-top:4px;font-size:12.5px;color:var(--text-muted);line-height:1.55;">
                        ${escapeHtml(c.evidencia)}
                      </div>
                    </td>
                    <td><span class="matrix__law">${escapeHtml(c.lei)}</span></td>
                    <td>
                      ${c.correcao
                        ? `<div class="matrix__rec"><strong>Recomendação:</strong> ${escapeHtml(c.correcao)}</div>`
                        : '<em style="color:var(--text-dim);font-size:12px;">—</em>'}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>`;

  const checklistHtml = `
    <section class="card">
      <h3 class="card__title">Checklist de Conformidade — Lei 14.133/2021</h3>
      <div class="table-wrap">
        <table class="checks">
          <thead>
            <tr><th>Requisito legal</th><th>Encontrado no documento</th><th>Status</th></tr>
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
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  const guiaHtml = rep.correcoes.length ? `
    <section class="card">
      <h3 class="card__title">Guia de Correção</h3>
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
          </article>`).join('')}
      </div>
    </section>` : '';

  els.report.innerHTML = `
    ${alertaCritico}
    ${dashboardHtml}
    ${fichaHtml}
    ${matrizHtml}
    ${checklistHtml}
    ${guiaHtml}
    <footer class="report-footer">
      <span>Relatório nº ${escapeHtml(meta.numeroRelatorio)} · LicitaAudit v1.8.1 · Lei nº 14.133/2021</span>
      <span>${rep.checks.length} verificações executadas</span>
    </footer>
  `;

  els.report.classList.remove('is-hidden');
  els.emptyState.classList.add('is-hidden');
  els.pdfBtn.disabled   = false;
  els.printBtn.disabled = false;
  els.jsonBtn.disabled  = false;

  requestAnimationFrame(() => {
    const circle = els.report.querySelector('.score-card__gauge .value');
    if (circle) {
      circle.style.strokeDasharray = `0 ${dashArray}`;
      requestAnimationFrame(() => { circle.style.strokeDasharray = `${dashValue} ${dashArray}`; });
    }
  });
}

function resetReport() {
  state.report = null;
  els.report.innerHTML = '';
  els.report.classList.add('is-hidden');
  els.emptyState.classList.remove('is-hidden');
  els.pdfBtn.disabled   = true;
  els.printBtn.disabled = true;
  els.jsonBtn.disabled  = true;
}

/* ==========================================================================
 * 12. LISTA DE ARQUIVOS
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
    </li>`;
  }).join('');

  const okCount = state.files.filter((f) => f.status === 'ok').length;
  els.analyzeBtn.disabled = okCount === 0;
  els.subtitle.textContent = `${state.files.length} documento(s) carregado(s) · ${okCount} pronto(s) para análise`;
}

/* ==========================================================================
 * 13. EXTRAÇÃO DE TEXTO
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
    let lastY = null, lineBuf = [];
    for (const it of items) {
      if (lastY !== null && Math.abs(it.y - lastY) > 2) { parts.push(lineBuf.join(' ')); lineBuf = []; }
      lineBuf.push(it.str); lastY = it.y;
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
      throw new Error('Formato .doc legado não suportado. Converta para .docx ou .pdf.');
    default:
      throw new Error(`Extensão ".${ext}" não suportada.`);
  }
}

/* ==========================================================================
 * 14. ADIÇÃO DE ARQUIVOS (CLICK + DROP + PASTE unificados)
 * ======================================================================== */

/** Núcleo comum: recebe uma lista de File e processa todos. */
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

  await Promise.all(
    state.files.filter((f) => f.status === 'loading').map(async (entry) => {
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

/** Converte um Blob colado em File com nome e extensão coerentes. */
function blobParaFile(blob, nomeSugerido) {
  const tipo = blob.type || 'application/octet-stream';
  const extPorTipo = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt',
    'text/markdown': '.md',
  };
  const ext = extPorTipo[tipo] || '';
  const nome = nomeSugerido || `colado-${Date.now()}${ext}`;
  return new File([blob], nome, { type: tipo });
}

async function removeFile(id) {
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
 * 15. EVENTOS DE ENTRADA — CLICK, DROP E PASTE
 * ======================================================================== */

function bindEvents() {
  const dz = els.dropzone;

  /* ---------- 🔧 FIX: Clique (sem loop) ---------- */
  // 1) Impede que o clique sintético do input volte ao dropzone
  els.fileInput.addEventListener('click', (e) => e.stopPropagation());

  // 2) Clique no dropzone → abre o seletor
  dz.addEventListener('click', (e) => {
    if (e.target === els.fileInput) return;
    els.fileInput.click();
  });

  // 3) Acessibilidade: Enter/Espaço abre o seletor
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  /* ---------- 🔧 FIX: Drag & Drop ---------- */
  ['dragenter', 'dragover'].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add('is-dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
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

  // Impede que o navegador abra o arquivo ao soltar fora do dropzone
  ['dragover', 'drop'].forEach((evt) =>
    window.addEventListener(evt, (e) => {
      if (!dz.contains(e.target)) e.preventDefault();
    })
  );

  /* ---------- 🔧 FIX: Input file ---------- */
  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  });

  /* ---------- 🔧 NOVO: Colar (Ctrl+V) ---------- */
  // Fonte 1: `paste` no document (pega arquivos e imagens)
  document.addEventListener('paste', (e) => {
    // Ignora se o foco está em input/textarea (usuário pode estar colando texto lá)
    const alvo = e.target;
    const isCampoTexto = alvo && (
      alvo.tagName === 'INPUT' ||
      alvo.tagName === 'TEXTAREA' ||
      alvo.isContentEditable
    );
    if (isCampoTexto) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const arquivosColados = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const blob = item.getAsFile();
      if (!blob) continue;
      arquivosColados.push(blobParaFile(blob));
    }

    if (arquivosColados.length) {
      e.preventDefault();
      addFiles(arquivosColados);
      toast(`${arquivosColados.length} arquivo(s) colado(s) da área de transferência.`, 'ok');
    }
  });

  /* ---------- Botões principais ---------- */
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
 * 16. EXPORTAÇÃO PDF
 * ======================================================================== */

function exportarPDF() {
  const rep = state.report;
  if (!rep) { toast('Execute a análise antes de exportar.', 'error'); return; }
  if (!window.pdfMake) { toast('Biblioteca pdfMake não carregada.', 'error'); return; }

  const risco       = rep.auditoria.riscoInfo;
  const meta        = rep.auditoria;
  const corStatus   = risco.cor;
  const dataGeracao = new Date(rep.geradoEm);
  const dataFmt     = dataGeracao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const achados = rep.checks.filter((c) => c.status !== 'ok');
  const pendenciasBody = achados.length === 0
    ? [[
        { text: '—', alignment: 'center', color: '#94a3b8' },
        { text: 'Nenhuma inconformidade identificada.', italics: true, color: '#059669', colSpan: 3 },
        {}, {}
      ]]
    : achados.map((c) => {
        const sev   = c.critico ? 'ALTA' : (c.status === 'danger' ? 'ALTA' : 'MÉDIA');
        const sevBg = sev === 'ALTA' ? '#fee2e2' : '#fef3c7';
        const sevFg = sev === 'ALTA' ? '#991b1b' : '#92400e';
        return [
          { text: sev, fillColor: sevBg, color: sevFg, bold: true, fontSize: 8, alignment: 'center' },
          { stack: [
              { text: c.requisito, bold: true, fontSize: 9 },
              { text: c.evidencia, fontSize: 8.5, color: '#475569', margin: [0, 2, 0, 0] }
          ]},
          { text: c.lei, fontSize: 7.5, color: '#0284c7', italics: true }
        ];
      });

  const recomendacoes = rep.correcoes.length
    ? rep.correcoes.map((f, i) => ({
        text: `${i + 1}. [${f.severidade.toUpperCase()}] ${f.titulo} — ${f.sugestao}`,
        fontSize: 9.5, color: '#334155', margin: [0, 0, 0, 6], lineHeight: 1.4,
      }))
    : [{ text: 'O processo encontra-se em conformidade formal para prosseguimento.', fontSize: 9.5, color: '#059669' }];

  const parecerTexto = rep.statusGeral === 'aprovado'
    ? 'APROVADO — O processo apresenta conformidade com os requisitos essenciais da Lei nº 14.133/2021.'
    : rep.statusGeral === 'requer-correcoes'
      ? 'APROVADO COM RESSALVAS — Foram identificadas inconsistências que devem ser sanadas.'
      : 'REJEITADO / DEVOLVIDO PARA SANEAMENTO — Vícios relevantes impedem o prosseguimento.';

  const corParecer = rep.statusGeral === 'aprovado' ? '#d1fae5'
                   : rep.statusGeral === 'requer-correcoes' ? '#fef3c7' : '#fee2e2';

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1e293b', lineHeight: 1.4 },
    header: (currentPage) => currentPage === 1 ? null : {
      margin: [40, 20, 40, 0],
      columns: [
        { text: 'LicitaAudit · Relatório de Auditoria', fontSize: 8, color: '#94a3b8' },
        { text: (meta.orgao || '').toUpperCase(), fontSize: 8, color: '#94a3b8', alignment: 'right' },
      ],
    },
    footer: (currentPage, pageCount) => ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: 'Documento gerado eletronicamente pelo LicitaAudit · Lei nº 14.133/2021', fontSize: 7.5, color: '#94a3b8' },
        { text: `Página ${currentPage} de ${pageCount}`, fontSize: 7.5, color: '#94a3b8', alignment: 'right' },
      ],
    }),
    content: [
      {
        columns: [
          { width: 55, table: { body: [[{ text: 'LA', color: 'white', bold: true, fontSize: 22, alignment: 'center', fillColor: '#1e3a8a', margin: [0, 8, 0, 8] }]] }, layout: 'noBorders' },
          { width: '*', stack: [
            { text: (meta.orgao || 'ÓRGÃO / ENTIDADE PÚBLICA').toUpperCase(), fontSize: 13, bold: true, color: '#0f172a' },
            { text: 'SISTEMA LICITAAUDIT — AUDITORIA DE CONFORMIDADE', fontSize: 8.5, color: '#64748b', characterSpacing: 0.5 },
            { text: 'Base normativa: Lei nº 14.133/2021', fontSize: 8, color: '#94a3b8', italics: true },
          ], margin: [14, 4, 0, 0] },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#1e3a8a' }], margin: [0, 12, 0, 0] },
      { text: 'RELATÓRIO TÉCNICO DE AUDITORIA E CONFORMIDADE LICITATÓRIA', fontSize: 12, bold: true, alignment: 'center', color: '#0f172a', margin: [0, 16, 0, 2] },
      { text: `Nº ${meta.numeroRelatorio}  ·  ${dataFmt}`, fontSize: 9, alignment: 'center', color: '#64748b', margin: [0, 0, 0, 18] },
      {
        table: {
          widths: ['32%', '68%'],
          body: [
            [{ text: 'Nº do Processo', style: 'metaLabel' }, { text: meta.processo, style: 'metaValue' }],
            [{ text: 'Órgão / Entidade', style: 'metaLabel' }, { text: meta.orgao, style: 'metaValue' }],
            [{ text: 'Objeto Auditado', style: 'metaLabel' }, { text: rep.identificacao.objeto, style: 'metaValue' }],
            [{ text: 'Natureza', style: 'metaLabel' }, { text: rep.identificacao.natureza, style: 'metaValue' }],
            [{ text: 'Valor Estimado', style: 'metaLabel' }, { text: meta.valor > 0 ? formatarValorBR(meta.valor) : 'Não informado', style: 'metaValue' }],
            [{ text: 'Modalidade', style: 'metaLabel' }, { text: rep.identificacao.modalidade, style: 'metaValue' }],
            [{ text: 'Grau de Conformidade', style: 'metaLabel' }, {
              stack: [
                { text: `${rep.score}%`, bold: true, fontSize: 12, color: corStatus },
                { canvas: [
                    { type: 'rect', x: 0, y: 0, w: 200, h: 5, r: 2.5, color: '#e2e8f0' },
                    { type: 'rect', x: 0, y: 0, w: 200 * rep.score / 100, h: 5, r: 2.5, color: corStatus },
                ], margin: [0, 4, 0, 0] },
              ],
            }],
            [{ text: 'Nível de Risco', style: 'metaLabel' }, { text: risco.nivel, color: corStatus, bold: true, fontSize: 11 }],
          ],
        },
        layout: {
          fillColor: (rowIndex) => rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff',
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8f0',
          paddingTop: () => 8, paddingBottom: () => 8, paddingLeft: () => 10, paddingRight: () => 10,
        },
        margin: [0, 0, 0, 18],
      },
      {
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: 'PARECER FINAL DA AUDITORIA', fontSize: 8, bold: true, color: '#64748b', characterSpacing: 0.5 },
              { text: parecerTexto, fontSize: 11, bold: true, color: corStatus, margin: [0, 4, 0, 4] },
              { text: risco.descricao, fontSize: 9.5, color: '#334155', italics: true },
            ],
            margin: [12, 12, 12, 12],
            fillColor: corParecer,
          }]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 20],
      },
      { text: '1. RESUMO EXECUTIVO', style: 'sectionTitle' },
      {
        text: [
          'Análise automatizada sobre ',
          { text: `${rep.identificacao.arquivosAnalisados} documento(s)`, bold: true },
          ', ',
          { text: `${rep.identificacao.linhasAnalisadas.toLocaleString('pt-BR')} linhas`, bold: true },
          ' processadas. Executadas ',
          { text: `${rep.checks.length} verificações`, bold: true },
          ': ',
          { text: `${rep.estatisticas.ok} conformes`, bold: true, color: '#059669' }, ', ',
          { text: `${rep.estatisticas.warn} em atenção`, bold: true, color: '#d97706' }, ' e ',
          { text: `${rep.estatisticas.danger} divergentes`, bold: true, color: '#dc2626' }, '.',
        ],
        style: 'bodyText',
      },
      ...(meta.temCritico ? [{
        text: '⚠ ALERTA CRÍTICO: menção direta a marca/empresa sem justificativa. Parecer: DEVOLVIDO PARA ADEQUAÇÃO (Art. 41, I e Art. 5º).',
        fontSize: 10, bold: true, color: '#dc2626', margin: [0, 4, 0, 12],
      }] : []),
      { text: '2. QUADRO DEMONSTRATIVO DE ACHADOS', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1, dontBreakRows: true,
          widths: ['10%', '60%', '30%'],
          body: [
            [
              { text: 'GRAU', style: 'tableHeader', alignment: 'center' },
              { text: 'CONSTATAÇÃO / VÍCIO', style: 'tableHeader' },
              { text: 'FUNDAMENTO LEGAL', style: 'tableHeader' },
            ],
            ...pendenciasBody,
          ],
        },
        layout: {
          fillColor: (rowIndex) => rowIndex === 0 ? '#1e293b' : null,
          hLineWidth: () => 0.5, vLineWidth: () => 0.5,
          hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1',
          paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 8, paddingRight: () => 8,
        },
        margin: [0, 0, 0, 20],
      },
      { text: '3. RECOMENDAÇÕES DA AUDITORIA', style: 'sectionTitle' },
      { stack: recomendacoes, margin: [0, 0, 0, 20] },
      {
        table: {
          dontBreakRows: true,
          widths: ['*'],
          body: [[{
            stack: [
              { text: ' ', margin: [0, 24, 0, 0] },
              { canvas: [{ type: 'line', x1: 130, y1: 0, x2: 385, y2: 0, lineWidth: 0.8, lineColor: '#334155' }] },
              { text: 'Equipe de Auditoria de Controle Interno', fontSize: 10, bold: true, alignment: 'center', margin: [0, 6, 0, 2] },
              { text: 'Agente de Auditoria · LicitaAudit', fontSize: 9, alignment: 'center', color: '#475569' },
              { text: (meta.orgao || '').toUpperCase(), fontSize: 8.5, alignment: 'center', color: '#64748b', italics: true, margin: [0, 2, 0, 0] },
            ],
            margin: [0, 10, 0, 10],
          }]],
        },
        layout: 'noBorders',
        margin: [0, 20, 0, 0],
      },
    ],
    styles: {
      metaLabel:    { fontSize: 8.5, bold: true, color: '#475569' },
      metaValue:    { fontSize: 9.5, color: '#0f172a' },
      sectionTitle: { fontSize: 11, bold: true, color: '#0f172a', margin: [0, 14, 0, 8] },
      bodyText:     { fontSize: 10, color: '#334155', lineHeight: 1.5, margin: [0, 0, 0, 8], alignment: 'justify' },
      tableHeader:  { fontSize: 8.5, bold: true, color: '#ffffff' },
    },
  };

  const procSafe = String(meta.processo || 'LicitaAudit').replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `Relatorio_Auditoria_${procSafe}_${dataGeracao.getFullYear()}.pdf`;

  try {
    pdfMake.createPdf(docDefinition).download(filename);
    toast('Relatório PDF gerado.', 'ok');
  } catch (err) {
    console.error('[LicitaAudit] Erro ao gerar PDF:', err);
    toast('Erro ao gerar o PDF.', 'error');
  }
}

/* ==========================================================================
 * 17. EXPORTAÇÃO JSON / FEEDBACK / TEMA
 * ======================================================================== */

function exportJson() {
  if (!state.report) return;
  const payload = { ferramenta: 'LicitaAudit', versao: '1.8.1', baseNormativa: 'Lei nº 14.133/2021', ...state.report };
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
 * 18. BOOTSTRAP
 * ======================================================================== */

function bootstrap() {
  initTheme();
  configurePdfWorker();
  bindEvents();
  renderFileList();
  console.info(
    '%cLicitaAudit',
    'background:#5b8cff;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
    '· v1.8.1 · click + drop + paste + análise'
  );
}

document.addEventListener('DOMContentLoaded', bootstrap);
