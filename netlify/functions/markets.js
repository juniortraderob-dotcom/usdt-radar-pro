
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
      status: response.status === 400 ? 'Par não disponível' : `Erro HTTP ${response.status}`,
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

async function getKrakenQuote(pair) {
  const response = await fetch(
    'https://api.kraken.com/0/public/AssetPairs',
    { signal: AbortSignal.timeout(8000) }
  );

  if (!response.ok) {
    throw new Error('Falha ao consultar mercados Kraken');
  }

  const data = await response.json();

  if (data.error?.length) {
    throw new Error(data.error.join(', '));
  }

  const market = Object.entries(data.result || {}).find(
    ([key, item]) =>
      item.wsname === pair ||
      item.altname === pair.replace('/', '')
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const [marketKey, marketInfo] = market;

  if (marketInfo.status !== 'online') {
    return { status: 'Mercado indisponível', quote: null };
  }

  const bookResponse = await fetch(
    `https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(marketKey)}&count=5`,
    { signal: AbortSignal.timeout(8000) }
  );

  if (!bookResponse.ok) {
    throw new Error('Falha ao consultar livro Kraken');
  }

  const bookData = await bookResponse.json();

  if (bookData.error?.length) {
    throw new Error(bookData.error.join(', '));
  }

  const book = Object.values(bookData.result || {})[0];

  if (!book?.bids?.length || !book?.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: {
      exchange: 'Kraken',
      pair,
      bid: Number(book.bids[0][0]),
      bidQuantity: Number(book.bids[0][1]),
      ask: Number(book.asks[0][0]),
      askQuantity: Number(book.asks[0][1])
    }
  };
}

async function getBybitQuote(pair) {
  const symbol = pair.replace('/', '');

  const instrumentResponse = await fetch(
  `https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${symbol}`,
  {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    signal: AbortSignal.timeout(12000)
  }
);

  if (!instrumentResponse.ok) {
  throw new Error(`Mercados HTTP ${instrumentResponse.status}`);
  }

  const instruments = await instrumentResponse.json();

  if (instruments.retCode !== 0) {
    throw new Error(instruments.retMsg || 'Erro Bybit');
  }

  const market = instruments.result?.list?.find(
    item => item.symbol === symbol && item.status === 'Trading'
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const response = await fetch(
  `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=5`,
  {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    signal: AbortSignal.timeout(12000)
  }
);

  if (!response.ok) {
  throw new Error(`Livro HTTP ${response.status}`);
}

  const result = await response.json();

  if (
    result.retCode !== 0 ||
    !result.result?.b?.length ||
    !result.result?.a?.length
  ) {
    return { status: 'Livro vazio', quote: null };
  }

  const book = result.result;

  return {
    status: 'Online',
    quote: {
      exchange: 'Bybit',
      pair,
      bid: Number(book.b[0][0]),
      bidQuantity: Number(book.b[0][1]),
      ask: Number(book.a[0][0]),
      askQuantity: Number(book.a[0][1])
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
    })),

    getKrakenQuote(pair).catch(() => ({
      status: 'API indisponível',
      quote: null
    })),

    getBybitQuote(pair).catch(error => ({
  status: `Erro: ${error.message}`,
  quote: null
}))
  ]);

  const statuses = Object.fromEntries(
    exchanges.map(name => [name, 'Integração pendente'])
  );

  statuses.Binance = results[0].status;
  statuses.OKX = results[1].status;
  statuses.Kraken = results[2].status;
  statuses.Bybit = results[3].status;

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
      message: 'Consultas públicas realizadas. Nenhuma cotação simulada.'
    })
  };
};
