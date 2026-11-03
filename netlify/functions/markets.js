
const exchanges = [
  'Binance',
  'OKX',
  'Kraken',
  'Bybit',
  'Ripio',
  'Bitget',
  'MEXC',
  'KuCoin',
  'Foxbit'
];

const binanceSymbols = {
  'USDT/BRL': 'USDTBRL',
  'USDT/BRLA': 'USDTBRLA',
  'USDT/BRL1': 'USDTBRL1',
  'USDT/BRZ': 'USDTBRZ'
};

const timeout = 12000;

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(timeout)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function makeQuote(exchange, pair, bid, bidQuantity, ask, askQuantity) {
  bid = Number(bid);
  bidQuantity = Number(bidQuantity);
  ask = Number(ask);
  askQuantity = Number(askQuantity);

  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    !Number.isFinite(bidQuantity) ||
    !Number.isFinite(askQuantity) ||
    bid <= 0 ||
    ask <= 0 ||
    bidQuantity <= 0 ||
    askQuantity <= 0
  ) {
    throw new Error('Livro com dados inválidos');
  }

  return {
    exchange,
    pair,
    bid,
    bidQuantity,
    ask,
    askQuantity
  };
}

async function getBinanceQuote(pair) {
  const symbol = binanceSymbols[pair];

  if (!symbol) {
    return { status: 'Par não configurado', quote: null };
  }

  const book = await getJson(
    `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=5`
  );

  if (!book.bids?.length || !book.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'Binance',
      pair,
      book.bids[0][0],
      book.bids[0][1],
      book.asks[0][0],
      book.asks[0][1]
    )
  };
}

async function getOkxQuote(pair) {
  const instId = pair.replace('/', '-');

  const instruments = await getJson(
    'https://www.okx.com/api/v5/public/instruments?instType=SPOT'
  );

  const exists = instruments.data?.some(
    item => item.instId === instId && item.state === 'live'
  );

  if (!exists) {
    return { status: 'Par não disponível', quote: null };
  }

  const result = await getJson(
    `https://www.okx.com/api/v5/market/books?instId=${instId}&sz=5`
  );

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
    quote: makeQuote(
      'OKX',
      pair,
      book.bids[0][0],
      book.bids[0][1],
      book.asks[0][0],
      book.asks[0][1]
    )
  };
}

async function getKrakenQuote(pair) {
  const data = await getJson(
    'https://api.kraken.com/0/public/AssetPairs'
  );

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

  const bookData = await getJson(
    `https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(marketKey)}&count=5`
  );

  if (bookData.error?.length) {
    throw new Error(bookData.error.join(', '));
  }

  const book = Object.values(bookData.result || {})[0];

  if (!book?.bids?.length || !book?.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'Kraken',
      pair,
      book.bids[0][0],
      book.bids[0][1],
      book.asks[0][0],
      book.asks[0][1]
    )
  };
}

async function getBybitQuote(pair) {
  const symbol = pair.replace('/', '');

  const instruments = await getJson(
    `https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${symbol}`
  );

  if (instruments.retCode !== 0) {
    throw new Error(instruments.retMsg || 'Erro Bybit');
  }

  const market = instruments.result?.list?.find(
    item => item.symbol === symbol && item.status === 'Trading'
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const result = await getJson(
    `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=5`
  );

  if (result.retCode !== 0) {
    throw new Error(result.retMsg || 'Erro no livro Bybit');
  }

  if (!result.result?.b?.length || !result.result?.a?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'Bybit',
      pair,
      result.result.b[0][0],
      result.result.b[0][1],
      result.result.a[0][0],
      result.result.a[0][1]
    )
  };
}

async function getRipioQuote(pair) {
  const symbol = pair.replace('/', '_');

  const marketData = await getJson(
    `https://api.ripiotrade.co/v4/public/pairs?pair=${symbol}&countries=BR`
  );

  const market = marketData.data?.find(
    item => item.symbol === symbol && item.enabled === true
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const bookData = await getJson(
    `https://api.ripiotrade.co/v4/public/orders/level-2?pair=${symbol}&limit=5`
  );

  const book = bookData.data;

  if (!book?.bids?.length || !book?.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'Ripio',
      pair,
      book.bids[0].price,
      book.bids[0].amount,
      book.asks[0].price,
      book.asks[0].amount
    )
  };
}

async function getBitgetQuote(pair) {
  const symbol = pair.replace('/', '');

  const instruments = await getJson(
    `https://api.bitget.com/api/v2/spot/public/symbols?symbol=${symbol}`
  );

  if (instruments.code !== '00000') {
    throw new Error(instruments.msg || 'Erro instrumentos Bitget');
  }

  const market = instruments.data?.find(
    item =>
      item.symbol === symbol &&
      String(item.status).toLowerCase() === 'online'
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const result = await getJson(
    `https://api.bitget.com/api/v3/market/orderbook?category=SPOT&symbol=${symbol}&limit=5`
  );

  if (result.code !== '00000') {
    throw new Error(result.msg || 'Erro livro Bitget');
  }

  if (!result.data?.b?.length || !result.data?.a?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'Bitget',
      pair,
      result.data.b[0][0],
      result.data.b[0][1],
      result.data.a[0][0],
      result.data.a[0][1]
    )
  };
}

async function getMexcQuote(pair) {
  if (pair !== 'USDT/BRL') {
    return { status: 'Par não disponível', quote: null };
  }

  const symbol = 'BRLUSDT';

  const instruments = await getJson(
    `https://api.mexc.com/api/v3/exchangeInfo?symbol=${symbol}`
  );

  const market = instruments.symbols?.find(
    item =>
      item.symbol === symbol &&
      Number(item.status) === 1 &&
      item.isSpotTradingAllowed === true
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const book = await getJson(
    `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=5`
  );

  if (!book.bids?.length || !book.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  const originalBid = Number(book.bids[0][0]);
  const originalBidQuantity = Number(book.bids[0][1]);

  const originalAsk = Number(book.asks[0][0]);
  const originalAskQuantity = Number(book.asks[0][1]);

  if (
    originalBid <= 0 ||
    originalAsk <= 0 ||
    originalBidQuantity <= 0 ||
    originalAskQuantity <= 0
  ) {
    return { status: 'Dados inválidos', quote: null };
  }

  const normalizedBid = 1 / originalAsk;
  const normalizedAsk = 1 / originalBid;

  const normalizedBidQuantity =
    originalAskQuantity * originalAsk;

  const normalizedAskQuantity =
    originalBidQuantity * originalBid;

  return {
    status: 'Online',
    quote: makeQuote(
      'MEXC',
      pair,
      normalizedBid,
      normalizedBidQuantity,
      normalizedAsk,
      normalizedAskQuantity
    )
  };
}

async function getKucoinQuote(pair) {
  const symbol = pair.replace('/', '-');

  const instruments = await getJson(
    `https://api.kucoin.com/api/v2/symbols/${symbol}`
  );

  if (
    instruments.code !== '200000' ||
    !instruments.data?.enableTrading
  ) {
    return { status: 'Par não disponível', quote: null };
  }

  const result = await getJson(
    `https://api.kucoin.com/api/v1/market/orderbook/level2_20?symbol=${symbol}`
  );

  if (
    result.code !== '200000' ||
    !result.data?.bids?.length ||
    !result.data?.asks?.length
  ) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'KuCoin',
      pair,
      result.data.bids[0][0],
      result.data.bids[0][1],
      result.data.asks[0][0],
      result.data.asks[0][1]
    )
  };
}

async function getFoxbitQuote(pair) {
  const [base, quote] = pair.toLowerCase().split('/');

  const marketsData = await getJson(
    'https://api.foxbit.com.br/rest/v3/markets'
  );

  const market = marketsData.data?.find(
    item =>
      item.base?.symbol === base &&
      item.quote?.symbol === quote
  );

  if (!market) {
    return { status: 'Par não disponível', quote: null };
  }

  const book = await getJson(
    `https://api.foxbit.com.br/rest/v3/markets/${encodeURIComponent(market.symbol)}/orderbook`
  );

  if (!book.bids?.length || !book.asks?.length) {
    return { status: 'Livro vazio', quote: null };
  }

  return {
    status: 'Online',
    quote: makeQuote(
      'Foxbit',
      pair,
      Number(book.bids[0][0]),
      book.bids[0][1],
      Number(book.asks[0][0]),
      book.asks[0][1]
    )
  };
}

function errorResult(error) {
  const message = String(error?.message || 'Erro desconhecido')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 100);

  return {
    status: `Erro: ${message}`,
    quote: null
  };
}

exports.handler = async event => {
  const allowedPairs = [
    'USDT/BRL',
    'USDT/BRLA',
    'USDT/BRL1',
    'USDT/BRZ'
  ];

  const requestedPair =
    event.queryStringParameters?.pair || 'USDT/BRL';

  const pair = allowedPairs.includes(requestedPair)
    ? requestedPair
    : 'USDT/BRL';

  const integrations = [
    ['Binance', getBinanceQuote],
    ['OKX', getOkxQuote],
    ['Kraken', getKrakenQuote],
    ['Bybit', getBybitQuote],
    ['Ripio', getRipioQuote],
    ['Bitget', getBitgetQuote],
    ['MEXC', getMexcQuote],
    ['KuCoin', getKucoinQuote],
    ['Foxbit', getFoxbitQuote]
  ];

  const results = await Promise.all(
    integrations.map(async ([name, fn]) => {
      try {
        return await fn(pair);
      } catch (error) {
        return errorResult(error);
      }
    })
  );

  const statuses = Object.fromEntries(
    exchanges.map(name => [name, 'Integração pendente'])
  );

  integrations.forEach(([name], index) => {
    statuses[name] = results[index].status;
  });

  const quotes = results
    .filter(result => result.quote)
    .map(result => result.quote);

  const onlineCount = Object.values(statuses)
    .filter(status => status === 'Online').length;

  // Cálculo das oportunidades entre corretoras diferentes.
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

  opportunities.sort(
    (a, b) => b.spreadPct - a.spreadPct
  );

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({
      updatedAt: new Date().toISOString(),
      pair,
      onlineCount,
      statuses,
      quotes,
      opportunities,
      message:
        'Cotações públicas consultadas. Oportunidades calculadas com preços do primeiro nível do livro.'
    })
  };
};
