const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

const USDT0 = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

const TOKENS = {
  'USDT/BRLA': {
    inputSymbol: 'BRLA',
    inputAddress: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    inputDecimals: 18,
    outputSymbol: 'USDT0',
    outputAddress: USDT0,
    outputDecimals: 6
  },
  'USDT/BRZ': {
    inputSymbol: 'BRZ',
    inputAddress: '0x4eD141110F6EeeAbA9A1df36d8c26f684d2475Dc',
    inputDecimals: 18,
    outputSymbol: 'USDT0',
    outputAddress: USDT0,
    outputDecimals: 6
  }
};

const RPCS = [
  'https://polygon-rpc.com',
  'https://polygon.drpc.org',
  'https://1rpc.io/matic'
];

const FEE_TIERS = [100, 500, 3000, 10000];
const SELECTOR = 'c6a5026a';

function word(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

function addressWord(address) {
  return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

// Converte uma quantia decimal para unidades inteiras sem perder precisão.
function parseUnits(value, decimals) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Capital inválido.');
  }

  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) {
    throw new Error('O capital tem casas decimais demais.');
  }

  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function encodeQuote(tokenIn, tokenOut, amountIn, fee) {
  // Uniswap V3 QuoterV2:
  // quoteExactInputSingle((address,address,uint256,uint24,uint160))
  return '0x' + SELECTOR +
    addressWord(tokenIn) +
    addressWord(tokenOut) +
    word(amountIn) +
    word(fee) +
    word(0);
}

async function rpcCall(rpc, data) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: QUOTER_V2, data }, 'latest']
    }),
    signal: AbortSignal.timeout(9000)
  });

  if (!response.ok) throw new Error('RPC HTTP ' + response.status);

  const json = await response.json();
  if (json.error) throw new Error(json.error.message || 'Falha RPC');
  if (!json.result || json.result === '0x') {
    throw new Error('Pool sem cotação');
  }

  return json.result;
}

function decodeAmountOut(result, decimals) {
  const hex = result.slice(2);
  if (hex.length < 64) throw new Error('Resposta inválida do Quoter');

  const raw = BigInt('0x' + hex.slice(0, 64));
  return Number(raw) / (10 ** decimals);
}

async function quoteWithRpc(rpc, token, amountIn) {
  const attempts = await Promise.allSettled(
    FEE_TIERS.map(async fee => {
      const data = encodeQuote(
        token.inputAddress,
        token.outputAddress,
        amountIn,
        fee
      );

      const result = await rpcCall(rpc, data);

      return {
        fee,
        amountOut: decodeAmountOut(result, token.outputDecimals)
      };
    })
  );

  const valid = attempts
    .filter(item => item.status === 'fulfilled')
    .map(item => item.value)
    .filter(item =>
      Number.isFinite(item.amountOut) && item.amountOut > 0
    )
    .sort((a, b) => b.amountOut - a.amountOut);

  if (!valid.length) {
    const failure = attempts.find(item => item.status === 'rejected');
    throw new Error(
      failure?.reason?.message || 'Nenhum pool com liquidez encontrado.'
    );
  }

  return valid[0];
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const pair = url.searchParams.get('pair') || 'USDT/BRLA';
  const token = TOKENS[pair];

  if (!token) {
    return Response.json(
      { error: 'Par DEX não suportado. Use USDT/BRLA ou USDT/BRZ.' },
      { status: 400 }
    );
  }

  const capital = url.searchParams.get('capital') || '1000';

  let amountIn;
  try {
    amountIn = parseUnits(capital, token.inputDecimals);
    if (amountIn <= 0n) throw new Error('Capital deve ser maior que zero.');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  let lastError;

  for (const rpc of RPCS) {
    try {
      const quote = await quoteWithRpc(rpc, token, amountIn);

      return Response.json({
        source: 'Uniswap v3 QuoterV2',
        network: 'Polygon',
        chainId: 137,
        pair,
        direction: token.inputSymbol + ' → ' + token.outputSymbol,
        inputAmount: Number(capital.replace(',', '.')),
        inputSymbol: token.inputSymbol,
        outputAmount: quote.amountOut,
        outputSymbol: token.outputSymbol,
        feeTier: quote.fee,
        capitalCurrency: 'BRL',
        note: 'Cotação simulada em um pool da Uniswap v3. Não inclui gas, slippage adicional, custos de entrada ou saída e não garante execução.',
        updatedAt: new Date().toISOString()
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    } catch (error) {
      lastError = error;
    }
  }

  return Response.json({
    source: 'Uniswap v3 QuoterV2',
    network: 'Polygon',
    pair,
    error: lastError?.message ||
      'Não foi possível consultar os RPCs da Polygon.',
    note: 'Nenhuma cotação foi confirmada. Não trate como oportunidade.'
  }, { status: 503 });
}
