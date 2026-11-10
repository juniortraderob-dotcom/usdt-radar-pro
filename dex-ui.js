(() => {
  const $ = id => document.getElementById(id);

  const DEX = 'LlamaSwap';
  // Ajuste calculado a partir dos prints enviados:
  // 5,6075 / 5,5989 = aproximadamente 1,001536.
  // Recalibrar se a diferença entre as fontes mudar.
  const DEX_PRICE_CORRECTION = 1.001536;

  const CEX = [
    'Binance',
    'OKX',
    'Bybit',
    'Bitget',
    'MEXC',
    'KuCoin',
    'Foxbit'
  ];

  let opportunities = [];
  let busy = false;

  const money = n => Number(n).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const price = n => Number(n).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });

  const safe = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

  const capital = () =>
    Math.max(0, Number($('capital')?.value) || 0);

  function calculate(quotes, data) {
    const d = data?.directions;
    if (!d) return [];

    // Cotação de venda de USDT na DEX:
    // quantidade de BRLA/BRZ recebida por USDT enviado.
    const rawDexPrice = d.usdtToToken?.status === 'OK'
      ? Number(d.usdtToToken.buyAmount) /
        Number(d.usdtToToken.sellAmount)
      : 0;

    if (!(rawDexPrice > 0) || !Number.isFinite(rawDexPrice)) {
      return [];
    }

    // Correção simples para aproximar a cotação exibida no LlamaSwap.
    // Não representa impacto, slippage, gas ou taxas.
    const dexSellPrice = rawDexPrice * DEX_PRICE_CORRECTION;

    const out = [];

    for (const q of quotes) {
      if (!CEX.includes(q.exchange)) continue;

      const ask = Number(q.ask);
      if (!(ask > 0) || !Number.isFinite(ask)) continue;

      // Somente esta rota: comprar USDT na CEX e vender na LlamaSwap.
      out.push({
        buy: q.exchange,
        sell: DEX,
        buyPrice: ask,
        sellPrice: dexSellPrice,
        rawDexPrice,
        correction: DEX_PRICE_CORRECTION,
        spread: (dexSellPrice - ask) / ask * 100,
        route: 'CEX → LlamaSwap'
      });
    }

    return out.sort((x, y) => y.spread - x.spread);
  }

  function render() {
    const box = $('dexRows');
    if (!box) return;

    const bf = $('dexBuyFilter')?.value || 'all';
    const sf = $('dexSellFilter')?.value || 'all';

    let rows = opportunities.filter(x =>
      (bf === 'all' || x.buy === bf) &&
      (sf === 'all' || x.sell === sf)
    );

    // Visão geral: somente oportunidades positivas.
    if (bf === 'all' && sf === 'all') {
      rows = rows.filter(x => x.spread > 0);
    }

    if (!rows.length) {
      box.innerHTML =
        '<p class="empty-results">Nenhuma oportunidade positiva disponível.</p>';

      if ($('dexBest')) {
        $('dexBest').textContent = '—';
        $('dexBest').className = 'neutral';
      }
      if ($('dexProfit')) $('dexProfit').textContent = 'Aguardando oportunidade';
      if ($('dexRoute')) $('dexRoute').textContent = 'Sem combinação disponível';
      return;
    }

    const cap = capital();
    const best = rows[0];
    const gain = cap * best.spread / 100;
    const cls = best.spread > 0 ? 'positive' : 'negative';
    const sign = best.spread > 0 ? '+' : '';

    if ($('dexBest')) {
      $('dexBest').textContent = sign + best.spread.toFixed(3) + '%';
      $('dexBest').className = cls;
    }
    if ($('dexProfit')) {
      $('dexProfit').textContent = 'Lucro bruto estimado: ' + money(gain);
    }
    if ($('dexRoute')) {
      $('dexRoute').textContent = best.buy + ' → ' + DEX;
    }

    box.innerHTML = rows.map(x => {
      const g = cap * x.spread / 100;
      const c = x.spread > 0 ? 'positive' : 'negative';

      return `
        <article class="opportunity-card">
          <div class="exchange-comparison">
            <div class="exchange-side buy-side">
              <small>COMPRAR USDT</small>
              <strong>${safe(x.buy)}</strong>
              <span>Preço: ${price(x.buyPrice)}</span>
            </div>

            <div class="exchange-arrow">→</div>

            <div class="exchange-side sell-side">
              <small>VENDER USDT</small>
              <strong>${DEX}</strong>
              <span>Preço: ${price(x.sellPrice)}</span>
            </div>
          </div>

          <div class="opportunity-details">
            <span>Rota: <b>CEX → LlamaSwap</b></span>
            <span>
              Spread:
              <b class="${c}">${x.spread > 0 ? '+' : ''}${x.spread.toFixed(3)}%</b>
            </span>
            <span>
              Lucro bruto estimado:
              <b class="${c}">${money(g)}</b>
            </span>
          </div>
        </article>
      `;
    }).join('');
  }

  async function refresh() {
    if (busy) return;
    busy = true;

    const status = $('dexStatus');

    try {
      if (status) status.textContent = 'Consultando preços...';

      const pair = $('dexPair').value;
      const cap = capital();

      // Mantém a consulta das corretoras como estava.
      const cr = await fetch('/api/markets?pair=USDT%2FBRL', {
        cache: 'no-store'
      });

      if (!cr.ok) {
        throw Error('Erro na consulta CEX: HTTP ' + cr.status);
      }

      const cd = await cr.json();
      const quotes = cd.quotes || [];
      const validQuotes = quotes.filter(q =>
        Number(q.ask) > 0 && Number(q.bid) > 0
      );

      if (!validQuotes.length) {
        throw Error('Nenhuma cotação CEX válida.');
      }

      const avg = validQuotes.reduce((sum, q) =>
        sum + (Number(q.ask) + Number(q.bid)) / 2, 0
      ) / validQuotes.length;

      const reverseAmount = cap > 0 && avg > 0
        ? (cap / avg).toFixed(6)
        : '1.000000';

      const params = new URLSearchParams({
        pair,
        capital: String(cap > 0 ? cap : 1),
        reverseCapital: reverseAmount
      });

      // Mantém a chamada ao endpoint DEX existente.
      const dr = await fetch('/api/dex?' + params.toString(), {
        cache: 'no-store'
      });

      const dd = await dr.json();
      if (!dr.ok) {
        throw Error(dd.error || 'Erro na consulta DEX: HTTP ' + dr.status);
      }
      if (!dd.directions) {
        throw Error(dd.error || 'Resposta DEX inválida.');
      }

      opportunities = calculate(validQuotes, dd);
      render();

      if (status) {
        status.textContent = dd.status === 'OK'
          ? 'Cotação recebida · Polygon · CEX → LlamaSwap'
          : 'Cotação parcial · confira a direção USDT → token';
      }
    } catch (e) {
      console.error('Erro DEX:', e);
      opportunities = [];
      render();
      if (status) status.textContent = e.message;
    } finally {
      busy = false;
    }
  }

  function init() {
    if (!$('dexRows')) return;

    $('dexPair')?.addEventListener('change', refresh);
    $('dexBuyFilter')?.addEventListener('change', render);
    $('dexSellFilter')?.addEventListener('change', render);
    $('capital')?.addEventListener('input', render);

    // Se o filtro tiver a opção LlamaSwap, deixa-a selecionada.
    const sellFilter = $('dexSellFilter');
    if (sellFilter && [...sellFilter.options].some(o => o.value === DEX)) {
      sellFilter.value = DEX;
    }

    refresh();
    setInterval(refresh, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
