
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

const TOKENS = {
  'USDT/BRLA': {
    inputSymbol: 'BRLA',
    inputAddress: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    inputDecimals: 18,
    outputSymbol: 'USDT0',
    outputAddress: '0xc2132D05D31c914a87C6611c10748AEb04B58e8F',
    outputDecimals: 6
  },
  'USDT/BRZ': {
    inputSymbol: 'BRZ',
    inputAddress: '0x4eD141110F6EeeAbA9A1df36d8c26f684d2475Dc',
    inputDecimals: 18,
    outputSymbol: 'USDT0',
    outputAddress: '0xc2132D05D31c914a87C6611c10748AEb04B58e8F',
    outputDecimals: 6
  }
};

const RPCS = [
  { id: 0, name: 'Polygon RPC', url: 'https://polygon-rpc.com' },
  { id: 1, name: 'dRPC', url: 'https://polygon.drpc.org' },
  { id: 2, name: '1RPC', url: 'https://1rpc.io/matic' }
];

const FEE_TIERS = [100, 500, 3000, 10000];
const SELECTOR = 'c6a5026a';

function word(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

function addressWord(address) {
  return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

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

function encodeQuote(tokenIn, tokenOut, amountIn, fee) {
  return '0x' +
    SELECTOR +
    addressWord(tokenIn) +
    addressWord(tokenOut) +
    word(amountIn) +
    word(fee) +
    word(0);
}

async function rpcCall(rpc, data) {
  const response = await fetch(rpc.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        { to: QUOTER_V2, data },
        'latest'
      ]
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();

  if (json.error) {
    throw new Error(json.error.message || 'Erro RPC');
  }

  if (!json.result || json.result === '0x') {
    throw new Error('Resposta vazia do contrato');
  }

  return json.result;
}

function decodeAmountOut(result, decimals) {
  const hex = result.startsWith('0x') ? result.slice(2) : result;

  if (hex.length < 64) {
    throw new Error('Resposta ABI incompleta');
  }

  const raw = BigInt('0x' + hex.slice(0, 64));

  return {
    raw: raw.toString(),
    formatted: formatUnits(raw, decimals)
  };
}

async function quoteWithRpc(rpc, token, amountIn) {
  const attempts = await Promise.allSettled(
    FEE_TIERS.map(async fee => {
      const calldata = encodeQuote(
        token.inputAddress,
        token.outputAddress,
        amountIn,
        fee
      );

      const result = await rpcCall(rpc, calldata);
      const decoded = decodeAmountOut(
        result,
        token.outputDecimals
      );

      return {
        fee,
        amountOut: decoded.formatted,
        amountOutRaw: decoded.raw,
        rawResponse: result,
        calldata
      };
    })
  );

  const diagnostics = attempts.map((item, index) => {
    if (item.status === 'fulfilled') {
      return {
        status: 'OK',
        ...item.value
      };
    }

    return {
      status: 'ERRO',
      fee: FEE_TIERS[index],
      error: String(
        item.reason?.message || item.reason
      ).slice(0, 250)
    };
  });

  const valid = diagnostics
    .filter(item => item.status === 'OK')
    .filter(item => BigInt(item.amountOutRaw) > 0n)
    .sort((a, b) => {
      const x = BigInt(a.amountOutRaw);
      const y = BigInt(b.amountOutRaw);
      return x > y ? -1 : x < y ? 1 : 0;
    });

  return {
    rpc: rpc.name,
    rpcUrl: rpc.url,
    status: valid.length ? 'OK' : 'SEM COTAÇÃO',
    bestQuote: valid.length ? {
      feeTier: valid[0].fee,
      outputAmount: valid[0].amountOut,
      outputAmountRaw: valid[0].amountOutRaw,
      rawResponse: valid[0].rawResponse,
      calldata: valid[0].calldata
    } : null,
    allFeeTiers: diagnostics
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

  const rpcParam = url.searchParams.get('rpc') || 'all';

  let selectedRpcs;

  if (rpcParam === 'all') {
    selectedRpcs = RPCS;
  } else {
    const id = Number(rpcParam);
    selectedRpcs = RPCS.filter(rpc => rpc.id === id);

    if (!selectedRpcs.length) {
      return Response.json(
        { error: 'RPC inválido. Use 0, 1, 2 ou all.' },
        { status: 400 }
      );
    }
  }

  const results = await Promise.all(
    selectedRpcs.map(async rpc => {
      try {
        return await quoteWithRpc(rpc, token, amountIn);
      } catch (error) {
        return {
          rpc: rpc.name,
          rpcUrl: rpc.url,
          status: 'ERRO',
          error: String(error?.message || error).slice(0, 300)
        };
      }
    })
  );

  return Response.json(
    {
      diagnosticMode: true,
      source: 'Uniswap V3 QuoterV2',
      network: 'Polygon',
      chainId: 137,
      pair,
      direction: `${token.inputSymbol} → ${token.outputSymbol}`,

      inputAmount: String(capital).replace(',', '.'),
      inputAmountUnits: amountIn.toString(),
      inputAmountHex: '0x' + word(amountIn),

      inputSymbol: token.inputSymbol,
      inputAddress: token.inputAddress,
      inputDecimals: token.inputDecimals,

      outputSymbol: token.outputSymbol,
      outputAddress: token.outputAddress,
      outputDecimals: token.outputDecimals,

      rpcTest: rpcParam,
      rpcResults: results,

      note: 'Diagnóstico de RPC. Cotação simulada, sem execução de swap. Não utilizar para operações reais.',
      updatedAt: new Date().toISOString()
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    }
  );
}
