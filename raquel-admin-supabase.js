/**
 * raquel-admin-supabase.js
 * ─────────────────────────────────────────────────────
 * Script completo do painel admin integrado ao Supabase.
 * Substitui toda a lógica de localStorage do admin atual.
 *
 * Como usar:
 *   1. Preencha SUPABASE_URL e SUPABASE_SERVICE_KEY
 *   2. Adicione <script src="raquel-admin-supabase.js"></script>
 *      no HTML do admin (https://raquel-adm.vercel.app)
 * ─────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════
// ⚠️  ATENÇÃO: preencha com os dados do seu projeto
// ═══════════════════════════════════════════════════════
const SB_URL = 'https://olqzjhedbpfsalygokvj.supabase.co/rest/v1/';       // ← PREENCHA
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9scXpqaGVkYnBmc2FseWdva3ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDM0NjA0NywiZXhwIjoyMDk1OTIyMDQ3fQ.9aZ-Lg40UXVgGsyw3T7bRpgLtancg1MuIzbO9E715No';              // ← PREENCHA (service_role)
// ═══════════════════════════════════════════════════════

// ─── Cliente REST mínimo ──────────────────────────────
const sb = {
  async req(method, path, body) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) throw new Error(data?.message || data?.error || `HTTP ${r.status}`);
    return data;
  },

  get:    (path)        => sb.req('GET',    path),
  post:   (path, body)  => sb.req('POST',   path, body),
  patch:  (path, body)  => sb.req('PATCH',  path, body),
  delete: (path)        => sb.req('DELETE', path),

  // Upload de imagem para Supabase Storage
  async uploadImagem(file) {
    const ext  = file.name.split('.').pop();
    const nome = `produtos/${Date.now()}.${ext}`;
    const r = await fetch(`${SB_URL}/storage/v1/object/raquel-imagens/${nome}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': file.type,
      },
      body: file,
    });
    if (!r.ok) throw new Error('Falha no upload da imagem');
    return `${SB_URL}/storage/v1/object/public/raquel-imagens/${nome}`;
  },
};

// ─── Estado global ────────────────────────────────────
let produtos     = [];
let configSite   = {};
let modoEdicao   = null; // id do produto em edição ou null
let _extraFiles  = [null, null, null]; // arquivos novos das 3 fotos extras
let _extraUrls   = [null, null, null]; // URLs já existentes (edição) das 3 fotos extras

// ─── Helpers ──────────────────────────────────────────
const fmt = (p) => 'R$ ' + parseFloat(p).toFixed(2).replace('.', ',');
const toast = (msg, tipo = 'ok') => {
  let el = document.getElementById('sb-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-toast';
    el.style.cssText = `
      position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:13px;z-index:9999;
      font-family:'DM Sans',sans-serif;font-weight:500;
      transition:opacity .3s;color:#fff;
    `;
    document.body.appendChild(el);
  }
  el.style.background = tipo === 'ok' ? '#B8935A' : tipo === 'erro' ? '#E05252' : '#333';
  el.style.opacity = '1';
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = '0'), 3000);
};

// ─── PRODUTOS ─────────────────────────────────────────

async function carregarProdutos() {
  try {
    produtos = await sb.get('produtos?order=id.asc');
    renderTabelaProdutos();
    atualizarDashboard();
  } catch (e) {
    toast('Erro ao carregar produtos: ' + e.message, 'erro');
  }
}

function renderTabelaProdutos(filtro = '') {
  // Tenta encontrar o tbody da tabela de produtos no DOM do admin
  const tbody = document.querySelector('#tabela-produtos tbody') ||
                document.querySelector('.product-table tbody') ||
                document.querySelector('table tbody');
  if (!tbody) return;

  const lista = filtro
    ? produtos.filter((p) =>
        p.nome.toLowerCase().includes(filtro.toLowerCase()) ||
        p.categoria === filtro
      )
    : produtos;

  if (!lista.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:2rem;color:#9A917F">
          👗 Nenhum produto encontrado. Adicione o primeiro!
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = lista
    .map(
      (p) => `
    <tr data-id="${p.id}">
      <td>
        ${p.imagem_url
          ? `<img src="${p.imagem_url}" style="width:44px;height:44px;object-fit:cover;border-radius:6px">`
          : `<span style="font-size:32px">${p.emoji || '👗'}</span>`}
      </td>
      <td>
        <strong>${p.nome}</strong><br>
        <small style="color:#9A917F">${p.categoria}</small>
      </td>
      <td style="font-family:'Cormorant Garamond',serif;font-size:18px">${fmt(p.preco)}</td>
      <td>${p.badge ? `<span class="badge-tag">${p.badge}</span>` : '—'}</td>
      <td>
        <label class="sb-toggle">
          <input type="checkbox" ${p.ativo ? 'checked' : ''}
            onchange="toggleAtivo(${p.id}, this.checked)">
          <span class="sb-slider"></span>
        </label>
      </td>
      <td>
        <button onclick="abrirModalEdicao(${p.id})" class="btn-acao btn-editar" title="Editar">✏️</button>
        <button onclick="excluirProduto(${p.id})" class="btn-acao btn-excluir" title="Excluir">🗑️</button>
      </td>
    </tr>`
    )
    .join('');
}

async function salvarProduto(dados) {
  try {
    // Upload de imagem (capa) se houver arquivo
    let imageUrl = dados.imagem_url || null;
    if (dados._arquivo) {
      toast('Enviando imagem...', 'info');
      imageUrl = await sb.uploadImagem(dados._arquivo);
    }
    delete dados._arquivo;
    dados.imagem_url = imageUrl;

    // Upload das fotos extras (mantém a existente se não trocou)
    const arquivosExtra = dados._arquivosExtra || [null, null, null];
    delete dados._arquivosExtra;
    const imagens = [];
    for (let i = 0; i < 3; i++) {
      if (arquivosExtra[i]) {
        toast(`Enviando foto extra ${i + 1}...`, 'info');
        imagens.push(await sb.uploadImagem(arquivosExtra[i]));
      } else if (_extraUrls[i]) {
        imagens.push(_extraUrls[i]);
      }
    }
    dados.imagens = imagens;

    dados.atualizado_em = new Date().toISOString();

    if (modoEdicao) {
      await sb.patch(`produtos?id=eq.${modoEdicao}`, dados);
      toast('✅ Produto atualizado!');
    } else {
      await sb.post('produtos', dados);
      toast('✅ Produto criado!');
    }
    fecharModal();
    await carregarProdutos();
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'erro');
  }
}

async function excluirProduto(id) {
  // Tenta usar o modal de confirmação do admin existente
  const modal = document.getElementById('modal-excluir') ||
                document.getElementById('delete-modal');
  if (modal) {
    // Armazena o id para usar no botão de confirmação
    window._sbExcluirId = id;
    modal.classList.add('open');
    modal.style.display = 'flex';
    // Conecta o botão de confirmar do modal
    const btnConfirm = modal.querySelector('[data-confirm], .btn-confirmar, #btn-confirmar-excluir');
    if (btnConfirm) {
      btnConfirm.onclick = async () => {
        await _confirmarExclusao();
      };
    }
    return;
  }
  if (confirm('Excluir este produto? Esta ação não pode ser desfeita.')) {
    await _confirmarExclusao(id);
  }
}

async function _confirmarExclusao(id) {
  const _id = id || window._sbExcluirId;
  try {
    await sb.delete(`produtos?id=eq.${_id}`);
    toast('🗑️ Produto excluído');
    // Fecha modal se existir
    document.querySelectorAll('#modal-excluir, #delete-modal').forEach((m) => {
      m.classList.remove('open');
      m.style.display = 'none';
    });
    await carregarProdutos();
  } catch (e) {
    toast('Erro ao excluir: ' + e.message, 'erro');
  }
}

async function toggleAtivo(id, ativo) {
  try {
    await sb.patch(`produtos?id=eq.${id}`, { ativo });
    const p = produtos.find((x) => x.id === id);
    if (p) p.ativo = ativo;
    atualizarDashboard();
    toast(ativo ? '✅ Produto ativado' : 'Produto desativado');
  } catch (e) {
    toast('Erro: ' + e.message, 'erro');
    renderTabelaProdutos(); // reverte visual
  }
}

// ─── MODAL PRODUTO ────────────────────────────────────

function abrirModalCriacao() {
  modoEdicao = null;
  preencherModal(null);
  abrirModal();
}

function abrirModalEdicao(id) {
  modoEdicao = id;
  const p = produtos.find((x) => x.id === id);
  preencherModal(p);
  abrirModal();
}

function preencherModal(p) {
  setVal('input-nome',      p?.nome       || '');
  setVal('input-categoria', p?.categoria  || 'feminino');
  setVal('input-preco',     p?.preco      || '');
  setVal('input-emoji',     p?.emoji      || '👗');
  setVal('input-badge',     p?.badge      || '');
  setVal('input-descricao', p?.descricao  || '');

  const titulo = document.querySelector('#modal-produto .modal-titulo, #modal-produto h2, .form-titulo');
  if (titulo) titulo.textContent = p ? 'Editar Produto' : 'Novo Produto';

  const preview = document.getElementById('img-preview');
  if (preview) {
    preview.src = p?.imagem_url || '';
    preview.style.display = p?.imagem_url ? 'block' : 'none';
  }

  // Fotos extras (até 3)
  _extraUrls = [null, null, null];
  const imagens = Array.isArray(p?.imagens) ? p.imagens : [];
  for (let i = 1; i <= 3; i++) {
    const url = imagens[i - 1] || null;
    _extraUrls[i - 1] = url;
    const slotPreview = document.getElementById('img-preview-extra-' + i);
    const slot = document.getElementById('extra-slot-' + i);
    const fileInput = document.getElementById('img-file-extra-' + i);
    if (fileInput) fileInput.value = '';
    if (slotPreview) slotPreview.src = url || '';
    if (slot) slot.classList.toggle('has-img', !!url);
  }
  _extraFiles = [null, null, null];

  // Cores disponíveis (ou padrão)
  const cores = Array.isArray(p?.cores) && p.cores.length ? p.cores : ['#B8935A', '#7A6F62', '#18140F'];
  setVal('f-color-1', cores[0] || '#B8935A');
  setVal('f-color-2', cores[1] || '#7A6F62');
  setVal('f-color-3', cores[2] || '#18140F');

  // Tamanhos disponíveis (ou todos por padrão)
  const tamanhos = Array.isArray(p?.tamanhos) && p.tamanhos.length ? p.tamanhos : ['P', 'M', 'G'];
  ['P', 'M', 'G'].forEach((s) => {
    const el = document.getElementById('f-size-' + s);
    if (el) el.checked = tamanhos.includes(s);
    const label = document.getElementById('size-label-' + s);
    if (label) label.classList.toggle('checked', tamanhos.includes(s));
  });
}

function abrirModal() {
  const modal = document.getElementById('modal-produto') ||
                document.querySelector('.modal-produto, [data-modal="produto"]');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

function fecharModal() {
  document.querySelectorAll('#modal-produto, .modal-produto').forEach((m) => {
    m.classList.remove('open');
    m.style.display = 'none';
  });
  modoEdicao = null;
  _extraFiles = [null, null, null];
  _extraUrls  = [null, null, null];
}

function setVal(id, val) {
  const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
  if (el) el.value = val;
}
function getVal(id) {
  const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
  return el ? el.value.trim() : '';
}

function coletarDadosFormulario() {
  const nome      = getVal('input-nome');
  const categoria = getVal('input-categoria');
  const preco     = parseFloat(getVal('input-preco'));

  if (!nome || !categoria || isNaN(preco)) {
    toast('Preencha nome, categoria e preço', 'erro');
    return null;
  }

  const fileInput = document.getElementById('input-foto') || document.querySelector('input[type="file"]');
  const arquivo   = fileInput?.files?.[0] || null;

  // Cores disponíveis (3 seletores de cor)
  const cores = [
    document.getElementById('f-color-1')?.value || '#B8935A',
    document.getElementById('f-color-2')?.value || '#7A6F62',
    document.getElementById('f-color-3')?.value || '#18140F',
  ];

  // Tamanhos disponíveis (P/M/G) — se nenhum marcado, assume todos
  let tamanhos = ['P', 'M', 'G'].filter((s) => document.getElementById('f-size-' + s)?.checked);
  if (!tamanhos.length) tamanhos = ['P', 'M', 'G'];

  return {
    nome,
    categoria,
    preco,
    emoji:     getVal('input-emoji') || '👗',
    badge:     getVal('input-badge') || null,
    descricao: getVal('input-descricao') || null,
    ativo:     true,
    cores,
    tamanhos,
    _arquivo:  arquivo,
    _arquivosExtra: [1, 2, 3].map((i) => document.getElementById('img-file-extra-' + i)?.files?.[0] || null),
  };
}

// ─── CONFIG DO SITE ───────────────────────────────────

async function carregarConfig() {
  try {
    const rows = await sb.get('config_site?order=secao.asc');
    rows.forEach((r) => (configSite[r.secao] = r.valor));
    preencherFormConfig();
  } catch (e) {
    console.warn('Config não carregada:', e.message);
  }
}

function preencherFormConfig() {
  // Hero
  const h = configSite.hero || {};
  setVal('cfg-hero-tag',        h.tag           || '');
  setVal('cfg-hero-titulo1',    h.titulo1        || '');
  setVal('cfg-hero-destaque',   h.tituloDestaque || '');
  setVal('cfg-hero-titulo2',    h.titulo2        || '');
  setVal('cfg-hero-subtitulo',  h.subtitulo      || '');
  setVal('cfg-hero-btn',        h.btnTexto       || '');

  // Contato
  const c = configSite.contato || {};
  setVal('cfg-whatsapp',   c.whatsapp   || '');
  setVal('cfg-instagram',  c.instagram  || '');
  setVal('cfg-msg-wa',     c.mensagem_padrao || '');

  // Rodapé
  const r = configSite.rodape || {};
  setVal('cfg-rodape', r.texto || '');
}

async function salvarConfigHero() {
  const valor = {
    tag:            getVal('cfg-hero-tag'),
    titulo1:         getVal('cfg-hero-titulo1'),
    tituloDestaque:  getVal('cfg-hero-destaque'),
    titulo2:         getVal('cfg-hero-titulo2'),
    subtitulo:       getVal('cfg-hero-subtitulo'),
    btnTexto:        getVal('cfg-hero-btn'),
  };
  await upsertConfig('hero', valor);
}

async function salvarConfigContato() {
  const valor = {
    whatsapp:         getVal('cfg-whatsapp'),
    instagram:        getVal('cfg-instagram'),
    mensagem_padrao:  getVal('cfg-msg-wa'),
  };
  await upsertConfig('contato', valor);

  const rodape = { texto: getVal('cfg-rodape') };
  await upsertConfig('rodape', rodape);
}

async function salvarConfigBanner() {
  // Coleta dinamicamente os itens do banner
  const itens = [];
  document.querySelectorAll('.banner-item').forEach((row) => {
    const icone = row.querySelector('[name="banner-icone"]')?.value?.trim();
    const texto = row.querySelector('[name="banner-texto"]')?.value?.trim();
    if (icone && texto) itens.push({ icone, texto });
  });
  await upsertConfig('banner', { itens });
}

async function upsertConfig(secao, valor) {
  try {
    await sb.req('POST', `config_site?on_conflict=secao`, {
      secao,
      valor,
      atualizado_em: new Date().toISOString(),
    });
    // upsert via header Prefer
    await fetch(`${SB_URL}/rest/v1/config_site?secao=eq.${secao}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ valor, atualizado_em: new Date().toISOString() }),
    });
    configSite[secao] = valor;
    toast(`✅ "${secao}" salvo! O site será atualizado.`);
  } catch (e) {
    // Tenta insert se patch falhou (primeira vez)
    try {
      await fetch(`${SB_URL}/rest/v1/config_site`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ secao, valor, atualizado_em: new Date().toISOString() }),
      });
      configSite[secao] = valor;
      toast(`✅ "${secao}" salvo!`);
    } catch (e2) {
      toast('Erro ao salvar config: ' + e2.message, 'erro');
    }
  }
}

// ─── DASHBOARD ────────────────────────────────────────

function atualizarDashboard() {
  const total    = produtos.length;
  const ativos   = produtos.filter((p) => p.ativo).length;
  const cats     = new Set(produtos.map((p) => p.categoria)).size;
  const destaque = produtos.filter((p) => p.badge).length;
  const promo    = produtos.filter((p) => p.badge === 'Promoção').length;

  setStatEl('[data-stat="total"]',    total);
  setStatEl('[data-stat="categorias"]', cats);
  setStatEl('[data-stat="destaque"]', destaque);
  setStatEl('[data-stat="promo"]',    promo);
  setStatEl('[data-stat="ativos"]',   ativos);

  // Tenta atualizar os números visíveis no DOM do admin original
  const spans = document.querySelectorAll('.stat-number, .stat-val, [class*="count"]');
  if (spans[0]) spans[0].textContent = total;
  if (spans[1]) spans[1].textContent = cats;
  if (spans[2]) spans[2].textContent = destaque;
  if (spans[3]) spans[3].textContent = promo;
}

function setStatEl(selector, val) {
  const el = document.querySelector(selector);
  if (el) el.textContent = val;
}

// ─── CONECTA COM O DOM DO ADMIN ───────────────────────

function conectarDOM() {
  // Botão "Salvar Produto" no modal
  const btnSalvar =
    document.querySelector('#btn-salvar-produto, [data-action="salvar-produto"], .btn-salvar');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', async () => {
      const dados = coletarDadosFormulario();
      if (dados) await salvarProduto(dados);
    });
  }

  // Botão "Novo Produto" (qualquer variação)
  document.querySelectorAll(
    '#btn-novo-produto, [data-action="novo-produto"], .btn-novo, .add-product-btn'
  ).forEach((el) => {
    el.addEventListener('click', abrirModalCriacao);
  });

  // Fechar modal (X ou Cancelar)
  document.querySelectorAll(
    '#btn-fechar-modal, .btn-cancelar, .modal-close, [data-dismiss="modal"]'
  ).forEach((el) => {
    el.addEventListener('click', fecharModal);
  });

  // Preview de imagem no input file
  const inputFoto = document.getElementById('input-foto') || document.querySelector('input[type="file"]');
  if (inputFoto) {
    inputFoto.addEventListener('change', () => {
      const file    = inputFoto.files[0];
      const preview = document.getElementById('img-preview');
      if (file && preview) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
      }
    });
  }

  // Preview das 3 fotos extras
  for (let i = 1; i <= 3; i++) {
    const input = document.getElementById('img-file-extra-' + i);
    if (input) {
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        _extraFiles[i - 1] = file;
        const preview = document.getElementById('img-preview-extra-' + i);
        const slot    = document.getElementById('extra-slot-' + i);
        if (preview) preview.src = URL.createObjectURL(file);
        if (slot) slot.classList.add('has-img');
      });
    }
  }

  // Botões de remover foto extra
  document.querySelectorAll('.extra-photo-remove').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const slotEl = btn.closest('[id^="extra-slot-"]');
      if (!slotEl) return;
      const i = parseInt(slotEl.id.replace('extra-slot-', ''), 10);
      _extraFiles[i - 1] = null;
      _extraUrls[i - 1]  = null;
      const fileInput = document.getElementById('img-file-extra-' + i);
      const preview   = document.getElementById('img-preview-extra-' + i);
      if (fileInput) fileInput.value = '';
      if (preview) preview.src = '';
      slotEl.classList.remove('has-img');
    });
  });

  // Realce visual dos checkboxes de tamanho (P/M/G)
  ['P', 'M', 'G'].forEach((s) => {
    const chk = document.getElementById('f-size-' + s);
    if (chk) {
      chk.addEventListener('change', () => {
        const label = document.getElementById('size-label-' + s);
        if (label) label.classList.toggle('checked', chk.checked);
      });
    }
  });

  // Botões de salvar config
  const btnHero = document.querySelector('#btn-salvar-hero, [data-save="hero"]');
  if (btnHero) btnHero.addEventListener('click', salvarConfigHero);

  const btnContato = document.querySelector('#btn-salvar-contato, [data-save="contato"]');
  if (btnContato) btnContato.addEventListener('click', salvarConfigContato);

  const btnBanner = document.querySelector('#btn-salvar-banner, [data-save="banner"]');
  if (btnBanner) btnBanner.addEventListener('click', salvarConfigBanner);

  // Filtro de categoria
  const selectCat = document.querySelector('#filtro-categoria, select[name="filtro"]');
  if (selectCat) {
    selectCat.addEventListener('change', () =>
      renderTabelaProdutos(selectCat.value)
    );
  }

  // Botão de confirmar exclusão no modal
  const btnConfExcluir = document.querySelector(
    '#btn-confirmar-excluir, [data-confirm="excluir"]'
  );
  if (btnConfExcluir) {
    btnConfExcluir.addEventListener('click', () => _confirmarExclusao());
  }
}

// ─── ESTILOS MÍNIMOS ──────────────────────────────────
function injetarEstilos() {
  const style = document.createElement('style');
  style.textContent = `
    .sb-toggle{position:relative;width:40px;height:22px;cursor:pointer;display:inline-block}
    .sb-toggle input{opacity:0;width:0;height:0}
    .sb-slider{position:absolute;inset:0;background:#2A251D;border-radius:22px;transition:.2s;border:1px solid rgba(184,147,90,.25)}
    .sb-slider::before{content:'';position:absolute;width:16px;height:16px;background:#5A5347;border-radius:50%;top:2px;left:2px;transition:.2s}
    .sb-toggle input:checked + .sb-slider{background:#B8935A;border-color:#B8935A}
    .sb-toggle input:checked + .sb-slider::before{transform:translateX(18px);background:#fff}
    .btn-acao{background:transparent;border:1px solid rgba(184,147,90,.3);border-radius:5px;padding:5px 10px;cursor:pointer;font-size:14px;transition:all .2s}
    .btn-acao:hover{background:rgba(184,147,90,.15)}
    .badge-tag{background:rgba(184,147,90,.2);color:#B8935A;font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:3px 8px;border-radius:3px;font-weight:600}
  `;
  document.head.appendChild(style);
}

// ─── BOOT ─────────────────────────────────────────────
(function init() {
  injetarEstilos();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  async function boot() {
    conectarDOM();
    await Promise.all([carregarProdutos(), carregarConfig()]);
  }

  // Expõe funções globais para uso inline no HTML do admin
  Object.assign(window, {
    sbSalvarProduto:     async () => { const d = coletarDadosFormulario(); if (d) await salvarProduto(d); },
    sbNovoProduto:       abrirModalCriacao,
    sbEditarProduto:     abrirModalEdicao,
    sbExcluirProduto:    excluirProduto,
    sbToggleAtivo:       toggleAtivo,
    sbFecharModal:       fecharModal,
    sbSalvarHero:        salvarConfigHero,
    sbSalvarContato:     salvarConfigContato,
    sbSalvarBanner:      salvarConfigBanner,
    confirmarExclusao:   _confirmarExclusao,
  });
})();
