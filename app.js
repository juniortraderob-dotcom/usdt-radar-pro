
const $ = id => document.getElementById(id);

const names = [
  'Binance','OKX','Bybit','Bitget',
  'MEXC','KuCoin','Foxbit','Bitso'
];

let latestOpportunities = [];

function money(value){
  return Number(value).toLocaleString('pt-BR',{
    style:'currency',currency:'BRL'
  });
}

function safe(value){
  return String(value).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function setupFilters(){
  ['buyFilter','sellFilter'].forEach(id=>{
    names.forEach(name=>{
      const option=document.createElement('option');
      option.value=name;
      option.textContent=name;
      $(id).appendChild(option);
    });
  });
}

function renderExchanges(statuses){
  const container=$('exchanges');
  container.replaceChildren();

  names.forEach(name=>{
    const card=document.createElement('div');
    card.className='source';

    const title=document.createElement('strong');
    title.textContent=name;

    const status=document.createElement('span');
    status.textContent=statuses[name]||'Integração pendente';
    status.className=status.textContent==='Online'?'positive':'neutral';

    card.append(title,status);
    container.appendChild(card);
  });
}

function calculateOpportunities(quotes){
  const results=[];

  for(const buy of quotes){
    for(const sell of quotes){
      if(buy.exchange===sell.exchange || buy.pair!==sell.pair) continue;

      const spread=((sell.bid-buy.ask)/buy.ask)*100;
      if(!Number.isFinite(spread)) continue;

      results.push({
        buyExchange:buy.exchange,
        sellExchange:sell.exchange,
        pair:buy.pair,
        ask:buy.ask,
        bid:sell.bid,
        spread,
        quantity:Math.min(buy.askQuantity,sell.bidQuantity)
      });
    }
  }

  return results.sort((a,b)=>b.spread-a.spread);
}

function renderOpportunities(){
  const capital=Math.max(0,Number($('capital').value)||0);
  const buy=$('buyFilter').value;
  const sell=$('sellFilter').value;
  const filter=$('resultFilter').value;

  const filtered=latestOpportunities.filter(item=>{
    if(buy!=='all'&&item.buyExchange!==buy)return false;
    if(sell!=='all'&&item.sellExchange!==sell)return false;
    if(filter==='positive'&&item.spread<=0)return false;
    if(filter==='negative'&&item.spread>=0)return false;
    return true;
  });

  $('count').textContent=latestOpportunities.filter(x=>x.spread>0).length;

  if(!filtered.length){
    $('rows').innerHTML='<p class="empty-results">Nenhuma combinação disponível para os filtros selecionados.</p>';
    $('best').textContent='—';
    $('best').className='neutral';
    $('profit').textContent='Nenhuma oportunidade calculável';
    $('route').textContent='Aguardando cotações compatíveis';
    $('net').textContent=$('includeCosts').checked?'—':'Desativado';
    return;
  }

  $('rows').innerHTML=filtered.map(item=>{
    const gross=capital*item.spread/100;
    const cls=item.spread>0?'positive':item.spread<0?'negative':'neutral';

    return `
      <article class="opportunity-card">
        <div class="exchange-comparison">
          <div class="exchange-side buy-side">
            <small>COMPRAR USDT</small>
            <strong>${safe(item.buyExchange)}</strong>
            <span>ASK: ${money(item.ask)}</span>
          </div>
          <div class="exchange-arrow">→</div>
          <div class="exchange-side sell-side">
            <small>VENDER USDT</small>
            <strong>${safe(item.sellExchange)}</strong>
            <span>BID: ${money(item.bid)}</span>
          </div>
        </div>
        <div class="opportunity-details">
          <span>Par: <b>${safe(item.pair)}</b></span>
          <span>Spread: <b class="${cls}">${item.spread>0?'+':''}${item.spread.toFixed(3)}%</b></span>
          <span>Lucro/prejuízo bruto: <b class="${cls}">${money(gross)}</b></span>
          <span>Quantidade disponível no primeiro nível: <b>${item.quantity.toFixed(4)} USDT</b></span>
        </div>
      </article>`;
  }).join('');

  const best=filtered[0];
  const gross=capital*best.spread/100;
  const cls=best.spread>0?'positive':best.spread<0?'negative':'neutral';

  $('best').textContent=(best.spread>0?'+':'')+best.spread.toFixed(3)+'%';
  $('best').className=cls;
  $('profit').textContent=(gross>=0?'Lucro bruto estimado: ':'Prejuízo bruto estimado: ')+money(Math.abs(gross));
  $('route').textContent=best.buyExchange+' → '+best.sellExchange;

  const cost=Math.max(0,Number($('cost').value)||0);
  $('net').textContent=$('includeCosts').checked?money(gross-cost):'Desativado';

  $('history').textContent=new Date().toLocaleTimeString('pt-BR')+
    ' · '+best.buyExchange+' → '+best.sellExchange+
    ' · '+(best.spread>0?'+':'')+best.spread.toFixed(3)+'%';
}

async function refresh(){
  $('updated').textContent='Consultando...';

  try{
    const pair=$('pair').value;
    const response=await fetch('/api/markets?pair='+encodeURIComponent(pair),{cache:'no-store'});
    if(!response.ok)throw new Error('API HTTP '+response.status);

    const data=await response.json();
    const statuses=data.statuses||{};
    renderExchanges(statuses);

    $('online').textContent=(data.onlineCount??Object.values(statuses).filter(x=>x==='Online').length)+' / '+names.length;

    latestOpportunities=calculateOpportunities(data.quotes||[]);
    renderOpportunities();

    $('updated').textContent=new Date().toLocaleTimeString('pt-BR');
  }catch(error){
    console.error(error);
    $('updated').textContent='Erro na consulta';
    $('rows').textContent='Não foi possível consultar a API. Verifique a conexão e tente novamente.';
  }
}

setupFilters();

$('refresh').addEventListener('click',refresh);
$('pair').addEventListener('change',refresh);
$('buyFilter').addEventListener('change',renderOpportunities);
$('sellFilter').addEventListener('change',renderOpportunities);
$('resultFilter').addEventListener('change',renderOpportunities);
$('capital').addEventListener('input',renderOpportunities);
$('cost').addEventListener('input',renderOpportunities);

$('includeCosts').addEventListener('change',()=>{
  $('cost').disabled=!$('includeCosts').checked;
  renderOpportunities();
});

const sidebar=$('sidebar');
const backdrop=document.createElement('div');
backdrop.className='menu-backdrop';
backdrop.hidden=true;
document.body.appendChild(backdrop);

function closeMenu(){
  sidebar.classList.remove('open');
  backdrop.hidden=true;
}

$('menu').addEventListener('click',()=>{
  const opening=!sidebar.classList.contains('open');
  sidebar.classList.toggle('open',opening);
  backdrop.hidden=!opening;
});

backdrop.addEventListener('click',closeMenu);
sidebar.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));

renderExchanges({});
refresh();
setInterval(refresh,10000);
