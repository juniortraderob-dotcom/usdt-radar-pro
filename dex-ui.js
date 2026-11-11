(() => {
  const $ = id => document.getElementById(id);

  const DEX = 'LlamaSwap';
  const DEX_PRICE_CORRECTION = 1.001536;
  const ALERT_THRESHOLD = -0.45; // Alerta em -0,45% ou pior.

  const CEX = ['Binance', 'OKX', 'Bybit', 'Bitget', 'MEXC', 'KuCoin', 'Foxbit'];

  let opportunities = [];
  let busy = false;
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

  // Negrito Unicode para manter o destaque mesmo em mensagens de texto simples.
  function bold(text) {
    const normal = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const strong = '𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗';
    return String(text).replace(/[A-Za-z0-9]/g, char => {
      const index = normal.indexOf(char);
      return index >= 0 ? strong[index] : char;
    });
  }

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
    const directions = data?.directions;
    if (!directions) return [];

    const rawDexPrice = directions.usdtToToken?.status === 'OK'
      ? Number(directions.usdtToToken.buyAmount) / Number(directions.usdtToToken.sellAmount)
      : 0;

    if (!(rawDexPrice > 0) || !Number.isFinite(rawDexPrice)) return [];

    const dexSellPrice = rawDexPrice * DEX_PRICE_CORRECTION;
    const result = [];

    for (const quote of quotes) {
      if (!CEX.includes(quote.exchange)) continue;

      const ask = Number(quote.ask);
      if (!(ask > 0) || !Number.isFinite(ask)) continue;

      result.push({
        buy: quote.exchange,
        sell: DEX,
        buyPrice: ask,
        sellPrice: dexSellPrice,
        spread: ((dexSellPrice - ask) / ask) * 100,
        route: 'CEX → LlamaSwap'
      });
    }

    return result.sort((a, b) => b.spread - a.spread);
  }

  // Alerta negativo exclusivo da DEX. Reaproveita sendTelegramAlert() do app.js.
  async function checkNegativeDexAlerts(items) {
    const negative = items.filter(item => item.spread <= ALERT_THRESHOLD);
    const currentKeys = new Set(negative.map(item => `${item.buy}|${item.sell}`));

    const newlyNegative = negative.filter(item =>
      !lastNegativeDexAlerts.has(`${item.buy}|${item.sell}`)
    );

    if (!newlyNegative.length) {
      lastNegativeDexAlerts = currentKeys;
      return;
    }

    if (typeof window.sendTelegramAlert !== 'function') {
      console.warn('Telegram não disponível: sendTelegramAlert() não foi encontrada.');
      return;
    }

    const cap = capital();
    const pair = $('dexPair')?.value || 'USDT/BRLA';

    const sections = newlyNegative.map(item => {
      const estimatedUsdt = cap > 0 && item.buyPrice > 0 ? cap / item.buyPrice : 0;
      const estimatedLoss = Math.abs(cap * item.spread / 100);

      return [
        `🔻 ${bold(item.buy + ' → LlamaSwap')}`,
        '━━━━━━━━━━━━━━━━━━',
        `📉 ${bold('Spread negativo:')} ${bold(item.spread.toFixed(3) + '%')}`,
        `🛒 ${bold('Compra na CEX:')} ${price(item.buyPrice)}`,
        `🔄 ${bold('Venda na DEX:')} ${price(item.sellPrice)}`,
        `🪙 ${bold('Quantidade estimada:')} ${quantity(estimatedUsdt)} USDT`,
        `💸 ${bold('Prejuízo bruto estimado:')} -${money(estimatedLoss)}`
      ].join('\n');
    });

    const message = [
      `🚨 ${bold('ALERTA DEX — SPREAD NEGATIVO')}`,
      '━━━━━━━━━━━━━━━━━━',
      `📊 ${bold('Par monitorado:')} ${pair}`,
      `💰 ${bold('Capital de referência:')} ${money(cap)}`,
      `🎯 ${bold('Gatilho do alerta:')} -0,450% ou menor`,
      '',
      sections.join('\n\n'),
      '',
      `⚠️ ${bold('Atenção:')} cotação indicativa. Confira liquidez, impacto, taxas e limites antes de operar.`,
      '━━━━━━━━━━━━━━━━━━'
    ].join('\n');

    try {
      const sent = await window.sendTelegramAlert(message);
      if (sent) {
        lastNegativeDexAlerts = currentKeys;
      } else {
        console.error('O Telegram não confirmou o envio do alerta negativo DEX.');
      }
    } catch (error) {
      console.error('Falha no alerta negativo DEX:', error);
    }
  }

  function render() {
    const box = $('dexRows');
    if (!box) return;

    const buyFilter = $('dexBuyFilter')?.value || 'all';
    const filteredRows = opportunities.filter(item =>
      buyFilter === 'all' || item.buy === buyFilter
    );
    const rows = filteredRows.length ? [filteredRows[0]] : [];

    if (!rows.length) {
      box.innerHTML = '<p class="empty-results">Nenhuma oportunidade disponível para este filtro.</p>';

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
      $('dexProfit').textContent =
        (best.spread >= 0 ? 'Lucro bruto estimado: ' : 'Resultado bruto estimado: ') + money(gain);
    }
    if ($('dexRoute')) $('dexRoute').textContent = best.buy + ' → ' + DEX;

    box.innerHTML = rows.map(item => {
      const result = cap * item.spread / 100;
      const estimatedUsdt = cap > 0 ? cap / item.buyPrice : 0;
      const itemClass = item.spread > 0 ? 'positive' : 'negative';
      const spreadSign = item.spread > 0 ? '+' : '';

      return `
        <article class="opportunity-card">
          <div class="exchange-comparison">
            <div class="exchange-side buy-side">
              <small>COMPRAR USDT</small>
              <strong>${safe(item.buy)}</strong>
              <span>Preço: ${price(item.buyPrice)}</span>
            </div>
            <div class="exchange-arrow">→</div>
            <div class="exchange-side sell-side">
              <small>VENDER USDT</small>
              <strong>${DEX}</strong>
              <span>Preço: ${price(item.sellPrice)}</span>
            </div>
          </div>
          <div class="opportunity-details">
            <span>Rota: <b>CEX → LlamaSwap</b></span>
            <span>Quantidade estimada: <b>${quantity(estimatedUsdt)} USDT</b></span>
            <span>Spread: <b class="${itemClass}">${spreadSign}${item.spread.toFixed(3)}%</b></span>
            <span>Resultado bruto estimado: <b class="${itemClass}">${money(result)}</b></span>
          </div>
          <div class="exchange-buttons">
            <a class="exchange-link" href="https://swap.defillama.com/" target="_blank" rel="noopener noreferrer">
              Abrir LlamaSwap ↗
            </a>
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

      const cexResponse = await fetch('/api/markets?pair=USDT%2FBRL', {
        cache: 'no-store'
      });
      if (!cexResponse.ok) {
        throw new Error('Erro na consulta CEX: HTTP ' + cexResponse.status);
      }

      const cexData = await cexResponse.json();
      const quotes = cexData.quotes || [];
      const validQuotes = quotes.filter(quote =>
        CEX.includes(quote.exchange) &&
        Number(quote.ask) > 0 &&
        Number(quote.bid) > 0
      );

      if (!validQuotes.length) throw new Error('Nenhuma cotação CEX válida.');

      const average = validQuotes.reduce((sum, quote) =>
        sum + (Number(quote.ask) + Number(quote.bid)) / 2, 0
      ) / validQuotes.length;

      const reverseAmount = cap > 0 && average > 0
        ? (cap / average).toFixed(6)
        : '1.000000';

      const params = new URLSearchParams({
        pair,
        capital: String(cap > 0 ? cap : 1),
        reverseCapital: reverseAmount
      });

      const dexResponse = await fetch('/api/dex?' + params.toString(), {
        cache: 'no-store'
      });
      const dexData = await dexResponse.json();

      if (!dexResponse.ok) {
        throw new Error(dexData.error || 'Erro na consulta DEX: HTTP ' + dexResponse.status);
      }
      if (!dexData.directions) {
        throw new Error(dexData.error || 'Resposta DEX inválida.');
      }

      opportunities = calculate(validQuotes, dexData);

      // Somente o módulo DEX envia alertas negativos ao Telegram.
      await checkNegativeDexAlerts(opportunities);

      render();

      if (status) {
        status.textContent = dexData.status === 'OK'
          ? 'Cotação recebida · Polygon · CEX → LlamaSwap'
          : 'Cotação parcial · confira a direção USDT → token';
      }
    } catch (error) {
      console.error('Erro DEX:', error);
      opportunities = [];
      render();
      if (status) status.textContent = error.message;
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
