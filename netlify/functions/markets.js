const exchanges = [
  'Binance', 'OKX', 'Kraken', 'Bybit', 'Ripio',
  'BitcoinTrade', 'Bitget', 'Bitso', 'MEXC',
  'KuCoin', 'Coinext'
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
    return {
      status: 'Par não configurado',
      quote: null
    };
  }

  const url =
    `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=5`;

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });

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
    return {
      status: 'Livro de ofertas vazio',
      quote: null
    };
  }

  return {
    status: 'Online',
    quote: {
      exchange: 'Binance',
      pair,
      symbol,
      bid: Number(book.bids[0][0]),
      bidQuantity: Number(book.bids[0][1]),
      ask: Number(book.asks[0][0]),
      askQuantity: Number(book.asks[0][1]),
      updatedAt: new Date().toISOString()
    }
  };
}

exports.handler = async (event) => {
  const pair = event.queryStringParameters?.pair || 'USDT/BRL';

  let binance;

  try {
    binance = await getBinanceQuote(pair);
  } catch (error) {
    binance = {
      status: 'API indisponível',
      quote: null
    };
  }

  const statuses = Object.fromEntries(
    exchanges.map(name => [
      name,
      name === 'Binance'
        ? binance.status
        : 'Integração pendente'
    ])
  );

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
      quotes: binance.quote ? [binance.quote] : [],
      opportunities: [],
      message: binance.quote
        ? 'Binance conectada. Aguardando integração de outra corretora para calcular arbitragem.'
        : 'Não foi possível obter uma cotação válida da Binance.'
    })
  };
};

