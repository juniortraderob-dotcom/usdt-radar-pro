const $=id=>document.getElementById(id);const names=['Binance','OKX','Kraken','Bybit','Ripio','BitcoinTrade','Bitget','Bitso','MEXC','KuCoin','Coinext'];$('exchanges').innerHTML=names.map(n=>`<div class="source">${n}<span>Integração pendente</span></div>`).join('');function money(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}function color(el,v){el.className=v>0?'positive':v<0?'negative':'neutral'}async function refresh(){try{let r=await fetch('/.netlify/functions/markets?pair='+encodeURIComponent($('pair').value),{cache:'no-store'});let d=await r.json();if(d.statuses){
  $('exchanges').innerHTML=names.map(n=>{
    const s=d.statuses[n]||'Sem status';
    const cls=s==='Online'?'positive':'neutral';

    return `<div class="source">${n}<span class="${cls}">${s}</span></div>`;
  }).join('');
}let arr=(d.opportunities||[]).filter(x=>Number.isFinite(+x.spreadPct));let min=+$('min').value;let list=arr.filter(x=>(!x.pair||x.pair===$('pair').value)&&x.spreadPct>min).sort((a,b)=>b.spreadPct-a.spreadPct);$('count').textContent=list.length;$('online').textContent=(d.onlineCount||0)+' / 11';$('updated').textContent=new Date().toLocaleTimeString('pt-BR');$('rows').innerHTML=list.length?list.map(x=>`<tr><td>${x.buyExchange}</td><td>${x.sellExchange}</td><td>${x.pair||$('pair').value}</td><td>${money(x.ask)}</td><td>${money(x.bid)}</td><td class="${x.spreadPct>0?'positive':'negative'}">${x.spreadPct>0?'+':''}${(+x.spreadPct).toFixed(3)}%</td><td class="${x.spreadPct>0?'positive':'negative'}">${money(+$('capital').value*x.spreadPct/100)}</td></tr>`).join(''):'<tr><td colspan="7">Nenhuma oportunidade positiva confirmada. Cotações negativas não são exibidas.</td></tr>';if(list.length){let x=list[0],gross=+$('capital').value*x.spreadPct/100;$('best').textContent='+'+x.spreadPct.toFixed(3)+'%';color($('best'),x.spreadPct);$('profit').textContent=money(gross)+' de lucro bruto estimado';$('route').textContent=x.buyExchange+' → '+x.sellExchange;$('net').textContent=money(gross-+$('cost').value);$('history').textContent=new Date().toLocaleTimeString('pt-BR')+' · '+x.buyExchange+' → '+x.sellExchange+' · +'+x.spreadPct.toFixed(3)+'%';}else{$('best').textContent='—';$('best').className='neutral';$('profit').textContent='Aguardando oportunidade positiva';$('route').textContent='Nenhuma oportunidade confirmada';$('net').textContent='—';}}catch(e){$('updated').textContent='API indisponível';}}$('refresh').onclick=refresh;$('pair').onchange=refresh;$('min').onchange=refresh;$('capital').oninput=refresh;$('cost').oninput=refresh;const sidebar=$('sidebar');
const backdrop=document.createElement('div');
backdrop.className='menu-backdrop';
backdrop.hidden=true;
document.body.appendChild(backdrop);

function closeMenu(){
  sidebar.classList.remove('open');
  backdrop.hidden=true;
}

$('menu').onclick=()=>{
  const opening=!sidebar.classList.contains('open');
  sidebar.classList.toggle('open',opening);
  backdrop.hidden=!opening;
};

backdrop.onclick=closeMenu;

sidebar.querySelectorAll('a').forEach(link=>{
  link.addEventListener('click',closeMenu);
});refresh();setInterval(refresh,10000);
