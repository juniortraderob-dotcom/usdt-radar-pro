
const ZEROX_API_URL = 'https://api.0x.org/swap/allowance-holder/price';

const USDT = {
  symbol: 'USDT',
  address: '0xc2132D05D31c914a87C6611c10748AEb04B58e8F',
  decimals: 6
};

const TOKENS = {
  'USDT/BRLA': {
    symbol: 'BRLA',
    address: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    decimals: 18
  },
  'USDT/BRZ': {
    symbol: 'BRZ',
    address: '0x4eD141110F6EeeAbA9A1df36d8c26f684d2475Dc',
    decimals: 18
  }
};

function parseUnits(value, decimals) {
  const normalized = String(value).trim().replace(',', '.');

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Quantidade inválida.');
  }

  const [whole, fraction = ''] = normalized.split('.');

  if (fraction.length > decimals) {
    throw new Error('Casas decimais excedem o limite do token.');
  }

  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function formatUnits(value, decimals) {
  const raw = BigInt(value)
    .toString()
    .padStart(decimals + 1, '0');

  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

async function getQuote(context, sellToken, buyToken, inputAmount) {
  const apiKey = context.env.ZEROX_API_KEY;

  if (!apiKey) {
    throw new Error('ZEROX_API_KEY não configurada na Cloudflare.');
  }

  const sellAmountRaw = parseUnits(inputAmount, sellToken.decimals);

  if (sellAmountRaw <= 0n) {
    throw new Error('Quantidade de entrada inválida.');
  }

  const params = new URLSearchParams({
    chainId: '137',
    sellToken: sellToken.address,
    buyToken: buyToken.address,
    sellAmount: sellAmountRaw.toString()
  });

  const response = await fetch(
    `${ZEROX_API_URL}?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        '0x-api-key': apiKey,
        '0x-version': 'v2',
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.reason ||
      data?.message ||
      data?.validationErrors?.[0]?.reason ||
      `Erro HTTP ${response.status}`;

    throw new Error(`0x API: ${message}`);
  }

  if (!data.buyAmount) {
    throw new Error('A 0x não retornou quantidade de saída.');
  }

  if (data.liquidityAvailable === false) {
    throw new Error('A 0x informou que não há liquidez disponível.');
  }

  const outputRaw = BigInt(data.buyAmount);

  if (outputRaw <= 0n) {
    throw new Error('Quantidade de saída inválida.');
  }

  const actualSellAmount = formatUnits(
    sellAmountRaw,
    sellToken.decimals
  );

  const actualBuyAmount = formatUnits(
    outputRaw,
    buyToken.decimals
  );

  const sellNumber = Number(actualSellAmount);
  const buyNumber = Number(actualBuyAmount);

  return {
    status: 'OK',
    sellAmount: actualSellAmount,
    buyAmount: actualBuyAmount,
    sellSymbol: sellToken.symbol,
    buySymbol: buyToken.symbol,
    unitRate: buyNumber / sellNumber,
    price: data.price || null,
    guaranteedPrice: data.guaranteedPrice || null,
    liquidityAvailable: data.liquidityAvailable,
    calculation: 'Cotação 0x para a quantidade integral informada.'
  };
}

async function safeQuote(context, sellToken, buyToken, inputAmount) {
  try {
    return await getQuote(context, sellToken, buyToken, inputAmount);
  } catch (error) {
    return {
      status: 'ERRO',
      sellSymbol: sellToken.symbol,
      buySymbol: buyToken.symbol,
      error: String(error?.message || error).slice(0, 400)
    };
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const pair = url.searchParams.get('pair') || 'USDT/BRLA';
  const token = TOKENS[pair];

  if (!token) {
    return Response.json(
      { error: 'Use USDT/BRLA ou USDT/BRZ.' },
      { status: 400 }
    );
  }

  const capital = url.searchParams.get('capital') || '1000';
  const reverseCapital = url.searchParams.get('reverseCapital') || '1000';

  try {
    const tokenRaw = parseUnits(capital, token.decimals);
    const usdtRaw = parseUnits(reverseCapital, USDT.decimals);

    if (tokenRaw <= 0n || usdtRaw <= 0n) {
      throw new Error('As quantidades devem ser maiores que zero.');
    }
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }

  // COMPRA NA DEX:
  // Envia BRLA/BRZ e recebe USDT.
  //
  // VENDA NA DEX:
  // Envia USDT e recebe BRLA/BRZ.
  const [tokenToUsdt, usdtToToken] = await Promise.all([
    safeQuote(context, token, USDT, capital),
    safeQuote(context, USDT, token, reverseCapital)
  ]);

  const successfulQuotes = [
    tokenToUsdt,
    usdtToToken
  ].filter(quote => quote.status === 'OK');

  return Response.json({
    source: '0x Swap API v2',
    network: 'Polygon',
    chainId: 137,
    pair,

    inputs: {
      tokenAmount: String(capital).replace(',', '.'),
      usdtAmount: String(reverseCapital).replace(',', '.')
    },

    directions: {
      tokenToUsdt,
      usdtToToken
    },

    status: successfulQuotes.length === 2
      ? 'OK'
      : successfulQuotes.length === 1
        ? 'PARCIAL'
        : 'ERRO',

    successfulQuotes: successfulQuotes.length,

    note: 'Cotações indicativas da 0x. Os valores podem variar conforme rota, liquidez, impacto, slippage e taxas.',

    updatedAt: new Date().toISOString()
  }, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}
