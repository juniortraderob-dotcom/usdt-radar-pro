
const $ = id => document.getElementById(id);

const names = [
  'Binance', 'OKX', 'Bybit', 'Bitget',
  'MEXC', 'KuCoin', 'Foxbit', 'Bitso'
];

const tradeUrls = {
  Binance: 'https://www.binance.com/pt-BR/trade/USDT_BRL?type=spot',
  MEXC: 'https://www.mexc.com/pt-BR/exchange/BRL_USDT'
};

let latestOpportunities = [];

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function safe(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);
}

function setupFilters() {
  ['buyFilter', 'sellFilter'].forEach(id => {
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      $(id).appendChild(option);
    });
  });

  // O radar não terá filtro separado de positivos e negativos.
  if ($('resultFilter')) {
    $('resultFilter').style.display = 'none';
  }
}

function renderExchanges(statuses) {
  const container = $('exchanges');
  container.replaceChildren();

  names.forEach(name => {
    const card = document.createElement('div');
    card.className = 'source';

    const title = document.createElement('strong');
    title.textContent = name;

    const status = document.createElement('span');
    status.textContent = statuses[name] || 'Integração pendente';
    status.className =
      status.textContent === 'Online' ? 'positive' : 'neutral';

    card.append(title, status);
    container.appendChild(card);
  });
}

function validLevel(level) {
  return Array.isArray(level) &&
    level.length >= 2 &&
    Number.isFinite(Number(level[0])) &&
    Number(level[0]) > 0 &&
    Number.isFinite(Number(level[1])) &&
    Number(level[1]) > 0;
}

async function getBinanceQuote() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const url =
      'https://data-api.binance.vision/api/v3/depth?symbol=USDTBRL&limit=5';

    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const book = await response.json();

    if (!validLevel(book.bids?.[0]) ||
        !validLevel(book.asks?.[0])) {
      throw new Error('Livro Binance sem ofertas válidas');
    }

    return {
      exchange: 'Binance',
      pair: 'USDT/BRL',
      bid: Number(book.bids[0][0]),
      bidQuantity: Number(book.bids[0][1]),
      ask: Number(book.asks[0][0]),
      askQuantity: Number(book.asks[0][1])
    };
  } finally {
    clearTimeout(timer);
  }
}

function calculateOpportunities(quotes) {
  const results = [];

  for (const buy of quotes) {
    for (const sell of quotes) {
      if (buy.exchange === sell.exchange ||
          buy.pair !== sell.pair) continue;

      const spread =
        ((sell.bid - buy.ask) / buy.ask) * 100;

      if (!Number.isFinite(spread)) continue;

      results.push({
        buyExchange: buy.exchange,
        sellExchange: sell.exchange,
        pair: buy.pair,
        ask: buy.ask,
        bid: sell.bid,
        spread,
        quantity: Math.min(
          buy.askQuantity,
          sell.bidQuantity
        )
      });
    }
  }

  return results.sort((a, b) => b.spread - a.spread);
}

function exchangeButton(name) {
  const url = tradeUrls[name];

  if (!url) return '';

  return `
    <a class="exchange-link"
       href="${url}"
       target="_blank"
       rel="noopener noreferrer">
       Abrir ${safe(name)} ↗
    </a>
  `;
}

function renderOpportunities() {
  const capital = Math.max(
    0,
    Number($('capital').value) || 0
  );

  const buy = $('buyFilter').value;
  const sell = $('sellFilter').value;

  // Primeiro aplica os filtros escolhidos pelo usuário.
  const selected = latestOpportunities.filter(item => {
    if (buy !== 'all' && item.buyExchange !== buy) return false;
    if (sell !== 'all' && item.sellExchange !== sell) return false;
    return true;
  });

  // Prioriza oportunidades positivas.
  // Só mostra negativas quando não existe nenhuma positiva.
  const positives = selected.filter(item => item.spread > 0);
  const negatives = selected.filter(item => item.spread < 0);

  const filtered = positives.length
    ? positives
    : negatives;

  $('count').textContent =
    latestOpportunities.filter(x => x.spread > 0).length;

  if (!filtered.length) {
    $('rows').innerHTML =
      '<p class="empty-results">Nenhuma combinação disponível para os filtros selecionados.</p>';

    $('best').textContent = '—';
    $('best').className = 'neutral';
    $('profit').textContent = 'Aguardando oportunidade';
    $('route').textContent = 'Nenhuma combinação disponível';
    $('net').textContent =
      $('includeCosts').checked ? '—' : 'Desativado';

    return;
  }

  $('rows').innerHTML = filtered.map(item => {
    const gross = capital * item.spread / 100;

    const cls = item.spread > 0
      ? 'positive'
      : 'negative';

    return `
      <article class="opportunity-card">

        <div class="exchange-comparison">

          <div class="exchange-side buy-side">
            <small>COMPRAR USDT</small>
            <strong>${safe(item.buyExchange)}</strong>
            <span>ASK: ${money(item.ask)}</span>
          </div>

          <div class="exchange-arrow">→</div>

          <div class="exchange-side sell-side">
            <small>VENDER USDT</small>
            <strong>${safe(item.sellExchange)}</strong>
            <span>BID: ${money(item.bid)}</span>
          </div>

        </div>

        <div class="opportunity-details">
          <span>Par: <b>${safe(item.pair)}</b></span>

          <span>Spread:
            <b class="${cls}">
              ${item.spread > 0 ? '+' : ''}${item.spread.toFixed(3)}%
            </b>
          </span>

          <span>Lucro/prejuízo bruto:
            <b class="${cls}">${money(gross)}</b>
          </span>

          <span>Quantidade disponível no primeiro nível:
            <b>${item.quantity.toFixed(4)} USDT</b>
          </span>
        </div>

        <div class="exchange-buttons">
          ${exchangeButton(item.buyExchange)}
          ${exchangeButton(item.sellExchange)}
        </div>

      </article>
    `;
  }).join('');

  const best = filtered[0];
  const gross = capital * best.spread / 100;

  const cls = best.spread > 0
    ? 'positive'
    : 'negative';

  $('best').textContent =
    (best.spread > 0 ? '+' : '') +
    best.spread.toFixed(3) + '%';

  $('best').className = cls;

  $('profit').textContent =
    (gross >= 0
      ? 'Lucro bruto estimado: '
      : 'Prejuízo bruto estimado: ') +
    money(Math.abs(gross));

  $('route').textContent =
    best.buyExchange + ' → ' + best.sellExchange;

  const cost = Math.max(
    0,
    Number($('cost').value) || 0
  );

  $('net').textContent = $('includeCosts').checked
    ? money(gross - cost)
    : 'Desativado';

  $('history').textContent =
    new Date().toLocaleTimeString('pt-BR') +
    ' · ' + best.buyExchange +
    ' → ' + best.sellExchange +
    ' · ' + (best.spread > 0 ? '+' : '') +
    best.spread.toFixed(3) + '%';
}

async function refresh() {
  $('updated').textContent = 'Consultando...';

  try {
    const pair = $('pair').value;

    const response = await fetch(
      '/api/markets?pair=' + encodeURIComponent(pair),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('API HTTP ' + response.status);
    }

    const data = await response.json();

    const statuses = data.statuses || {};
    const quotes = [...(data.quotes || [])];

    // Consulta direta da Binance para USDT/BRL.
    if (pair === 'USDT/BRL') {
      try {
        const binance = await getBinanceQuote();

        const existing = quotes.findIndex(
          q => q.exchange === 'Binance'
        );

        if (existing >= 0) {
          quotes[existing] = binance;
        } else {
          quotes.push(binance);
        }

        statuses.Binance = 'Online';

      } catch (error) {
        statuses.Binance = 'Erro: ' +
          String(error.message || 'Falha na consulta')
            .slice(0, 70);
      }
    } else {
      statuses.Binance = 'Par ainda não integrado';
    }

    renderExchanges(statuses);

    const onlineCount = Object.values(statuses)
      .filter(status => status === 'Online').length;

    $('online').textContent =
      onlineCount + ' / ' + names.length;

    latestOpportunities =
      calculateOpportunities(quotes);

    renderOpportunities();

    $('updated').textContent =
      new Date().toLocaleTimeString('pt-BR');

  } catch (error) {
    console.error(error);

    $('updated').textContent = 'Erro na consulta';

    $('rows').textContent =
      'Não foi possível consultar a API. Tente novamente.';
  }
}

setupFilters();

$('refresh').addEventListener('click', refresh);
$('pair').addEventListener('change', refresh);

$('buyFilter').addEventListener(
  'change',
  renderOpportunities
);

$('sellFilter').addEventListener(
  'change',
  renderOpportunities
);

$('capital').addEventListener(
  'input',
  renderOpportunities
);

$('cost').addEventListener(
  'input',
  renderOpportunities
);

$('includeCosts').addEventListener('change', () => {
  $('cost').disabled = !$('includeCosts').checked;
  renderOpportunities();
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

renderExchanges({});
refresh();

setInterval(refresh, 10000);
