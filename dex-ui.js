
function calculate(quotes, data) {
  const reverse = data?.directions?.tokenToUsdt;
  const cap = capital();

  if (!reverse || reverse.status !== 'OK' || !(cap > 0)) {
    return [];
  }

  // Cotação real: BRLA usado para comprar USDT na 0x.
  const tokenInput = Number(reverse.sellAmount);
  const usdtAmount = Number(reverse.buyAmount);

  if (
    !(tokenInput > 0) ||
    !(usdtAmount > 0) ||
    !Number.isFinite(tokenInput) ||
    !Number.isFinite(usdtAmount)
  ) {
    return [];
  }

  // Custo efetivo de cada USDT comprado na LlamaSwap.
  const dexBuyPrice = tokenInput / usdtAmount;

  const result = [];

  for (const quote of quotes) {
    if (!CEX.includes(quote.exchange)) continue;

    // BID: preço pelo qual a corretora compra o USDT.
    const bid = Number(quote.bid);

    if (!(bid > 0) || !Number.isFinite(bid)) continue;

    // Valor recebido ao vender exatamente a quantidade
    // estimada de USDT na corretora.
    const finalValue = usdtAmount * bid;

    // Spread da operação LlamaSwap -> corretora.
    const spread = ((finalValue / tokenInput) - 1) * 100;

    if (!Number.isFinite(spread)) continue;

    const grossResult = finalValue - tokenInput;

    result.push({
      exchange: quote.exchange,
      direction: 'DEX_TO_CEX',

      leftName: DEX,
      rightName: quote.exchange,

      leftAction: 'COMPRAR USDT',
      rightAction: 'VENDER USDT',

      leftPrice: dexBuyPrice,
      rightPrice: bid,

      buyLocation: DEX,
      sellLocation: quote.exchange,
      buyPrice: dexBuyPrice,
      sellPrice: bid,

      usdtAmount,
      tokenAmount: tokenInput,

      capital: tokenInput,
      finalValue,
      grossResult,
      spread,

      route: `${DEX} → ${quote.exchange}`,
      operationRoute: `${DEX} → ${quote.exchange}`
    });
  }

  // Mostra primeiro o resultado mais negativo.
  return result.sort((a, b) => a.spread - b.spread);
}
