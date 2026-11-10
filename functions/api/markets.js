
const EXCHANGES = [
  'Binance', 'OKX', 'Bybit', 'Bitget',
  'MEXC', 'KuCoin', 'Foxbit', 'Bitso'
];

const PENDING = 'Integração pendente';
const TIMEOUT_MS = 10000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validLevel(level) {
  return Array.isArray(level) &&
    level.length >= 2 &&
    Number.isFinite(Number(level[0])) &&
    Number(level[0]) > 0 &&
    Number.isFinite(Number(level[1])) &&
    Number(level[1]) > 0;
}

function makeQuote(exchange, bids, asks) {
  if (!validLevel(bids?.[0]) || !validLevel(asks?.[0])) {
    throw new Error('Livro sem ofertas válidas');
  }

  return {
    exchange,
    pair: 'USDT/BRL',
    bid: Number(bids[0][0]),
    bidQuantity: Number(bids[0][1]),
    ask: Number(asks[0][0]),
    askQuantity: Number(asks[0][1])
  };
}

async function getBinanceQuote() {
  // Endpoints oficiais alternativos da Binance para dados públicos.
  const hosts = [
    'https://data-api.binance.vision',
    'https://api-gcp.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com'
  ];

  let lastError;

  // Primeiro tenta obter o livro de ofertas.
  for (const host of hosts) {
    try {
      const book = await fetchJson(
        `${host}/api/v3/depth?symbol=USDTBRL&limit=5`
      );
      return makeQuote('Binance', book.bids, book.asks);
    } catch (error) {
      lastError = error;
    }
  }

  // Alternativa oficial: melhor compra e venda, sem profundidade do livro.
  for (const host of [
    'https://data-api.binance.vision',
    'https://api-gcp.binance.com'
  ]) {
    try {
      const ticker = await fetchJson(
        `${host}/api/v3/ticker/bookTicker?symbol=USDTBRL`
      );

      return makeQuote(
        'Binance',
        [[ticker.bidPrice, ticker.bidQty]],
        [[ticker.askPrice, ticker.askQty]]
      );
    } catch (error) {
      lastError = error;
    }
  }

  const message = String(lastError?.message || 'Binance indisponível');
  if (message.includes('HTTP 403')) {
    throw new Error(
      'HTTP 403: Binance bloqueou o acesso do servidor Cloudflare (WAF/região)'
    );
  }

  throw lastError || new Error('Binance indisponível');
}

async function getMexcQuote() {
  const symbol = 'BRLUSDT';

  const info = await fetchJson(
    `https://api.mexc.com/api/v3/exchangeInfo?symbol=${symbol}`
  );

  if (!info.symbols?.some(item => item.symbol === symbol)) {
    throw new Error('Par BRLUSDT não encontrado');
  }

  const book = await fetchJson(
    `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=5`
  );

  if (!validLevel(book.bids?.[0]) || !validLevel(book.asks?.[0])) {
    throw new Error('Livro MEXC sem ofertas válidas');
  }

  const bidBRL = Number(book.bids[0][0]);
  const bidQtyBRL = Number(book.bids[0][1]);
  const askBRL = Number(book.asks[0][0]);
  const askQtyBRL = Number(book.asks[0][1]);

  // Inverte BRL/USDT para apresentar USDT/BRL.
  return {
    exchange: 'MEXC',
    pair: 'USDT/BRL',
    bid: 1 / askBRL,
    bidQuantity: askQtyBRL * askBRL,
    ask: 1 / bidBRL,
    askQuantity: bidQtyBRL * bidBRL
  };
}

async function getOkxQuote() {
  const data = await fetchJson(
    'https://www.okx.com/api/v5/market/books?instId=USDT-BRL&sz=5'
  );

  if (data.code !== '0' || !data.data?.[0]) {
    throw new Error(data.msg || 'Par USDT-BRL indisponível na OKX');
  }

  return makeQuote('OKX', data.data[0].bids, data.data[0].asks);
}

async function getBybitQuote() {
  const data = await fetchJson(
    'https://api.bybit.com/v5/market/orderbook?category=spot&symbol=USDTBRL&limit=5'
  );

  if (data.retCode !== 0 || !data.result) {
    throw new Error(data.retMsg || 'Par USDTBRL indisponível na Bybit');
  }

  return makeQuote('Bybit', data.result.b, data.result.a);
}

async function getBitgetQuote() {
  const data = await fetchJson(
    'https://api.bitget.com/api/v3/market/orderbook?category=SPOT&symbol=USDTBRL&limit=5'
  );

  if (data.code !== '00000' || !data.data) {
    throw new Error(data.msg || 'Par USDTBRL indisponível na Bitget');
  }

  return makeQuote('Bitget', data.data.b, data.data.a);
}

async function getKucoinQuote() {
  const data = await fetchJson(
    'https://api.kucoin.com/api/v1/market/orderbook/level2_20?symbol=USDT-BRL'
  );

  if (data.code !== '200000' || !data.data) {
    throw new Error('Par USDT-BRL indisponível na KuCoin');
  }

  return makeQuote('KuCoin', data.data.bids, data.data.asks);
}

async function getFoxbitQuote() {
  const data = await fetchJson(
    'https://api.foxbit.com.br/rest/v3/markets/usdtbrl/orderbook?depth=5'
  );

  return makeQuote('Foxbit', data.bids, data.asks);
}

function errorMessage(error) {
  return 'Erro: ' +
    String(error?.message || 'Falha na consulta')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 100);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const requestedPair = url.searchParams.get('pair') || 'USDT/BRL';

  const allowedPairs = [
    'USDT/BRL', 'USDT/BRLA', 'USDT/BRL1', 'USDT/BRZ'
  ];

  const pair = allowedPairs.includes(requestedPair)
    ? requestedPair
    : 'USDT/BRL';

  const statuses = Object.fromEntries(
    EXCHANGES.map(name => [name, PENDING])
  );

  const quotes = [];

  if (pair === 'USDT/BRL') {
    const integrations = [
      ['Binance', getBinanceQuote],
      ['OKX', getOkxQuote],
      ['Bybit', getBybitQuote],
      ['Bitget', getBitgetQuote],
      ['MEXC', getMexcQuote],
      ['KuCoin', getKucoinQuote],
      ['Foxbit', getFoxbitQuote]
    ];

    const results = await Promise.allSettled(
      integrations.map(([, fn]) => fn())
    );

    results.forEach((result, index) => {
      const name = integrations[index][0];

      if (result.status === 'fulfilled') {
        quotes.push(result.value);
        statuses[name] = 'Online';
      } else {
        statuses[name] = errorMessage(result.reason);
      }
    });
  } else {
    for (const name of EXCHANGES) {
      if (name !== 'Bitso') {
        statuses[name] = 'Par ainda não integrado';
      }
    }
  }

  const onlineCount = Object.values(statuses)
    .filter(status => status === 'Online').length;

  return Response.json({
    updatedAt: new Date().toISOString(),
    pair,
    onlineCount,
    statuses,
    quotes,
    message: 'Cotações públicas do livro de ofertas. Confira profundidade, taxas e limites antes de operar.'
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
}
