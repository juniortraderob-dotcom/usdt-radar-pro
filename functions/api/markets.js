
const EXCHANGES = [
  'Binance','OKX','Bybit','Bitget',
  'MEXC','KuCoin','Foxbit','Bitso'
];

const PENDING = 'Integração pendente';

async function fetchJson(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),9000);

  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json'},
      signal:controller.signal,
      cf:{cacheTtl:0,cacheEverything:false}
    });

    if(!response.ok)throw new Error('HTTP '+response.status);
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}

function validLevel(level){
  return Array.isArray(level)&&level.length>=2&&
    Number.isFinite(Number(level[0]))&&Number(level[0])>0&&
    Number.isFinite(Number(level[1]))&&Number(level[1])>0;
}

function quote(exchange,bid,bidQuantity,ask,askQuantity){
  return {
    exchange,
    pair:'USDT/BRL',
    bid:Number(bid),
    bidQuantity:Number(bidQuantity),
    ask:Number(ask),
    askQuantity:Number(askQuantity)
  };
}

async function getMexcQuote(){
  const symbol='BRLUSDT';

  const info=await fetchJson(
    `https://api.mexc.com/api/v3/exchangeInfo?symbol=${symbol}`
  );

  const market=info.symbols?.find(item=>item.symbol===symbol);

  if(!market)throw new Error('Par BRLUSDT não encontrado na MEXC');

  const book=await fetchJson(
    `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=5`
  );

  if(!validLevel(book.bids?.[0])||!validLevel(book.asks?.[0])){
    throw new Error('Livro MEXC sem ofertas válidas');
  }

  const bidBRL=Number(book.bids[0][0]);
  const bidQtyBRL=Number(book.bids[0][1]);
  const askBRL=Number(book.asks[0][0]);
  const askQtyBRL=Number(book.asks[0][1]);

  // Conversão do livro BRL/USDT para USDT/BRL.
  const bidUSDTBRL=1/askBRL;
  const askUSDTBRL=1/bidBRL;

  const bidQtyUSDT=askQtyBRL*askBRL;
  const askQtyUSDT=bidQtyBRL*bidBRL;

  return quote(
    'MEXC',
    bidUSDTBRL,
    bidQtyUSDT,
    askUSDTBRL,
    askQtyUSDT
  );
}

async function getBinanceQuote(){
  const hosts=[
    'https://api1.binance.com',
    'https://data-api.binance.vision',
    'https://api.binance.com'
  ];

  let lastError;

  for(const host of hosts){
    try{
      const book=await fetchJson(
        `${host}/api/v3/depth?symbol=USDTBRL&limit=5`
      );

      if(!validLevel(book.bids?.[0])||!validLevel(book.asks?.[0])){
        throw new Error('Livro Binance sem ofertas válidas');
      }

      return quote(
        'Binance',
        book.bids[0][0],
        book.bids[0][1],
        book.asks[0][0],
        book.asks[0][1]
      );
    }catch(error){
      lastError=error;
    }
  }

  throw lastError||new Error('Binance indisponível');
}

function errorMessage(error){
  return 'Erro: '+String(error?.message||'Falha na consulta')
    .replace(/[\r\n]/g,' ').slice(0,100);
}

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const requestedPair=url.searchParams.get('pair')||'USDT/BRL';

  const allowed=[
    'USDT/BRL','USDT/BRLA','USDT/BRL1','USDT/BRZ'
  ];

  const pair=allowed.includes(requestedPair)?requestedPair:'USDT/BRL';

  const statuses=Object.fromEntries(
    EXCHANGES.map(name=>[name,PENDING])
  );

  const quotes=[];

  if(pair==='USDT/BRL'){
    const results=await Promise.allSettled([
      getBinanceQuote(),
      getMexcQuote()
    ]);

    results.forEach((result,index)=>{
      const name=index===0?'Binance':'MEXC';

      if(result.status==='fulfilled'){
        quotes.push(result.value);
        statuses[name]='Online';
      }else{
        statuses[name]=errorMessage(result.reason);
      }
    });
  }else{
    statuses.Binance='Par ainda não integrado';
    statuses.MEXC='Par ainda não integrado';
  }

  const onlineCount=Object.values(statuses)
    .filter(status=>status==='Online').length;

  return Response.json({
    updatedAt:new Date().toISOString(),
    pair,
    onlineCount,
    statuses,
    quotes,
    message:'Cotações públicas do primeiro nível do livro. Confira profundidade, taxas e limites antes de operar.'
  },{
    headers:{
      'Cache-Control':'no-store, no-cache, must-revalidate',
      'Pragma':'no-cache'
    }
  });
}
