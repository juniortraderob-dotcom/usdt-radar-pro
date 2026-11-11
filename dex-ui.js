(() => {
  const $ = id => document.getElementById(id);

  const DEX = 'LlamaSwap';
  const ALERT_THRESHOLD = -0.45;

  // Referência observada na LlamaSwap:
  // diferença média de R$ 5,22 para 500 USDT.
  const DEX_REFERENCE_DIFFERENCE = 5.22;
  const DEX_REFERENCE_USDT = 500;

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
  let lastNegativeDexAlerts = new Set();

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

  const quantity = n => Number(n).toLocaleString('pt-BR', {
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

  function bold(text) {
    const normal =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    const strong =
      '𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗';

    return String(text).replace(/[A-Za-z0-9]/g, char => {
      const index = normal.indexOf(char);
      return index >= 0 ? strong[index] : char;
    });
  }

  function configureFilters() {
    const buyFilter = $('dexBuyFilter');
    const sellFilter = $('dexSellFilter');

    // Lado esquerdo: somente corretoras centralizadas (CEX).
    const cexOptions = [
      '<option value="all">Todas as corretoras</option>',
      ...CEX.map(name =>
        `<option value="${safe(name)}">${safe(name)}</option>`
      )
    ];

    if (buyFilter) {
      const previous = buyFilter.value || 'all';
      buyFilter.innerHTML = cexOptions.join('');
      buyFilter.value = CEX.includes(previous) || previous === 'all'
        ? previous
        : 'all';
    }

    // Lado direito: LlamaSwap é a única opção disponível.
    if (sellFilter) {
      sellFilter.innerHTML = `<option value="${DEX}">${DEX}</option>`;
      sellFilter.value = DEX;
      sellFilter.disabled = true;
    }
  }

  // =====================================================
  // CÁLCULO DAS DUAS DIREÇÕES
  // =====================================================

  function calculate(quotes, data) {
    const directions = data?.directions;
    const cap = capital();

    if (!directions || !(cap > 0)) return [];

    const result = [];

    // ---------------------------------------------------
    // DIREÇÃO 1:
    // COMPRA USDT NA LLAMASWAP
    // VENDE USDT NA CORRETORA (BID)
    // ---------------------------------------------------

    const dexBuy = directions.tokenToUsdt;

    if (dexBuy?.status === 'OK') {
      const tokenInput = Number(dexBuy.sellAmount);
      const usdtAmount = Number(dexBuy.buyAmount);

      if (
        tokenInput > 0 &&
        usdtAmount > 0 &&
        Number.isFinite(tokenInput) &&
        Number.isFinite(usdtAmount)
      ) {
        const dexBuyPrice = tokenInput / usdtAmount;

        for (const quote of quotes) {
          if (!CEX.includes(quote.exchange)) continue;

          const bid = Number(quote.bid);

          if (!(bid > 0) || !Number.isFinite(bid)) continue;

          const finalValue = usdtAmount * bid;
          const grossResult = finalValue - tokenInput;
          const spread = (grossResult / tokenInput) * 100;

          if (
            !Number.isFinite(spread) ||
            !Number.isFinite(grossResult)
          ) continue;

          result.push({
            exchange: quote.exchange,
            direction: 'DEX_TO_CEX',

            leftName: quote.exchange,
            rightName: DEX,

            leftAction: 'VENDER USDT',
            rightAction: 'COMPRAR USDT',

            leftPrice: bid,
            rightPrice: dexBuyPrice,

            buyLocation: DEX,
            sellLocation: quote.exchange,

            buyPrice: dexBuyPrice,
            sellPrice: bid,

            usdtAmount,
            tokenAmount: tokenInput,

            capital: tokenInput,
            finalValue,
            grossResult,
            spread,

            route: `${DEX} → ${quote.exchange}`,
            operationRoute: `${DEX} → ${quote.exchange}`,
            arrow: '←'
          });
        }
      }
    }

    // ---------------------------------------------------
    // DIREÇÃO 2:
    // COMPRA USDT NA CORRETORA (ASK)
    // VENDE USDT NA LLAMASWAP
    // ---------------------------------------------------

    const dexSell = directions.usdtToToken;

    if (dexSell?.status === 'OK') {
      const usdtAmount = Number(dexSell.sellAmount);
      const tokenOutput = Number(dexSell.buyAmount);

      if (
        usdtAmount > 0 &&
        tokenOutput > 0 &&
        Number.isFinite(usdtAmount) &&
        Number.isFinite(tokenOutput)
      ) {
        const dexSellPrice = tokenOutput / usdtAmount;

        for (const quote of quotes) {
          if (!CEX.includes(quote.exchange)) continue;

          const ask = Number(quote.ask);

          if (!(ask > 0) || !Number.isFinite(ask)) continue;

          const cost = usdtAmount * ask;
          const finalValue = tokenOutput;
          const grossResult = finalValue - cost;
          const spread = (grossResult / cost) * 100;

          if (
            !Number.isFinite(spread) ||
            !Number.isFinite(grossResult)
          ) continue;

          result.push({
            exchange: quote.exchange,
            direction: 'CEX_TO_DEX',

            leftName: quote.exchange,
            rightName: DEX,

            leftAction: 'COMPRAR USDT',
            rightAction: 'VENDER USDT',

            leftPrice: ask,
            rightPrice: dexSellPrice,

            buyLocation: quote.exchange,
            sellLocation: DEX,

            buyPrice: ask,
            sellPrice: dexSellPrice,

            usdtAmount,
            tokenAmount: tokenOutput,

            capital: cost,
            finalValue,
            grossResult,
            spread,

            route: `${quote.exchange} → ${DEX}`,
            operationRoute: `${quote.exchange} → ${DEX}`,
            arrow: '→'
          });
        }
      }
    }

    return result.sort((a, b) => b.spread - a.spread);
  }

  // =====================================================
  // ALERTAS DE SPREAD NEGATIVO
  // =====================================================

  async function checkNegativeDexAlerts(items) {
    const negative = items.filter(
      item => item.spread <= ALERT_THRESHOLD
    );

    const currentKeys = new Set(
      negative.map(item =>
        `${item.exchange}|${item.direction}`
      )
    );

    const newlyNegative = negative.filter(item =>
      !lastNegativeDexAlerts.has(
        `${item.exchange}|${item.direction}`
      )
    );

    if (!newlyNegative.length) {
      lastNegativeDexAlerts = currentKeys;
      return;
    }

    if (typeof window.sendTelegramAlert !== 'function') {
      console.warn(
        'Telegram não disponível: sendTelegramAlert() não encontrada.'
      );
      return;
    }

    const cap = capital();
    const pair = $('dexPair')?.value || 'USDT/BRLA';

    const sections = newlyNegative.map(item => [
      `🔻 ${bold(item.operationRoute)}`,
      '━━━━━━━━━━━━━━━━━━',
      `📉 ${bold('Spread negativo:')} ${bold(item.spread.toFixed(3) + '%')}`,
      `🛒 ${bold('Compra em:')} ${item.buyLocation}`,
      `💰 ${bold('Preço de compra:')} ${price(item.buyPrice)}`,
      `🔄 ${bold('Venda em:')} ${item.sellLocation}`,
      `💰 ${bold('Preço de venda:')} ${price(item.sellPrice)}`,
      `🪙 ${bold('Quantidade estimada:')} ${quantity(item.usdtAmount)} USDT`,
      `💸 ${bold('Resultado bruto estimado:')} ${money(item.grossResult)}`
    ].join('\n'));

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
        console.error(
          'O Telegram não confirmou o envio do alerta negativo DEX.'
        );
      }
    } catch (error) {
      console.error('Falha no alerta negativo DEX:', error);
    }
  }

  // =====================================================
  // EXIBIÇÃO
  // =====================================================

  function render() {
    const box = $('dexRows');

    if (!box) return;

    const buyFilter = $('dexBuyFilter')?.value || 'all';

    // A comparação visual mantém a CEX à esquerda e a LlamaSwap à direita
    // nas duas direções. O filtro esquerdo seleciona apenas a corretora.
    const filteredRows = opportunities.filter(item =>
      buyFilter === 'all' || item.exchange === buyFilter
    );

    const rows = filteredRows.length
      ? [filteredRows[0]]
      : [];

    if (!rows.length) {
      box.innerHTML =
        '<p class="empty-results">Nenhuma oportunidade disponível para este filtro.</p>';

      if ($('dexBest')) {
        $('dexBest').textContent = '—';
        $('dexBest').className = 'neutral';
      }

      if ($('dexProfit')) {
        $('dexProfit').textContent = 'Aguardando oportunidade';
      }

      if ($('dexRoute')) {
        $('dexRoute').textContent = 'Sem combinação disponível';
      }

      return;
    }

    const best = rows[0];

    const cls = best.spread >= 0
      ? 'positive'
      : 'negative';

    const sign = best.spread > 0 ? '+' : '';

    if ($('dexBest')) {
      $('dexBest').textContent =
        sign + best.spread.toFixed(3) + '%';

      $('dexBest').className = cls;
    }

    if ($('dexProfit')) {
      $('dexProfit').textContent =
        (best.grossResult >= 0
          ? 'Lucro bruto estimado: '
          : 'Resultado bruto estimado: ') +
        money(best.grossResult);
    }

    if ($('dexRoute')) {
      $('dexRoute').textContent = best.route;
    }

    box.innerHTML = rows.map(item => {
      const itemClass = item.spread >= 0
        ? 'positive'
        : 'negative';

      const spreadSign = item.spread > 0 ? '+' : '';

      return `
        <article class="opportunity-card">
          <div class="exchange-comparison">

            <div class="exchange-side buy-side">
              <small>${safe(item.leftAction)}</small>
              <strong>${safe(item.leftName)}</strong>
              <span>Preço: ${price(item.leftPrice)}</span>
            </div>

            <div class="exchange-arrow">${item.arrow}</div>

            <div class="exchange-side sell-side">
              <small>${safe(item.rightAction)}</small>
              <strong>${safe(item.rightName)}</strong>
              <span>Preço: ${price(item.rightPrice)}</span>
            </div>

          </div>

          <div class="opportunity-details">
            <span>Rota: <b>${safe(item.route)}</b></span>

            <span>
              Quantidade estimada:
              <b>${quantity(item.usdtAmount)} USDT</b>
            </span>

            <span>
              Spread:
              <b class="${itemClass}">
                ${spreadSign}${item.spread.toFixed(3)}%
              </b>
            </span>

            <span>
              Resultado bruto estimado:
              <b class="${itemClass}">
                ${money(item.grossResult)}
              </b>
            </span>
          </div>

          <div class="exchange-buttons">
            <a
              class="exchange-link"
              href="https://swap.defillama.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir LlamaSwap ↗
            </a>

            <a
              class="exchange-link"
              href="https://www.${item.exchange.toLowerCase()}.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir ${safe(item.exchange)} ↗
            </a>
          </div>
        </article>
      `;
    }).join('');
  }

  // =====================================================
  // ATUALIZAÇÃO DAS COTAÇÕES
  // =====================================================

  async function refresh() {
    if (busy) return;

    busy = true;

    const status = $('dexStatus');

    try {
      if (status) {
        status.textContent = 'Consultando preços...';
      }

      const pair = $('dexPair')?.value || 'USDT/BRLA';
      const cap = capital();

      if (!(cap > 0)) {
        throw new Error('Informe um capital maior que zero.');
      }

      const cexResponse = await fetch(
        '/api/markets?pair=USDT%2FBRL',
        { cache: 'no-store' }
      );

      if (!cexResponse.ok) {
        throw new Error(
          'Erro na consulta CEX: HTTP ' + cexResponse.status
        );
      }

      const cexData = await cexResponse.json();
      const quotes = cexData.quotes || [];

      const validQuotes = quotes.filter(quote =>
        CEX.includes(quote.exchange) &&
        Number(quote.bid) > 0 &&
        Number(quote.ask) > 0
      );

      if (!validQuotes.length) {
        throw new Error('Nenhuma cotação CEX válida.');
      }

      // Estima a quantidade de USDT para a segunda direção.
      const average = validQuotes.reduce((sum, quote) =>
        sum + (
          (Number(quote.ask) + Number(quote.bid)) / 2
        ), 0
      ) / validQuotes.length;

      const reverseAmount = average > 0
        ? (cap / average).toFixed(6)
        : '1.000000';

      const params = new URLSearchParams({
        pair,
        capital: String(cap),
        reverseCapital: reverseAmount
      });

      const dexResponse = await fetch(
        '/api/dex?' + params.toString(),
        { cache: 'no-store' }
      );

      const dexData = await dexResponse.json();

      if (!dexResponse.ok) {
        throw new Error(
          dexData.error ||
          'Erro na consulta DEX: HTTP ' + dexResponse.status
        );
      }

      if (!dexData.directions) {
        throw new Error(
          dexData.error || 'Resposta DEX inválida.'
        );
      }

      opportunities = calculate(validQuotes, dexData);

      await checkNegativeDexAlerts(opportunities);

      render();

      if (status) {
        const buyOK =
          dexData.directions.tokenToUsdt?.status === 'OK';

        const sellOK =
          dexData.directions.usdtToToken?.status === 'OK';

        status.textContent =
          `LlamaSwap · Compra: ${buyOK ? 'OK' : 'ERRO'} · Venda: ${sellOK ? 'OK' : 'ERRO'} · Referência: R$ ${DEX_REFERENCE_DIFFERENCE.toFixed(2)} / ${DEX_REFERENCE_USDT} USDT`;
      }

    } catch (error) {
      console.error('Erro DEX:', error);

      opportunities = [];
      render();

      if (status) {
        status.textContent = error.message;
      }

    } finally {
      busy = false;
    }
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================

  function init() {
    if (!$('dexRows')) return;

    configureFilters();

    $('dexPair')?.addEventListener('change', () => {
      lastNegativeDexAlerts = new Set();
      refresh();
    });

    $('dexBuyFilter')?.addEventListener('change', render);
    $('dexSellFilter')?.addEventListener('change', render);

    $('capital')?.addEventListener('input', render);

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
