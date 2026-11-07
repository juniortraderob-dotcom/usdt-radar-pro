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
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 150)}`);
    }

    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

function validLevel(level) {
  if (!Array.isArray(level) || level.length < 2) return false;

  const price = Number(level[0]);
  const quantity = Number(level[1]);

  return Number.isFinite(price) &&
    price > 0 &&
    Number.isFinite(quantity) &&
    quantity > 0;
}

function makeQuote(exchange, bid, bidQty, ask, askQty) {
  return {
    exchange,
    pair: 'USDT/BRL',
    bid: Number(bid),
    bidQuantity: Number(bidQty),
    ask: Number(ask),
    askQuantity: Number(askQty)
  };
}

// MEXC: mercado BRL/USDT convertido para USDT/BRL.
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
    throw new Error('Par BRLUSDT não listado ou indisponível');
  }

  const book = await fetchJson(
    `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=5`
  );

  if (
    !validLevel(book.bids?.[0]) ||
    !validLevel(book.asks?.[0])
  ) {
    throw new Error('Livro de ofertas vazio');
  }

  const bidBRLUSDT = Number(book.bids[0][0]);
  const bidQtyBRL = Number(book.bids[0][1]);

  const askBRLUSDT = Number(book.asks[0][0]);
  const askQtyBRL = Number(book.asks[0][1]);

  // Inverte bid e ask ao converter BRL/USDT para USDT/BRL.
  const bidUSDTBRL = 1 / askBRLUSDT;
  const askUSDTBRL = 1 / bidBRLUSDT;

  const bidQtyUSDT = askQtyBRL * askBRLUSDT;
  const askQtyUSDT = bidQtyBRL * bidBRLUSDT;

  return makeQuote(
    'MEXC',
    bidUSDTBRL,
    bidQtyUSDT,
    askUSDTBRL,
    askQtyUSDT
  );
}

function errorStatus(error) {
  return (
    'Erro: ' +
    String(error?.message || 'Erro desconhecido')
      .replace(/[\r\n]/g, ' ')
      .slice(0, 90)
  );
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const requestedPair = url.searchParams.get('pair') || 'USDT/BRL';

  const allowedPairs = [
    'USDT/BRL',
    'USDT/BRLA',
    'USDT/BRL1',
    'USDT/BRZ'
  ];

  const pair = allowedPairs.includes(requestedPair)
    ? requestedPair
    : 'USDT/BRL';

  const statuses = Object.fromEntries(
    EXCHANGES.map(name => [name, PENDING])
  );

  const quotes = [];

  if (pair === 'USDT/BRL') {
    try {
      const quote = await getMexcQuote();
      quotes.push(quote);
      statuses.MEXC = 'Online';
    } catch (error) {
      statuses.MEXC = errorStatus(error);
    }
  } else {
    statuses.MEXC = 'Par ainda não integrado';
  }

  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      pair,
      onlineCount: Object.values(statuses).filter(
        status => status === 'Online'
      ).length,
      statuses,
      quotes,
      opportunities: [],
      message:
        'Cotações públicas do primeiro nível do livro. Verifique profundidade, taxas e limites antes de operar.'
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    }
  );
}
