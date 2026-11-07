
const EXCHANGES = [
  'Binance', 'OKX', 'Kraken', 'Bybit', 'Ripio',
  'Bitget', 'MEXC', 'KuCoin', 'Foxbit'
];

const PENDING = 'Integração pendente';
const TIMEOUT_MS = 10000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'USDT-Radar-Pro/1.0'
      },
      signal: controller.signal,
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${body.slice(0, 180)}`
      );
    }

    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

function validLevel(level) {
  if (!Array.isArray(level) || level.length < 2) {
    return false;
  }

  const price = Number(level[0]);
  const quantity = Number(level[1]);

  return (
    Number.isFinite(price) &&
    price > 0 &&
    Number.isFinite(quantity) &&
    quantity > 0
  );
}

function makeQuote(exchange, pair, bid, bidQty, ask, askQty) {
  const values = [bid, bidQty, ask, askQty].map(Number);

  if (
    !values.every(Number.isFinite) ||
    values[0] <= 0 ||
    values[1] <= 0 ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    throw new Error('Livro de ofertas inválido');
  }

  return {
    exchange,
    pair,
    bid: values[0],
    bidQuantity: values[1],
    ask: values[2],
    askQuantity: values[3]
  };
}

// BINANCE
async function getBinanceQuote() {
  const symbol = 'USDTBRL';

  // Endereços alternativos da API oficial da Binance.
  const hosts = [
    'https://api1.binance.com',
    'https://data-api.binance.vision',
    'https://api.binance.com'
  ];

  let lastError;

  for (const host of hosts) {
    try {
      // Verifica se o mercado está disponível.
      const info = await fetchJson(
        `${host}/api/v3/exchangeInfo?symbol=${symbol}`
      );

      const market = info.symbols?.find(
        item =>
          item.symbol === symbol &&
          item.status === 'TRADING'
      );

      if (!market) {
        return {
          status: 'Par USDT/BRL não listado',
          quote: null
        };
      }

      // Consulta o livro de ofertas.
      const book = await fetchJson(
        `${host}/api/v3/depth?symbol=${symbol}&limit=5`
      );

      if (
        !validLevel(book.bids?.[0]) ||
        !validLevel(book.asks?.[0])
      ) {
        return {
          status: 'Livro vazio',
          quote: null
        };
      }

      return {
        status: 'Online',
        quote: makeQuote(
          'Binance',
          'USDT/BRL',
          book.bids[0][0],
          book.bids[0][1],
          book.asks[0][0],
          book.asks[0][1]
        )
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Binance indisponível');
}

// MEXC
async function getMexcQuote() {
  const symbol = 'BRLUSDT';

  const info = await fetchJson(
    `https://api.mexc.com/api/v3/exchangeInfo?symbol=${symbol}`
  );

  const market = info.symbols?.find(item =>
    item.symbol === symbol &&
    (
      item.status === '1' ||
      item.status === 1 ||
      item.status === 'ENABLED'
    ) &&
    item.isSpotTradingAllowed !== false
  );

  if (!market) {
    return {
      status: 'Par BRLUSDT não listado',
      quote: null
    };
  }

  const book = await fetchJson(
    `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=5`
  );

  if (
    !validLevel(book.bids?.[0]) ||
    !validLevel(book.asks?.[0])
  ) {
    return {
      status: 'Livro vazio',
      quote: null
    };
  }

  // A MEXC apresenta BRL/USDT.
  // Invertendo os preços para exibir USDT/BRL.
  const bidBRLUSDT = Number(book.bids[0][0]);
  const bidQtyBRL = Number(book.bids[0][1]);

  const askBRLUSDT = Number(book.asks[0][0]);
  const askQtyBRL = Number(book.asks[0][1]);

  const bidUSDTBRL = 1 / askBRLUSDT;
  const askUSDTBRL = 1 / bidBRLUSDT;

  const bidQtyUSDT = askQtyBRL * askBRLUSDT;
  const askQtyUSDT = bidQtyBRL * bidBRLUSDT;

  return {
    status: 'Online',
    quote: makeQuote(
      'MEXC',
      'USDT/BRL',
      bidUSDTBRL,
      bidQtyUSDT,
      askUSDTBRL,
      askQtyUSDT
    )
  };
}

function errorStatus(error) {
  const message = String(
    error?.message || 'Erro desconhecido'
  )
    .replace(/[\r\n]/g, ' ')
    .slice(0, 90);

  return `Erro: ${message}`;
}

// FUNÇÃO PRINCIPAL DA API
export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const allowedPairs = [
    'USDT/BRL',
    'USDT/BRLA',
    'USDT/BRL1',
    'USDT/BRZ'
  ];

  const requestedPair =
    url.searchParams.get('pair') || 'USDT/BRL';

  const pair = allowedPairs.includes(requestedPair)
    ? requestedPair
    : 'USDT/BRL';

  const statuses = Object.fromEntries(
    EXCHANGES.map(name => [name, PENDING])
  );

  const quotes = [];

  if (pair === 'USDT/BRL') {
    const results = await Promise.allSettled([
      getBinanceQuote(),
      getMexcQuote()
    ]);

    for (let index = 0; index < results.length; index++) {
      const name = index === 0 ? 'Binance' : 'MEXC';
      const result = results[index];

      if (result.status === 'fulfilled') {
        statuses[name] = result.value.status;

        if (result.value.quote) {
          quotes.push(result.value.quote);
        }
      } else {
        statuses[name] = errorStatus(result.reason);
      }
    }
  } else {
    statuses.Binance = 'Par ainda não integrado';
    statuses.MEXC = 'Par ainda não integrado';
  }

  // Procura oportunidades positivas entre corretoras.
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

      if (
        !Number.isFinite(spreadPct) ||
        spreadPct <= 0
      ) {
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

  opportunities.sort(
    (a, b) => b.spreadPct - a.spreadPct
  );

  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      pair,

      onlineCount: Object.values(statuses).filter(
        status => status === 'Online'
      ).length,

      statuses,
      quotes,
      opportunities,

      message:
        'Preços públicos do primeiro nível do livro. Verifique profundidade, taxas e limites antes de operar.'
    },
    {
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    }
  );
}
