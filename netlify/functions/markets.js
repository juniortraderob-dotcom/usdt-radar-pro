const exchanges = [
  'Binance', 'OKX', 'Kraken', 'Bybit', 'Ripio',
  'BitcoinTrade', 'Bitget', 'Bitso', 'MEXC',
  'KuCoin', 'Coinext'
];

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({
      updatedAt: new Date().toISOString(),
      onlineCount: 0,
      statuses: Object.fromEntries(
        exchanges.map(name => [name, 'Integração pendente'])
      ),
      opportunities: [],
      message: 'APIs ainda não integradas. Nenhuma cotação simulada.'
    })
  };
};
