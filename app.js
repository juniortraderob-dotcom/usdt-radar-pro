
const $ = id => document.getElementById(id);

const names = [
  'Binance', 'OKX', 'Bybit', 'Bitget',
  'MEXC', 'KuCoin', 'Foxbit', 'Bitso'
];

const tradeUrls = {
  Binance: 'https://www.binance.com/pt-BR/trade/USDT_BRL?type=spot',
  OKX: 'https://www.okx.com/trade-spot/usdt-brl',
  Bybit: 'https://www.bybit.com/trade/spot/USDT/BRL',
  Bitget: 'https://www.bitget.com/spot/USDTBRL',
  MEXC: 'https://www.mexc.com/exchange/BRL_USDT',
  KuCoin: 'https://www.kucoin.com/trade/USDT-BRL',
  Foxbit: 'https://foxbit.com.br/',
  Bitso: 'https://bitso.com/'
};

let latestOpportunities = [];
let audioContext = null;
let soundUnlocked = false;
let lastPositiveAlertKey = '';

const ALERT_STORAGE_KEY = 'usdtRadarProAlertSettings';

const TELEGRAM_WORKER_URL =
  'https://usdt-radar-telegram.juniortraderob.workers.dev';

async function sendTelegramAlert(message) {
  try {
    const response = await fetch(TELEGRAM_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Falha no envio');
    }

    return true;
  } catch (error) {
    console.error('Erro ao enviar alerta ao Telegram:', error);
    return false;
  }
}

function money(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function priceBRL(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function formatUSDT(value) {
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }) + ' USDT';
}

function safe(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function setupFilters() {
  ['buyFilter', 'sellFilter'].forEach(id => {
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      $(id).appendChild(option);
    });
  });

  if ($('resultFilter')) {
    $('resultFilter').style.display = 'none';
  }
}

function renderExchanges(statuses) {
  const container = $('exchanges');
  container.replaceChildren();

  names.forEach(name => {
    const card = document.createElement('div');
    card.className = 'source';

    const title = document.createElement('strong');
    title.textContent = name;

    const status = document.createElement('span');
    status.textContent = statuses[name] || 'Integração pendente';
    status.className =
      status.textContent === 'Online' ? 'positive' : 'neutral';

    card.append(title, status);
    container.appendChild(card);
  });
}

/*
  GERA TODAS AS COMBINAÇÕES DIRECIONAIS.

  Não descarta spreads negativos aqui.
  A decisão de mostrar ou ocultar resultados
  é feita posteriormente pelos filtros.
*/

function calculateOpportunities(quotes) {
  const results = [];

  const validQuotes = quotes.filter(q =>
    q &&
    q.exchange &&
    q.pair &&
    Number.isFinite(Number(q.ask)) &&
    Number(q.ask) > 0 &&
    Number.isFinite(Number(q.bid)) &&
    Number(q.bid) > 0
  );

  for (const buy of validQuotes) {
    for (const sell of validQuotes) {
      if (buy.exchange === sell.exchange) continue;
      if (buy.pair !== sell.pair) continue;

      const ask = Number(buy.ask);
      const bid = Number(sell.bid);

      const spread = ((bid - ask) / ask) * 100;

      if (!Number.isFinite(spread)) continue;

      results.push({
        buyExchange: buy.exchange,
        sellExchange: sell.exchange,
        pair: buy.pair,
        ask,
        bid,
        spread
      });
    }
  }

  return results.sort((a, b) => b.spread - a.spread);
}

function exchangeButton(name) {
  const url = tradeUrls[name];
  if (!url) return '';

  return `
    <a class="exchange-link"
       href="${url}"
       target="_blank"
       rel="noopener noreferrer">
       Abrir ${safe(name)} ↗
    </a>
  `;
}

function createMainCard(item, capital) {
  const gross = capital * item.spread / 100;
  const quantity = capital > 0 ? capital / item.ask : 0;

  const isPositive = item.spread > 0;
  const resultClass = isPositive ? 'positive' : 'negative';
  const sign = isPositive ? '+' : '';

  return `
    <article class="opportunity-card">
      <div class="exchange-comparison">
        <div class="exchange-side buy-side">
          <small>COMPRAR USDT</small>
          <strong>${safe(item.buyExchange)}</strong>
          <span>ASK: ${priceBRL(item.ask)}</span>
        </div>

        <div class="exchange-arrow">→</div>

        <div class="exchange-side sell-side">
          <small>VENDER USDT</small>
          <strong>${safe(item.sellExchange)}</strong>
          <span>BID: ${priceBRL(item.bid)}</span>
        </div>
      </div>

      <div class="opportunity-details">
        <span>Par: <b>${safe(item.pair)}</b></span>

        <span>Quantidade estimada:
          <b>${formatUSDT(quantity)}</b>
        </span>

        <span>Spread:
          <b class="${resultClass}">
            ${sign}${item.spread.toFixed(3)}%
          </b>
        </span>

        <span>Resultado bruto estimado:
          <b class="${resultClass}">${money(gross)}</b>
        </span>
      </div>

      <div class="exchange-buttons">
        ${exchangeButton(item.buyExchange)}
        ${exchangeButton(item.sellExchange)}
      </div>
    </article>
  `;
}

/* OUTRAS OPORTUNIDADES */

function ensureSecondarySection() {
  return $('otherOpportunities');
}

function renderOtherOpportunities(items, capital) {
  const section = ensureSecondarySection();
  const list = $('otherOpportunityList');

  if (!section || !list) return;

  if (!items.length) {
    list.innerHTML =
      '<p class="empty-results">Nenhuma outra combinação encontrada.</p>';
    return;
  }

  list.innerHTML = items.map(item => {
    const gross = capital * item.spread / 100;
    const isPositive = item.spread > 0;
    const resultClass = isPositive ? 'positive' : 'negative';
    const sign = isPositive ? '+' : '';

    return `
      <div style="
        display:flex;justify-content:space-between;align-items:center;
        flex-wrap:wrap;gap:10px;padding:12px 4px;
        border-top:1px solid #273646;font-size:12px;color:#aebdcb;
      ">
        <span>
          <b style="color:#edf4f8">${safe(item.buyExchange)}</b>
          →
          <b style="color:#edf4f8">${safe(item.sellExchange)}</b>
        </span>

        <span>${safe(item.pair)}</span>

        <span class="${resultClass}" style="font-weight:700">
          ${sign}${item.spread.toFixed(3)}%
        </span>

        <span class="${resultClass}">${money(gross)}</span>

        <span style="display:flex;gap:7px;flex-wrap:wrap">
          ${exchangeButton(item.buyExchange)}
          ${exchangeButton(item.sellExchange)}
        </span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.exchange-link').forEach(link => {
    link.style.padding = '6px 9px';
    link.style.fontSize = '11px';
  });
}

/* ALERTAS SONOROS POSITIVOS */

function loadAlertSettings() {
  const defaults = {
    positiveEnabled: false,
    positiveThreshold: 1.0
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(ALERT_STORAGE_KEY) || '{}'
    );

    return {
      ...defaults,
      positiveEnabled: !!saved.positiveEnabled,
      positiveThreshold: Math.max(
        0,
        Number(saved.positiveThreshold) || 0
      )
    };
  } catch {
    return defaults;
  }
}

function saveAlertSettings() {
  const settings = {
    positiveEnabled: $('positiveAlertEnabled').checked,
    positiveThreshold: Math.max(
      0,
      Number($('positiveAlertThreshold').value) || 0
    )
  };

  localStorage.setItem(
    ALERT_STORAGE_KEY,
    JSON.stringify(settings)
  );

  return settings;
}

function ensureAlertPanel() {
  if ($('soundAlertsPanel')) return;

  const panel = document.createElement('section');
  panel.id = 'soundAlertsPanel';
  panel.className = 'panel';

  panel.innerHTML = `
    <h2>Alertas sonoros de oportunidades</h2>

    <p>
      Configure o aviso sonoro e o envio de oportunidades positivas.
    </p>

    <div class="alert-settings-grid">
      <div class="alert-setting">
        <label class="check">
          <input id="positiveAlertEnabled" type="checkbox">
          Ativar alerta de spread positivo
        </label>

        <label for="positiveAlertThreshold">
          Avisar quando atingir ou superar (%)
        </label>

        <input
          id="positiveAlertThreshold"
          type="number"
          min="0"
          step="0.001"
          value="1.000"
        >

        <small>
          Exemplo: 1,000 significa alertar em +1,000% ou mais.
        </small>
      </div>
    </div>

    <div class="alert-actions">
      <button type="button" id="enableSoundButton">
        Ativar som neste navegador
      </button>

      <span id="soundStatus" class="neutral">
        Som ainda não autorizado
      </span>
    </div>

    <small>
      O navegador exige um clique para liberar o áudio.
      Os alertas funcionam enquanto esta página estiver aberta.
    </small>
  `;

  const settings = $('settings');

  if (settings) {
    settings.parentNode.insertBefore(panel, settings);
  } else {
    document.querySelector('main').appendChild(panel);
  }

  const style = document.createElement('style');

  style.textContent = `
    .alert-settings-grid {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      margin:18px 0;
    }

    .alert-setting {
      background:#0d1721;
      border:1px solid #304253;
      border-radius:9px;
      padding:15px;
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .alert-setting input[type="number"] {
      width:100%;
      max-width:220px;
    }

    .alert-setting .check {
      margin-bottom:4px;
    }

    .alert-actions {
      display:flex;
      align-items:center;
      gap:14px;
      flex-wrap:wrap;
      margin:12px 0;
    }

    #enableSoundButton {
      background:#173b32;
      color:#39e39a;
      border-color:#28634e;
      font-weight:700;
    }

    @media(max-width:800px) {
      .alert-settings-grid {
        grid-template-columns:1fr;
      }
    }
  `;

  document.head.appendChild(style);

  const saved = loadAlertSettings();

  $('positiveAlertEnabled').checked = saved.positiveEnabled;
  $('positiveAlertThreshold').value = saved.positiveThreshold;

  [
    'positiveAlertEnabled',
    'positiveAlertThreshold'
  ].forEach(id => {
    $(id).addEventListener('change', saveAlertSettings);
    $(id).addEventListener('input', saveAlertSettings);
  });

  $('enableSoundButton').addEventListener('click', unlockSound);
}

async function unlockSound() {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error('Áudio não suportado neste navegador');
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    soundUnlocked = audioContext.state === 'running';

    if (!soundUnlocked) {
      throw new Error('Não foi possível liberar o áudio');
    }

    $('soundStatus').textContent =
      'Som ativado neste navegador';

    $('soundStatus').className = 'positive';

    playTone();
  } catch (error) {
    $('soundStatus').textContent =
      error.message || 'Falha ao ativar o som';

    $('soundStatus').className = 'negative';
  }
}

function playTone() {
  if (
    !soundUnlocked ||
    !audioContext ||
    audioContext.state !== 'running'
  ) return;

  const now = audioContext.currentTime;
  const frequencies = [880, 1174];

  frequencies.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(
      0.0001,
      now + index * 0.18
    );

    gain.gain.exponentialRampToValueAtTime(
      0.16,
      now + index * 0.18 + 0.025
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + index * 0.18 + 0.16
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(now + index * 0.18);
    oscillator.stop(now + index * 0.18 + 0.18);
  });
}

/* REGRA ESPECIAL DA MEXC PARA ALERTAS */

function getAlertThreshold(item, configuredThreshold) {
  const involvesMexc =
    item.buyExchange.toUpperCase().includes('MEXC') ||
    item.sellExchange.toUpperCase().includes('MEXC');

  return involvesMexc
    ? Math.max(Number(configuredThreshold) || 0, 1.30)
    : Number(configuredThreshold) || 0;
}

/* VERIFICAÇÃO DOS ALERTAS POSITIVOS */

function checkSoundAlerts(opportunities) {
  if (!$('positiveAlertEnabled')) return;

  const settings = {
    positiveEnabled: $('positiveAlertEnabled').checked,
    positiveThreshold: Math.max(
      0,
      Number($('positiveAlertThreshold').value) || 0
    )
  };

  const positives = opportunities
    .filter(item =>
      item.spread > 0 &&
      item.spread >= getAlertThreshold(
        item,
        settings.positiveThreshold
      )
    )
    .sort((a, b) => b.spread - a.spread);

  if (settings.positiveEnabled && positives.length) {
    const best = positives[0];

    const key = [
      best.buyExchange,
      best.sellExchange,
      best.pair
    ].join(':');

    if (key !== lastPositiveAlertKey) {
      playTone();

      sendTelegramAlert(
        `🟢 SPREAD POSITIVO: ${best.buyExchange} → ${best.sellExchange}\n` +
        `Par: ${best.pair}\n` +
        `Spread: +${best.spread.toFixed(3)}%\n` +
        `Capital: ${money(Number($('capital').value) || 0)}`
      );

      lastPositiveAlertKey = key;
    }
  } else {
    lastPositiveAlertKey = '';
  }
}

/* RENDERIZAÇÃO DAS OPORTUNIDADES */

function renderOpportunities() {
  const capital = Math.max(
    0,
    Number($('capital').value) || 0
  );

  const buy = $('buyFilter').value;
  const sell = $('sellFilter').value;

  const hasManualFilter =
    buy !== 'all' || sell !== 'all';

  const selected = latestOpportunities.filter(item => {
    if (buy !== 'all' && item.buyExchange !== buy) return false;
    if (sell !== 'all' && item.sellExchange !== sell) return false;

    return true;
  });

  /*
    Sem filtros: somente spreads positivos.
    Com pelo menos um filtro: mostra positivos e negativos.
  */

  const filtered = hasManualFilter
    ? selected
    : selected.filter(item => item.spread > 0);

  $('count').textContent = filtered.length;

  if (!filtered.length) {
    $('rows').innerHTML = hasManualFilter
      ? '<p class="empty-results">Nenhuma cotação válida encontrada para essa combinação de corretoras.</p>'
      : '<p class="empty-results">Nenhuma oportunidade positiva disponível neste momento.</p>';

    renderOtherOpportunities([], capital);

    $('best').textContent = '—';
    $('best').className = 'neutral';

    $('profit').textContent =
      hasManualFilter
        ? 'Aguardando cotações das corretoras selecionadas'
        : 'Aguardando oportunidade positiva';

    $('route').textContent =
      hasManualFilter
        ? 'Nenhuma combinação encontrada'
        : 'Nenhuma combinação positiva disponível';

    $('net').textContent =
      $('includeCosts').checked ? '—' : 'Desativado';

    return;
  }

  const best = filtered[0];
  const others = filtered.slice(1);

  $('rows').innerHTML = createMainCard(best, capital);

  renderOtherOpportunities(others, capital);

  const gross = capital * best.spread / 100;
  const isPositive = best.spread > 0;
  const resultClass = isPositive ? 'positive' : 'negative';
  const sign = isPositive ? '+' : '';

  $('best').textContent =
    sign + best.spread.toFixed(3) + '%';

  $('best').className = resultClass;

  $('profit').textContent =
    'Resultado bruto estimado: ' + money(gross);

  $('route').textContent =
    best.buyExchange + ' → ' + best.sellExchange;

  const cost = Math.max(
    0,
    Number($('cost').value) || 0
  );

  $('net').textContent = $('includeCosts').checked
    ? money(gross - cost)
    : 'Desativado';

  $('history').textContent =
    new Date().toLocaleTimeString('pt-BR') +
    ' · ' + best.buyExchange +
    ' → ' + best.sellExchange +
    ' · ' + sign + best.spread.toFixed(3) + '%';
}

/* CONSULTA DA API */

async function refresh() {
  $('updated').textContent = 'Consultando...';

  try {
    const pair = $('pair').value;

    const response = await fetch(
      '/api/markets?pair=' + encodeURIComponent(pair),
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('API HTTP ' + response.status);
    }

    const data = await response.json();

    const statuses = data.statuses || {};
    const quotes = data.quotes || [];

    renderExchanges(statuses);

    const onlineCount = Object.values(statuses)
      .filter(status => status === 'Online').length;

    $('online').textContent =
      onlineCount + ' / ' + names.length;

    latestOpportunities = calculateOpportunities(quotes);

    checkSoundAlerts(latestOpportunities);

    renderOpportunities();

    $('updated').textContent =
      new Date().toLocaleTimeString('pt-BR');

  } catch (error) {
    console.error(error);

    $('updated').textContent = 'Erro na consulta';

    $('rows').textContent =
      'Não foi possível consultar a API. Tente novamente.';
  }
}

/* INICIALIZAÇÃO */

setupFilters();
ensureAlertPanel();

$('refresh').addEventListener('click', refresh);
$('pair').addEventListener('change', refresh);

$('buyFilter').addEventListener('change', renderOpportunities);
$('sellFilter').addEventListener('change', renderOpportunities);

$('capital').addEventListener('input', renderOpportunities);
$('cost').addEventListener('input', renderOpportunities);

$('includeCosts').addEventListener('change', () => {
  $('cost').disabled = !$('includeCosts').checked;
  renderOpportunities();
});

/* MENU MOBILE */

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

renderExchanges({});
refresh();

// Atualização automática a cada 20 segundos.
setInterval(refresh, 20000);
