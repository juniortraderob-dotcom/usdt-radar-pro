
const $ = id => document.getElementById(id);

const names = [
  'Binance', 'OKX', 'Kraken', 'Bybit', 'Ripio',
  'Bitget', 'MEXC', 'KuCoin', 'Foxbit'
];

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function color(element, value) {
  element.className =
    value > 0 ? 'positive' :
    value < 0 ? 'negative' : 'neutral';
}

// Consulta a Binance diretamente pelo navegador.
async function getBinanceQuote() {
  const symbol = 'USDTBRL';

  const hosts = [
    'https://api1.binance.com',
    'https://data-api.binance.vision',
    'https://api.binance.com'
  ];

  let lastError;

  for (const host of hosts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      let response;

      try {
        response = await fetch(
          `${host}/api/v3/depth?symbol=${symbol}&limit=5`,
          {
            cache: 'no-store',
            signal: controller.signal
          }
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const book = await response.json();

      const bid = book.bids?.[0];
      const ask = book.asks?.[0];

      if (!bid || !ask) {
        throw new Error('Livro de ofertas vazio');
      }

      const bidPrice = Number(bid[0]);
      const bidQuantity = Number(bid[1]);
      const askPrice = Number(ask[0]);
      const askQuantity = Number(ask[1]);

      if (
        ![bidPrice, bidQuantity, askPrice, askQuantity]
          .every(Number.isFinite) ||
        bidPrice <= 0 || bidQuantity <= 0 ||
        askPrice <= 0 || askQuantity <= 0
      ) {
        throw new Error('Cotação inválida');
      }

      return {
        exchange: 'Binance',
        pair: 'USDT/BRL',
        bid: bidPrice,
        bidQuantity,
        ask: askPrice,
        askQuantity
      };

    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Binance indisponível');
}

function renderExchanges(statuses = {}) {
  const container = $('exchanges');
  container.replaceChildren();

  for (const name of names) {
    const card = document.createElement('div');
    card.className = 'source';

    const title = document.createTextNode(name);
    const status = document.createElement('span');

    status.className =
      statuses[name] === 'Online' ? 'positive' : 'neutral';

    status.textContent =
      statuses[name] || 'Integração pendente';

    card.append(title, status);
    container.appendChild(card);
  }
}

function calculateOpportunities(quotes) {
  const opportunities = [];

  for (const buy of quotes) {
    for (const sell of quotes) {
      if (
        buy.exchange === sell.exchange ||
        buy.pair !== sell.pair
      ) {
        continue;
      }

      const spreadPct =
        ((sell.bid - buy.ask) / buy.ask) * 100;

      if (!Number.isFinite(spreadPct) || spreadPct <= 0) {
        continue;
      }

      opportunities.push({
        buyExchange: buy.exchange,
        sellExchange: sell.exchange,
        pair: buy.pair,
        ask: buy.ask,
        bid: sell.bid,
        spreadPct,
        maxBaseQuantity: Math.min(
          buy.askQuantity,
          sell.bidQuantity
        )
      });
    }
  }

  return opportunities.sort(
    (a, b) => b.spreadPct - a.spreadPct
  );
}

async function refresh() {
  const pair = $('pair').value;
  $('updated').textContent = 'Consultando...';

  const statuses = Object.fromEntries(
    names.map(name => [name, 'Integração pendente'])
  );

  const quotes = [];

  try {
    // Consulta MEXC e demais integrações pelo servidor.
    const response = await fetch(
      '/api/markets?pair=' + encodeURIComponent(pair),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Erro HTTP ' + response.status);
    }

    const data = await response.json();

    Object.assign(statuses, data.statuses || {});

    for (const quote of data.quotes || []) {
      quotes.push(quote);
    }

    // Consulta direta à Binance pelo navegador.
    if (pair === 'USDT/BRL') {
      try {
        const binanceQuote = await getBinanceQuote();

        quotes.push(binanceQuote);
        statuses.Binance = 'Online';

      } catch (error) {
        statuses.Binance =
          'Erro: ' + String(error.message || 'Falha na consulta')
            .slice(0, 90);
      }
    } else {
      statuses.Binance = 'Par ainda não integrado';
    }

    renderExchanges(statuses);

    const onlineCount = Object.values(statuses)
      .filter(status => status === 'Online').length;

    $('online').textContent = onlineCount + ' / ' + names.length;

    // Calcula oportunidades usando as cotações reais recebidas.
    const opportunities = calculateOpportunities(quotes);

    const minimum = Number($('min').value) || 0;

    const filtered = opportunities.filter(item =>
      item.pair === pair &&
      Number(item.spreadPct) > minimum
    );

    $('count').textContent = filtered.length;

    $('updated').textContent = new Date().toLocaleTimeString('pt-BR');

    if (filtered.length) {
      $('rows').innerHTML = filtered.map(item => {
        const spread = Number(item.spreadPct);
        const capital = Math.max(
          0,
          Number($('capital').value) || 0
        );

        const profit = capital * spread / 100;

        return `
          <tr>
            <td>${item.buyExchange}</td>
            <td>${item.sellExchange}</td>
            <td>${item.pair}</td>
            <td>${money(item.ask)}</td>
            <td>${money(item.bid)}</td>
            <td class="positive">+${spread.toFixed(3)}%</td>
            <td>${money(profit)}</td>
          </tr>
        `;
      }).join('');

      const best = filtered[0];
      const spread = Number(best.spreadPct);
      const capital = Math.max(
        0,
        Number($('capital').value) || 0
      );

      const gross = capital * spread / 100;

      $('best').textContent = '+' + spread.toFixed(3) + '%';
      color($('best'), spread);

      $('profit').textContent =
        money(gross) + ' de lucro bruto estimado';

      $('route').textContent =
        best.buyExchange + ' → ' + best.sellExchange;

      $('net').textContent = $('includeCosts').checked
        ? money(
            gross - Math.max(
              0,
              Number($('cost').value) || 0
            )
          )
        : 'Desativado';

      $('history').textContent =
        new Date().toLocaleTimeString('pt-BR') + ' · ' +
        best.buyExchange + ' → ' + best.sellExchange +
        ' · +' + spread.toFixed(3) + '%';

    } else {
      $('rows').innerHTML = `
        <tr><td colspan="7">
          Nenhuma oportunidade positiva confirmada para este par.
        </td></tr>
      `;

      $('best').textContent = '—';
      $('best').className = 'neutral';
      $('profit').textContent =
        'Aguardando oportunidade positiva';
      $('route').textContent =
        'Nenhuma oportunidade confirmada';
      $('net').textContent =
        $('includeCosts').checked ? '—' : 'Desativado';
    }

  } catch (error) {
    console.error('Erro no radar:', error);
    $('updated').textContent = 'API indisponível';

    $('rows').innerHTML = `
      <tr><td colspan="7">
        Não foi possível consultar a API. Tente atualizar novamente.
      </td></tr>
    `;
  }
}

$('refresh').addEventListener('click', refresh);
$('pair').addEventListener('change', refresh);
$('min').addEventListener('change', refresh);
$('capital').addEventListener('input', refresh);
$('cost').addEventListener('input', refresh);

$('includeCosts').addEventListener('change', () => {
  $('cost').disabled = !$('includeCosts').checked;
  refresh();
});

const sidebar = $('sidebar');
const backdrop = document.createElement('div');

backdrop.className = 'menu-backdrop';
backdrop.hidden = true;
document.body.appendChild(backdrop);

function closeMenu() {
  sidebar.classList.remove('open');
  backdrop.hidden = true;
}

$('menu').addEventListener('click', () => {
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', opening);
  backdrop.hidden = !opening;
});

backdrop.addEventListener('click', closeMenu);

sidebar.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeMenu);
});

renderExchanges();
refresh();
setInterval(refresh, 10000);
