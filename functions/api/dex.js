
const ZEROX_API_URL = 'https://api.0x.org/swap/allowance-holder/price';

const TOKENS = {
  'USDT/BRLA': {
    inputSymbol: 'BRLA',
    inputAddress: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    inputDecimals: 18,
    outputSymbol: 'USDT',
    outputAddress: '0xc2132D05D31c914a87C6611c10748AEb04B58e8F',
    outputDecimals: 6
  },
  'USDT/BRZ': {
    inputSymbol: 'BRZ',
    inputAddress: '0x4eD141110F6EeeAbA9A1df36d8c26f684d2475Dc',
    inputDecimals: 18,
    outputSymbol: 'USDT',
    outputAddress: '0xc2132D05D31c914a87C6611c10748AEb04B58e8F',
    outputDecimals: 6
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
  const raw = BigInt(value).toString().padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

async function getZeroXPrice(context, token, amountIn) {
  const apiKey = context.env.ZEROX_API_KEY;

  if (!apiKey) {
    throw new Error('ZEROX_API_KEY não configurada na Cloudflare.');
  }

  const params = new URLSearchParams({
    chainId: '137',
    sellToken: token.inputAddress,
    buyToken: token.outputAddress,
    sellAmount: amountIn.toString()
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

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.reason ||
      data?.message ||
      data?.validationErrors?.[0]?.reason ||
      `Erro HTTP ${response.status}`;

    throw new Error(`0x API: ${message}`);
  }

  if (!data.buyAmount) {
    throw new Error('A 0x não retornou uma quantidade de saída.');
  }

  if (data.liquidityAvailable === false) {
    throw new Error('A 0x informou que não há liquidez disponível.');
  }

  const outputRaw = BigInt(data.buyAmount);

  if (outputRaw <= 0n) {
    throw new Error('Quantidade de saída inválida.');
  }

  return {
    amountOut: formatUnits(outputRaw, token.outputDecimals),
    amountOutRaw: outputRaw.toString(),
    price: data.price ?? null,
    estimatedPriceImpact: data.estimatedPriceImpact ?? null,
    liquidityAvailable: data.liquidityAvailable ?? null,
    route: data.route ?? null,
    rawResponse: data
  };
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

  let amountIn;

  try {
    amountIn = parseUnits(capital, token.inputDecimals);

    if (amountIn <= 0n) {
      throw new Error('Quantidade deve ser maior que zero.');
    }
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }

  try {
    const quote = await getZeroXPrice(context, token, amountIn);

    const result = {
      rpc: '0x Swap API',
      status: 'OK',
      bestQuote: {
        feeTier: null,
        outputAmount: quote.amountOut,
        outputAmountRaw: quote.amountOutRaw,
        price: quote.price,
        estimatedPriceImpact: quote.estimatedPriceImpact,
        liquidityAvailable: quote.liquidityAvailable,
        rawResponse: quote.rawResponse
      },
      allFeeTiers: []
    };

    return Response.json(
      {
        diagnosticMode: true,
        source: '0x Swap API v2',
        network: 'Polygon',
        chainId: 137,
        pair,
        direction: `${token.inputSymbol} → ${token.outputSymbol}`,

        inputAmount: String(capital).replace(',', '.'),
        inputAmountUnits: amountIn.toString(),

        inputSymbol: token.inputSymbol,
        inputAddress: token.inputAddress,
        inputDecimals: token.inputDecimals,

        outputSymbol: token.outputSymbol,
        outputAddress: token.outputAddress,
        outputDecimals: token.outputDecimals,

        status: 'OK',
        bestQuote: result.bestQuote,
        rpcResults: [result],

        note: 'Preço indicativo consultado pela 0x. Não executa swap. Validar liquidez, impacto e custos antes de qualquer operação.',
        updatedAt: new Date().toISOString()
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      }
    );

  } catch (error) {
    return Response.json(
      {
        diagnosticMode: true,
        source: '0x Swap API v2',
        network: 'Polygon',
        chainId: 137,
        pair,
        direction: `${token.inputSymbol} → ${token.outputSymbol}`,
        inputAmount: String(capital).replace(',', '.'),
        inputAmountUnits: amountIn.toString(),
        inputSymbol: token.inputSymbol,
        outputSymbol: token.outputSymbol,
        status: 'ERRO',
        error: String(error?.message || error).slice(0, 500),
        rpcResults: [{
          rpc: '0x Swap API',
          status: 'ERRO',
          error: String(error?.message || error).slice(0, 500)
        }],
        updatedAt: new Date().toISOString()
      },
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      }
    );
  }
}
