/**
 * VoltFolio — Inverse Volatility Portfolio Optimizer
 * Client-Side Asset Allocation Engine & Visualizer
 */

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================

// OpenRouter model configuration - easily swappable
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';

// Storage keys
const STORAGE_KEYS = {
  TWELVE_DATA_KEY: 'voltFolio_twelveDataKey',
  OPENROUTER_KEY: 'voltFolio_openRouterKey',
  TICKERS: 'voltFolio_tickers',
  HIDE_BANNER: 'voltFolio_hideInfoBanner'
};

// Constraints
const MIN_TICKERS = 5;
const MAX_TICKERS = 15;
const TWELVEDATA_RATE_LIMIT_PER_MIN = 8;
const ROLLING_WINDOW_MS = 60000;

// Color Palette for Charts (Electric Dark Theme)
const CHART_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#f59e0b',
  '#6366f1', '#3b82f6', '#ec4899', '#84cc16', '#14b8a6',
  '#a855f7', '#0284c7', '#22c55e', '#e11d48', '#d97706'
];

// Default Ticker Set if none saved
const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'SPY', 'GLD'];

// ==========================================
// STATE MANAGEMENT
// ==========================================

let state = {
  tickers: [],
  twelveDataKey: '',
  openRouterKey: '',
  investmentAmount: null,
  compareWithEqualWeight: false,
  latestResults: null,
  isFetching: false
};

// Request log for rate limiting
const requestLog = [];

// Chart instance reference
let weightsChart = null;

// ==========================================
// DOM ELEMENTS
// ==========================================

const elements = {
  // Banner
  infoBanner: document.getElementById('info-banner'),
  dismissBannerBtn: document.getElementById('dismiss-banner-btn'),

  // Form & Inputs
  portfolioForm: document.getElementById('portfolio-form'),
  tickerInput: document.getElementById('ticker-input'),
  addTickerBtn: document.getElementById('add-ticker-btn'),
  tickerChips: document.getElementById('ticker-chips'),
  tickerCountBadge: document.getElementById('ticker-count-badge'),
  tickerError: document.getElementById('ticker-error'),
  investmentAmountInput: document.getElementById('investment-amount'),
  twelveDataKeyInput: document.getElementById('twelvedata-key'),
  twelveDataKeyError: document.getElementById('twelvedata-key-error'),
  openRouterKeyInput: document.getElementById('openrouter-key'),
  openRouterKeyError: document.getElementById('openrouter-key-error'),
  submitBtn: document.getElementById('submit-btn'),

  // Progress Card
  fetchProgressCard: document.getElementById('fetch-progress-card'),
  progressStatusText: document.getElementById('progress-status-text'),
  progressPercent: document.getElementById('progress-percent'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  rateLimitNotice: document.getElementById('rate-limit-notice'),
  rateLimitText: document.getElementById('rate-limit-text'),

  // Results
  resultsPanel: document.getElementById('results'),
  resultsPlaceholder: document.getElementById('results-placeholder'),
  resultsContent: document.getElementById('results-content'),
  resultsTimestamp: document.getElementById('results-timestamp'),
  compareToggle: document.getElementById('compare-toggle'),

  // Metrics
  metricInvvolRisk: document.getElementById('metric-invvol-risk'),
  metricRiskReduction: document.getElementById('metric-risk-reduction'),
  metricEqvolCard: document.getElementById('metric-eqvol-card'),
  metricEqvolRisk: document.getElementById('metric-eqvol-risk'),
  metricLowestVolSymbol: document.getElementById('metric-lowest-vol-symbol'),
  metricLowestVolVal: document.getElementById('metric-lowest-vol-val'),
  metricHighestVolSymbol: document.getElementById('metric-highest-vol-symbol'),
  metricHighestVolVal: document.getElementById('metric-highest-vol-val'),
  metricInvestmentCard: document.getElementById('metric-investment-card'),
  metricTotalInvested: document.getElementById('metric-total-invested'),

  // Chart
  weightsChartCanvas: document.getElementById('weights-chart'),

  // AI Explainer
  explainBtn: document.getElementById('explain-btn'),
  aiResponseArea: document.getElementById('ai-response-area'),
  aiSkeleton: document.getElementById('ai-skeleton'),
  aiContent: document.getElementById('ai-content'),
  aiText: document.getElementById('ai-text'),
  aiError: document.getElementById('ai-error'),

  // Table
  allocationTableBody: document.getElementById('allocation-table-body')
};

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  setupEventListeners();
  renderTickerChips();
});

function loadSavedState() {
  // Load Banner Preference
  if (localStorage.getItem(STORAGE_KEYS.HIDE_BANNER) === 'true') {
    elements.infoBanner.classList.add('hidden');
  }

  // Load API Keys
  state.twelveDataKey = localStorage.getItem(STORAGE_KEYS.TWELVE_DATA_KEY) || '';
  state.openRouterKey = localStorage.getItem(STORAGE_KEYS.OPENROUTER_KEY) || '';
  elements.twelveDataKeyInput.value = state.twelveDataKey;
  elements.openRouterKeyInput.value = state.openRouterKey;

  // Load Saved Tickers
  const savedTickers = localStorage.getItem(STORAGE_KEYS.TICKERS);
  if (savedTickers) {
    try {
      const parsed = JSON.parse(savedTickers);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.tickers = parsed;
      } else {
        state.tickers = [...DEFAULT_TICKERS];
      }
    } catch (e) {
      state.tickers = [...DEFAULT_TICKERS];
    }
  } else {
    state.tickers = [...DEFAULT_TICKERS];
  }
}

function setupEventListeners() {
  // Dismiss Banner
  elements.dismissBannerBtn.addEventListener('click', () => {
    elements.infoBanner.classList.add('hidden');
    localStorage.setItem(STORAGE_KEYS.HIDE_BANNER, 'true');
  });

  // Ticker Add Button & Keypress
  elements.addTickerBtn.addEventListener('click', () => handleAddTickerInput());
  elements.tickerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTickerInput();
    }
  });

  // Presets
  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const presetStr = e.target.getAttribute('data-preset');
      if (presetStr) {
        const presetTickers = presetStr.split(',').map(s => s.trim().toUpperCase());
        state.tickers = [...new Set(presetTickers)].slice(0, MAX_TICKERS);
        saveTickersState();
        renderTickerChips();
        hideError(elements.tickerError);
      }
    });
  });

  // API Key Inputs Auto-Save
  elements.twelveDataKeyInput.addEventListener('input', (e) => {
    state.twelveDataKey = e.target.value.trim();
    localStorage.setItem(STORAGE_KEYS.TWELVE_DATA_KEY, state.twelveDataKey);
    hideError(elements.twelveDataKeyError);
  });

  elements.openRouterKeyInput.addEventListener('input', (e) => {
    state.openRouterKey = e.target.value.trim();
    localStorage.setItem(STORAGE_KEYS.OPENROUTER_KEY, state.openRouterKey);
    hideError(elements.openRouterKeyError);
  });

  // Investment Amount Input
  elements.investmentAmountInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.investmentAmount = (!isNaN(val) && val > 0) ? val : null;
    if (state.latestResults) {
      renderResults(state.latestResults);
    }
  });

  // Compare Toggle
  elements.compareToggle.addEventListener('change', (e) => {
    state.compareWithEqualWeight = e.target.checked;
    if (state.latestResults) {
      renderResults(state.latestResults);
    }
  });

  // Submit / Optimize Button
  elements.submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleOptimizeFormSubmit();
  });

  // AI Explain Button
  elements.explainBtn.addEventListener('click', () => {
    handleExplainAllocation();
  });
}

// ==========================================
// TICKER MANAGEMENT
// ==========================================

function handleAddTickerInput() {
  const rawValue = elements.tickerInput.value.trim().toUpperCase();
  if (!rawValue) return;

  // Support comma separated entries e.g. "AAPL, MSFT"
  const tokens = rawValue.split(',').map(t => t.trim().replace(/[^A-Z0-9.-]/g, '')).filter(Boolean);

  let addedCount = 0;
  for (const token of tokens) {
    if (state.tickers.length >= MAX_TICKERS) {
      showError(elements.tickerError, `Maximum limit of ${MAX_TICKERS} tickers reached.`);
      break;
    }
    if (state.tickers.includes(token)) {
      showError(elements.tickerError, `Ticker "${token}" is already in your basket.`);
      continue;
    }
    state.tickers.push(token);
    addedCount++;
  }

  if (addedCount > 0) {
    elements.tickerInput.value = '';
    saveTickersState();
    renderTickerChips();
    hideError(elements.tickerError);
  }
}

function removeTicker(symbol) {
  state.tickers = state.tickers.filter(t => t !== symbol);
  saveTickersState();
  renderTickerChips();
  hideError(elements.tickerError);
}

function saveTickersState() {
  localStorage.setItem(STORAGE_KEYS.TICKERS, JSON.stringify(state.tickers));
}

function renderTickerChips() {
  elements.tickerChips.innerHTML = '';

  state.tickers.forEach(symbol => {
    const chip = document.createElement('div');
    chip.className = 'ticker-chip';
    chip.innerHTML = `
      <span>${symbol}</span>
      <button type="button" class="chip-remove-btn" aria-label="Remove ${symbol}">×</button>
    `;

    chip.querySelector('.chip-remove-btn').addEventListener('click', () => {
      removeTicker(symbol);
    });

    elements.tickerChips.appendChild(chip);
  });

  // Update Badge & Validate Count
  const count = state.tickers.length;
  elements.tickerCountBadge.textContent = `${count} / ${MAX_TICKERS} Tickers`;

  if (count >= MIN_TICKERS && count <= MAX_TICKERS) {
    elements.tickerCountBadge.classList.add('valid');
    elements.submitBtn.disabled = false;
  } else {
    elements.tickerCountBadge.classList.remove('valid');
  }
}

// ==========================================
// DATA FETCHING & THROTTLING (Twelve Data)
// ==========================================

/**
 * Enforces rate limiting for Twelve Data (max 8 requests / rolling 60s)
 */
async function fetchWithRateLimit(url) {
  const now = Date.now();
  
  // Clean up request log older than rolling window
  while (requestLog.length > 0 && now - requestLog[0] >= ROLLING_WINDOW_MS) {
    requestLog.shift();
  }

  if (requestLog.length >= TWELVEDATA_RATE_LIMIT_PER_MIN) {
    const oldestReq = requestLog[0];
    const waitTimeMs = ROLLING_WINDOW_MS - (now - oldestReq) + 1000;
    
    // Show countdown notice
    elements.rateLimitNotice.classList.remove('hidden');
    let remainingSec = Math.ceil(waitTimeMs / 1000);
    
    while (remainingSec > 0) {
      elements.rateLimitText.textContent = `Twelve Data rate limit hit (8 req/min): Pausing ${remainingSec}s for next batch...`;
      await new Promise(r => setTimeout(r, 1000));
      remainingSec--;
    }
    
    elements.rateLimitNotice.classList.add('hidden');
  }

  requestLog.push(Date.now());
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  
  if (data.status === 'error' || data.code) {
    throw new Error(data.message || `API error for symbol`);
  }

  return data;
}

async function handleOptimizeFormSubmit() {
  hideError(elements.tickerError);
  hideError(elements.twelveDataKeyError);

  // Validate Tickers
  if (state.tickers.length < MIN_TICKERS) {
    showError(elements.tickerError, `Please select at least ${MIN_TICKERS} valid tickers to run the optimizer (currently ${state.tickers.length}).`);
    return;
  }

  // Validate API Key
  if (!state.twelveDataKey) {
    showError(elements.twelveDataKeyError, 'Twelve Data API key is required to fetch historical stock prices.');
    return;
  }

  // UI Progress Setup
  state.isFetching = true;
  elements.submitBtn.disabled = true;
  elements.fetchProgressCard.classList.remove('hidden');
  updateProgress(0, `Initializing data fetch for ${state.tickers.length} tickers...`);

  const fetchedDataMap = {};
  const errorsMap = {};

  for (let i = 0; i < state.tickers.length; i++) {
    const ticker = state.tickers[i];
    const percent = Math.round(((i) / state.tickers.length) * 100);
    updateProgress(percent, `Fetching daily prices for ${ticker} (${i + 1}/${state.tickers.length})...`);

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=252&apikey=${encodeURIComponent(state.twelveDataKey)}`;

    try {
      const data = await fetchWithRateLimit(url);
      if (!data.values || !Array.isArray(data.values) || data.values.length < 2) {
        throw new Error(`Insufficient historical price data returned for ${ticker}.`);
      }
      fetchedDataMap[ticker] = data.values;
    } catch (err) {
      errorsMap[ticker] = err.message;
    }
  }

  updateProgress(100, 'Calculating volatility metrics and inverse weights...');
  await new Promise(r => setTimeout(r, 400));

  elements.fetchProgressCard.classList.add('hidden');
  elements.submitBtn.disabled = false;
  state.isFetching = false;

  // Handle Errors
  const errorTickers = Object.keys(errorsMap);
  if (errorTickers.length > 0) {
    const sampleErr = errorsMap[errorTickers[0]];
    if (sampleErr.toLowerCase().includes('api key') || sampleErr.toLowerCase().includes('unauthorized')) {
      showError(elements.twelveDataKeyError, `Invalid Twelve Data API Key: ${sampleErr}`);
      return;
    }
    
    if (Object.keys(fetchedDataMap).length < MIN_TICKERS) {
      showError(elements.tickerError, `Failed to fetch valid data for tickers: ${errorTickers.join(', ')}. Details: ${sampleErr}. Need at least ${MIN_TICKERS} successful tickers.`);
      return;
    }
  }

  // Compute Inverse Volatility Metrics
  try {
    const results = calculateInverseVolatilityPortfolio(fetchedDataMap);
    state.latestResults = results;
    renderResults(results);
  } catch (calcError) {
    showError(elements.tickerError, `Calculation Error: ${calcError.message}`);
  }
}

function updateProgress(percent, statusText) {
  elements.progressBarFill.style.width = `${percent}%`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressStatusText.textContent = statusText;
}

// ==========================================
// MATHEMATICAL CORE FUNCTIONS
// ==========================================

/**
 * Calculates Log Returns, Annualized Volatility, and Inverse Volatility Weights
 * 
 * FORMULA SPECIFICATION:
 * 1. Log Daily Return: r_t = ln(Price_t / Price_{t-1})
 * 2. Daily Volatility: s = sqrt( sum((r_t - mean)^2) / (N - 1) )
 * 3. Annualized Volatility: vol_i = s * sqrt(252)
 * 4. Inverse Volatility Weight: w_i = (1 / vol_i) / sum(1 / vol_j)
 */
function calculateInverseVolatilityPortfolio(dataMap) {
  const tickers = Object.keys(dataMap);
  const stats = [];

  for (const ticker of tickers) {
    const rawValues = dataMap[ticker]; // Twelve Data returns newest first
    
    // Sort chronologically (oldest first at index 0, newest at end)
    const sortedPrices = rawValues
      .map(item => parseFloat(item.close))
      .filter(p => !isNaN(p) && p > 0)
      .reverse();

    if (sortedPrices.length < 2) {
      throw new Error(`Not enough price points for ${ticker}`);
    }

    // Step 1: Compute Daily Log Returns
    const logReturns = [];
    for (let t = 1; t < sortedPrices.length; t++) {
      const return_t = Math.log(sortedPrices[t] / sortedPrices[t - 1]);
      logReturns.push(return_t);
    }

    // Step 2: Mean Daily Return
    const meanReturn = logReturns.reduce((sum, val) => sum + val, 0) / logReturns.length;

    // Step 3: Sample Variance & Daily Volatility
    const variance = logReturns.reduce((sum, val) => sum + Math.pow(val - meanReturn, 2), 0) / (logReturns.length - 1);
    const dailyVolatility = Math.sqrt(variance);

    // Step 4: Annualized Volatility (assuming 252 trading days/year)
    const annualizedVol = dailyVolatility * Math.sqrt(252);

    stats.push({
      ticker,
      dataPoints: sortedPrices.length,
      annualizedVol,
      invVol: 1 / annualizedVol
    });
  }

  // Step 5: Compute Inverse Volatility Weights
  const totalInvVol = stats.reduce((sum, item) => sum + item.invVol, 0);
  const equalWeight = 1 / stats.length;

  let weightedInvVolSum = 0;
  let weightedEqVolSum = 0;

  stats.forEach(item => {
    item.invWeight = item.invVol / totalInvVol; // Inverse Volatility Weight
    item.eqWeight = equalWeight;                 // Equal Weight (1/N)
    item.weightDiff = item.invWeight - item.eqWeight;

    weightedInvVolSum += item.invWeight * item.annualizedVol;
    weightedEqVolSum += item.eqWeight * item.annualizedVol;
  });

  // Sort stats by Inverse Volatility Weight descending
  stats.sort((a, b) => b.invWeight - a.invWeight);

  // Identify extremes
  const lowestVolItem = [...stats].sort((a, b) => a.annualizedVol - b.annualizedVol)[0];
  const highestVolItem = [...stats].sort((a, b) => b.annualizedVol - a.annualizedVol)[0];

  return {
    tickerStats: stats,
    portfolioInvVolRisk: weightedInvVolSum,
    portfolioEqVolRisk: weightedEqVolSum,
    riskReductionPct: ((weightedEqVolSum - weightedInvVolSum) / weightedEqVolSum) * 100,
    lowestVolAsset: lowestVolItem,
    highestVolAsset: highestVolItem,
    computedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
}

// ==========================================
// RENDER RESULTS
// ==========================================

function renderResults(results) {
  elements.resultsPlaceholder.classList.add('hidden');
  elements.resultsContent.classList.remove('hidden');

  elements.resultsTimestamp.textContent = `Computed at ${results.computedAt} across 252 trading days`;

  // 1. Oversized Key Metrics
  elements.metricInvvolRisk.textContent = `${(results.portfolioInvVolRisk * 100).toFixed(2)}%`;
  
  const reductionText = results.riskReductionPct >= 0
    ? `-${results.riskReductionPct.toFixed(1)}% vs Eq Weight`
    : `+${Math.abs(results.riskReductionPct).toFixed(1)}% vs Eq Weight`;
  elements.metricRiskReduction.textContent = reductionText;

  elements.metricLowestVolSymbol.textContent = results.lowestVolAsset.ticker;
  elements.metricLowestVolVal.textContent = `${(results.lowestVolAsset.annualizedVol * 100).toFixed(1)}% Vol`;

  elements.metricHighestVolSymbol.textContent = results.highestVolAsset.ticker;
  elements.metricHighestVolVal.textContent = `${(results.highestVolAsset.annualizedVol * 100).toFixed(1)}% Vol`;

  // Toggle Equal Weight Card
  if (state.compareWithEqualWeight) {
    elements.metricEqvolCard.classList.remove('hidden');
    elements.metricEqvolRisk.textContent = `${(results.portfolioEqVolRisk * 100).toFixed(2)}%`;
  } else {
    elements.metricEqvolCard.classList.add('hidden');
  }

  // Investment Amount Card & Table Columns
  if (state.investmentAmount) {
    elements.metricInvestmentCard.classList.remove('hidden');
    elements.metricTotalInvested.textContent = formatCurrency(state.investmentAmount);
  } else {
    elements.metricInvestmentCard.classList.add('hidden');
  }

  // 2. Render Donut Chart
  renderChart(results);

  // 3. Render Table
  renderTable(results);
}

function renderChart(results) {
  const ctx = elements.weightsChartCanvas.getContext('2d');

  if (weightsChart) {
    weightsChart.destroy();
  }

  const labels = results.tickerStats.map(s => s.ticker);
  const invWeights = results.tickerStats.map(s => (s.invWeight * 100).toFixed(2));
  const eqWeights = results.tickerStats.map(s => (s.eqWeight * 100).toFixed(2));

  const datasets = [
    {
      label: 'Inverse Volatility Weight (%)',
      data: invWeights,
      backgroundColor: CHART_COLORS.slice(0, labels.length),
      borderWidth: 2,
      borderColor: '#080c14',
      hoverOffset: 8
    }
  ];

  if (state.compareWithEqualWeight) {
    datasets.push({
      label: 'Equal Weight (%)',
      data: eqWeights,
      backgroundColor: CHART_COLORS.slice(0, labels.length).map(c => adjustAlpha(c, 0.4)),
      borderWidth: 2,
      borderColor: '#080c14',
      hoverOffset: 8
    });
  }

  weightsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        animateScale: true,
        animateRotate: true,
        duration: 800
      },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: {
              family: 'Space Grotesk',
              size: 12
            },
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#38bdf8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${context.raw}%`;
            }
          }
        }
      },
      cutout: '68%'
    }
  });
}

function renderTable(results) {
  elements.allocationTableBody.innerHTML = '';

  const showCompare = state.compareWithEqualWeight;
  const showAmount = !!state.investmentAmount;

  // Toggle Header Columns
  document.querySelectorAll('.eq-col').forEach(el => {
    if (showCompare) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  document.querySelectorAll('.amount-col').forEach(el => {
    if (showAmount) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  document.querySelectorAll('.eq-amount-col').forEach(el => {
    if (showAmount && showCompare) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  results.tickerStats.forEach((item, index) => {
    const row = document.createElement('tr');
    const color = CHART_COLORS[index % CHART_COLORS.length];

    const volPct = (item.annualizedVol * 100).toFixed(2);
    const weightPct = (item.invWeight * 100).toFixed(2);
    const eqWeightPct = (item.eqWeight * 100).toFixed(2);
    const diffPct = (item.weightDiff * 100).toFixed(2);

    const invDollar = showAmount ? formatCurrency(state.investmentAmount * item.invWeight) : '';
    const eqDollar = showAmount ? formatCurrency(state.investmentAmount * item.eqWeight) : '';

    const diffBadge = diffPct >= 0
      ? `<span class="weight-diff-tag diff-positive">+${diffPct}%</span>`
      : `<span class="weight-diff-tag diff-negative">${diffPct}%</span>`;

    row.innerHTML = `
      <td class="ticker-cell">
        <span class="ticker-dot" style="background-color: ${color}"></span>
        <span>${item.ticker}</span>
      </td>
      <td>${item.dataPoints} days</td>
      <td><strong>${volPct}%</strong></td>
      <td>
        <span class="weight-badge">${weightPct}%</span>
      </td>
      ${showCompare ? `<td class="eq-col">${eqWeightPct}%</td>` : ''}
      ${showCompare ? `<td class="eq-col">${diffBadge}</td>` : ''}
      ${showAmount ? `<td class="amount-col"><strong>${invDollar}</strong></td>` : ''}
      ${showAmount && showCompare ? `<td class="eq-amount-col">${eqDollar}</td>` : ''}
    `;

    elements.allocationTableBody.appendChild(row);
  });
}

// ==========================================
// AI EXPLANATION (OpenRouter API)
// ==========================================

async function handleExplainAllocation() {
  hideError(elements.aiError);

  if (!state.latestResults) {
    showError(elements.aiError, 'Please run the optimizer first before requesting an AI explanation.');
    return;
  }

  if (!state.openRouterKey) {
    showError(elements.aiError, 'OpenRouter API Key is required for AI explanations. Please enter your key in the configuration panel above.');
    elements.openRouterKeyInput.focus();
    return;
  }

  // Show Skeleton, Hide Placeholder & Text
  document.querySelector('.ai-placeholder-text')?.classList.add('hidden');
  elements.aiContent.classList.add('hidden');
  elements.aiSkeleton.classList.remove('hidden');
  elements.explainBtn.disabled = true;

  const stats = state.latestResults.tickerStats;
  const portfolioVol = (state.latestResults.portfolioInvVolRisk * 100).toFixed(2);
  const eqVol = (state.latestResults.portfolioEqVolRisk * 100).toFixed(2);

  const tickerSummary = stats
    .map(s => `${s.ticker}: Volatility ${(s.annualizedVol * 100).toFixed(1)}%, Inv-Weight ${(s.invWeight * 100).toFixed(1)}%`)
    .join('; ');

  const promptMessage = `Analyze this inverse volatility portfolio allocation:
Overall Inverse Volatility Portfolio Volatility: ${portfolioVol}% (vs Equal Weight Volatility: ${eqVol}%).
Asset details: ${tickerSummary}.

In 3-4 concise sentences, explain to an investor why the less volatile assets received higher weights and how this inverse weighting balances overall portfolio risk compared to equal weighting.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'VoltFolio Optimizer'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert financial analyst explaining portfolio optimization strategies clearly to an individual investor. Provide 3-4 plain-language sentences directly addressing the specific ticker allocation numbers.'
          },
          {
            role: 'user',
            content: promptMessage
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenRouter call failed with status ${response.status}`);
    }

    const responseData = await response.json();
    const aiMessage = responseData.choices?.[0]?.message?.content;

    if (!aiMessage) {
      throw new Error('No completion text returned from OpenRouter.');
    }

    elements.aiText.textContent = aiMessage;
    elements.aiSkeleton.classList.add('hidden');
    elements.aiContent.classList.remove('hidden');
  } catch (err) {
    elements.aiSkeleton.classList.add('hidden');
    showError(elements.aiError, `AI Explanation Error: ${err.message}`);
  } finally {
    elements.explainBtn.disabled = false;
  }
}

// ==========================================
// UTILITY HELPERS
// ==========================================

function showError(containerEl, message) {
  if (!containerEl) return;
  containerEl.textContent = message;
  containerEl.classList.remove('hidden');
}

function hideError(containerEl) {
  if (!containerEl) return;
  containerEl.textContent = '';
  containerEl.classList.add('hidden');
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(amount);
}

function adjustAlpha(hex, alpha) {
  // Convert hex to rgba
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
