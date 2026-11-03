
const $ = id => document.getElementById(id);

const names = [
  'Binance',
  'OKX',
  'Kraken',
  'Bybit',
  'Ripio',
  'Bitget',
  'MEXC',
  'KuCoin',
  'Foxbit'
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
  $('exchanges').innerHTML = names.map(name => {
    const status = statuses[name] || 'Integração pendente';
    const cls = status === 'Online' ? 'positive' : 'neutral';

    return `
      <div class="source">
        ${name}
        <span class="${cls}">${status}</span>
      </div>
    `;
  }).join('');
}

async function refresh() {
  const pair = $('pair').value;

  $('updated').textContent = 'Consultando...';

  try {
    const response = await fetch(
      '/.netlify/functions/markets?pair=' +
      encodeURIComponent(pair),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Erro HTTP ' + response.status);
    }

    const data = await response.json();

    renderExchanges(data.statuses || {});

    const opportunities = (data.opportunities || [])
      .filter(item => Number.isFinite(Number(item.spreadPct)));

    const minimum = Number($('min').value);

    const filtered = opportunities
      .filter(item =>
        (!item.pair || item.pair === pair) &&
        Number(item.spreadPct) > minimum
      )
      .sort((a, b) =>
        Number(b.spreadPct) - Number(a.spreadPct)
      );

    $('count').textContent = filtered.length;

    $('online').textContent =
      (data.onlineCount || 0) + ' / 9';

    $('updated').textContent =
      new Date().toLocaleTimeString('pt-BR');

    if (filtered.length > 0) {
      $('rows').innerHTML = filtered.map(item => {
        const spread = Number(item.spreadPct);
        const profit =
          Number($('capital').value) * spread / 100;

        return `
          <tr>
            <td>${item.buyExchange}</td>
            <td>${item.sellExchange}</td>
            <td>${item.pair || pair}</td>
            <td>${money(item.ask)}</td>
            <td>${money(item.bid)}</td>
            <td class="${spread > 0 ? 'positive' : 'negative'}">
              ${spread > 0 ? '+' : ''}${spread.toFixed(3)}%
            </td>
            <td>${money(profit)}</td>
          </tr>
        `;
      }).join('');

      const best = filtered[0];
      const spread = Number(best.spreadPct);
      const gross =
        Number($('capital').value) * spread / 100;

      $('best').textContent = '+' + spread.toFixed(3) + '%';
      color($('best'), spread);

      $('profit').textContent =
        money(gross) + ' de lucro bruto estimado';

      $('route').textContent =
        best.buyExchange + ' → ' + best.sellExchange;

      if ($('includeCosts').checked) {
        $('net').textContent =
          money(gross - Number($('cost').value));
      } else {
        $('net').textContent = 'Desativado';
      }

      $('history').textContent =
        new Date().toLocaleTimeString('pt-BR') +
        ' · ' + best.buyExchange +
        ' → ' + best.sellExchange +
        ' · +' + spread.toFixed(3) + '%';

    } else {
      $('rows').innerHTML = `
        <tr>
          <td colspan="7">
            Nenhuma oportunidade positiva confirmada.
          </td>
        </tr>
      `;

      $('best').textContent = '—';
      $('best').className = 'neutral';

      $('profit').textContent =
        'Aguardando oportunidade positiva';

      $('route').textContent =
        'Nenhuma oportunidade confirmada';

      $('net').textContent =
        $('includeCosts').checked ? '—' : 'Desativado';
    }

  } catch (error) {
    console.error('Erro no radar:', error);
    $('updated').textContent = 'API indisponível';
  }
}

// Atualização manual e filtros
$('refresh').addEventListener('click', refresh);
$('pair').addEventListener('change', refresh);
$('min').addEventListener('change', refresh);
$('capital').addEventListener('input', refresh);
$('cost').addEventListener('input', refresh);

$('includeCosts').addEventListener('change', () => {
  $('cost').disabled = !$('includeCosts').checked;
  refresh();
});

// Menu lateral
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

// Inicialização
renderExchanges();
refresh();

setInterval(refresh, 10000);
