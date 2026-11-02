
const exchanges = [
  'Binance',
  'OKX',
  'Kraken',
  'Bybit',
  'Ripio',
  'BitcoinTrade',
  'Bitget',
  'Bitso',
  'MEXC',
  'KuCoin',
  'Coinext'
];

const binanceSymbols = {
  'USDT/BRL': 'USDTBRL',
  'USDT/BRLA': 'USDTBRLA',
  'USDT/BRL1': 'USDTBRL1',
  'USDT/BRZ': 'USDTBRZ'
};

async function getBinanceQuote(pair) {
  const symbol = binanceSymbols[pair];

  if (!symbol) {
    return { status: 'Par não configurado', quote: null };
  }

  const response = await fetch(
    `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=5`,
    { signal: AbortSignal.timeout(8000) }
  );

  if (!response.ok) {
    return {
      status: response.status === 400
        ? 'Par não disponível'
        : `Erro HTTP ${response.status}`,
      quote: null
    };
  }

  const book = await response.json();

  if (!book.bids?.length || !book.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: {
      exchange: 'Binance',
      pair,
      bid: Number(book.bids[0][0]),
      bidQuantity: Number(book.bids[0][1]),
      ask: Number(book.asks[0][0]),
      askQuantity: Number(book.asks[0][1])
    }
  };
}

async function getOkxQuote(pair) {
  const instId = pair.replace('/', '-');

  const instrumentsResponse = await fetch(
    'https://www.okx.com/api/v5/public/instruments?instType=SPOT',
    { signal: AbortSignal.timeout(8000) }
  );

  if (!instrumentsResponse.ok) {
    throw new Error('Falha ao consultar instrumentos OKX');
  }

  const instruments = await instrumentsResponse.json();

  const exists = instruments.data?.some(
    item => item.instId === instId && item.state === 'live'
  );

  if (!exists) {
    return { status: 'Par não disponível', quote: null };
  }

  const response = await fetch(
    `https://www.okx.com/api/v5/market/books?instId=${instId}&sz=5`,
    { signal: AbortSignal.timeout(8000) }
  );

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status}`);
  }

  const result = await response.json();

  if (
    result.code !== '0' ||
    !result.data?.[0]?.bids?.length ||
    !result.data?.[0]?.asks?.length
  ) {
    return { status: 'Livro vazio', quote: null };
  }

  const book = result.data[0];

  return {
    status: 'Online',
    quote: {
      exchange: 'OKX',
      pair,
      bid: Number(book.bids[0][0]),
      bidQuantity: Number(book.bids[0][1]),
      ask: Number(book.asks[0][0]),
      askQuantity: Number(book.asks[0][1])
    }
  };
}

exports.handler = async (event) => {
  const pair = event.queryStringParameters?.pair || 'USDT/BRL';

  const results = await Promise.all([
    getBinanceQuote(pair).catch(() => ({
      status: 'API indisponível',
      quote: null
    })),

    getOkxQuote(pair).catch(() => ({
      status: 'API indisponível',
      quote: null
    }))
  ]);

  const statuses = Object.fromEntries(
    exchanges.map(name => [name, 'Integração pendente'])
  );

  statuses.Binance = results[0].status;
  statuses.OKX = results[1].status;

  const quotes = results
    .filter(result => result.quote)
    .map(result => result.quote);

  const onlineCount = Object.values(statuses)
    .filter(status => status === 'Online').length;

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({
      updatedAt: new Date().toISOString(),
      pair,
      onlineCount,
      statuses,
      quotes,
      opportunities: [],
      message: 'Cotações públicas consultadas. Nenhuma cotação simulada.'
    })
  };
};


