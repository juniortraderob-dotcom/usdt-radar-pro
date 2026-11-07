const $ = id => document.getElementById(id);

const names = [
  'Binance', 'OKX', 'Kraken', 'Bybit', 'Ripio',
  'Bitget', 'MEXC', 'KuCoin', 'Foxbit'
];

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function color(element, value) {
  element.className =
    value > 0 ? 'positive' :
    value < 0 ? 'negative' : 'neutral';
}

function renderExchanges(statuses = {}) {
  const container = $('exchanges');
  container.replaceChildren();

  for (const name of names) {
    const card = document.createElement('div');
    card.className = 'source';

    const title = document.createTextNode(name);
    const status = document.createElement('span');

    status.className =
      statuses[name] === 'Online' ? 'positive' : 'neutral';
    status.textContent = statuses[name] || 'Integração pendente';

    card.append(title, status);
    container.appendChild(card);
  }
}

async function refresh() {
  const pair = $('pair').value;
  $('updated').textContent = 'Consultando...';

  try {
    const response = await fetch(
      '/api/markets?pair=' + encodeURIComponent(pair),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Erro HTTP ' + response.status);
    }

    const data = await response.json();
    renderExchanges(data.statuses || {});

    const opportunities = (data.opportunities || [])
      .filter(item =>
        Number.isFinite(Number(item.spreadPct)) &&
        Number(item.spreadPct) > 0
      );

    const minimum = Number($('min').value);

    const filtered = opportunities
      .filter(item =>
        (!item.pair || item.pair === pair) &&
        Number(item.spreadPct) > minimum
      )
      .sort((a, b) => Number(b.spreadPct) - Number(a.spreadPct));

    $('count').textContent = filtered.length;
    $('online').textContent = (data.onlineCount || 0) + ' / 9';

    $('updated').textContent = data.updatedAt
      ? new Date(data.updatedAt).toLocaleTimeString('pt-BR')
      : new Date().toLocaleTimeString('pt-BR');

    if (filtered.length) {
      $('rows').innerHTML = filtered.map(item => {
        const spread = Number(item.spreadPct);
        const capital = Math.max(0, Number($('capital').value) || 0);
        const profit = capital * spread / 100;

        return `
          <tr>
            <td>${item.buyExchange}</td>
            <td>${item.sellExchange}</td>
            <td>${item.pair || pair}</td>
            <td>${money(item.ask)}</td>
            <td>${money(item.bid)}</td>
            <td class="positive">+${spread.toFixed(3)}%</td>
            <td>${money(profit)}</td>
          </tr>
        `;
      }).join('');

      const best = filtered[0];
      const spread = Number(best.spreadPct);
      const capital = Math.max(0, Number($('capital').value) || 0);
      const gross = capital * spread / 100;

      $('best').textContent = '+' + spread.toFixed(3) + '%';
      color($('best'), spread);

      $('profit').textContent =
        money(gross) + ' de lucro bruto estimado';

      $('route').textContent =
        best.buyExchange + ' → ' + best.sellExchange;

      $('net').textContent = $('includeCosts').checked
        ? money(gross - Math.max(0, Number($('cost').value) || 0))
        : 'Desativado';

      $('history').textContent =
        new Date().toLocaleTimeString('pt-BR') + ' · ' +
        best.buyExchange + ' → ' + best.sellExchange +
        ' · +' + spread.toFixed(3) + '%';

    } else {
      $('rows').innerHTML = `
        <tr><td colspan="7">
          Nenhuma oportunidade positiva confirmada para este par.
        </td></tr>
      `;

      $('best').textContent = '—';
      $('best').className = 'neutral';
      $('profit').textContent = 'Aguardando oportunidade positiva';
      $('route').textContent = 'Nenhuma oportunidade confirmada';
      $('net').textContent =
        $('includeCosts').checked ? '—' : 'Desativado';
    }

  } catch (error) {
    console.error('Erro no radar:', error);
    $('updated').textContent = 'API indisponível';

    $('rows').innerHTML = `
      <tr><td colspan="7">
        Não foi possível consultar a API. Tente atualizar novamente.
      </td></tr>
    `;
  }
}

$('refresh').addEventListener('click', refresh);
$('pair').addEventListener('change', refresh);
$('min').addEventListener('change', refresh);
$('capital').addEventListener('input', refresh);
$('cost').addEventListener('input', refresh);

$('includeCosts').addEventListener('change', () => {
  $('cost').disabled = !$('includeCosts').checked;
  refresh();
});

const sidebar = $('sidebar');
const backdrop = document.createElement('div');

backdrop.className = 'menu-backdrop';
backdrop.hidden = true;
document.body.appendChild(backdrop);

function closeMenu() {
  sidebar.classList.remove('open');
  backdrop.hidden = true;
}

$('menu').addEventListener('click', () => {
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', opening);
  backdrop.hidden = !opening;
});

backdrop.addEventListener('click', closeMenu);

sidebar.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeMenu);
});

renderExchanges();
refresh();
setInterval(refresh, 10000);
