const CURRENCIES = [
  { code: 'PLN', symbol: 'zł', name: 'Polish zloty', flag: '🇵🇱' },
  { code: 'USD', symbol: '$', name: 'United States dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'Pound sterling', flag: '🇬🇧' },
  { code: 'CHF', symbol: 'CHF ', name: 'Swiss franc', flag: '🇨🇭' },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar', flag: '🇦🇺' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', flag: '🇨🇦' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen', flag: '🇯🇵' },
  { code: 'NOK', symbol: 'kr ', name: 'Norwegian krone', flag: '🇳🇴' },
  { code: 'SEK', symbol: 'kr ', name: 'Swedish krona', flag: '🇸🇪' },
  { code: 'CZK', symbol: 'Kč ', name: 'Czech koruna', flag: '🇨🇿' },
  { code: 'DKK', symbol: 'kr ', name: 'Danish krone', flag: '🇩🇰' },
  { code: 'AED', symbol: 'د.إ ', name: 'United Arab Emirates dirham', flag: '🇦🇪' },
  { code: 'ARS', symbol: 'ARS$', name: 'Argentine peso', flag: '🇦🇷' },
  { code: 'BGN', symbol: 'лв ', name: 'Bulgarian lev', flag: '🇧🇬' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian real', flag: '🇧🇷' },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean peso', flag: '🇨🇱' },
  { code: 'CNY', symbol: '¥', name: 'Chinese yuan', flag: '🇨🇳' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong dollar', flag: '🇭🇰' },
  { code: 'HUF', symbol: 'Ft ', name: 'Hungarian forint', flag: '🇭🇺' },
  { code: 'IDR', symbol: 'Rp ', name: 'Indonesian rupiah', flag: '🇮🇩' },
  { code: 'ILS', symbol: '₪', name: 'Israeli new shekel', flag: '🇮🇱' },
  { code: 'INR', symbol: '₹', name: 'Indian rupee', flag: '🇮🇳' },
  { code: 'KRW', symbol: '₩', name: 'South Korean won', flag: '🇰🇷' },
  { code: 'MXN', symbol: 'Mex$', name: 'Mexican peso', flag: '🇲🇽' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit', flag: '🇲🇾' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand dollar', flag: '🇳🇿' },
  { code: 'PHP', symbol: '₱', name: 'Philippine peso', flag: '🇵🇭' },
  { code: 'PKR', symbol: '₨ ', name: 'Pakistani rupee', flag: '🇵🇰' },
  { code: 'RON', symbol: 'lei ', name: 'Romanian leu', flag: '🇷🇴' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', flag: '🇸🇬' },
  { code: 'THB', symbol: '฿', name: 'Thai baht', flag: '🇹🇭' },
  { code: 'TRY', symbol: '₺', name: 'Turkish lira', flag: '🇹🇷' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan dollar', flag: '🇹🇼' },
  { code: 'ZAR', symbol: 'R ', name: 'South African rand', flag: '🇿🇦' }
];

const STORAGE_KEY = 'xrp_alerts_pro_state_v1';

const defaultState = {
  currency: 'PLN',
  recentCurrencies: ['PLN', 'USD', 'EUR', 'GBP', 'CHF'],
  priceSource: 'direct', // 'direct' | 'aggregated'
  theme: 'dark', // 'dark' | 'oled' | 'light'
  alerts: {
    highEnabled: true,
    highTargetCurrency: 0, // auto-initialized once first price arrives
    lowEnabled: true,
    lowTargetCurrency: 0,
    soundEnabled: true,
    browserPush: false,
    webhookUrl: '',
    lastTriggeredType: null,
    history: []
  },
  records: [
    {
      id: 'rec-default-1',
      amount: 7000,
      buyPriceUsd: 0.195, // ~£0.1500
      date: '2021-10-04',
      note: 'Genesis Position'
    }
  ],
  activeRecordIndex: 0,
  chartRange: '1D'
};

let state = loadState();
let market = {
  priceUsd: 0,
  prevPriceUsd: 0,
  high24hUsd: 0,
  low24hUsd: 0,
  change24hPct: 0,
  change1hPct: 0,
  volume24hUsd: 0,
  marketCapUsd: 0,
  totalSupply: 99987385748,
  circulatingSupply: 58100000000,
  rates: { USD: 1, PLN: 3.98, EUR: 0.92, GBP: 0.79, CHF: 0.88, AUD: 1.52, CAD: 1.38, JPY: 153.2 }
};

let chartData = [];
let scrubIndex = null;
let binanceWs = null;
let alertCooldownUntil = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      alerts: { ...structuredClone(defaultState.alerts), ...(parsed.alerts || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to persist state:', e);
  }
}

function getCurrencyMeta(code = state.currency) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

function getRate(code = state.currency) {
  return market.rates[code] || 1;
}

function formatPrice(usdAmount, decimals = 4, code = state.currency) {
  const meta = getCurrencyMeta(code);
  const val = usdAmount * getRate(code);
  const abs = Math.abs(val);
  const d = abs >= 100 ? 2 : abs >= 10 ? 3 : decimals;
  return `${meta.symbol}${val.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  })}`;
}

function formatMoney(usdAmount, code = state.currency) {
  const meta = getCurrencyMeta(code);
  const val = usdAmount * getRate(code);
  const sign = val < 0 ? '-' : '';
  return `${sign}${meta.symbol}${Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatCompactMoney(usdAmount, code = state.currency) {
  const meta = getCurrencyMeta(code);
  const val = usdAmount * getRate(code);
  if (val >= 1e9) return `${meta.symbol}${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${meta.symbol}${(val / 1e6).toFixed(2)}M`;
  return formatMoney(usdAmount, code);
}

// Safari Fallback for <dialog closedby="any"> per modern-web-guidance: light-dismiss-a-dialog
function setupDialogLightDismiss() {
  document.querySelectorAll('dialog').forEach((dialog) => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close');
      const dlg = document.getElementById(targetId);
      if (dlg && dlg.open) dlg.close();
    });
  });
}

// Audio Chime Synthesizer (zero external audio files needed)
function playAlertChime(isHigh = true) {
  if (!state.alerts.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = isHigh ? [587.33, 880, 1174.66] : [523.25, 392.0, 329.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.11);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.11);
      osc.stop(ctx.currentTime + idx * 0.11 + 0.3);
    });
  } catch (e) {
    console.warn('Audio chime blocked:', e);
  }
}

async function dispatchAlertNotification(type, currentPriceInCur, targetInCur) {
  const meta = getCurrencyMeta();
  const title = type === 'high' ? `XRP High Alert: ${meta.symbol}${currentPriceInCur.toFixed(4)}` : `XRP Low Alert: ${meta.symbol}${currentPriceInCur.toFixed(4)}`;
  const body = `XRP crossed your ${type.toUpperCase()} limit of ${meta.symbol}${targetInCur.toFixed(4)} (${state.currency}).`;

  // Show top banner with one-tap bump actions
  state.alerts.lastTriggeredType = type;
  const banner = document.getElementById('triggeredAlertBanner');
  const bannerText = document.getElementById('triggeredAlertText');
  bannerText.textContent = `${title} (Target: ${meta.symbol}${targetInCur.toFixed(4)})`;
  banner.classList.remove('hidden');

  // Log entry
  state.alerts.history.unshift({
    ts: Date.now(),
    type,
    price: `${meta.symbol}${currentPriceInCur.toFixed(4)}`,
    target: `${meta.symbol}${targetInCur.toFixed(4)}`
  });
  state.alerts.history = state.alerts.history.slice(0, 20);
  saveState();
  renderAlertHistory();

  playAlertChime(type === 'high');

  if (state.alerts.browserPush && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icon.svg' });
    } catch {}
  }

  if (state.alerts.webhookUrl) {
    try {
      const url = state.alerts.webhookUrl.trim();
      if (url.includes('discord.com/api/webhooks')) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `**${title}**\n${body}` })
        });
      } else {
        await fetch(url, {
          method: 'POST',
          body: `${title} - ${body}`
        });
      }
    } catch (e) {
      console.warn('Webhook send error:', e);
    }
  }
}

function checkPriceAlerts() {
  if (!market.priceUsd) return;
  const rate = getRate();
  const curPrice = market.priceUsd * rate;

  // Auto-seed default high/low targets on first run
  if (!state.alerts.highTargetCurrency || state.alerts.highTargetCurrency <= 0) {
    state.alerts.highTargetCurrency = Number((curPrice * 1.05).toFixed(4));
    state.alerts.lowTargetCurrency = Number((curPrice * 0.95).toFixed(4));
    syncAlertInputsFromState();
    saveState();
  }

  const now = Date.now();
  if (now < alertCooldownUntil) return;

  if (state.alerts.highEnabled && curPrice >= state.alerts.highTargetCurrency) {
    alertCooldownUntil = now + 45000;
    dispatchAlertNotification('high', curPrice, state.alerts.highTargetCurrency);
  } else if (state.alerts.lowEnabled && curPrice <= state.alerts.lowTargetCurrency) {
    alertCooldownUntil = now + 45000;
    dispatchAlertNotification('low', curPrice, state.alerts.lowTargetCurrency);
  }
}

function renderOverviewAndPortfolio() {
  if (!market.priceUsd) return;
  const meta = getCurrencyMeta();
  const rate = getRate();

  // Header Currency Pill
  document.getElementById('activeCurrencyFlag').textContent = meta.flag;
  document.getElementById('activeCurrencyCode').textContent = meta.code;

  // Hero Price & Flash Animation
  const priceFormatted = formatPrice(market.priceUsd, 4);
  const heroEls = [
    document.getElementById('overviewHeroPrice'),
    document.getElementById('alertsHeroPrice'),
    scrubIndex === null ? document.getElementById('chartHeroPrice') : null
  ].filter(Boolean);

  const flashClass =
    market.prevPriceUsd && market.priceUsd > market.prevPriceUsd
      ? 'flash-up'
      : market.prevPriceUsd && market.priceUsd < market.prevPriceUsd
      ? 'flash-down'
      : '';

  heroEls.forEach((el) => {
    el.textContent = priceFormatted;
    if (flashClass) {
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add(flashClass);
      setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 550);
    }
  });

  const pctSign = market.change24hPct >= 0 ? '+' : '';
  const pctStr = `${pctSign}${market.change24hPct.toFixed(2)}%`;
  const overviewPctEl = document.getElementById('overviewHeroPct');
  overviewPctEl.textContent = pctStr;
  overviewPctEl.className = `hero-sub-pct ${market.change24hPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;

  if (scrubIndex === null) {
    const chartPctEl = document.getElementById('chartHeroPct');
    chartPctEl.textContent = pctStr;
    chartPctEl.className = `hero-sub-pct ${market.change24hPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
  }

  // Portfolio Calculations across all records
  let totalXrp = 0;
  let totalCostUsd = 0;
  state.records.forEach((r) => {
    const amt = Number(r.amount) || 0;
    const buyUsd = Number(r.buyPriceUsd) || 0;
    totalXrp += amt;
    totalCostUsd += amt * buyUsd;
  });

  const avgBuyUsd = totalXrp > 0 ? totalCostUsd / totalXrp : 0;
  const currentWorthUsd = totalXrp * market.priceUsd;
  const pnlUsd = currentWorthUsd - totalCostUsd;
  const pnlPct = totalCostUsd > 0 ? (pnlUsd / totalCostUsd) * 100 : 0;

  document.getElementById('ovTotalXrp').textContent = totalXrp.toLocaleString('en-US', {
    maximumFractionDigits: 2
  });
  document.getElementById('ovAvgBuyPrice').textContent = formatPrice(avgBuyUsd, 4);
  document.getElementById('ovCurrentWorth').textContent = formatMoney(currentWorthUsd);
  document.getElementById('ovTotalBuyIn').textContent = formatMoney(totalCostUsd);

  const pnlEl = document.getElementById('ovTotalPnl');
  const pnlSign = pnlUsd >= 0 ? '+' : '';
  pnlEl.textContent = `${formatMoney(pnlUsd)} (${pnlSign}${pnlPct.toFixed(2)}%)`;
  pnlEl.className = `stat-value pnl-text ${pnlUsd >= 0 ? 'pnl-positive' : 'pnl-negative'}`;

  // Market Stats Card
  document.getElementById('msMarketCap').textContent = formatCompactMoney(market.marketCapUsd);
  document.getElementById('msTotalSupply').textContent = `${Math.round(market.totalSupply).toLocaleString('en-US')} XRP`;
  document.getElementById('msCirculatingSupply').textContent = `${Math.round(market.circulatingSupply).toLocaleString('en-US')} XRP`;
  document.getElementById('msHigh24h').textContent = formatPrice(market.high24hUsd, 4);
  document.getElementById('msLow24h').textContent = formatPrice(market.low24hUsd, 4);

  const delta24hUsd = market.priceUsd * (market.change24hPct / 100);
  const ms24El = document.getElementById('msChange24h');
  ms24El.textContent = `${delta24hUsd >= 0 ? '+' : ''}${formatPrice(delta24hUsd, 4)} (${pctSign}${market.change24hPct.toFixed(2)}%)`;
  ms24El.className = `ms-val ${market.change24hPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;

  const delta1hUsd = market.priceUsd * (market.change1hPct / 100);
  const sign1h = market.change1hPct >= 0 ? '+' : '';
  const ms1hEl = document.getElementById('msChange1h');
  ms1hEl.textContent = `${delta1hUsd >= 0 ? '+' : ''}${formatPrice(delta1hUsd, 4)} (${sign1h}${market.change1hPct.toFixed(2)}%)`;
  ms1hEl.className = `ms-val ${market.change1hPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;

  document.getElementById('msVolume24h').textContent = formatCompactMoney(market.volume24hUsd);

  const breakEvenEl = document.getElementById('msBreakEvenDist');
  if (avgBuyUsd > 0) {
    const distPct = ((market.priceUsd - avgBuyUsd) / avgBuyUsd) * 100;
    breakEvenEl.textContent = `${distPct >= 0 ? '+' : ''}${distPct.toFixed(2)}% vs AVG Buy`;
    breakEvenEl.className = `ms-val ${distPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
  } else {
    breakEvenEl.textContent = '—';
  }

  // Update Alert Distance Labels
  const curPriceInSelected = market.priceUsd * rate;
  document.getElementById('highAlertPrefix').textContent = meta.symbol;
  document.getElementById('lowAlertPrefix').textContent = meta.symbol;

  if (state.alerts.highTargetCurrency > 0) {
    const diffPct = ((state.alerts.highTargetCurrency - curPriceInSelected) / curPriceInSelected) * 100;
    document.getElementById('highAlertDistance').textContent =
      diffPct > 0
        ? `Requires +${diffPct.toFixed(2)}% move (${meta.symbol}${(state.alerts.highTargetCurrency - curPriceInSelected).toFixed(4)} away)`
        : `Target reached (${diffPct.toFixed(2)}%)`;
  }
  if (state.alerts.lowTargetCurrency > 0) {
    const diffPct = ((state.alerts.lowTargetCurrency - curPriceInSelected) / curPriceInSelected) * 100;
    document.getElementById('lowAlertDistance').textContent =
      diffPct < 0
        ? `Triggers on ${diffPct.toFixed(2)}% drop (${meta.symbol}${Math.abs(curPriceInSelected - state.alerts.lowTargetCurrency).toFixed(4)} away)`
        : `Target reached (+${diffPct.toFixed(2)}%)`;
  }

  renderWalletCarousel();
  renderPipWidgetCanvas();
  checkPriceAlerts();
}

// Render Wallet Tab (Matches screen_2.png & ipad_3.png)
function renderWalletCarousel() {
  const stage = document.getElementById('walletRecordStage');
  const dots = document.getElementById('walletPaginationDots');

  if (!state.records.length) {
    stage.innerHTML = `<p class="empty-hint">No XRP purchase records yet. Tap "Add new record" below to track your bag.</p>`;
    dots.innerHTML = '';
    return;
  }

  if (state.activeRecordIndex >= state.records.length) {
    state.activeRecordIndex = state.records.length - 1;
  }
  const rec = state.records[state.activeRecordIndex];
  const amt = Number(rec.amount) || 0;
  const buyUsd = Number(rec.buyPriceUsd) || 0;
  const totalBuyUsd = amt * buyUsd;
  const curWorthUsd = amt * (market.priceUsd || buyUsd);
  const pnlUsd = curWorthUsd - totalBuyUsd;
  const pnlPct = totalBuyUsd > 0 ? (pnlUsd / totalBuyUsd) * 100 : 0;
  const pnlSign = pnlUsd >= 0 ? '+' : '';

  const formattedDate = rec.date
    ? new Date(rec.date + 'T00:00:00').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    : '—';

  stage.innerHTML = `
    <div class="wallet-record-card">
      <div class="portfolio-overview-grid">
        <div class="stat-pair">
          <span class="stat-label">XRP amount:</span>
          <span class="stat-value">${amt.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
        <div class="stat-pair">
          <span class="stat-label">Price per XRP:</span>
          <span class="stat-value">${formatPrice(buyUsd, 4)}</span>
        </div>
        <div class="stat-pair">
          <span class="stat-label">Currently worth:</span>
          <span class="stat-value">${formatMoney(curWorthUsd)}</span>
        </div>
        <div class="stat-pair">
          <span class="stat-label">Total buy in:</span>
          <span class="stat-value">${formatMoney(totalBuyUsd)}</span>
        </div>
        <div class="stat-pair stat-pair-full">
          <span class="stat-label">Profit/Loss:</span>
          <span class="stat-value pnl-text ${pnlUsd >= 0 ? 'pnl-positive' : 'pnl-negative'}">
            ${formatMoney(pnlUsd)} (${pnlSign}${pnlPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      <div class="wallet-trade-date-block">
        <span class="stat-label">Trade date:</span>
        <span class="stat-value">${formattedDate}</span>
        ${rec.note ? `<span class="wallet-note-pill">${escapeHtml(rec.note)}</span>` : ''}
      </div>

      <div class="wallet-card-nav-row">
        ${
          state.records.length > 1
            ? `<button type="button" class="circle-Step-btn" id="prevRecordBtn" aria-label="Previous record">‹</button>`
            : ''
        }
        <button type="button" class="outline-edit-btn" id="editActiveRecordBtn">Edit</button>
        ${
          state.records.length > 1
            ? `<button type="button" class="circle-Step-btn" id="nextRecordBtn" aria-label="Next record">›</button>`
            : ''
        }
      </div>
    </div>
  `;

  dots.innerHTML = state.records
    .map(
      (_, idx) =>
        `<button type="button" class="wallet-dot ${idx === state.activeRecordIndex ? 'active' : ''}" data-idx="${idx}" aria-label="Record ${idx + 1}"></button>`
    )
    .join('');

  const prevBtn = document.getElementById('prevRecordBtn');
  const nextBtn = document.getElementById('nextRecordBtn');
  const editBtn = document.getElementById('editActiveRecordBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      state.activeRecordIndex = (state.activeRecordIndex - 1 + state.records.length) % state.records.length;
      saveState();
      renderWalletCarousel();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.activeRecordIndex = (state.activeRecordIndex + 1) % state.records.length;
      saveState();
      renderWalletCarousel();
    });
  }
  if (editBtn) {
    editBtn.addEventListener('click', () => openRecordModal(rec));
  }

  dots.querySelectorAll('.wallet-dot').forEach((d) => {
    d.addEventListener('click', () => {
      state.activeRecordIndex = Number(d.getAttribute('data-idx'));
      saveState();
      renderWalletCarousel();
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Interactive Historical Chart Engine (Matches screen_4.png)
async function loadChartData(range = state.chartRange) {
  state.chartRange = range;
  saveState();
  document.querySelectorAll('.tf-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-range') === range);
  });

  try {
    const res = await fetch(`/api/chart?range=${encodeURIComponent(range)}`);
    if (!res.ok) throw new Error('Backend unreachable');
    const data = await res.json();
    if (Array.isArray(data.points) && data.points.length > 0) {
      chartData = data.points;
      scrubIndex = null;
      drawChart();
      return;
    }
  } catch {
    try {
      const rangeMap = {
        '1H': { interval: '1m', limit: 60 },
        '1D': { interval: '15m', limit: 96 },
        '1W': { interval: '2h', limit: 84 },
        '1M': { interval: '6h', limit: 120 },
        '3M': { interval: '1d', limit: 90 },
        '1Y': { interval: '3d', limit: 122 },
        '2Y': { interval: '1w', limit: 104 },
        'ALL': { interval: '1w', limit: 400 }
      };
      const cfg = rangeMap[range] || rangeMap['1D'];
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=XRPUSDT&interval=${cfg.interval}&limit=${cfg.limit}`);
      const raw = await r.json();
      if (Array.isArray(raw) && raw.length > 0) {
        chartData = raw.map((k) => ({
          t: k[0],
          o: parseFloat(k[1]),
          h: parseFloat(k[2]),
          l: parseFloat(k[3]),
          c: parseFloat(k[4]),
          v: parseFloat(k[5])
        }));
        scrubIndex = null;
        drawChart();
      }
    } catch (e) {
      console.warn('Chart load error:', e);
    }
  }
}

function drawChart() {
  const canvas = document.getElementById('xrpChartCanvas');
  if (!canvas || !chartData.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 360;
  const height = rect.height || 255;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const prices = chartData.map((p) => p.c);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const span = maxPrice - minPrice || maxPrice * 0.01 || 1;

  document.getElementById('chartHighLabel').textContent = `High: ${formatPrice(maxPrice, 4)}`;
  document.getElementById('chartLowLabel').textContent = `Low: ${formatPrice(minPrice, 4)}`;

  const padX = 8;
  const padY = 16;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const getX = (i) => padX + (i / Math.max(1, chartData.length - 1)) * plotW;
  const getY = (val) => padY + plotH - ((val - minPrice) / span) * plotH;

  // Subtle fill gradient under the curve
  const grad = ctx.createLinearGradient(0, padY, 0, height);
  grad.addColorStop(0, 'rgba(12, 147, 234, 0.26)');
  grad.addColorStop(1, 'rgba(12, 147, 234, 0.0)');

  ctx.beginPath();
  chartData.forEach((pt, idx) => {
    const x = getX(idx);
    const y = getY(pt.c);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(getX(chartData.length - 1), height);
  ctx.lineTo(getX(0), height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Main #0C93EA Line
  ctx.beginPath();
  chartData.forEach((pt, idx) => {
    const x = getX(idx);
    const y = getY(pt.c);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#0C93EA';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Interactive Scrubbing Crosshair
  if (scrubIndex !== null && chartData[scrubIndex]) {
    const pt = chartData[scrubIndex];
    const cx = getX(scrubIndex);
    const cy = getY(pt.c);

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#0C93EA';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    const firstPrice = chartData[0].c;
    const scrubPct = firstPrice > 0 ? ((pt.c - firstPrice) / firstPrice) * 100 : 0;
    const sign = scrubPct >= 0 ? '+' : '';
    document.getElementById('chartHeroPrice').textContent = formatPrice(pt.c, 4);
    const pctEl = document.getElementById('chartHeroPct');
    pctEl.textContent = `${sign}${scrubPct.toFixed(2)}%`;
    pctEl.className = `hero-sub-pct ${scrubPct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
    document.getElementById('chartScrubTimestamp').textContent = new Date(pt.t).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (chartData.length > 0) {
    const firstPrice = chartData[0].c;
    const lastPrice = market.priceUsd || chartData[chartData.length - 1].c;
    const rangePct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const sign = rangePct >= 0 ? '+' : '';
    document.getElementById('chartHeroPrice').textContent = formatPrice(lastPrice, 4);
    const pctEl = document.getElementById('chartHeroPct');
    pctEl.textContent = `${sign}${rangePct.toFixed(2)}%`;
    pctEl.className = `hero-sub-pct ${rangePct >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
    document.getElementById('chartScrubTimestamp').textContent = `${state.chartRange} Range`;
  }

  ctx.restore();
}

function setupChartInteractions() {
  const canvas = document.getElementById('xrpChartCanvas');
  const handlePointer = (clientX) => {
    if (!chartData.length) return;
    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const idx = Math.round((relX / rect.width) * (chartData.length - 1));
    scrubIndex = Math.max(0, Math.min(chartData.length - 1, idx));
    drawChart();
  };

  canvas.addEventListener('pointerdown', (e) => handlePointer(e.clientX));
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons > 0 || e.pointerType === 'touch') {
      handlePointer(e.clientX);
    }
  });
  canvas.addEventListener('pointerup', () => {
    scrubIndex = null;
    drawChart();
  });
  canvas.addEventListener('pointerleave', () => {
    scrubIndex = null;
    drawChart();
  });

  document.querySelectorAll('.tf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadChartData(btn.getAttribute('data-range'));
    });
  });

  window.addEventListener('resize', () => drawChart());
}

// News & Ad-Free Reader Mode
async function loadNewsFeed() {
  const listEl = document.getElementById('newsFeedList');
  let articles = [];
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error('Backend unreachable');
    const data = await res.json();
    articles = data.articles || [];
  } catch {
    try {
      const r = await fetch('https://min-api.cryptocompare.com/data/v2/news/?categories=XRP&excludeCategories=Sponsored');
      const parsed = await r.json();
      articles = (parsed.Data || []).slice(0, 35).map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        url: item.url,
        imageurl: item.imageurl,
        source: item.source_info?.name || item.source || 'XRP Wire',
        published_on: item.published_on * 1000
      }));
    } catch (e) {
      listEl.innerHTML = `<p class="empty-hint">Unable to fetch XRP news right now.</p>`;
      return;
    }
  }

  if (!articles.length) {
    listEl.innerHTML = `<p class="empty-hint">No news articles found.</p>`;
    return;
  }
  listEl.innerHTML = articles
    .map((art) => {
      const dt = new Date(art.published_on).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `
        <button type="button" class="news-item" data-url="${escapeHtml(art.url)}" data-title="${escapeHtml(art.title)}" data-body="${escapeHtml(art.body || '')}" data-img="${escapeHtml(art.imageurl || '')}" data-source="${escapeHtml(art.source)}">
          <img class="news-thumb" src="${escapeHtml(art.imageurl || 'icon.svg')}" alt="" loading="lazy" onerror="this.src='icon.svg'" />
          <div class="news-meta-col">
            <h3 class="news-headline">${escapeHtml(art.title)}</h3>
            <span class="news-subline">${escapeHtml(art.source)} • ${dt}</span>
          </div>
        </button>
      `;
    })
    .join('');

  listEl.querySelectorAll('.news-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      openReaderView({
        url: btn.getAttribute('data-url'),
        title: btn.getAttribute('data-title'),
        summary: btn.getAttribute('data-body'),
        image: btn.getAttribute('data-img'),
        source: btn.getAttribute('data-source')
      });
    });
  });
}

async function openReaderView(article) {
  const dlg = document.getElementById('readerDialog');
  const bodyEl = document.getElementById('readerArticleBody');
  const domainEl = document.getElementById('readerDomainText');
  const extLink = document.getElementById('readerExternalLink');

  try {
    const host = new URL(article.url).hostname.replace(/^www\./, '');
    domainEl.textContent = `🔒 ${host} (Reader View)`;
  } catch {
    domainEl.textContent = `🔒 ${article.source}`;
  }
  extLink.href = article.url;

  bodyEl.innerHTML = `
    <h2 id="readerArticleTitle">${escapeHtml(article.title)}</h2>
    ${article.image ? `<img class="reader-hero-img" src="${escapeHtml(article.image)}" alt="" />` : ''}
    <p>${escapeHtml(article.summary)}</p>
    <p class="empty-hint">Extracting full ad-free article...</p>
  `;
  dlg.showModal();

  try {
    const res = await fetch(`/api/reader?url=${encodeURIComponent(article.url)}`);
    const data = await res.json();
    if (data.blocks && data.blocks.length >= 2) {
      const blocksHtml = data.blocks
        .map((b) => `<${b.tag}>${escapeHtml(b.text)}</${b.tag}>`)
        .join('');
      bodyEl.innerHTML = `
        <h2 id="readerArticleTitle">${escapeHtml(article.title)}</h2>
        ${article.image ? `<img class="reader-hero-img" src="${escapeHtml(article.image)}" alt="" />` : ''}
        ${blocksHtml}
      `;
    } else {
      bodyEl.innerHTML = `
        <h2 id="readerArticleTitle">${escapeHtml(article.title)}</h2>
        ${article.image ? `<img class="reader-hero-img" src="${escapeHtml(article.image)}" alt="" />` : ''}
        <p>${escapeHtml(article.summary)}</p>
      `;
    }
  } catch {
    // Keep summary view on fallback
  }
}

// Currency & Settings Modal
function renderCurrencyLists(filter = '') {
  const q = filter.trim().toLowerCase();
  const recentContainer = document.getElementById('recentCurrencyList');
  const allContainer = document.getElementById('allCurrencyList');

  const buildRow = (c) => `
    <button type="button" class="currency-row-btn" data-code="${c.code}">
      <div class="currency-row-left">
        <span class="currency-row-flag">${c.flag}</span>
        <div>
          <div class="currency-row-code">${c.code} (${c.symbol.trim()})</div>
          <div class="currency-row-name">${c.name}</div>
        </div>
      </div>
      ${state.currency === c.code ? `<span class="currency-check-badge">✓</span>` : ''}
    </button>
  `;

  const recentMetas = state.recentCurrencies
    .map((code) => getCurrencyMeta(code))
    .filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));

  const allMetas = CURRENCIES.filter(
    (c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  );

  recentContainer.innerHTML = recentMetas.map(buildRow).join('');
  allContainer.innerHTML = allMetas.map(buildRow).join('');

  document.querySelectorAll('.currency-row-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const newCode = btn.getAttribute('data-code');
      switchCurrency(newCode);
    });
  });
}

function switchCurrency(newCode) {
  const oldRate = getRate(state.currency);
  const newRate = getRate(newCode);
  const ratio = oldRate > 0 ? newRate / oldRate : 1;

  // Convert active alert thresholds seamlessly to the newly selected currency
  if (state.alerts.highTargetCurrency > 0) {
    state.alerts.highTargetCurrency = Number((state.alerts.highTargetCurrency * ratio).toFixed(4));
  }
  if (state.alerts.lowTargetCurrency > 0) {
    state.alerts.lowTargetCurrency = Number((state.alerts.lowTargetCurrency * ratio).toFixed(4));
  }

  state.currency = newCode;
  state.recentCurrencies = [newCode, ...state.recentCurrencies.filter((c) => c !== newCode)].slice(0, 5);
  saveState();
  syncAlertInputsFromState();
  renderCurrencyLists(document.getElementById('currencySearchInput').value);
  renderOverviewAndPortfolio();
  drawChart();
}

function syncAlertInputsFromState() {
  document.getElementById('highAlertEnabled').checked = state.alerts.highEnabled;
  document.getElementById('lowAlertEnabled').checked = state.alerts.lowEnabled;
  document.getElementById('highAlertInput').value = state.alerts.highTargetCurrency || '';
  document.getElementById('lowAlertInput').value = state.alerts.lowTargetCurrency || '';
  document.getElementById('soundAlertEnabled').checked = state.alerts.soundEnabled;
  document.getElementById('browserPushEnabled').checked = state.alerts.browserPush;
  document.getElementById('webhookUrlInput').value = state.alerts.webhookUrl || '';
}

function renderAlertHistory() {
  const listEl = document.getElementById('alertHistoryList');
  if (!state.alerts.history.length) {
    listEl.innerHTML = `<p class="empty-hint">No alerts triggered yet in this session.</p>`;
    return;
  }
  listEl.innerHTML = state.alerts.history
    .map((item) => {
      const t = new Date(item.ts).toLocaleTimeString('en-GB');
      return `
        <div class="alert-log-item">
          <span><strong>${item.type.toUpperCase()}</strong> @ ${item.price} (Target ${item.target})</span>
          <span>${t}</span>
        </div>
      `;
    })
    .join('');
}

// Add / Edit Wallet Purchase Record Modal
function openRecordModal(record = null) {
  const dlg = document.getElementById('recordDialog');
  const titleEl = document.getElementById('recordDialogTitle');
  const idInput = document.getElementById('recordIdInput');
  const amtInput = document.getElementById('recordAmountInput');
  const priceInput = document.getElementById('recordPriceInput');
  const dateInput = document.getElementById('recordDateInput');
  const noteInput = document.getElementById('recordNoteInput');
  const delBtn = document.getElementById('deleteRecordBtn');
  const curLabel = document.getElementById('recordCurrencyLabel');

  curLabel.textContent = state.currency;
  const rate = getRate();

  if (record) {
    titleEl.textContent = 'Edit Record';
    idInput.value = record.id;
    amtInput.value = record.amount;
    priceInput.value = Number((record.buyPriceUsd * rate).toFixed(4));
    dateInput.value = record.date || new Date().toISOString().slice(0, 10);
    noteInput.value = record.note || '';
    delBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'Add New Record';
    idInput.value = '';
    amtInput.value = '';
    priceInput.value = market.priceUsd ? Number((market.priceUsd * rate).toFixed(4)) : '';
    dateInput.value = new Date().toISOString().slice(0, 10);
    noteInput.value = '';
    delBtn.classList.add('hidden');
  }

  dlg.showModal();
}

// Live On-Chain XRPL Address Sync (via public xrplcluster.com JSON-RPC)
async function syncXrplAddress() {
  const addrInput = document.getElementById('xrplAddressInput');
  const statusEl = document.getElementById('xrplSyncStatus');
  const address = addrInput.value.trim();

  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) {
    statusEl.textContent = 'Enter a valid XRPL address starting with "r".';
    statusEl.style.color = 'var(--negative)';
    return;
  }

  statusEl.textContent = 'Querying XRPL mainnet ledger...';
  statusEl.style.color = 'var(--text-secondary)';

  try {
    const res = await fetch('https://xrplcluster.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: address, ledger_index: 'validated' }]
      })
    });
    const data = await res.json();
    const drops = data?.result?.account_data?.Balance;
    if (!drops) {
      statusEl.textContent = data?.result?.error_message || 'Account not found or unfunded on XRPL.';
      statusEl.style.color = 'var(--negative)';
      return;
    }

    const xrpBalance = Number(drops) / 1e6;
    const existingIdx = state.records.findIndex((r) => r.note === `XRPL: ${address.slice(0, 10)}...`);
    const recordObj = {
      id: existingIdx >= 0 ? state.records[existingIdx].id : `xrpl-${Date.now()}`,
      amount: Number(xrpBalance.toFixed(2)),
      buyPriceUsd: existingIdx >= 0 ? state.records[existingIdx].buyPriceUsd : market.priceUsd || 0.5,
      date: new Date().toISOString().slice(0, 10),
      note: `XRPL: ${address.slice(0, 10)}...`
    };

    if (existingIdx >= 0) {
      state.records[existingIdx] = recordObj;
      state.activeRecordIndex = existingIdx;
    } else {
      state.records.push(recordObj);
      state.activeRecordIndex = state.records.length - 1;
    }
    saveState();
    renderOverviewAndPortfolio();
    statusEl.textContent = `Synced ${xrpBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} XRP from ledger!`;
    statusEl.style.color = 'var(--positive)';
  } catch (e) {
    statusEl.textContent = `XRPL RPC error: ${e.message}`;
    statusEl.style.color = 'var(--negative)';
  }
}

// Market Polling & Real-Time Binance WebSocket
async function pollMarketRest() {
  try {
    const res = await fetch('/api/market');
    if (!res.ok) throw new Error('Backend unreachable');
    const data = await res.json();
    if (data && data.priceUsd) {
      market.prevPriceUsd = market.priceUsd || data.priceUsd;
      if (state.priceSource === 'aggregated' || !market.priceUsd) {
        market.priceUsd = data.priceUsd;
      }
      market.high24hUsd = data.high24hUsd || market.high24hUsd;
      market.low24hUsd = data.low24hUsd || market.low24hUsd;
      market.change24hPct = data.change24hPct ?? market.change24hPct;
      market.change1hPct = data.change1hPct ?? market.change1hPct;
      market.volume24hUsd = data.volume24hUsd || market.volume24hUsd;
      market.marketCapUsd = data.marketCapUsd || market.priceUsd * market.circulatingSupply;
      market.totalSupply = data.totalSupply || market.totalSupply;
      market.circulatingSupply = data.circulatingSupply || market.circulatingSupply;
      if (data.rates) market.rates = { ...market.rates, ...data.rates };
      renderOverviewAndPortfolio();
      return;
    }
  } catch {
    try {
      const [binRes, fxRes] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=XRPUSDT'),
        fetch('https://open.er-api.com/v6/latest/USD').catch(() => null)
      ]);
      const bin = await binRes.json();
      const priceUsd = parseFloat(bin.lastPrice);
      if (priceUsd > 0) {
        market.prevPriceUsd = market.priceUsd || priceUsd;
        market.priceUsd = priceUsd;
        market.high24hUsd = parseFloat(bin.highPrice) || market.high24hUsd;
        market.low24hUsd = parseFloat(bin.lowPrice) || market.low24hUsd;
        market.change24hPct = parseFloat(bin.priceChangePercent) || market.change24hPct;
        market.volume24hUsd = parseFloat(bin.quoteVolume) || market.volume24hUsd;
        market.marketCapUsd = priceUsd * market.circulatingSupply;
      }
      if (fxRes && fxRes.ok) {
        const fx = await fxRes.json();
        if (fx.rates) market.rates = { ...market.rates, ...fx.rates };
      }
      renderOverviewAndPortfolio();
    } catch (e) {
      console.warn('Market poll error:', e);
    }
  }
}

function connectLiveWebSocket() {
  if (binanceWs) {
    try {
      binanceWs.close();
    } catch {}
    binanceWs = null;
  }

  if (state.priceSource !== 'direct') {
    document.getElementById('liveStatusText').textContent = '10S AGG';
    return;
  }

  try {
    binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/xrpusdt@ticker');
    binanceWs.onopen = () => {
      document.getElementById('liveStatusText').textContent = 'LIVE WS';
    };
    binanceWs.onmessage = (event) => {
      if (state.priceSource !== 'direct') return;
      try {
        const msg = JSON.parse(event.data);
        const last = parseFloat(msg.c);
        if (last > 0) {
          market.prevPriceUsd = market.priceUsd || last;
          market.priceUsd = last;
          market.high24hUsd = parseFloat(msg.h) || market.high24hUsd;
          market.low24hUsd = parseFloat(msg.l) || market.low24hUsd;
          market.change24hPct = parseFloat(msg.P) || market.change24hPct;
          market.marketCapUsd = market.priceUsd * market.circulatingSupply;
          renderOverviewAndPortfolio();
        }
      } catch {}
    };
    binanceWs.onclose = () => {
      document.getElementById('liveStatusText').textContent = '10S POLL';
    };
  } catch {
    document.getElementById('liveStatusText').textContent = '10S POLL';
  }
}

function applyTheme(themeName) {
  state.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  const metaTheme = document.getElementById('metaThemeColor');
  if (metaTheme) {
    metaTheme.setAttribute('content', themeName === 'light' ? '#F1F3F6' : themeName === 'oled' ? '#000000' : '#1F2023');
  }
  document.querySelectorAll('[data-theme-opt]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-opt') === themeName);
  });
  saveState();
}

// Generate iOS Scriptable Widget Code (supports iOS Lock Screen + Small & Medium Home Screen widgets)
function generateIosScriptableCode() {
  const totalXrp = state.records.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const totalCostUsd = state.records.reduce((acc, r) => acc + (Number(r.amount) || 0) * (Number(r.buyPriceUsd) || 0), 0);
  const meta = getCurrencyMeta();
  const rate = getRate();
  const appUrl = window.location.origin;
  return `// XRP Alerts Pro — Native iOS Lock Screen & Home Screen Widget
// Supports: Small Home Widget, Medium Home Widget, and iOS Lock Screen Widget!

const CURRENCY = "${meta.code}";
const SYMBOL = "${meta.symbol}";
const FALLBACK_FX = ${rate};
const HOLDINGS_XRP = ${totalXrp};
const COST_USD = ${totalCostUsd.toFixed(2)};
const APP_URL = "${appUrl}";

async function fetchMarket() {
  const req = new Request("https://api.binance.com/api/v3/ticker/24hr?symbol=XRPUSDT");
  const bin = await req.loadJSON();
  let fx = FALLBACK_FX;
  try {
    const fxReq = new Request("https://open.er-api.com/v6/latest/USD");
    const fxJson = await fxReq.loadJSON();
    if (fxJson && fxJson.rates && fxJson.rates[CURRENCY]) fx = fxJson.rates[CURRENCY];
  } catch (e) {}
  return { bin, fx };
}

const { bin, fx } = await fetchMarket();
const priceUsd = parseFloat(bin.lastPrice);
const price = priceUsd * fx;
const change = parseFloat(bin.priceChangePercent);
const high = parseFloat(bin.highPrice) * fx;
const low = parseFloat(bin.lowPrice) * fx;
const worth = HOLDINGS_XRP * price;
const pnl = (HOLDINGS_XRP * priceUsd - COST_USD) * fx;
const sign = change >= 0 ? "+" : "";

const w = new ListWidget();
w.url = APP_URL;

if (config.widgetFamily === "accessoryRectangular") {
  // iOS Lock Screen Rectangular Widget
  const top = w.addText("✕ XRP (" + CURRENCY + ")  " + sign + change.toFixed(2) + "%");
  top.font = Font.semiboldSystemFont(12);
  const main = w.addText(SYMBOL + price.toFixed(4));
  main.font = Font.boldSystemFont(20);
  const sub = w.addText("H: " + SYMBOL + high.toFixed(3) + "  L: " + SYMBOL + low.toFixed(3));
  sub.font = Font.systemFont(11);
  sub.textOpacity = 0.8;
} else if (config.widgetFamily === "accessoryCircular") {
  // iOS Lock Screen Circular Widget
  w.addSpacer(2);
  const t1 = w.addText("XRP");
  t1.font = Font.boldSystemFont(11);
  t1.centerAlignText();
  const t2 = w.addText(price.toFixed(2));
  t2.font = Font.semiboldSystemFont(13);
  t2.centerAlignText();
  const t3 = w.addText(sign + change.toFixed(1) + "%");
  t3.font = Font.systemFont(10);
  t3.centerAlignText();
} else {
  // iOS Home Screen Small / Medium Widget
  w.backgroundColor = new Color("#1F2023");
  w.setPadding(12, 14, 12, 14);

  const header = w.addStack();
  header.layoutHorizontally();
  const title = header.addText("✕  XRP Alerts Pro");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = new Color("#0C93EA");
  header.addSpacer();
  const curBadge = header.addText(CURRENCY);
  curBadge.font = Font.boldSystemFont(11);
  curBadge.textColor = new Color("#9EA4B0");

  w.addSpacer(6);
  const priceTxt = w.addText(SYMBOL + price.toFixed(4));
  priceTxt.font = Font.lightSystemFont(25);
  priceTxt.textColor = Color.white();

  const pctTxt = w.addText(sign + change.toFixed(2) + "% (24h)");
  pctTxt.font = Font.semiboldSystemFont(12);
  pctTxt.textColor = change >= 0 ? new Color("#2ECC71") : new Color("#E74C3C");

  w.addSpacer(6);
  const hlTxt = w.addText("H: " + SYMBOL + high.toFixed(4) + "  •  L: " + SYMBOL + low.toFixed(4));
  hlTxt.font = Font.systemFont(10);
  hlTxt.textColor = new Color("#9EA4B0");

  if (HOLDINGS_XRP > 0) {
    w.addSpacer(4);
    const bagSign = pnl >= 0 ? "+" : "";
    const bagTxt = w.addText(HOLDINGS_XRP.toLocaleString() + " XRP = " + SYMBOL + worth.toFixed(2) + " (" + bagSign + SYMBOL + pnl.toFixed(0) + ")");
    bagTxt.font = Font.mediumSystemFont(11);
    bagTxt.textColor = pnl >= 0 ? new Color("#2ECC71") : new Color("#E74C3C");
  }
}

Script.setWidget(w);
Script.complete();
if (config.runsInApp) w.presentMedium();`;
}

// Built-in Live iOS Widget Canvas Renderer + Picture-in-Picture (PiP) Floating Home Screen Widget
let pipStreamInitialized = false;

function renderPipWidgetCanvas() {
  const canvas = document.getElementById('pipWidgetCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const meta = getCurrencyMeta();
  const rate = getRate();
  const priceUsd = market.priceUsd || 0;
  const chg = market.change24hPct || 0;
  const isUp = chg >= 0;
  const accentColor = isUp ? '#2ECC71' : '#E74C3C';

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#181A1F');
  bgGrad.addColorStop(1, '#101216');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle top accent bar
  ctx.fillStyle = '#0C93EA';
  ctx.fillRect(0, 0, W, 5);

  // Top Header Row
  ctx.fillStyle = '#0C93EA';
  ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('✕  XRP ALERTS PRO', 28, 44);

  // Live green dot + timestamp
  ctx.beginPath();
  ctx.arc(W - 155, 36, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#2ECC71';
  ctx.fill();

  ctx.fillStyle = '#9EA4B0';
  ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const nowStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  ctx.fillText(`LIVE • ${nowStr}`, W - 140, 43);

  // Main Hero Price
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '300 64px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const priceText = priceUsd > 0 ? formatPrice(priceUsd, 4) : `${meta.symbol}—`;
  ctx.fillText(priceText, 28, 122);

  // 24h Change Badge
  const sign = isUp ? '+' : '';
  const chgText = `${sign}${chg.toFixed(2)}% (24h)`;
  ctx.fillStyle = accentColor;
  ctx.font = '700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(chgText, 28, 162);

  // 24h High / Low
  ctx.fillStyle = '#9EA4B0';
  ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const hiStr = market.high24hUsd ? formatPrice(market.high24hUsd, 4) : '—';
  const loStr = market.low24hUsd ? formatPrice(market.low24hUsd, 4) : '—';
  ctx.fillText(`24h H: ${hiStr}   •   L: ${loStr}`, 28, 204);

  // Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(28, 232);
  ctx.lineTo(W - 28, 232);
  ctx.stroke();

  // Portfolio Bag & P&L Row
  let totalXrp = 0;
  let totalCostUsd = 0;
  state.records.forEach((r) => {
    totalXrp += Number(r.amount) || 0;
    totalCostUsd += (Number(r.amount) || 0) * (Number(r.buyPriceUsd) || 0);
  });
  const worthUsd = totalXrp * priceUsd;
  const pnlUsd = worthUsd - totalCostUsd;
  const pnlPct = totalCostUsd > 0 ? (pnlUsd / totalCostUsd) * 100 : 0;

  ctx.fillStyle = '#9EA4B0';
  ctx.font = '600 19px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`PORTFEL: ${totalXrp.toLocaleString('en-US', { maximumFractionDigits: 0 })} XRP`, 28, 272);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(formatMoney(worthUsd), 28, 312);

  const pnlSign = pnlUsd >= 0 ? '+' : '';
  ctx.fillStyle = pnlUsd >= 0 ? '#2ECC71' : '#E74C3C';
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`${formatMoney(pnlUsd)} (${pnlSign}${pnlPct.toFixed(2)}%)`, 28, 344);

  // Right Side Mini Sparkline Chart
  if (chartData && chartData.length > 2) {
    const sparkX = 390;
    const sparkY = 74;
    const sparkW = W - sparkX - 28;
    const sparkH = 130;
    const pts = chartData.slice(-48);
    const vals = pts.map((p) => p.c);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = maxV - minV || 1;

    const getSX = (i) => sparkX + (i / (pts.length - 1)) * sparkW;
    const getSY = (v) => sparkY + sparkH - ((v - minV) / span) * sparkH;

    const sGrad = ctx.createLinearGradient(0, sparkY, 0, sparkY + sparkH);
    sGrad.addColorStop(0, 'rgba(12, 147, 234, 0.38)');
    sGrad.addColorStop(1, 'rgba(12, 147, 234, 0.0)');

    ctx.beginPath();
    pts.forEach((p, idx) => {
      const x = getSX(idx);
      const y = getSY(p.c);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(getSX(pts.length - 1), sparkY + sparkH);
    ctx.lineTo(getSX(0), sparkY + sparkH);
    ctx.closePath();
    ctx.fillStyle = sGrad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, idx) => {
      const x = getSX(idx);
      const y = getSY(p.c);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#0C93EA';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  }
  return Promise.resolve(fallbackCopyText(text));
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch {}
  document.body.removeChild(ta);
}

function openWidgetSetupModal() {
  const dlg = document.getElementById('widgetSetupDialog');
  if (dlg) dlg.showModal();
}

function initApp() {
  setupDialogLightDismiss();
  applyTheme(state.theme);
  syncAlertInputsFromState();
  renderAlertHistory();
  renderCurrencyLists();
  setupChartInteractions();
  renderPipWidgetCanvas();

  // Keep Live Widget Canvas ticking every second
  setInterval(renderPipWidgetCanvas, 1000);

  const pipBtn = document.getElementById('launchPipWidgetBtn');
  const headerPipBtn = document.getElementById('headerPipWidgetBtn');
  const pipCanvas = document.getElementById('pipWidgetCanvas');
  if (pipBtn) pipBtn.addEventListener('click', openWidgetSetupModal);
  if (headerPipBtn) headerPipBtn.addEventListener('click', openWidgetSetupModal);
  if (pipCanvas) pipCanvas.addEventListener('click', openWidgetSetupModal);

  const copyOpenBtn = document.getElementById('copyAndOpenScriptableBtn');
  if (copyOpenBtn) {
    copyOpenBtn.addEventListener('click', async (e) => {
      const code = generateIosScriptableCode();
      await copyTextToClipboard(code);
      e.target.textContent = '✓ Skopiowano! Otwieram Scriptable...';
      setTimeout(() => {
        window.location.href = 'scriptable:///add';
      }, 350);
      setTimeout(() => {
        e.target.textContent = '2. Skopiuj Kod Widżetu i Otwórz Scriptable';
      }, 3500);
    });
  }

  // Tab Navigation
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const targetId = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.nav-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));

      tabBtn.classList.add('active');
      const targetView = document.getElementById(targetId);
      if (targetView) {
        targetView.classList.add('active');
        document.getElementById('currentViewTitle').textContent = targetView.getAttribute('data-title') || 'XRP Alerts';
      }
      if (targetId === 'tab-chart') {
        setTimeout(() => drawChart(), 20);
      }
    });
  });

  // Settings & Quick Currency Modal Triggers
  const openSettings = () => {
    renderCurrencyLists(document.getElementById('currencySearchInput').value);
    document.getElementById('settingsDialog').showModal();
  };
  document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
  document.getElementById('quickCurrencyBtn').addEventListener('click', openSettings);

  document.getElementById('currencySearchInput').addEventListener('input', (e) => {
    renderCurrencyLists(e.target.value);
  });

  // Theme Selector
  document.querySelectorAll('[data-theme-opt]').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.getAttribute('data-theme-opt')));
  });

  // Price Source Selector
  const updateSourceUI = () => {
    document.getElementById('srcDirectBtn').classList.toggle('active', state.priceSource === 'direct');
    document.getElementById('srcAggregatedBtn').classList.toggle('active', state.priceSource === 'aggregated');
  };
  updateSourceUI();
  document.querySelectorAll('[data-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.priceSource = btn.getAttribute('data-source');
      saveState();
      updateSourceUI();
      connectLiveWebSocket();
      pollMarketRest();
    });
  });

  // Copy iOS Scriptable Widget Code
  document.getElementById('copyScriptableWidgetBtn').addEventListener('click', async (e) => {
    const code = generateIosScriptableCode();
    try {
      await navigator.clipboard.writeText(code);
      e.target.textContent = 'Copied iOS Widget Script to Clipboard!';
      setTimeout(() => {
        e.target.textContent = '1. Copy iOS Widget Script';
      }, 2500);
    } catch {
      e.target.textContent = 'Failed to copy';
    }
  });

  // Alert Controls
  document.getElementById('highAlertEnabled').addEventListener('change', (e) => {
    state.alerts.highEnabled = e.target.checked;
    saveState();
  });
  document.getElementById('lowAlertEnabled').addEventListener('change', (e) => {
    state.alerts.lowEnabled = e.target.checked;
    saveState();
  });
  document.getElementById('highAlertInput').addEventListener('input', (e) => {
    state.alerts.highTargetCurrency = parseFloat(e.target.value) || 0;
    saveState();
    renderOverviewAndPortfolio();
  });
  document.getElementById('lowAlertInput').addEventListener('input', (e) => {
    state.alerts.lowTargetCurrency = parseFloat(e.target.value) || 0;
    saveState();
    renderOverviewAndPortfolio();
  });

  document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      const pct = parseFloat(btn.getAttribute('data-pct'));
      const base = (market.priceUsd || 0.5) * getRate();
      if (target === 'high') {
        const cur = state.alerts.highTargetCurrency || base;
        state.alerts.highTargetCurrency = Number((cur * (1 + pct)).toFixed(4));
      } else {
        const cur = state.alerts.lowTargetCurrency || base;
        state.alerts.lowTargetCurrency = Number((cur * (1 + pct)).toFixed(4));
      }
      syncAlertInputsFromState();
      saveState();
      renderOverviewAndPortfolio();
    });
  });

  // One-Tap Limit Bump on Triggered Banner (Matches original app's signature notification action)
  document.querySelectorAll('.bump-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const bump = parseFloat(chip.getAttribute('data-bump'));
      const type = state.alerts.lastTriggeredType || (bump > 0 ? 'high' : 'low');
      if (type === 'high') {
        state.alerts.highTargetCurrency = Number((state.alerts.highTargetCurrency * (1 + bump)).toFixed(4));
      } else {
        state.alerts.lowTargetCurrency = Number((state.alerts.lowTargetCurrency * (1 + bump)).toFixed(4));
      }
      alertCooldownUntil = 0;
      syncAlertInputsFromState();
      saveState();
      renderOverviewAndPortfolio();
      document.getElementById('triggeredAlertBanner').classList.add('hidden');
    });
  });

  document.getElementById('dismissAlertBannerBtn').addEventListener('click', () => {
    document.getElementById('triggeredAlertBanner').classList.add('hidden');
  });

  document.getElementById('soundAlertEnabled').addEventListener('change', (e) => {
    state.alerts.soundEnabled = e.target.checked;
    saveState();
  });

  document.getElementById('browserPushEnabled').addEventListener('change', async (e) => {
    if (e.target.checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      state.alerts.browserPush = perm === 'granted';
      e.target.checked = state.alerts.browserPush;
    } else {
      state.alerts.browserPush = false;
    }
    saveState();
  });

  document.getElementById('saveWebhookBtn').addEventListener('click', (e) => {
    state.alerts.webhookUrl = document.getElementById('webhookUrlInput').value.trim();
    saveState();
    e.target.textContent = 'Saved!';
    setTimeout(() => {
      e.target.textContent = 'Save';
    }, 1500);
  });

  document.getElementById('testAlertBtn').addEventListener('click', () => {
    const cur = (market.priceUsd || 0.6) * getRate();
    dispatchAlertNotification('high', cur, state.alerts.highTargetCurrency || cur);
  });

  // Wallet Record Form
  document.getElementById('addNewRecordBtn').addEventListener('click', () => openRecordModal(null));
  document.getElementById('recordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('recordIdInput').value;
    const amount = parseFloat(document.getElementById('recordAmountInput').value);
    const priceInCur = parseFloat(document.getElementById('recordPriceInput').value);
    const date = document.getElementById('recordDateInput').value;
    const note = document.getElementById('recordNoteInput').value.trim();
    const buyPriceUsd = priceInCur / getRate();

    if (id) {
      const idx = state.records.findIndex((r) => r.id === id);
      if (idx >= 0) {
        state.records[idx] = { id, amount, buyPriceUsd, date, note };
      }
    } else {
      state.records.push({
        id: `rec-${Date.now()}`,
        amount,
        buyPriceUsd,
        date,
        note
      });
      state.activeRecordIndex = state.records.length - 1;
    }
    saveState();
    renderOverviewAndPortfolio();
    document.getElementById('recordDialog').close();
  });

  document.getElementById('deleteRecordBtn').addEventListener('click', () => {
    const id = document.getElementById('recordIdInput').value;
    state.records = state.records.filter((r) => r.id !== id);
    state.activeRecordIndex = Math.max(0, state.records.length - 1);
    saveState();
    renderOverviewAndPortfolio();
    document.getElementById('recordDialog').close();
  });

  document.getElementById('syncXrplBtn').addEventListener('click', syncXrplAddress);
  document.getElementById('refreshNewsBtn').addEventListener('click', loadNewsFeed);

  // Reader Font Toggle (AA)
  document.getElementById('readerFontToggleBtn').addEventListener('click', () => {
    document.getElementById('readerArticleBody').classList.toggle('large-text');
  });

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Initial Data Fetch
  pollMarketRest();
  connectLiveWebSocket();
  loadChartData(state.chartRange);
  loadNewsFeed();

  setInterval(pollMarketRest, 10000);
}

document.addEventListener('DOMContentLoaded', initApp);
