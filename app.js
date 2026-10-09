/* =====================================================================
   OMNILICIT · LicitaETP v5.0 — Núcleo da Aplicação
   Delega: OmniLogo (assets), DFDParser (extração), PDFEngine (render)
   ===================================================================== */
'use strict';

/* =====================================================================
   0. HELPERS GERAIS
   ===================================================================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* =====================================================================
   1. TEMA (Light / Dark)
   ===================================================================== */
const TEMA_KEY = 'licitaetp_theme';

function lerTemaSalvo() {
  try {
    const t = localStorage.getItem(TEMA_KEY);
    if (t === 'light' || t === 'dark') return t;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch (e) {}
  return 'light';
}

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  const sun  = document.getElementById('iconSun');
  const moon = document.getElementById('iconMoon');
  if (!sun || !moon) return;
  if (tema === 'dark') { sun.style.display = 'block'; moon.style.display = 'none'; }
  else                  { sun.style.display = 'none';  moon.style.display = 'block'; }
}

function alternarTema() {
  const atual = document.documentElement.getAttribute('data-theme') || 'light';
  const novo  = atual === 'dark' ? 'light' : 'dark';
  aplicarTema(novo);
  try { localStorage.setItem(TEMA_KEY, novo); } catch (e) {}
  toast(`Tema alterado para ${novo === 'dark' ? 'escuro' : 'claro'}.`);
}

/* =====================================================================
   2. IDENTIDADE VISUAL (logo oficial OmniLicit)
   ===================================================================== */
async function injetarIdentidadeVisual() {
  // Favicon SVG inline (pode ser sobrescrito pela logo oficial, mas mantém fallback)
  const link = document.getElementById('favicon');
  if (link) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#0E7C86"/>
      <text x="32" y="43" font-family="ui-sans-serif,system-ui,sans-serif"
            font-size="26" font-weight="900" fill="#FFFFFF"
            text-anchor="middle" letter-spacing="0.5">ETP</text>
    </svg>`;
    link.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // Header brand: usa a logo oficial carregada
  const brand = document.getElementById('brandLogo');
  if (brand && OmniLogo.get()) {
    brand.innerHTML = `<img src="${OmniLogo.get()}" alt="OmniLicit"
                            style="width:100%;height:100%;object-fit:contain" />`;
  }

  // Modal welcome: usa a logo oficial carregada
  const w = document.getElementById('welcomeLogo');
  if (w && OmniLogo.get()) {
    w.innerHTML = `<img src="${OmniLogo.get()}" alt="OmniLicit"
                        style="width:100%;height:100%;object-fit:contain" />`;
  }
}

/* =====================================================================
   3. NUMERAÇÃO ETP (sequencial por exercício)
   ===================================================================== */
const ETP_COUNTER_KEY = 'licitaetp_counter';

function obterProximoNumeroETP(exercicio) {
  const ex = String(exercicio || new Date().getFullYear());
  let counters = {};
  try { counters = JSON.parse(localStorage.getItem(ETP_COUNTER_KEY) || '{}'); } catch (e) {}
  const atual = parseInt(counters[ex] || '0', 10);
  return { proximo: atual + 1, counters, ex };
}

function consumirNumeroETP(exercicio) {
  const { proximo, counters, ex } = obterProximoNumeroETP(exercicio);
  counters[ex] = proximo;
  try { localStorage.setItem(ETP_COUNTER_KEY, JSON.stringify(counters)); } catch (e) {}
  return String(proximo).padStart(3, '0');
}

function preencherNumeroETPInicial() {
  const exEl  = document.getElementById('exercicio');
  const numEl = document.getElementById('numeroEtp');
  if (!exEl || !numEl) return;
  if (!exEl.value) exEl.value = String(new Date().getFullYear());
  if (numEl.dataset.userEdited === '1') return;
  const { proximo } = obterProximoNumeroETP(exEl.value);
  numEl.value = String(proximo).padStart(3, '0');
  numEl.placeholder = String(proximo).padStart(3, '0');
}

function marcarNumeroEditado() {
  const numEl = document.getElementById('numeroEtp');
  if (numEl) numEl.dataset.userEdited = '1';
}

/* =====================================================================
   4. WELCOME MODAL
   ===================================================================== */
const WELCOME_KEY = 'licitaetp_welcome_dismissed';

function deveExibirWelcome() {
  try { return localStorage.getItem(WELCOME_KEY) !== '1'; } catch (e) { return true; }
}
function abrirWelcome() {
  const m = document.getElementById('welcomeModal');
  if (!m) return;
  m.classList.add('show');
  m.setAttribute('aria-hidden', 'false');
}
function fecharWelcome() {
  const cb = document.getElementById('welcomeDontShow');
  if (cb?.checked) { try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) {} }
  const m = document.getElementById('welcomeModal');
  if (!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden', 'true');
}
function abrirAjuda() {
  const cb = document.getElementById('welcomeDontShow');
  if (cb) cb.checked = false;
  abrirWelcome();
}

/* =====================================================================
   5. ESTADO GLOBAL
   ===================================================================== */
let logoDataUrl    = null;   // dataURL da logo em uso (oficial ou capturada)
let logoOrigem     = 'default';
let logoPadraoPng  = null;   // logo oficial OmniLicit convertida para uso no pdfMake
let current = 0;
let panels  = [];
let TOTAL   = 0;

/* =====================================================================
   6. NAVEGAÇÃO (Wizard)
   ===================================================================== */
const PASSOS = [
  { t:'Identificação do ETP',        s:'Dados institucionais e objeto' },
  { t:'I · Necessidade',             s:'Problema a ser resolvido' },
  { t:'II · PCA e Enquadramento',    s:'Dotação e modalidade' },
  { t:'III · Requisitos',            s:'Sustentabilidade e padrões' },
  { t:'IV · Quantidades',            s:'Memória de cálculo' },
  { t:'V · Levantamento de mercado', s:'Alternativas e riscos' },
  { t:'VI · Estimativa de preços',   s:'Método de cotação' },
  { t:'VII · Solução e prazos',      s:'Entrega e execução' },
  { t:'VIII · Parcelamento',         s:'Justificativa técnica' },
  { t:'IX · Resultados pretendidos', s:'Economicidade' },
  { t:'X · Providências prévias',    s:'Contratações correlatas' },
  { t:'XI · Posicionamento',         s:'Conclusão e viabilidade' },
  { t:'Aprovadores e Governança',    s:'Equipe e fiscalização' }
];

function renderNav() {
  const nav = document.getElementById('stepNav');
  if (!nav) return;
  nav.innerHTML = PASSOS.map((p, i) => `
    <button class="step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}"
            onclick="goTo(${i})">
      <span class="step-num">${i < current ? '✓' : i + 1}</span>
      <span>
        <span class="step-title" style="display:block">${esc(p.t)}</span>
        <span class="step-sub" style="display:block">${esc(p.s)}</span>
      </span>
    </button>`).join('');
}

function goTo(i) {
  if (i < 0 || i >= TOTAL) return;
  current = i;
  panels.forEach((p, idx) => p.classList.toggle('hidden', idx !== current));
  renderNav();

  const counter = document.getElementById('stepCounter');
  if (counter) counter.textContent = `${current + 1} / ${TOTAL}`;
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = `${((current + 1) / TOTAL) * 100}%`;

  const btnV = document.getElementById('btnVoltar');
  const btnP = document.getElementById('btnProximo');
  const btnG = document.getElementById('btnGerar');
  if (btnV) btnV.disabled = current === 0;
  if (btnP) btnP.classList.toggle('hidden', current === TOTAL - 1);
  if (btnG) btnG.classList.toggle('hidden', current !== TOTAL - 1);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =====================================================================
   7. LINHAS DINÂMICAS (tabelas)
   ===================================================================== */
function addQtd(d = {}) {
  const tb = document.getElementById('tbQtd');
  if (!tb) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="inp" data-k="item" value="${esc(d.item||'')}" placeholder="1"></td>
    <td><input class="inp" data-k="descricao" value="${esc(d.descricao||'')}" placeholder="Descrição do bem/serviço"></td>
    <td><input class="inp" data-k="quantidade" type="number" step="any" value="${esc(d.quantidade||'')}" placeholder="0"></td>
    <td><input class="inp" data-k="unidade" value="${esc(d.unidade||'')}" placeholder="un"></td>
    <td><textarea class="ta ta-sm" data-k="memoria" placeholder="Fórmula / fonte do quantitativo">${esc(d.memoria||'')}</textarea></td>
    <td style="text-align:center"><button class="btn-xs" onclick="this.closest('tr').remove();recalcularTotal()">×</button></td>`;
  tb.appendChild(tr);
}

function addMercado(d = {}) {
  const tb = document.getElementById('tbMercado');
  if (!tb) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="inp" data-k="alternativa" value="${esc(d.alternativa||'')}" placeholder="Ex.: Aquisição direta"></td>
    <td><textarea class="ta ta-sm" data-k="descricao" placeholder="Como resolve o problema">${esc(d.descricao||'')}</textarea></td>
    <td><textarea class="ta ta-sm" data-k="vantagens" placeholder="Vantagens técnicas e econômicas">${esc(d.vantagens||'')}</textarea></td>
    <td><textarea class="ta ta-sm" data-k="riscos" placeholder="Riscos e limitações">${esc(d.riscos||'')}</textarea></td>
    <td style="text-align:center"><button class="btn-xs" onclick="this.closest('tr').remove()">×</button></td>`;
  tb.appendChild(tr);
}

function addPreco(d = {}) {
  const tb = document.getElementById('tbPreco');
  if (!tb) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="inp" data-k="item" value="${esc(d.item||'')}" placeholder="Item / descrição"></td>
    <td><input class="inp" data-k="fonte" value="${esc(d.fonte||'')}" placeholder="Fornecedor / Painel de Preços"></td>
    <td><input class="inp" data-k="unitario" type="number" step="0.01" value="${esc(d.unitario||'')}" placeholder="0,00"></td>
    <td><input class="inp" data-k="quantidade" type="number" step="any" value="${esc(d.quantidade||'')}" placeholder="0"></td>
    <td><input class="inp" data-k="total" readonly style="background:var(--bg-3)"></td>
    <td style="text-align:center"><button class="btn-xs" onclick="this.closest('tr').remove();recalcularTotal()">×</button></td>`;
  tb.appendChild(tr);
  tr.querySelectorAll('input').forEach(i => i.addEventListener('input', recalcularTotal));
}

function addAprovador(d = {}) {
  const lst = document.getElementById('listaAprovadores');
  if (!lst) return;
  const div = document.createElement('div');
  div.className = 'aprov-card';
  div.innerHTML = `
    <div class="aprov-card-head">
      <span class="aprov-card-title">Agente institucional</span>
      <button class="btn-xs" onclick="this.closest('.aprov-card').remove()">×</button>
    </div>
    <div class="aprov-grid">
      <div style="grid-column:span 2"><label class="lbl">Nome completo</label><input class="inp" data-a="nome" value="${esc(d.nome||'')}" placeholder="Nome do agente"></div>
      <div><label class="lbl">Papel</label>
        <select class="sel" data-a="papel">
          ${['Elaborador','Validador','Aprovador','Autoridade Competente','Fiscal Técnico']
            .map(p => `<option ${d.papel===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div><label class="lbl">Cargo / Função</label><input class="inp" data-a="cargo" value="${esc(d.cargo||'')}" placeholder="Ex.: Diretor de Administração"></div>
      <div style="grid-column:span 2"><label class="lbl">Órgão / Unidade</label><input class="inp" data-a="orgao" value="${esc(d.orgao||'')}" placeholder="Ex.: Coordenação-Geral de Logística"></div>
      <div style="grid-column:span 2"><label class="lbl">Matrícula / Identificador funcional</label><input class="inp" data-a="matricula" value="${esc(d.matricula||'')}" placeholder="Opcional"></div>
    </div>`;
  lst.appendChild(div);
}

function recalcularTotal() {
  let soma = 0;
  $$('#tbPreco tr').forEach(tr => {
    const u = parseFloat(tr.querySelector('[data-k="unitario"]')?.value) || 0;
    const q = parseFloat(tr.querySelector('[data-k="quantidade"]')?.value) || 0;
    const t = u * q;
    const cell = tr.querySelector('[data-k="total"]');
    if (cell) cell.value = t ? t.toFixed(2) : '';
    soma += t;
  });
  const el = document.getElementById('valorTotal');
  if (el) el.textContent = soma.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return soma;
}

/* =====================================================================
   8. COLETA DE DADOS (payload enviado ao PDFEngine)
   ===================================================================== */
function readTable(tbodyId, keys) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return [];
  return $$(`#${tbodyId} tr`).map(tr => {
    const o = {};
    keys.forEach(k => {
      const el = tr.querySelector(`[data-k="${k}"]`);
      o[k] = el ? el.value.trim() : '';
    });
    return o;
  }).filter(o => Object.values(o).some(v => v));
}

function coletarDados() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const checks = name => $$(`input[name="${name}"]:checked`).map(i => i.value);

  return {
    id: {
      orgao: v('orgao'), unidade: v('unidade'), uasg: v('uasg'),
      processo: v('processo'), numero: v('numeroEtp'), exercicio: v('exercicio'),
      objeto: v('objeto'), responsavel: v('responsavel'), cargo: v('cargoResponsavel'),
      email: v('email'), telefone: v('telefone'), data: v('dataElaboracao')
    },
    nec: { necessidade: v('necessidade'), causaRaiz: v('causaRaiz'), publicoAlvo: v('publicoAlvo') },
    pca: { previsto: v('pcaPrevisto'), item: v('pcaItem'), justificativa: v('pcaJustificativa') },
    enq: {
      dotacao: v('dotacaoOrcamentaria'), fonte: v('fonteRecurso'),
      modalidade: v('modalidadePretendida'), criterio: v('criterioJulgamento')
    },
    req: {
      sustentaveis: checks('sustent'), tecnicos: v('reqTecnicos'),
      habilitacao: v('reqHabilitacao'), garantia: v('reqGarantia'), entrega: v('reqEntrega')
    },
    qtd: {
      descricao: v('qtdDescricao'),
      itens: readTable('tbQtd', ['item','descricao','quantidade','unidade','memoria']),
      metodo: v('metodoQtd')
    },
    mercado: {
      alternativas: readTable('tbMercado', ['alternativa','descricao','vantagens','riscos']),
      conclusao: v('conclusaoMercado')
    },
    precos: {
      metodo: v('metodoPreco'),
      itens: readTable('tbPreco', ['item','fonte','unitario','quantidade','total']),
      observacoes: v('obsPreco'),
      total: recalcularTotal()
    },
    solucao: { descricao: v('descricaoSolucao'), entregas: v('entregas'), ciclo: v('cicloVida') },
    prazos: { execucao: v('prazoExecucao'), local: v('localEntrega'), pagamento: v('condicoesPagamento') },
    parcel: { decisao: v('parcelar'), itens: v('itensParcelaveis'), justificativa: v('justificativaParcelamento') },
    result: { resultados: v('resultados'), economicidade: v('economicidade'), indicadores: v('indicadores') },
    prov: { providencias: v('providencias'), correlatas: v('correlatas'), impacto: v('impactoProvidencias') },
    conc: { posicionamento: v('posicionamento'), recomendacoes: v('recomendacoes'), conclusao: v('conclusao') },
    governanca: {
      fiscalTitular: v('fiscalTitular'),
      fiscalSubstituto: v('fiscalSubstituto'),
      gestor: v('gestorContrato')
    },
    aprov: $$('#listaAprovadores > .aprov-card').map(div => {
      const g = k => div.querySelector(`[data-a="${k}"]`)?.value.trim() || '';
      return { nome: g('nome'), papel: g('papel'), cargo: g('cargo'), orgao: g('orgao'), matricula: g('matricula') };
    }).filter(a => a.nome || a.cargo)
  };
}

/* =====================================================================
   9. CONFORMIDADE (11 incisos)
   ===================================================================== */
const INCISOS = [
  { n:'I',    t:'Descrição da necessidade',           f:d => [d.nec.necessidade, d.nec.causaRaiz, d.nec.publicoAlvo] },
  { n:'II',   t:'Alinhamento ao PCA e enquadramento', f:d => [d.pca.previsto, d.pca.item, d.pca.justificativa, d.enq.dotacao, d.enq.fonte, d.enq.modalidade, d.enq.criterio] },
  { n:'III',  t:'Requisitos da contratação',          f:d => [d.req.sustentaveis.join(' '), d.req.tecnicos, d.req.habilitacao, d.req.garantia, d.req.entrega] },
  { n:'IV',   t:'Quantidades e memória de cálculo',   f:d => [d.qtd.descricao, d.qtd.metodo, d.qtd.itens.map(i => JSON.stringify(i)).join(' ')] },
  { n:'V',    t:'Levantamento de mercado',            f:d => [d.mercado.conclusao, d.mercado.alternativas.map(i => JSON.stringify(i)).join(' ')] },
  { n:'VI',   t:'Estimativa preliminar de preços',    f:d => [d.precos.metodo, d.precos.observacoes, d.precos.itens.map(i => JSON.stringify(i)).join(' ')] },
  { n:'VII',  t:'Descrição da solução como um todo',  f:d => [d.solucao.descricao, d.solucao.entregas, d.solucao.ciclo, d.prazos.execucao, d.prazos.local, d.prazos.pagamento] },
  { n:'VIII', t:'Justificativa para parcelamento',    f:d => [d.parcel.decisao, d.parcel.itens, d.parcel.justificativa] },
  { n:'IX',   t:'Resultados pretendidos',             f:d => [d.result.resultados, d.result.economicidade, d.result.indicadores] },
  { n:'X',    t:'Providências prévias',               f:d => [d.prov.providencias, d.prov.correlatas, d.prov.impacto] },
  { n:'XI',   t:'Posicionamento conclusivo',          f:d => [d.conc.posicionamento, d.conc.recomendacoes, d.conc.conclusao] }
];

function avaliarInciso(valores) {
  const txt = valores.filter(Boolean).join(' ').trim();
  if (!txt)             return { status:'Não preenchido', pct:0,   cor:'#B91C1C', bg:'#FEF2F2' };
  if (txt.length < 140) return { status:'Parcial',        pct:50,  cor:'#B45309', bg:'#FFFBEB' };
  return                       { status:'Atendido',       pct:100, cor:'#15803D', bg:'#F0FDF4' };
}

function calcularConformidade(d) {
  const linhas = INCISOS.map(i => ({ ...i, ...avaliarInciso(i.f(d)) }));
  const score  = Math.round(linhas.reduce((a, l) => a + l.pct, 0) / linhas.length);
  return { linhas, score };
}

/* =====================================================================
   10. MODAL DE IMPORTAÇÃO DE DFD
   ===================================================================== */
let dfdExtraido = null;

function abrirImportarDFD() {
  const m = document.getElementById('dfdModal');
  if (!m) return;
  m.classList.add('show');
  m.setAttribute('aria-hidden', 'false');
  document.getElementById('dfdResult')?.classList.add('hidden');
  const btn = document.getElementById('dfdApplyBtn');
  if (btn) btn.disabled = true;
  dfdExtraido = null;
}

function fecharImportarDFD() {
  const m = document.getElementById('dfdModal');
  if (!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden', 'true');
}

/* --- 10.1 Extração de logo embutida em PDF do DFD (mantida aqui) --- */
async function extrairLogoDoPdf(file) {
  if (!window.pdfjsLib) return null;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let pdf;
  try {
    const buf = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  } catch (e) { console.warn('[Logo] PDF inválido:', e); return null; }

  const paginasAlvo = Math.min(3, pdf.numPages);
  const candidatos  = [];

  for (let p = 1; p <= paginasAlvo; p++) {
    let page; try { page = await pdf.getPage(p); } catch (e) { continue; }
    let opList; try { opList = await page.getOperatorList(); } catch (e) { continue; }

    const nomesXObj = new Set();
    const inlineImgs = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i]; const args = opList.argsArray[i];
      if (!args) continue;
      if (fn === pdfjsLib.OPS.paintImageXObject       && args[0]) nomesXObj.add(args[0]);
      if (fn === pdfjsLib.OPS.paintJpegXObject        && args[0]) nomesXObj.add(args[0]);
      if (fn === pdfjsLib.OPS.paintInlineImageXObject && args[0]) inlineImgs.push(args[0]);
    }

    for (const nome of nomesXObj) {
      const obj = await new Promise(resolve => {
        let done = false;
        const finish = v => { if (!done) { done = true; resolve(v); } };
        const timer = setTimeout(() => finish(null), 800);
        const cb = img => { clearTimeout(timer); finish(img); };
        try { page.objs.get(nome, cb); }
        catch (e) { try { page.commonObjs.get(nome, cb); } catch (e2) { clearTimeout(timer); finish(null); } }
      });
      if (obj && obj.width && obj.height && obj.data) candidatos.push({ obj, pagina: p, fonte: 'named' });
    }
    for (const obj of inlineImgs) {
      if (obj && obj.width && obj.height && obj.data) candidatos.push({ obj, pagina: p, fonte: 'inline' });
    }
  }
  if (!candidatos.length) return null;

  const validos = [];
  for (const c of candidatos) {
    const { width, height, data } = c.obj;
    if (!width || !height || !data) continue;
    if (width < 24 || height < 24) continue;
    if (width > 1200 || height > 1200) continue;
    const ratio = width / height;
    if (ratio < 0.15 || ratio > 6) continue;
    const area = width * height;
    if (area < 2000) continue;
    const dataUrl = bitmapParaDataUrl(c.obj);
    if (!dataUrl) continue;
    if (dataUrl.length > 800 * 1024) continue;
    validos.push({ dataUrl, width, height, area, pagina: c.pagina, fonte: c.fonte });
  }
  if (!validos.length) return null;
  validos.sort((a, b) => b.area - a.area);
  return validos[0].dataUrl;
}

function bitmapParaDataUrl(imgObj) {
  try {
    const { width, height, data } = imgObj;
    if (!width || !height || !data) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx  = canvas.getContext('2d');
    const imgD = ctx.createImageData(width, height);
    const n    = width * height;
    if (data.length === n * 4) {
      imgD.data.set(data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data));
    } else if (data.length === n * 3) {
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        imgD.data[j]   = data[i];
        imgD.data[j+1] = data[i+1];
        imgD.data[j+2] = data[i+2];
        imgD.data[j+3] = 255;
      }
    } else if (data.length === n) {
      for (let i = 0, j = 0; i < data.length; i++, j += 4) {
        const v = data[i];
        imgD.data[j] = imgD.data[j+1] = imgD.data[j+2] = v;
        imgD.data[j+3] = 255;
      }
    } else return null;
    ctx.putImageData(imgD, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) { console.warn('[Logo] bitmapParaDataUrl falhou:', e); return null; }
}

/* --- 10.2 Processamento do DFD (delega ao DFDParser) --- */
async function processarDFD(file) {
  const msgEl = document.getElementById('dfdResultMsg');
  const list  = document.getElementById('dfdResultList');
  const box   = document.getElementById('dfdResult');
  const btn   = document.getElementById('dfdApplyBtn');

  try {
    toast('Lendo DFD...');
    const resultado = await DFDParser.parse(file);

    // Tenta capturar logo embutida no PDF
    let logoCapturada = null;
    if ((file.name || '').toLowerCase().endsWith('.pdf')) {
      toast('Capturando logotipo institucional...');
      try { logoCapturada = await extrairLogoDoPdf(file); } catch (e) { console.warn('[Logo]', e); }
    }

    dfdExtraido = { ...resultado, logo: logoCapturada };

    const campos = Object.entries(resultado.campos).filter(([_, v]) => v && String(v).trim());
    if (!campos.length && !logoCapturada) {
      toast('Nenhum campo ou logo reconhecido no arquivo.');
      return;
    }

    msgEl.textContent = `${campos.length} campo(s) via ${resultado.origem.toUpperCase()}${logoCapturada ? ' + logotipo capturado' : ''}`;

    list.innerHTML = campos.map(([k, v]) => {
      const label = {
        numero:'Nº do DFD', objeto:'Objeto', unidade:'Unidade Requisitante',
        responsavel:'Responsável pela Demanda', cargo:'Cargo / Função',
        email:'E-mail', telefone:'Telefone', valor:'Valor Estimado',
        justificativa:'Justificativa', processo:'Processo', orgao:'Órgão', uasg:'UASG',
        data:'Data de Elaboração',
        pcaItem:'Item do PCA', pcaPrevisto:'Previsão no PCA',
        dotacao:'Dotação Orçamentária', fonteRecurso:'Fonte de Recurso',
        modalidade:'Modalidade', criterio:'Critério de Julgamento',
        prazoExecucao:'Prazo de Execução', localEntrega:'Local de Entrega',
        condicoesPagamento:'Condições de Pagamento',
        fiscalTitular:'Fiscal Titular', fiscalSubstituto:'Fiscal Substituto',
        gestorContrato:'Gestor do Contrato', qtdDescricao:'Quantitativo'
      }[k] || k;
      const val = String(v).length > 140 ? String(v).slice(0, 137) + '…' : String(v);
      return `<li><span>${esc(label)}</span><span>${esc(val)}</span></li>`;
    }).join('');

    if (logoCapturada) {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px dashed rgba(22,163,74,.20);grid-column:1/-1';
      li.innerHTML = `
        <span style="color:var(--tx-3);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Logotipo institucional</span>
        <span style="display:flex;align-items:center;gap:8px">
          <img src="${logoCapturada}" alt="Logo capturada" style="width:52px;height:52px;object-fit:contain;background:var(--bg-1);border:1px solid var(--bd-1);border-radius:8px;padding:3px" />
          <span style="color:var(--ok);font-weight:700;font-size:11.5px">✓ capturado</span>
        </span>`;
      list.appendChild(li);
    }

    box.classList.remove('hidden');
    btn.disabled = false;
  } catch (e) {
    console.error('[DFD]', e);
    toast('Falha ao ler o DFD: ' + (e?.message || e));
  }
}

/* --- 10.3 Aplicação dos campos no formulário --- */
function aplicarImportacaoDFD() {
  try {
    if (!dfdExtraido) { toast('Nenhum DFD carregado. Importe o arquivo primeiro.'); return; }
    const c = dfdExtraido.campos || {};
    const setV = (id, v) => {
      const el = document.getElementById(id);
      if (el && v != null && String(v).trim() !== '') el.value = String(v);
    };

    setV('objeto', c.objeto);
    setV('unidade', c.unidade);
    setV('responsavel', c.responsavel);
    setV('cargoResponsavel', c.cargo);
    setV('email', c.email);
    setV('telefone', c.telefone);
    setV('processo', c.processo);
    setV('necessidade', c.justificativa);
    setV('orgao', c.orgao);
    setV('uasg', c.uasg);
    setV('dataElaboracao', c.data);

    setV('pcaItem', c.pcaItem);
    if (c.pcaPrevisto) setV('pcaPrevisto', c.pcaPrevisto);

    setV('dotacaoOrcamentaria', c.dotacao);
    setV('fonteRecurso', c.fonteRecurso);
    setV('modalidadePretendida', c.modalidade);
    setV('criterioJulgamento', c.criterio);

    setV('prazoExecucao', c.prazoExecucao);
    setV('localEntrega', c.localEntrega);
    setV('condicoesPagamento', c.condicoesPagamento);

    setV('fiscalTitular', c.fiscalTitular);
    setV('fiscalSubstituto', c.fiscalSubstituto);
    setV('gestorContrato', c.gestorContrato);

    setV('qtdDescricao', c.qtdDescricao);

    if (c.numero) {
      const justEl = document.getElementById('pcaJustificativa');
      if (justEl && !justEl.value) {
        justEl.value = `Documento de Formalização da Demanda (DFD) nº ${c.numero} importado automaticamente.`;
      }
    }

    /* Valor estimado → primeira linha de cotação */
    if (c.valor) {
      let primeiro = document.querySelector('#tbPreco tr');
      if (!primeiro) { addPreco(); primeiro = document.querySelector('#tbPreco tr'); }
      if (primeiro) {
        const itemEl  = primeiro.querySelector('[data-k="item"]');
        const fonteEl = primeiro.querySelector('[data-k="fonte"]');
        const unitEl  = primeiro.querySelector('[data-k="unitario"]');
        const qtdEl   = primeiro.querySelector('[data-k="quantidade"]');
        if (itemEl  && !itemEl.value)  itemEl.value  = c.objeto ? c.objeto.slice(0, 80) : 'Item importado do DFD';
        if (fonteEl && !fonteEl.value) fonteEl.value = 'Valor estimado — DFD';
        if (unitEl  && !unitEl.value)  unitEl.value  = c.valor;
        if (qtdEl   && !qtdEl.value)   qtdEl.value   = '1';
        recalcularTotal();
      }
    }

    /* Quantitativo → primeira linha de estimativa */
    if (c.qtdDescricao) {
      let primeiroQ = document.querySelector('#tbQtd tr');
      if (!primeiroQ) { addQtd(); primeiroQ = document.querySelector('#tbQtd tr'); }
      if (primeiroQ) {
        const descEl = primeiroQ.querySelector('[data-k="descricao"]');
        const memEl  = primeiroQ.querySelector('[data-k="memoria"]');
        if (descEl && !descEl.value) descEl.value = c.objeto ? c.objeto.slice(0, 120) : c.qtdDescricao.slice(0, 120);
        if (memEl  && !memEl.value)  memEl.value  = c.qtdDescricao.slice(0, 240);
      }
    }

    /* Governança → primeiro aprovador */
    const lstAprov = document.getElementById('listaAprovadores');
    if (lstAprov && c.fiscalTitular) {
      const primeiroCard = lstAprov.querySelector('.aprov-card');
      const nomeEl  = primeiroCard?.querySelector('[data-a="nome"]');
      const cargoEl = primeiroCard?.querySelector('[data-a="cargo"]');
      const papelEl = primeiroCard?.querySelector('[data-a="papel"]');
      if (nomeEl  && !nomeEl.value)  nomeEl.value  = c.fiscalTitular;
      if (cargoEl && !cargoEl.value) cargoEl.value = 'Fiscal Titular do Contrato';
      if (papelEl) papelEl.value = 'Fiscal Técnico';
    }

    /* Logo capturada do PDF */
    let origemLogo = 'default';
    if (dfdExtraido.logo) {
      aplicarLogoCapturada(dfdExtraido.logo, 'dfd');
      origemLogo = 'dfd';
    } else if (dfdExtraido.logoJson) {
      aplicarLogoCapturada(dfdExtraido.logoJson, 'dfd');
      origemLogo = 'dfd';
    }

    const qtdAplicados = Object.keys(c).filter(k => c[k]).length;
    const msgLogo = origemLogo === 'dfd' ? ' · logotipo herdado do DFD' : '';
    toast(`DFD importado · ${qtdAplicados} campo(s)${msgLogo}.`);

    fecharImportarDFD();
    goTo(0);

    setTimeout(() => {
      ['objeto','unidade','responsavel','cargoResponsavel','necessidade','processo','orgao',
       'dotacaoOrcamentaria','fonteRecurso','modalidadePretendida','criterioJulgamento',
       'prazoExecucao','localEntrega','condicoesPagamento',
       'fiscalTitular','fiscalSubstituto','gestorContrato','qtdDescricao'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) {
          el.style.transition = 'box-shadow .4s';
          el.style.boxShadow = '0 0 0 3px rgba(14,124,134,.35)';
          setTimeout(() => el.style.boxShadow = '', 1400);
        }
      });
    }, 200);
  } catch (err) {
    console.error('[DFD] Falha ao aplicar importação:', err);
    toast('Erro ao aplicar o DFD: ' + (err?.message || err));
  }
}

function aplicarLogoCapturada(dataUrl, origem = 'dfd') {
  if (!dataUrl) return;
  logoDataUrl = dataUrl;
  logoOrigem  = origem;

  const img     = document.getElementById('logoPreviewImg');
  const empty   = document.getElementById('logoDropzoneEmpty');
  const preview = document.getElementById('logoDropzonePreview');
  const dz      = document.getElementById('logoDropzone');
  const nameEl  = document.getElementById('logoPreviewName');
  const sizeEl  = document.getElementById('logoPreviewSize');

  if (img)    img.src = dataUrl;
  if (nameEl) nameEl.textContent = origem === 'dfd' ? 'logotipo-herdado-do-dfd.png' : 'logotipo.png';
  if (sizeEl) sizeEl.textContent = origem === 'dfd' ? '— herdado do DFD —' : '— carregado —';
  empty?.classList.add('hidden');
  preview?.classList.remove('hidden');
  dz?.classList.add('has-file');

  if (dz) {
    dz.style.transition = 'box-shadow .5s';
    dz.style.boxShadow = '0 0 0 4px rgba(14,124,134,.45)';
    setTimeout(() => { dz.style.boxShadow = ''; }, 1800);
  }
}

/* =====================================================================
   11. GERAR PDF (delega ao PDFEngine)
   ===================================================================== */
async function gerarPDF() {
  const d = coletarDados();

  if (!d.id.orgao || !d.id.objeto) {
    toast('Preencha ao menos Órgão/Entidade e Objeto na etapa de Identificação.');
    goTo(0);
    return;
  }

  /* Consome número sequencial do ETP se o usuário não editou */
  const exMatch = (d.id.exercicio || '').match(/\d{4}/);
  const exercicio = exMatch ? exMatch[0] : String(new Date().getFullYear());

  if (!d.id.numero || !document.getElementById('numeroEtp').dataset.userEdited) {
    const novo = consumirNumeroETP(exercicio);
    document.getElementById('numeroEtp').value = novo;
    d.id.numero = novo;
  }

  const conf = calcularConformidade(d);
  const numLimpo = (d.id.numero || '001').replace(/\D/g, '').padStart(3, '0');
  const arquivo  = `ETP_${numLimpo}_${exercicio}.pdf`;

  try {
    const resultado = await PDFEngine.gerar(d, conf, {
      exercicio,
      arquivoNome: arquivo,
      logoDataUrl: OmniLogo.get() || logoDataUrl || logoPadraoPng
    });
    toast(`PDF gerado: ${resultado.arquivo} · ${resultado.tag}`);
  } catch (err) {
    console.error('[PDFEngine]', err);
    toast('Falha ao gerar PDF: ' + (err?.message || err));
  }
}

/* =====================================================================
   12. RASCUNHO (salvar / carregar JSON)
   ===================================================================== */
function salvarRascunho() {
  try {
    const pacote = {
      sistema: 'OmniLicit-LicitaETP',
      versao:  '5.0.0',
      tipo:    'rascunho',
      salvoEm: new Date().toISOString(),
      logo:    logoDataUrl,
      logoOrigem,
      dados:   coletarDados()
    };
    const json = JSON.stringify(pacote, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

    const numero = (document.getElementById('numeroEtp')?.value || '').replace(/\D/g, '').padStart(3, '0') || '001';
    const exercicio = (document.getElementById('exercicio')?.value || '').match(/\d{4}/)?.[0] || new Date().getFullYear();
    const arquivo = `ETP_${numero}_${exercicio}_rascunho.json`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = arquivo;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Rascunho salvo: ${arquivo}`);
  } catch (e) {
    console.error(e);
    toast('Falha ao salvar rascunho.');
  }
}

function abrirCarregarRascunho() {
  document.getElementById('jsonFile')?.click();
}

async function processarArquivoJSON(file) {
  try {
    const txt = await file.text();
    const pacote = JSON.parse(txt);
    const d = pacote.dados || pacote;
    aplicarDados(d);
    if (pacote.logo) {
      aplicarLogoCapturada(pacote.logo, 'rascunho');
      const nameEl = document.getElementById('logoPreviewName');
      const sizeEl = document.getElementById('logoPreviewSize');
      if (nameEl) nameEl.textContent = 'logotipo-restaurado.png';
      if (sizeEl) sizeEl.textContent = '— restaurado do rascunho —';
    }
    toast(`Rascunho carregado · ${file.name}`);
  } catch (e) {
    console.error(e);
    toast('Arquivo JSON inválido ou corrompido.');
  }
}

function aplicarDados(d) {
  const setV = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };

  setV('orgao', d.id?.orgao); setV('uasg', d.id?.uasg); setV('unidade', d.id?.unidade);
  setV('exercicio', d.id?.exercicio); setV('numeroEtp', d.id?.numero);
  if (d.id?.numero) document.getElementById('numeroEtp').dataset.userEdited = '1';
  setV('processo', d.id?.processo); setV('dataElaboracao', d.id?.data);
  setV('objeto', d.id?.objeto); setV('responsavel', d.id?.responsavel);
  setV('cargoResponsavel', d.id?.cargo); setV('email', d.id?.email); setV('telefone', d.id?.telefone);

  setV('necessidade', d.nec?.necessidade);
  setV('causaRaiz', d.nec?.causaRaiz);
  setV('publicoAlvo', d.nec?.publicoAlvo);

  setV('pcaPrevisto', d.pca?.previsto);
  setV('pcaItem', d.pca?.item);
  setV('pcaJustificativa', d.pca?.justificativa);

  setV('dotacaoOrcamentaria', d.enq?.dotacao);
  setV('fonteRecurso', d.enq?.fonte);
  setV('modalidadePretendida', d.enq?.modalidade);
  setV('criterioJulgamento', d.enq?.criterio);

  const sustSet = new Set(d.req?.sustentaveis || []);
  document.querySelectorAll('input[name="sustent"]').forEach(cb => { cb.checked = sustSet.has(cb.value); });
  setV('reqTecnicos', d.req?.tecnicos);
  setV('reqHabilitacao', d.req?.habilitacao);
  setV('reqGarantia', d.req?.garantia);
  setV('reqEntrega', d.req?.entrega);

  setV('qtdDescricao', d.qtd?.descricao);
  const tbQ = document.getElementById('tbQtd');
  if (tbQ) {
    tbQ.innerHTML = '';
    (d.qtd?.itens || []).forEach(addQtd);
    if (!(d.qtd?.itens || []).length) addQtd();
  }
  setV('metodoQtd', d.qtd?.metodo);

  const tbM = document.getElementById('tbMercado');
  if (tbM) {
    tbM.innerHTML = '';
    (d.mercado?.alternativas || []).forEach(addMercado);
    if (!(d.mercado?.alternativas || []).length) { addMercado(); addMercado(); }
  }
  setV('conclusaoMercado', d.mercado?.conclusao);

  setV('metodoPreco', d.precos?.metodo);
  const tbP = document.getElementById('tbPreco');
  if (tbP) {
    tbP.innerHTML = '';
    (d.precos?.itens || []).forEach(addPreco);
    if (!(d.precos?.itens || []).length) addPreco();
  }
  setV('obsPreco', d.precos?.observacoes);
  recalcularTotal();

  setV('descricaoSolucao', d.solucao?.descricao);
  setV('entregas', d.solucao?.entregas);
  setV('cicloVida', d.solucao?.ciclo);
  setV('prazoExecucao', d.prazos?.execucao);
  setV('localEntrega', d.prazos?.local);
  setV('condicoesPagamento', d.prazos?.pagamento);

  setV('parcelar', d.parcel?.decisao);
  setV('itensParcelaveis', d.parcel?.itens);
  setV('justificativaParcelamento', d.parcel?.justificativa);

  setV('resultados', d.result?.resultados);
  setV('economicidade', d.result?.economicidade);
  setV('indicadores', d.result?.indicadores);

  setV('providencias', d.prov?.providencias);
  setV('correlatas', d.prov?.correlatas);
  setV('impactoProvidencias', d.prov?.impacto);

  setV('posicionamento', d.conc?.posicionamento);
  setV('recomendacoes', d.conc?.recomendacoes);
  setV('conclusao', d.conc?.conclusao);

  setV('fiscalTitular', d.governanca?.fiscalTitular);
  setV('fiscalSubstituto', d.governanca?.fiscalSubstituto);
  setV('gestorContrato', d.governanca?.gestor);

  const lst = document.getElementById('listaAprovadores');
  if (lst) {
    lst.innerHTML = '';
    (d.aprov || []).forEach(addAprovador);
    if (!(d.aprov || []).length) addAprovador({ papel: 'Elaborador' });
  }
}

/* =====================================================================
   13. DROPZONES
   ===================================================================== */
function inicializarDropzoneLogo() {
  const dz    = document.getElementById('logoDropzone');
  const input = document.getElementById('logoFile');
  if (!dz || !input) return;

  const empty     = document.getElementById('logoDropzoneEmpty');
  const preview   = document.getElementById('logoDropzonePreview');
  const nameEl    = document.getElementById('logoPreviewName');
  const sizeEl    = document.getElementById('logoPreviewSize');
  const removeBtn = document.getElementById('logoRemoveBtn');

  dz.addEventListener('click', e => {
    if (e.target.closest('#logoRemoveBtn')) return;
    if (dz.classList.contains('has-file')) return;
    input.click();
  });

  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.add('dragover');
  }));
  ['dragleave','dragend'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) processar(f);
  });
  input.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) processar(f);
  });
  removeBtn?.addEventListener('click', e => {
    e.stopPropagation();
    logoDataUrl = null; logoOrigem = 'default';
    input.value = '';
    preview?.classList.add('hidden');
    empty?.classList.remove('hidden');
    dz.classList.remove('has-file');
    toast('Logotipo removido. Voltando à logo oficial OmniLicit.');
  });

  async function processar(file) {
    const MAX = 2 * 1024 * 1024;
    if (!file.type.startsWith('image/')) { toast('Formato inválido. Envie PNG, JPG ou SVG.'); return; }
    if (file.size > MAX) { toast('Arquivo excede 2 MB.'); return; }
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      aplicarLogoCapturada(dataUrl, 'manual');
      if (nameEl) nameEl.textContent = file.name;
      if (sizeEl) sizeEl.textContent = fmt(file.size);
      toast(`Logotipo carregado: ${file.name}`);
    } catch (e) {
      console.error(e);
      toast('Falha ao ler o arquivo.');
    }
  }
  function fmt(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  }
}

function inicializarDropzoneDFD() {
  const dz    = document.getElementById('dfdDropzone');
  const input = document.getElementById('dfdFile');
  if (!dz || !input) return;

  dz.addEventListener('click', () => input.click());
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.add('dragover');
  }));
  ['dragleave','dragend'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) processarDFD(f);
  });
  input.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) processarDFD(f);
    e.target.value = '';
  });
}

/* =====================================================================
   14. TOAST
   ===================================================================== */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

/* =====================================================================
   15. BOOTSTRAP — Integração OmniLicit
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  /* 1. Tema + identidade visual (logo oficial) */
  aplicarTema(lerTemaSalvo());
  await OmniLogo.load();
  logoPadraoPng = OmniLogo.get();
  await injetarIdentidadeVisual();

  /* 2. Data padrão */
  const dtEl = document.getElementById('dataElaboracao');
  if (dtEl && !dtEl.value) dtEl.value = new Date().toISOString().slice(0, 10);

  /* 3. Painéis e navegação */
  panels = $$('[data-panel]');
  TOTAL  = panels.length;

  preencherNumeroETPInicial();
  const numEl = document.getElementById('numeroEtp');
  numEl?.addEventListener('input', marcarNumeroEditado);
  document.getElementById('exercicio')?.addEventListener('change', () => {
    if (!document.getElementById('numeroEtp').dataset.userEdited) preencherNumeroETPInicial();
  });

  /* 4. Dropzones */
  inicializarDropzoneLogo();
  inicializarDropzoneDFD();

  /* 5. Carregar rascunho JSON */
  document.getElementById('jsonFile')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) processarArquivoJSON(f);
    e.target.value = '';
  });

  /* 6. Linhas iniciais dinâmicas */
  addQtd();
  addMercado(); addMercado();
  addPreco();
  addAprovador({ papel: 'Elaborador' });

  /* 7. Recalcular total sempre que mexer na tabela de preços */
  document.addEventListener('input', e => {
    if (e.target.closest('#tbPreco')) recalcularTotal();
  });

  /* 8. Modais: fechar ao clicar no overlay ou pressionar ESC */
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  });

  /* 9. Navegação inicial */
  renderNav();
  goTo(0);

  /* 10. Score de conformidade em tempo real */
  setInterval(() => {
    const conf = calcularConformidade(coletarDados());
    const b = document.getElementById('scoreBadge');
    if (!b) return;
    b.textContent = `Conformidade ${conf.score}%`;
    if (conf.score >= 80) {
      b.style.background = 'var(--ok-bg)';
      b.style.color = 'var(--ok)';
      b.style.borderColor = 'rgba(22,163,74,.35)';
    } else if (conf.score >= 50) {
      b.style.background = 'var(--wa-bg)';
      b.style.color = 'var(--wa)';
      b.style.borderColor = 'rgba(217,119,6,.35)';
    } else {
      b.style.background = 'var(--er-bg)';
      b.style.color = 'var(--er)';
      b.style.borderColor = 'rgba(220,38,38,.35)';
    }
  }, 1200);

  /* 11. Welcome */
  if (deveExibirWelcome()) setTimeout(abrirWelcome, 500);

  /* 12. Log de status */
  console.info(
    `[OmniLicit] LicitaETP v5.0 carregado\n` +
    `  Logo origem : ${OmniLogo.origem()}\n` +
    `  Módulos     : OmniLogo · DFDParser · PDFEngine`
  );
});
