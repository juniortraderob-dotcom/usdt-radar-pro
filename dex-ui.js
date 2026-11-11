(() => {
  const $ = id => document.getElementById(id);

  const DEX = 'LlamaSwap';
  const DEX_PRICE_CORRECTION = 1.001536;

  const CEX = ['Binance', 'OKX', 'Bybit', 'Bitget', 'MEXC', 'KuCoin', 'Foxbit'];

  let opportunities = [];
  let busy = false;
  // Guarda as rotas que já estão negativas para evitar alertas repetidos a cada 20s.
  let lastNegativeDexAlerts = new Set();

  const money = n => Number(n).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  const price = n => Number(n).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 4, maximumFractionDigits: 4
  });

  const quantity = n => Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 4, maximumFractionDigits: 4
  });

  const safe = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);

  const capital = () => Math.max(0, Number($('capital')?.value) || 0);

  function configureFilters() {
    const buyFilter = $('dexBuyFilter');
    const sellFilter = $('dexSellFilter');

    if (buyFilter) {
      const selected = CEX.includes(buyFilter.value) ? buyFilter.value : 'all';
      buyFilter.innerHTML =
        '<option value="all">Todas as corretoras CEX</option>' +
        CEX.map(name => `<option value="${safe(name)}">${safe(name)}</option>`).join('');
      buyFilter.value = selected;
    }

    if (sellFilter) {
      sellFilter.innerHTML = `<option value="${DEX}">${DEX}</option>`;
      sellFilter.value = DEX;
      sellFilter.disabled = true;
    }
  }

  function calculate(quotes, data) {
    const d = data?.directions;
    if (!d) return [];

    const rawDexPrice = d.usdtToToken?.status === 'OK'
      ? Number(d.usdtToToken.buyAmount) / Number(d.usdtToToken.sellAmount)
      : 0;

    if (!(rawDexPrice > 0) || !Number.isFinite(rawDexPrice)) return [];

    const dexSellPrice = rawDexPrice * DEX_PRICE_CORRECTION;
    const out = [];

    for (const q of quotes) {
      if (!CEX.includes(q.exchange)) continue;

      const ask = Number(q.ask);
      if (!(ask > 0) || !Number.isFinite(ask)) continue;

      out.push({
        buy: q.exchange,
        sell: DEX,
        buyPrice: ask,
        sellPrice: dexSellPrice,
        spread: (dexSellPrice - ask) / ask * 100,
        route: 'CEX → LlamaSwap'
      });
    }

    return out.sort((x, y) => y.spread - x.spread);
  }

  // ALERTA NEGATIVO EXCLUSIVO DO DEX.
  // Reaproveita sendTelegramAlert() já definido no app.js.
  
// ALERTA NEGATIVO DEX — LIMITE DE -0,45%
async function checkNegativeDexAlerts(items) {
  const ALERT_THRESHOLD = -0.45;

  // Só considera spreads iguais ou piores que -0,45%.
  const negative = items.filter(x => x.spread <= ALERT_THRESHOLD);

  const currentKeys = new Set(
    negative.map(x => `${x.buy}|${x.sell}`)
  );

  // Evita repetir alerta a cada atualização de 20 segundos.
  const newlyNegative = negative.filter(x =>
    !lastNegativeDexAlerts.has(`${x.buy}|${x.sell}`)
  );

  if (!newlyNegative.length) {
    lastNegativeDexAlerts = currentKeys;
    return;
  }

  if (typeof window.sendTelegramAlert !== 'function') {
    console.warn('Telegram não disponível.');
    return;
  }

  // Converte letras e números para caracteres Unicode em negrito.
  const bold = text => String(text).replace(/[A-Za-z0-9]/g, c => {
    const normal = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const strong = '𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗';
    return strong[normal.indexOf(c)] || c;
  });

  const cap = capital();
  const pair = $('dexPair')?.value || 'USDT/BRLA';

  const sections = newlyNegative.map(x => {
    const estimatedUsdt = cap > 0 ? cap / x.buyPrice : 0;
    const estimatedLoss = Math.abs(cap * x.spread / 100);

    return [
      `🔻 ${bold(x.buy + ' → LlamaSwap')}`,
      `━━━━━━━━━━━━━━━━━━`,
      `🟠 ${bold('Spread negativo:')} ${bold(x.spread.toFixed(3) + '%')}`,
      `🛒 ${bold('Compra CEX:')} ${price(x.buyPrice)}`,
      `🔄 ${bold('Venda LlamaSwap:')} ${price(x.sellPrice)}`,
      `💰 ${bold('Quantidade:')} ${quantity(estimatedUsdt)} USDT`,
      `📉 ${bold('Resultado bruto:')} -${money(estimatedLoss)}`
    ].join('\n');
  });

  const message = [
    `🚨 ${bold('ALERTA DEX — SPREAD NEGATIVO')}`,
    `━━━━━━━━━━━━━━━━━━`,
    `📊 ${bold('Par:')} ${pair}`,
    `💵 ${bold('Capital:')} ${money(cap)}`,
    `🎯 ${bold('Limite de alerta:')} -0,450%`,
    ``,
    sections.join('\n\n'),
    ``,
    `⚠️ ${bold('ATENÇÃO:')} Cotação indicativa. Confira o preço e o impacto antes de operar.`,
    `━━━━━━━━━━━━━━━━━━`
  ].join('\n');

  try {
    const sent = await window.sendTelegramAlert(message);

    if (sent) {
      lastNegativeDexAlerts = currentKeys;
    } else {
      console.error('O Telegram não confirmou o envio do alerta DEX.');
    }
  } catch (error) {
    console.error('Falha no alerta negativo DEX:', error);
  }
}


  function render() {
    const box = $('dexRows');
    if (!box) return;

    const bf = $('dexBuyFilter')?.value || 'all';
    const filteredRows = opportunities.filter(x => bf === 'all' || x.buy === bf);
const rows = filteredRows.length ? [filteredRows[0]] : [];

    if (!rows.length) {
      box.innerHTML = '<p class="empty-results">Nenhuma oportunidade positiva disponível.</p>';
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
    if ($('dexProfit')) $('dexProfit').textContent = 'Lucro bruto estimado: ' + money(gain);
    if ($('dexRoute')) $('dexRoute').textContent = best.buy + ' → ' + DEX;

    box.innerHTML = rows.map(x => {
      const g = cap * x.spread / 100;
      const estimated = cap > 0 ? cap / x.buyPrice : 0;
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
            <span>Quantidade estimada: <b>${quantity(estimated)} USDT</b></span>
            <span>Spread: <b class="${c}">${x.spread > 0 ? '+' : ''}${x.spread.toFixed(3)}%</b></span>
            <span>Lucro bruto estimado: <b class="${c}">${money(g)}</b></span>
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

      const pair = $('dexPair')?.value || 'USDT/BRLA';
      const cap = capital();

      const cr = await fetch('/api/markets?pair=USDT%2FBRL', { cache: 'no-store' });
      if (!cr.ok) throw Error('Erro na consulta CEX: HTTP ' + cr.status);

      const cd = await cr.json();
      const quotes = cd.quotes || [];
      const validQuotes = quotes.filter(q =>
        CEX.includes(q.exchange) && Number(q.ask) > 0 && Number(q.bid) > 0
      );
      if (!validQuotes.length) throw Error('Nenhuma cotação CEX válida.');

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

      const dr = await fetch('/api/dex?' + params.toString(), { cache: 'no-store' });
      const dd = await dr.json();
      if (!dr.ok) throw Error(dd.error || 'Erro na consulta DEX: HTTP ' + dr.status);
      if (!dd.directions) throw Error(dd.error || 'Resposta DEX inválida.');

      opportunities = calculate(validQuotes, dd);

      // Somente este módulo dispara alertas negativos no Telegram.
      await checkNegativeDexAlerts(opportunities);

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

    configureFilters();
    $('dexPair')?.addEventListener('change', () => {
      lastNegativeDexAlerts = new Set();
      refresh();
    });
    $('dexBuyFilter')?.addEventListener('change', render);
    $('capital')?.addEventListener('input', render);

    refresh();
    setInterval(refresh, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
