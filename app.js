const $ = id => document.getElementById(id);

const names = [
  'Binance', 'OKX', 'Bybit', 'Bitget',
  'MEXC', 'KuCoin', 'Foxbit', 'Bitso'
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

async function getBinanceQuote() {
  const hosts = [
    'https://api1.binance.com',
    'https://data-api.binance.vision',
    'https://api.binance.com'
  ];

  let lastError;

  for (const host of hosts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${host}/api/v3/depth?symbol=USDTBRL&limit=5`,
        {
          cache: 'no-store',
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const book = await response.json();
      const bid = book.bids?.[0];
      const ask = book.asks?.[0];

      if (!bid || !ask) {
        throw new Error('Livro de ofertas vazio');
      }

      const quote = {
        exchange: 'Binance',
        pair: 'USDT/BRL',
        bid: Number(bid[0]),
        bidQuantity: Number(bid[1]),
        ask: Number(ask[0]),
        askQuantity: Number(ask[1])
      };

      if (
        ![
          quote.bid,
          quote.bidQuantity,
          quote.ask,
          quote.askQuantity
        ].every(Number.isFinite) ||
        quote.bid <= 0 ||
        quote.ask <= 0 ||
        quote.bidQuantity <= 0 ||
        quote.askQuantity <= 0
      ) {
        throw new Error('Cotação inválida');
      }

      return quote;

    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Binance indisponível');
}

function renderExchanges(statuses) {
  const container = $('exchanges');
  container.replaceChildren();

  names.forEach(name => {
    const card = document.createElement('div');
    card.className = 'source';

    const title = document.createElement('span');
    title.textContent = name;

    const status = document.createElement('span');
    status.textContent = statuses[name] || 'Integração pendente';
    status.className =
      status.textContent === 'Online' ? 'positive' : 'neutral';

    card.append(title, status);
    container.appendChild(card);
  });
}

function calculateOpportunities(quotes) {
  const opportunities = [];

  for (const buy of quotes) {
    for (const sell of quotes) {
      if (
        buy.exchange === sell.exchange ||
        buy.pair !== sell.pair
      ) continue;

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
    // Consulta a MEXC pela API da Cloudflare.
    const response = await fetch(
      '/api/markets?pair=' + encodeURIComponent(pair),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('API HTTP ' + response.status);
    }

    const data = await response.json();

    Object.assign(statuses, data.statuses || {});
    quotes.push(...(data.quotes || []));

    // Consulta Binance diretamente no navegador.
    if (pair === 'USDT/BRL') {
      try {
        const quote = await getBinanceQuote();
        quotes.push(quote);
        statuses.Binance = 'Online';
      } catch (error) {
        statuses.Binance =
          'Erro: ' + String(error.message || 'Falha').slice(0, 70);
      }
    } else {
      statuses.Binance = 'Par ainda não integrado';
    }

    renderExchanges(statuses);

    const onlineCount = Object.values(statuses)
      .filter(status => status === 'Online').length;

    $('online').textContent = `${onlineCount} / ${names.length}`;

    const opportunities = calculateOpportunities(quotes);
    const minimum = Number($('min').value) || 0;

    const filtered = opportunities.filter(item =>
      item.pair === pair && item.spreadPct > minimum
    );

    $('count').textContent = filtered.length;
    $('updated').textContent =
      new Date().toLocaleTimeString('pt-BR');

    if (!filtered.length) {
      $('rows').innerHTML = `
        <tr>
          <td colspan="7">
            Nenhuma oportunidade positiva confirmada para este par.
          </td>
        </tr>
      `;

      $('best').textContent = '—';
      $('best').className = 'neutral';
      $('profit').textContent = 'Aguardando oportunidade positiva';
      $('route').textContent = 'Nenhuma oportunidade confirmada';
      $('net').textContent =
        $('includeCosts').checked ? '—' : 'Desativado';

      return;
    }

    const capital = Math.max(0, Number($('capital').value) || 0);

    $('rows').innerHTML = filtered.map(item => {
      const gross = capital * item.spreadPct / 100;

      return `
        <tr>
          <td>${item.buyExchange}</td>
          <td>${item.sellExchange}</td>
          <td>${item.pair}</td>
          <td>${money(item.ask)}</td>
          <td>${money(item.bid)}</td>
          <td class="positive">+${item.spreadPct.toFixed(3)}%</td>
          <td>${money(gross)}</td>
        </tr>
      `;
    }).join('');

    const best = filtered[0];
    const gross = capital * best.spreadPct / 100;

    $('best').textContent = '+' + best.spreadPct.toFixed(3) + '%';
    color($('best'), best.spreadPct);

    $('profit').textContent =
      money(gross) + ' de lucro bruto estimado';

    $('route').textContent =
      best.buyExchange + ' → ' + best.sellExchange;

    $('net').textContent = $('includeCosts').checked
      ? money(gross - Math.max(0, Number($('cost').value) || 0))
      : 'Desativado';

    $('history').textContent =
      new Date().toLocaleTimeString('pt-BR') +
      ' · ' + best.buyExchange +
      ' → ' + best.sellExchange +
      ' · +' + best.spreadPct.toFixed(3) + '%';

  } catch (error) {
    console.error('Erro no radar:', error);
    $('updated').textContent = 'API indisponível';

    $('rows').innerHTML = `
      <tr>
        <td colspan="7">
          Não foi possível consultar a API. Tente atualizar novamente.
        </td>
      </tr>
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

renderExchanges(
  Object.fromEntries(names.map(name => [name, 'Integração pendente']))
);

refresh();
setInterval(refresh, 10000);
