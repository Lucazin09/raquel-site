/**
 * raquel-site-supabase.js
 * ─────────────────────────────────────────────────────
 * Integração do site principal com o Supabase.
 * Substitui os dados estáticos do index.html pelos dados
 * salvos pelo painel admin.
 *
 * Como usar:
 *   1. Cole SUPABASE_URL e SUPABASE_ANON_KEY abaixo
 *   2. Adicione <script src="raquel-site-supabase.js"></script>
 *      ANTES do </body> do index.html principal
 * ─────────────────────────────────────────────────────
 */

const SUPABASE_URL  = 'https://olqzjhedbpfsalygokvj.supabase.co/rest/v1/'; // ← PREENCHA
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9scXpqaGVkYnBmc2FseWdva3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDYwNDcsImV4cCI6MjA5NTkyMjA0N30.oATC-TO15G4eBRysyLXEmOd43XjbFQiO2vXuiN6qPDU';                // ← PREENCHA

// ─── Cliente Supabase leve (sem npm) ─────────────────
const supabase = {
  async select(tabela, filtros = '') {
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?${filtros}&order=id.asc`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
    });
    if (!r.ok) throw new Error(`Supabase error ${r.status}`);
    return r.json();
  },
};

// ─── Helpers ──────────────────────────────────────────
const fmt = (p) =>
  'R$ ' + parseFloat(p).toFixed(2).replace('.', ',');

const catBg = (c) =>
  c === 'feminino' ? '#FDF0F5' : c === 'masculino' ? '#F0F4FD' : '#F5FDF0';

// ─── Carrega e injeta produtos ────────────────────────
async function carregarProdutos() {
  try {
    const produtos = await supabase.select('produtos', 'ativo=eq.true');
    if (!produtos || !produtos.length) return;

    // Sobrescreve o array global `products` usado pelo site
    window.products = produtos.map((p) => ({
      id:    p.id,
      name:  p.nome,
      cat:   p.categoria,
      price: parseFloat(p.preco),
      icon:  p.emoji || '👗',
      badge: p.badge || '',
      imageUrl: p.imagem_url || '',
    }));

    // Re-renderiza carousel e grid de produtos
    if (typeof buildCarousel === 'function') buildCarousel();
    if (typeof renderProducts === 'function') renderProducts();

    console.log(`✅ ${produtos.length} produtos carregados do Supabase`);
  } catch (e) {
    console.warn('⚠️ Não foi possível carregar produtos do Supabase:', e.message);
    // Mantém os dados estáticos do HTML em caso de falha
  }
}

// ─── Carrega e injeta config do site ─────────────────
async function carregarConfig() {
  try {
    const configs = await supabase.select('config_site');
    const cfg = {};
    configs.forEach((row) => (cfg[row.secao] = row.valor));

    // ── Hero ──────────────────────────────────────────
    if (cfg.hero) {
      const h = cfg.hero;
      const tag = document.querySelector('.hero-tag');
      const h1  = document.querySelector('.hero h1');
      const sub = document.querySelector('.hero-sub');
      const btn = document.querySelector('.hero-btn');

      if (tag && h.tag) tag.textContent = h.tag;
      if (h1 && h.titulo1) {
        h1.innerHTML = `${h.titulo1} <em>${h.tituloDestaque || ''}</em>${h.titulo2 ? '<br>' + h.titulo2 : ''}`;
      }
      if (sub && h.subtitulo) sub.textContent = h.subtitulo;
      if (btn && h.btnTexto) btn.textContent = h.btnTexto;
    }

    // ── Banner strip ──────────────────────────────────
    if (cfg.banner && cfg.banner.itens) {
      const strip = document.querySelector('.banner-strip');
      if (strip) {
        strip.innerHTML = cfg.banner.itens
          .map(
            (item) =>
              `<span class="strip-item">
                <i class="ti ${item.icone}"></i>${item.texto}
              </span>`
          )
          .join('');
      }
    }

    // ── WhatsApp / Social ─────────────────────────────
    if (cfg.contato) {
      const c = cfg.contato;
      const waNum = c.whatsapp || '5585999999999';
      const waMsg = encodeURIComponent(c.mensagem_padrao || 'Olá!');
      const waUrl = `https://wa.me/${waNum}?text=${waMsg}`;

      // Botão flutuante WhatsApp
      document.querySelectorAll('a.social-btn.whatsapp').forEach((el) => {
        el.href = waUrl;
      });

      // Botão "Pedir pelo WhatsApp" no carrinho (monkey-patch)
      window._raquel_wa = { num: waNum, msg: c.mensagem_padrao };

      // Instagram
      if (c.instagram) {
        document.querySelectorAll('a.social-btn.instagram').forEach((el) => {
          el.href = c.instagram;
        });
      }
    }

    // ── Rodapé ────────────────────────────────────────
    if (cfg.rodape && cfg.rodape.texto) {
      const copy = document.querySelector('.footer-copy');
      if (copy) copy.textContent = cfg.rodape.texto;
    }

    console.log('✅ Config do site carregada do Supabase');
  } catch (e) {
    console.warn('⚠️ Não foi possível carregar config do Supabase:', e.message);
  }
}

// ─── Patch do sendWhatsApp para usar config dinâmica ──
function patchWhatsApp() {
  const original = window.sendWhatsApp;
  window.sendWhatsApp = function () {
    const wa  = window._raquel_wa || {};
    const num = wa.num || '5585999999999';
    const msg = wa.msg || 'Olá! Gostaria de fazer um pedido:';
    const itens = (window.cart || [])
      .map((i) => `${i.qty}x ${i.name}`)
      .join('\n');
    window.open(
      `https://wa.me/${num}?text=${encodeURIComponent(msg + '\n\n' + itens)}`,
      '_blank'
    );
  };
}

// ─── Boot ─────────────────────────────────────────────
(async function init() {
  // Aguarda o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  async function boot() {
    await Promise.all([carregarProdutos(), carregarConfig()]);
    patchWhatsApp();
  }
})();
