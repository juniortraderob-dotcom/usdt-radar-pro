const LLAMA_QUOTE_URL = 'https://swap-api.defillama.com/dexAggregatorQuote';
const POLYGON_RPC = 'https://polygon-bor-rpc.publicnode.com';

const USDT = {
  symbol: 'USDT0', name: 'USDT0',
  address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  decimals: 6, chainId: 137,
  logoURI: 'https://token-icons.llamao.fi/icons/tokens/137/0xc2132d05d31c914a87c6611c10748aeb04b58e8f?h=48&w=48',
  tags: [], eip2612: false, label: 'USDT0',
  value: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  logoURI2: 'https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png',
  volume24h: 0
};

const TOKENS = {
  'USDT/BRLA': {
    symbol: 'BRLA', name: 'BRLA Token',
    address: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    decimals: 18, chainId: 137, geckoId: null,
    logoURI: 'https://token-icons.llamao.fi/icons/tokens/137/0xe6a537a407488807f0bbeb0038b79004f19dddfb?h=48&w=48',
    isGeckoToken: true, label: 'BRLA',
    value: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    logoURI2: null, volume24h: 0
  },
  'USDT/BRZ': {
    symbol: 'BRZ', name: 'Brazilian Digital Token',
    address: '0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc',
    decimals: 18, chainId: 137, geckoId: null,
    logoURI: 'https://token-icons.llamao.fi/icons/tokens/137/0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc?h=48&w=48',
    isGeckoToken: false, label: 'BRZ',
    value: '0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc',
    logoURI2: null, volume24h: 0
  }
};

const DEFAULT_QUOTE_ADDRESS = '0x000000000000000000000000000000000000dEaD';

function parseUnits(value, decimals) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error('Quantidade inválida.');
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) throw new Error('Casas decimais excedem o limite do token.');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function formatUnits(value, decimals) {
  const raw = BigInt(value).toString().padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole;
}

async function getPolygonGasPrice() {
  const response = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Falha ao consultar o gás da Polygon.');
  const data = await response.json();
  if (!data.result) throw new Error('A Polygon não retornou o preço do gás.');
  return Number(BigInt(data.result));
}

async function getLlamaQuote(context, sellToken, buyToken, amountIn, amountLabel, gasPrice) {
  const apiKey = context.env.LLAMASWAP_API_KEY;
  if (!apiKey) throw new Error('Configure LLAMASWAP_API_KEY nas variáveis de ambiente do Cloudflare Pages.');

  const params = new URLSearchParams({
    protocol: '1inch', chain: 'polygon', from: sellToken.address,
    to: buyToken.address, amount: amountIn.toString(), api_key: apiKey
  });

  const body = {
    gasPriceData: { gasPrice },
    userAddress: context.env.LLAMASWAP_USER_ADDRESS || DEFAULT_QUOTE_ADDRESS,
    amount: String(amountLabel).replace(',', '.'),
    fromToken: sellToken,
    toToken: buyToken,
    slippage: '0.1',
    isPrivacyEnabled: false,
    amountOut: '0'
  };

  const response = await fetch(LLAMA_QUOTE_URL + '?' + params.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Accept': '*/*',
      'Origin': 'https://swap.defillama.com',
      'Referer': 'https://swap.defillama.com/'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('LlamaSwap (' + (data?.error || data?.message || ('HTTP ' + response.status)) + ')');
  }
  if (!data.amountReturned) throw new Error('LlamaSwap não retornou amountReturned.');

  const outputRaw = BigInt(data.amountReturned);
  if (outputRaw <= 0n) throw new Error('Quantidade de saída inválida.');

  return {
    status: 'OK',
    sellAmount: formatUnits(amountIn, sellToken.decimals),
    buyAmount: formatUnits(outputRaw, buyToken.decimals),
    sellAmountRaw: amountIn.toString(),
    buyAmountRaw: outputRaw.toString(),
    sellSymbol: sellToken.symbol,
    buySymbol: buyToken.symbol,
    estimatedGas: data.estimatedGas ?? null,
    provider: '1inch',
    source: 'LlamaSwap'
  };
}

async function safeQuote(context, sellToken, buyToken, amountIn, amountLabel, gasPrice) {
  try {
    return await getLlamaQuote(context, sellToken, buyToken, amountIn, amountLabel, gasPrice);
  } catch (error) {
    return {
      status: 'ERRO', sellSymbol: sellToken.symbol, buySymbol: buyToken.symbol,
      error: String(error?.message || error).slice(0, 400)
    };
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const pair = url.searchParams.get('pair') || 'USDT/BRLA';
  const token = TOKENS[pair];
  if (!token) return Response.json({ error: 'Use USDT/BRLA ou USDT/BRZ.' }, { status: 400 });

  const capital = url.searchParams.get('capital') || '1000';
  const reverseCapital = url.searchParams.get('reverseCapital') || '1000';
  let tokenAmount;
  let usdtAmount;

  try {
    tokenAmount = parseUnits(capital, token.decimals);
    usdtAmount = parseUnits(reverseCapital, USDT.decimals);
    if (tokenAmount <= 0n || usdtAmount <= 0n) throw new Error('As quantidades devem ser maiores que zero.');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  try {
    const gasPrice = await getPolygonGasPrice();
    const [tokenToUsdt, usdtToToken] = await Promise.all([
      safeQuote(context, token, USDT, tokenAmount, capital, gasPrice),
      safeQuote(context, USDT, token, usdtAmount, reverseCapital, gasPrice)
    ]);
    const successfulQuotes = [tokenToUsdt, usdtToToken].filter(q => q.status === 'OK');

    return Response.json({
      source: 'LlamaSwap', provider: '1inch', network: 'Polygon', chainId: 137, pair,
      inputs: { tokenAmount: String(capital).replace(',', '.'), usdtAmount: String(reverseCapital).replace(',', '.') },
      directions: { tokenToUsdt, usdtToToken },
      status: successfulQuotes.length === 2 ? 'OK' : successfulQuotes.length === 1 ? 'PARCIAL' : 'ERRO',
      successfulQuotes: successfulQuotes.length,
      note: 'Cotação indicativa do agregador LlamaSwap/1inch. Nenhuma transação é executada.',
      updatedAt: new Date().toISOString()
    }, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
    });
  } catch (error) {
    return Response.json({
      source: 'LlamaSwap', status: 'ERRO',
      error: String(error?.message || error).slice(0, 400),
      updatedAt: new Date().toISOString()
    }, { status: 502 });
  }
}
