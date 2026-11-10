
(() => {
  const $ = id => document.getElementById(id);

  const DEX = 'LlamaSwap';

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

    // Preço para comprar USDT na DEX
    const a = d.tokenToUsdt?.status === 'OK'
      ? Number(d.tokenToUsdt.sellAmount) /
        Number(d.tokenToUsdt.buyAmount)
      : 0;

    // Preço para vender USDT na DEX
    const b = d.usdtToToken?.status === 'OK'
      ? Number(d.usdtToToken.buyAmount) /
        Number(d.usdtToToken.sellAmount)
      : 0;

    if (
      !(a > 0) ||
      !(b > 0) ||
      !Number.isFinite(a) ||
      !Number.isFinite(b)
    ) {
      return [];
    }

    const out = [];

    for (const q of quotes) {
      if (!CEX.includes(q.exchange)) continue;

      const ask = Number(q.ask);
      const bid = Number(q.bid);

      if (!(ask > 0) || !(bid > 0)) continue;

      // Comprar na CEX e vender na LlamaSwap
      out.push({
        buy: q.exchange,
        sell: DEX,
        buyPrice: ask,
        sellPrice: b,
        spread: (b - ask) / ask * 100,
        route: 'CEX → LlamaSwap'
      });

      // Comprar na LlamaSwap e vender na CEX
      out.push({
        buy: DEX,
        sell: q.exchange,
        buyPrice: a,
        sellPrice: bid,
        spread: (bid - a) / a * 100,
        route: 'LlamaSwap → CEX'
      });
    }

    return out.sort((x, y) => y.spread - x.spread);
  }

  function render() {
    const box = $('dexRows');

    if (!box) return;

    const bf = $('dexBuyFilter').value;
    const sf = $('dexSellFilter').value;

    let rows = opportunities.filter(x =>
      (bf === 'all' || x.buy === bf) &&
      (sf === 'all' || x.sell === sf)
    );

    // Exibe somente spreads positivos na visualização geral
    if (bf === 'all' && sf === 'all') {
      rows = rows.filter(x => x.spread > 0);
    }

    if (!rows.length) {
      box.innerHTML =
        '<p class="empty-results">Nenhuma oportunidade positiva disponível.</p>';

      $('dexBest').textContent = '—';
      $('dexBest').className = 'neutral';
      $('dexProfit').textContent = 'Aguardando oportunidade';
      $('dexRoute').textContent = 'Sem combinação disponível';

      return;
    }

    const cap = capital();
    const best = rows[0];
    const gain = cap * best.spread / 100;

    const cls = best.spread > 0 ? 'positive' : 'negative';
    const sign = best.spread > 0 ? '+' : '';

    $('dexBest').textContent =
      sign + best.spread.toFixed(3) + '%';

    $('dexBest').className = cls;

    $('dexProfit').textContent =
      'Lucro bruto estimado: ' + money(gain);

    $('dexRoute').textContent =
      best.buy + ' → ' + best.sell;

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
              <strong>${safe(x.sell)}</strong>
              <span>Preço: ${price(x.sellPrice)}</span>
            </div>

          </div>

          <div class="opportunity-details">

            <span>
              Rota: <b>${x.route}</b>
            </span>

            <span>
              Spread:
              <b class="${c}">
                ${x.spread > 0 ? '+' : ''}${x.spread.toFixed(3)}%
              </b>
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
      status.textContent = 'Consultando preços...';

      const pair = $('dexPair').value;
      const cap = capital();

      // Consulta as cotações das corretoras
      const cr = await fetch(
        '/api/markets?pair=USDT%2FBRL',
        { cache: 'no-store' }
      );

      if (!cr.ok) {
        throw Error('Erro na consulta CEX: HTTP ' + cr.status);
      }

      const cd = await cr.json();
      const quotes = cd.quotes || [];

      if (!quotes.length) {
        throw Error('Sem cotações CEX disponíveis.');
      }

      const validQuotes = quotes.filter(q =>
        Number(q.ask) > 0 && Number(q.bid) > 0
      );

      if (!validQuotes.length) {
        throw Error('Nenhuma cotação CEX válida.');
      }

      const avg = validQuotes.reduce(
        (s, q) => s + (
          Number(q.ask) + Number(q.bid)
        ) / 2,
        0
      ) / validQuotes.length;

      // Calcula a quantidade de USDT com exatamente 6 casas
      const reverseAmount =
        cap > 0 && avg > 0
          ? (cap / avg).toFixed(6)
          : '1.000000';

      const params = new URLSearchParams({
        pair,
        capital: String(cap > 0 ? cap : 1),
        reverseCapital: reverseAmount
      });

      // Consulta a fonte DEX configurada no backend
      const dr = await fetch(
        '/api/dex?' + params.toString(),
        { cache: 'no-store' }
      );

      const dd = await dr.json();

      if (!dr.ok) {
        throw Error(
          dd.error || 'Erro na consulta DEX: HTTP ' + dr.status
        );
      }

      if (!dd.directions) {
        throw Error(dd.error || 'Resposta DEX inválida.');
      }

      opportunities = calculate(validQuotes, dd);

      render();

      status.textContent =
        dd.status === 'OK'
          ? 'Cotação recebida · Polygon'
          : 'Cotação parcial · confira as direções';

    } catch (e) {
      console.error('Erro DEX:', e);

      opportunities = [];
      render();

      status.textContent = e.message;

    } finally {
      busy = false;
    }
  }

  function init() {
    if (!$('dexRows')) return;

    $('dexPair').addEventListener('change', refresh);
    $('dexBuyFilter').addEventListener('change', render);
    $('dexSellFilter').addEventListener('change', render);
    $('capital').addEventListener('input', render);

    refresh();

    setInterval(refresh, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );
  } else {
    init();
  }

})();
