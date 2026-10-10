/* =============================================================
   LicitaAudit · OmniLicit
   Módulo de auditoria e conformidade — Lei nº 14.133/2021
   Autor: Engenharia OmniLicit
   ============================================================= */

'use strict';

/* -------------------------------------------------------------
   1. ESTADO GLOBAL
   ------------------------------------------------------------- */
const STATE = {
  files: [],          // [{ id, name, size, type, ext, hash, seal, at }]
  compliance: {},     // { [itemId]: 'ok' | 'warn' | 'fail' | null }
  startedAt: new Date(),
};

/* -------------------------------------------------------------
   2. MATRIZ LEGAL — Lei nº 14.133/2021
   ------------------------------------------------------------- */
const LEGAL_MATRIX = [
  {
    id: 'art5',
    art: 'Art. 5º',
    title: 'Observância dos princípios administrativos',
    desc: 'Legalidade, impessoalidade, moralidade, publicidade, eficiência, motivação, razoabilidade, competitividade, planejamento, transparência, eficácia, segregação de funções e vinculação ao edital.',
  },
  {
    id: 'art11',
    art: 'Art. 11',
    title: 'Objetivos do processo licitatório',
    desc: 'Seleção da proposta apta a gerar o resultado de contratação mais vantajoso, tratamento isonômico e observância da justa competição.',
  },
  {
    id: 'art12',
    art: 'Art. 12',
    title: 'Fases da licitação formalizadas',
    desc: 'Preparatória, divulgação do edital, apresentação de propostas e lances, julgamento, habilitação, recursal, homologação.',
  },
  {
    id: 'art18',
    art: 'Art. 18',
    title: 'Estudo Técnico Preliminar (ETP)',
    desc: 'Caracterização da necessidade, levantamento de mercado, estimativa de quantidades, estimativa do valor, riscos e sustentabilidade.',
  },
  {
    id: 'art22',
    art: 'Art. 22',
    title: 'Projeto Básico / Executivo',
    desc: 'Descrição do objeto, fundamentação, prazo, especificações técnicas, critérios de julgamento e forma de pagamento.',
  },
  {
    id: 'art23',
    art: 'Art. 23',
    title: 'Pesquisa de preços e Termo de Referência',
    desc: 'Pesquisa de preços via painel de preços, contratações similares, mídia especializada ou fornecedores — para o TR.',
  },
  {
    id: 'art24',
    art: 'Art. 24',
    title: 'Matriz de Alocação de Riscos',
    desc: 'Obrigatória para contratos de grande vulto e obras/engenharia, identificando riscos e responsabilidades entre as partes.',
  },
  {
    id: 'art25',
    art: 'Art. 25',
    title: 'Edital — conteúdo e publicidade',
    desc: 'Objeto, regras de participação, critérios de julgamento, valores, prazos e demais elementos do processo.',
  },
  {
    id: 'art33',
    art: 'Art. 33',
    title: 'Adoção do Pregão (eletrônico/preferencial)',
    desc: 'Pregão como modalidade preferencial, obrigatoriamente eletrônico, para bens e serviços comuns.',
  },
  {
    id: 'art36',
    art: 'Art. 36',
    title: 'Publicidade no PNCP',
    desc: 'Divulgação obrigatória no Portal Nacional de Contratações Públicas, além do sítio oficial do ente.',
  },
  {
    id: 'art63',
    art: 'Art. 63',
    title: 'Habilitação jurídica, técnica, fiscal e econômica',
    desc: 'Comprovação de habilitação prévia à celebração do contrato, com verificação documental e de regularidade.',
  },
  {
    id: 'art71',
    art: 'Art. 71',
    title: 'Encerramento da fase competitiva',
    desc: 'Registro dos lances, julgamento das propostas e declaração do vencedor com publicidade.',
  },
  {
    id: 'art72',
    art: 'Art. 72',
    title: 'Homologação e adjudicação',
    desc: 'Homologação pela autoridade competente, com verificação de regularidade do processo e da proposta.',
  },
  {
    id: 'art89',
    art: 'Art. 89',
    title: 'Contratação direta — dispensa',
    desc: 'Hipóteses de dispensa (art. 75), justificativa de preço e razão de escolha do contratado.',
  },
  {
    id: 'art90',
    art: 'Art. 90',
    title: 'Inexigibilidade de licitação',
    desc: 'Comprovação de inviabilidade de competição, justificativa de preço e razão de escolha do fornecedor.',
  },
  {
    id: 'art174',
    art: 'Art. 174',
    title: 'Portal Nacional de Contratações Públicas',
    desc: 'Integração e alimentação obrigatória de dados ao PNCP.',
  },
];

/* -------------------------------------------------------------
   3. UTILITÁRIOS
   ------------------------------------------------------------- */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

const fmtDate = (d = new Date()) =>
  d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const toast = (msg, kind = 'ok', timeout = 3200) => {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    setTimeout(() => el.remove(), 300);
  }, timeout);
};

const uid = () => Math.random().toString(36).slice(2, 10);

/* -------------------------------------------------------------
   4. TEMA (dark/light persistente)
   ------------------------------------------------------------- */
const ThemeManager = {
  KEY: 'omnlicit:theme',
  init() {
    const saved = localStorage.getItem(this.KEY);
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = saved || (prefersLight ? 'light' : 'dark');
    this.apply(theme);
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.KEY, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#09090B' : '#F1F5F9');
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
};

/* -------------------------------------------------------------
   5. HASH SHA-256 (Web Crypto API)
   ------------------------------------------------------------- */
async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* -------------------------------------------------------------
   6. LEITURA DE SELOS DIGITAIS
   Detecta assinaturas PAdES (PDF), PKCS#7 (DER / .p7s),
   XMLDSig (XML) e assinaturas em containers ZIP (OOXML/ODF).
   ------------------------------------------------------------- */
function detectExtension(name) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

async function inspectSeal(file, buffer) {
  const bytes  = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4 * 1024 * 1024)));
  const ext    = detectExtension(file.name);
  const result = {
    kind: ext.toUpperCase() || 'BIN',
    signed: false,
    standard: null,
    details: [],
    level: 'none', // none | basic | icp
  };

  // --- PDF / PAdES ---
  const isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (isPDF || ext === 'pdf') {
    result.kind = 'PDF';
    const text = new TextDecoder('latin1').decode(bytes);

    if (/\/ByteRange\s*\[/.test(text) || /\/Type\s*\/Sig\b/.test(text)) {
      result.signed    = true;
      result.standard  = 'PAdES / PKCS#7';
      result.level     = 'basic';
      result.details.push('Assinatura digital embutida (dicionário /Sig)');
      const count = (text.match(/\/Type\s*\/Sig\b/g) || []).length || 1;
      result.details.push(`${count} assinatura(s) detectada(s)`);
    }

    if (/adbe\.pkcs7\.detached/i.test(text)) result.details.push('SubFilter: adbe.pkcs7.detached');
    if (/ETSI\.CAdES\.detached/i.test(text)) {
      result.standard = 'PAdES-BES (ETSI)';
      result.details.push('SubFilter: ETSI.CAdES.detached');
    }
    if (/\/DocMDP|\/Perms\b/.test(text)) result.details.push('Certificação DocMDP presente');

    // ICP-Brasil: OIDs típicos (2.16.76.1.3 / 2.16.76.1.7) — busca textual como heurística
    if (/(2\.16\.76\.1\.3|2\.16\.76\.1\.7|ICP-Brasil)/i.test(text)) {
      result.level = 'icp';
      result.details.push('Indícios de certificado ICP-Brasil');
    }
  }

  // --- PKCS#7 DER (30 82 ...) ---
  if (!result.signed && bytes[0] === 0x30 && (bytes[1] & 0x80)) {
    result.signed   = true;
    result.kind     = ext === 'p7s' ? 'P7S' : 'PKCS#7';
    result.standard = 'PKCS#7 / CMS';
    result.level    = 'basic';
    result.details.push('Estrutura ASN.1 / CMS detectada');
    if (ext === 'p7s') result.details.push('Assinatura destacada (detached signature)');
  }

  // --- PKCS#12 (.p12 / .pfx) ---
  if (ext === 'p12' || ext === 'pfx') {
    result.signed   = true;
    result.kind     = 'PKCS#12';
    result.standard = 'Container PKCS#12';
    result.level    = 'basic';
    result.details.push('Possível chave/certificado em container');
  }

  // --- XML Signature (XMLDSig) ---
  if (['xml', 'xsd', 'nfe', 'cte', 'mdfe'].includes(ext)) {
    result.kind = 'XML';
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (/<Signature[\s>]/i.test(text) || /xmldsig/i.test(text)) {
      result.signed   = true;
      result.standard = 'XMLDSig';
      result.level    = 'basic';
      result.details.push('Elemento <Signature> detectado');
    }
    if (/<X509Certificate>/i.test(text)) result.details.push('Certificado X.509 embutido');
    if (/ICP-Brasil/i.test(text)) {
      result.level = 'icp';
      result.details.push('Cadeia ICP-Brasil referenciada');
    }
  }

  // --- OOXML / ODF (ZIP) ---
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isZip && !result.signed) {
    result.details.push('Container ZIP (verificação de assinatura requer extração)');
  }

  if (!result.signed && !result.details.length) {
    result.details.push('Nenhum selo digital identificado');
  }

  return result;
}

/* -------------------------------------------------------------
   7. RENDER — KPIs
   ------------------------------------------------------------- */
function renderKPIs() {
  const seals = STATE.files.filter((f) => f.seal.signed).length;
  const values = Object.values(STATE.compliance);
  const ok   = values.filter((v) => v === 'ok').length;
  const fail = values.filter((v) => v === 'fail').length;
  const total = LEGAL_MATRIX.length;
  const pct = total ? Math.round((ok / total) * 100) : 0;

  $('#kpiFiles').textContent = STATE.files.length;
  $('#kpiSeals').textContent = seals;
  $('#kpiCompliance').textContent = total ? `${pct}%` : '—';
  $('#kpiRisks').textContent = fail;

  $('#chipOk').textContent   = `${ok} conformes`;
  $('#chipWarn').textContent = `${values.filter((v) => v === 'warn').length} pendentes`;
  $('#chipFail').textContent = `${fail} não conformes`;
}

/* -------------------------------------------------------------
   8. RENDER — LISTA DE ARQUIVOS
   ------------------------------------------------------------- */
function renderFiles() {
  const list = $('#fileList');

  if (!STATE.files.length) {
    list.innerHTML = '<li class="empty">Nenhum artefato ingerido ainda.</li>';
    return;
  }

  list.innerHTML = STATE.files.map((f) => {
    const short = f.hash ? `${f.hash.slice(0, 8)}…${f.hash.slice(-8)}` : '—';
    const sealBadge = f.seal.signed
      ? `<span class="status-dot dot-ok"></span> Selo: ${f.seal.standard || 'detectado'}`
      : `<span class="status-dot dot-warn"></span> Sem selo`;
    return `
      <li class="file-item" data-id="${f.id}">
        <div class="file-icon">${f.ext || 'BIN'}</div>
        <div class="file-meta">
          <div class="file-name" title="${escapeAttr(f.name)}">${escapeHTML(f.name)}</div>
          <div class="file-sub">
            <span>${fmtBytes(f.size)}</span>
            <span>${sealBadge}</span>
            <span class="hash" data-copy="${f.hash}" title="Copiar hash SHA-256">SHA-256: ${short}</span>
          </div>
        </div>
        <div class="file-icon" style="background:transparent;color:var(--accent)">✓</div>
      </li>
    `;
  }).join('');
}

/* -------------------------------------------------------------
   9. RENDER — SELOS DIGITAIS
   ------------------------------------------------------------- */
function renderSeals() {
  const list = $('#sealList');
  const sealed = STATE.files.filter((f) => f.seal.signed);

  if (!sealed.length) {
    list.innerHTML = '<li class="empty">Aguardando artefatos assinados.</li>';
    return;
  }

  list.innerHTML = sealed.map((f) => `
    <li class="seal-item">
      <div class="seal-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </div>
      <div class="file-meta">
        <div class="file-name">${escapeHTML(f.name)}</div>
        <div class="file-sub">
          <strong style="color:var(--accent)">${f.seal.standard || 'Assinatura'}</strong>
          <span>· ${f.seal.kind}</span>
          <span>· Nível: ${f.seal.level === 'icp' ? 'ICP-Brasil (provável)' : 'Padrão'}</span>
        </div>
      </div>
      <span class="status-dot dot-ok"></span>
    </li>
  `).join('');
}

/* -------------------------------------------------------------
   10. RENDER — MATRIZ DE CONFORMIDADE
   ------------------------------------------------------------- */
function renderCompliance() {
  const wrap = $('#complianceList');

  wrap.innerHTML = LEGAL_MATRIX.map((item) => {
    const status = STATE.compliance[item.id] || null;
    return `
      <div class="comp-item" data-id="${item.id}" data-status="${status || ''}">
        <div class="comp-head">
          <span class="comp-art">${item.art}</span>
          <span class="status-dot ${
            status === 'ok' ? 'dot-ok' :
            status === 'warn' ? 'dot-warn' :
            status === 'fail' ? 'dot-danger' : ''
          }"></span>
        </div>
        <div class="comp-title">${escapeHTML(item.title)}</div>
        <div class="comp-desc">${escapeHTML(item.desc)}</div>
        <div class="comp-foot">
          <button type="button" class="comp-btn ${status === 'ok' ? 'active-ok' : ''}"     data-set="ok">Conforme</button>
          <button type="button" class="comp-btn ${status === 'warn' ? 'active-warn' : ''}" data-set="warn">Pendente</button>
          <button type="button" class="comp-btn ${status === 'fail' ? 'active-fail' : ''}" data-set="fail">Não conforme</button>
        </div>
      </div>
    `;
  }).join('');
}

function bindComplianceEvents() {
  $('#complianceList').addEventListener('click', (e) => {
    const btn = e.target.closest('.comp-btn');
    if (!btn) return;
    const card = btn.closest('.comp-item');
    const id = card.dataset.id;
    const set = btn.dataset.set;

    STATE.compliance[id] = STATE.compliance[id] === set ? null : set;
    card.dataset.status = STATE.compliance[id] || '';
    if (!STATE.compliance[id]) delete STATE.compliance[id];

    // Atualiza visual dos botões
    card.querySelectorAll('.comp-btn').forEach((b) => {
      b.classList.remove('active-ok', 'active-warn', 'active-fail');
    });
    if (STATE.compliance[id]) {
      btn.classList.add(
        set === 'ok' ? 'active-ok' :
        set === 'warn' ? 'active-warn' : 'active-fail'
      );
    }

    // Atualiza dot
    const dot = card.querySelector('.comp-head .status-dot');
    dot.className = 'status-dot';
    if (STATE.compliance[id] === 'ok')   dot.classList.add('dot-ok');
    if (STATE.compliance[id] === 'warn') dot.classList.add('dot-warn');
    if (STATE.compliance[id] === 'fail') dot.classList.add('dot-danger');

    renderKPIs();
  });
}

/* -------------------------------------------------------------
   11. INGESTÃO DE ARQUIVOS
   ------------------------------------------------------------- */
async function ingestFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  const total = files.length;
  let done = 0;
  $('#progressWrap').hidden = false;

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      const hash   = await sha256(buffer);
      const seal   = await inspectSeal(file, buffer);

      STATE.files.push({
        id: uid(),
        name: file.name,
        size: file.size,
        type: file.type || '',
        ext: detectExtension(file.name),
        hash,
        seal,
        at: new Date(),
      });

      done++;
      const pct = Math.round((done / total) * 100);
      $('#progressBar').style.width = `${pct}%`;
      $('#progressText').textContent = `${pct}%`;
    } catch (err) {
      console.error('[LicitaAudit] falha ao processar', file.name, err);
      toast(`Falha ao processar: ${file.name}`, 'danger');
    }
  }

  renderFiles();
  renderSeals();
  renderKPIs();

  setTimeout(() => {
    $('#progressWrap').hidden = true;
    $('#progressBar').style.width = '0%';
    $('#progressText').textContent = '0%';
  }, 600);

  toast(`${files.length} artefato(s) auditado(s) com sucesso.`, 'ok');
}

function bindDropzone() {
  const dz = $('#dropzone');
  const input = $('#fileInput');

  input.addEventListener('change', (e) => {
    ingestFiles(e.target.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('dragover');
    });
  });

  dz.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) ingestFiles(files);
  });

  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
}

/* -------------------------------------------------------------
   12. EXPORTAÇÃO — LAUDO
   ------------------------------------------------------------- */
function buildAuditPayload() {
  const counts = {
    total: LEGAL_MATRIX.length,
    ok:    0, warn: 0, fail: 0, pending: 0,
  };
  LEGAL_MATRIX.forEach((i) => {
    const s = STATE.compliance[i.id];
    if (s === 'ok') counts.ok++;
    else if (s === 'warn') counts.warn++;
    else if (s === 'fail') counts.fail++;
    else counts.pending++;
  });

  return {
    geradoEm: new Date().toISOString(),
    geradoEmBR: fmtDate(new Date()),
    iniciadoEm: STATE.startedAt.toISOString(),
    norma: 'Lei nº 14.133/2021',
    modulo: 'LicitaAudit · OmniLicit',
    artefatos: STATE.files.map((f) => ({
      id: f.id,
      nome: f.name,
      tamanhoBytes: f.size,
      extensao: f.ext,
      mime: f.type,
      sha256: f.hash,
      seloDigital: {
        assinado: f.seal.signed,
        padrao: f.seal.standard,
        nivel: f.seal.level,
        detalhes: f.seal.details,
      },
      registradoEm: f.at.toISOString(),
    })),
    conformidade: LEGAL_MATRIX.map((i) => ({
      id: i.id,
      artigo: i.art,
      titulo: i.title,
      descricao: i.desc,
      status: STATE.compliance[i.id] || 'pendente',
    })),
    resumo: counts,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJSON() {
  if (!STATE.files.length) {
    toast('Nenhum artefato para exportar.', 'warn');
    return;
  }
  const data = buildAuditPayload();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(blob, `licitaudit-trilha-${stamp}.json`);
  toast('Trilha JSON exportada.', 'ok');
}

function exportHTML() {
  if (!STATE.files.length) {
    toast('Nenhum artefato para exportar.', 'warn');
    return;
  }

  const data = buildAuditPayload();

  const badgeColor = (s) =>
    s === 'ok'   ? '#10B981' :
    s === 'warn' ? '#F59E0B' :
    s === 'fail' ? '#EF4444' : '#64748B';

  const statusLabel = (s) =>
    s === 'ok' ? 'CONFORME' :
    s === 'warn' ? 'PENDENTE' :
    s === 'fail' ? 'NÃO CONFORME' : 'NÃO AVALIADO';

  const filesRows = data.artefatos.map((f) => `
    <tr>
      <td><strong>${escapeHTML(f.nome)}</strong><br>
        <span class="muted">${f.extensao.toUpperCase() || 'BIN'} · ${fmtBytes(f.tamanhoBytes)}</span>
      </td>
      <td class="mono small">${f.sha256 || '—'}</td>
      <td>
        ${f.seloDigital.assinado
          ? `<span class="pill ok">${escapeHTML(f.seloDigital.padrao || 'Assinado')}</span>`
          : `<span class="pill warn">Sem selo</span>`}
      </td>
      <td class="muted small">${fmtDate(new Date(f.registradoEm))}</td>
    </tr>
  `).join('');

  const compRows = data.conformidade.map((c) => `
    <tr>
      <td class="mono">${c.artigo}</td>
      <td><strong>${escapeHTML(c.titulo)}</strong><br><span class="muted small">${escapeHTML(c.descricao)}</span></td>
      <td><span class="pill" style="background:${badgeColor(c.status)}22;color:${badgeColor(c.status)};border:1px solid ${badgeColor(c.status)}55">${statusLabel(c.status)}</span></td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Laudo de Auditoria · LicitaAudit</title>
<style>
  :root { --accent:#0D9488; --blue:#1E40AF; --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --bg:#F8FAFC; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--ink); background: var(--bg); margin:0; padding: 32px; }
  .doc { max-width: 1080px; margin: 0 auto; background:#fff; border-radius:14px; box-shadow: 0 10px 32px rgba(15,23,42,.08); padding: 40px; }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--line); padding-bottom:20px; margin-bottom:28px; }
  .head h1 { font-size:1.5rem; margin:0; letter-spacing:-.02em; }
  .head h1 span { color: var(--accent); }
  .head .meta { text-align:right; font-size:.82rem; color:var(--muted); }
  .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:32px; }
  .kpi { background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:14px 18px; }
  .kpi b { display:block; font-size:1.4rem; font-family: ui-monospace, monospace; }
  .kpi span { font-size:.72rem; text-transform:uppercase; color:var(--muted); letter-spacing:.08em; }
  h2 { font-size:1rem; margin: 32px 0 12px; letter-spacing:-.01em; }
  table { width:100%; border-collapse: collapse; font-size:.85rem; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align: top; }
  th { background: var(--bg); font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  .mono { font-family: ui-monospace, SFMono-Regular, monospace; }
  .small { font-size:.76rem; }
  .muted { color:var(--muted); }
  .pill { display:inline-block; padding:3px 10px; border-radius:999px; font-size:.72rem; font-weight:600; }
  .pill.ok { background:#10B98122; color:#10B981; border:1px solid #10B98155; }
  .pill.warn { background:#F59E0B22; color:#F59E0B; border:1px solid #F59E0B55; }
  .foot { margin-top:42px; padding-top:20px; border-top:1px dashed var(--line); font-size:.76rem; color:var(--muted); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  @media print { body { background:#fff; padding:0; } .doc { box-shadow:none; padding:24px; } }
</style>
</head>
<body>
  <div class="doc">
    <div class="head">
      <div>
        <h1>Laudo de Auditoria <span>LicitaAudit</span></h1>
        <div class="muted small">Módulo de auditoria do ecossistema <strong>OmniLicit</strong> · Norma: ${data.norma}</div>
      </div>
      <div class="meta">
        <div><strong>Emitido em:</strong> ${data.geradoEmBR}</div>
        <div><strong>Sessão iniciada em:</strong> ${fmtDate(new Date(data.iniciadoEm))}</div>
        <div class="mono small">ID: ${uid().toUpperCase()}-${Date.now().toString(36).toUpperCase()}</div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><span>Artefatos</span><b>${data.resumo.total_artefatos ?? data.artefatos.length}</b></div>
      <div class="kpi"><span>Conformes</span><b style="color:#10B981">${data.resumo.ok}</b></div>
      <div class="kpi"><span>Pendentes</span><b style="color:#F59E0B">${data.resumo.warn + data.resumo.pending}</b></div>
      <div class="kpi"><span>Não conformes</span><b style="color:#EF4444">${data.resumo.fail}</b></div>
    </div>

    <h2>1 · Integridade dos Artefatos (SHA-256)</h2>
    <table>
      <thead><tr><th>Artefato</th><th>Hash SHA-256</th><th>Selo Digital</th><th>Registrado em</th></tr></thead>
      <tbody>${filesRows || '<tr><td colspan="4" class="muted">Sem artefatos.</td></tr>'}</tbody>
    </table>

    <h2>2 · Matriz de Conformidade — ${data.norma}</h2>
    <table>
      <thead><tr><th style="width:90px">Artigo</th><th>Requisito</th><th style="width:150px">Status</th></tr></thead>
      <tbody>${compRows}</tbody>
    </table>

    <div class="foot">
      <span>Documento gerado automaticamente pelo LicitaAudit · OmniLicit. Processamento local, sem tráfego externo de dados.</span>
      <span class="mono">${data.geradoEm}</span>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(blob, `laudo-licitaudit-${stamp}.html`);
  toast('Laudo de auditoria gerado. Abra e imprima como PDF.', 'ok');
}

/* -------------------------------------------------------------
   13. HELPERS DE SEGURANÇA (XSS)
   ------------------------------------------------------------- */
function escapeHTML(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s = '') { return escapeHTML(s).replace(/`/g, '&#96;'); }

/* -------------------------------------------------------------
   14. BIND GLOBAL
   ------------------------------------------------------------- */
function bindGlobal() {
  // Tema
  $('#themeToggle').addEventListener('click', () => ThemeManager.toggle());

  // Limpar
  $('#btnClear').addEventListener('click', () => {
    if (!STATE.files.length && !Object.keys(STATE.compliance).length) return;
    if (!confirm('Confirma limpeza de todos os artefatos e da matriz de conformidade?')) return;
    STATE.files = [];
    STATE.compliance = {};
    STATE.startedAt = new Date();
    renderFiles();
    renderSeals();
    renderCompliance();
    renderKPIs();
    toast('Sessão de auditoria reiniciada.', 'ok');
  });

  // Export
  $('#btnExportJSON').addEventListener('click', exportJSON);
  $('#btnExportHTML').addEventListener('click', exportHTML);

  // Copiar hash ao clicar
  document.addEventListener('click', (e) => {
    const h = e.target.closest('.hash');
    if (!h) return;
    const txt = h.dataset.copy || '';
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => toast('Hash SHA-256 copiado.', 'ok'));
  });

  // Ano no footer
  $('#year').textContent = new Date().getFullYear();
}

/* -------------------------------------------------------------
   15. BOOTSTRAP
   ------------------------------------------------------------- */
(function init() {
  ThemeManager.init();
  renderCompliance();
  bindComplianceEvents();
  renderFiles();
  renderSeals();
  renderKPIs();
  bindDropzone();
  bindGlobal();

  // Verificação de integridade do ambiente
  if (!window.crypto?.subtle) {
    toast('Web Crypto indisponível — use HTTPS ou localhost.', 'danger', 8000);
  }

  console.info(
    '%c LicitaAudit · OmniLicit ',
    'background:#14B8A6;color:#062620;font-weight:700;padding:2px 6px;border-radius:4px',
    '\nMódulo de auditoria iniciado ·',
    `Sessão: ${STATE.startedAt.toISOString()}`
  );
})();
