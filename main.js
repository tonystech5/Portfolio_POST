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
const DEFAULT_TICKERS = ['NVDA', 'MSFT', 'AVGO', 'VRT', 'ETN'];

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

// AbortController reference for in-flight fetches
let currentAbortController = null;

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

  // API Keys Toggle & Collapsible
  toggleApiKeysBtn: document.getElementById('toggle-api-keys-btn'),
  apiKeysStatusDot: document.getElementById('api-keys-status-dot'),
  apiKeysCollapsible: document.getElementById('api-keys-collapsible'),

  // Progress Card
  fetchProgressCard: document.getElementById('fetch-progress-card'),
  progressStatusText: document.getElementById('progress-status-text'),
  progressPercent: document.getElementById('progress-percent'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  cancelFetchBtn: document.getElementById('cancel-fetch-btn'),
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
  allocationTableBody: document.getElementById('allocation-table-body'),
  tradingSignalsTableBody: document.getElementById('trading-signals-table-body'),

  // R Portfolio Optimization Comparison
  rComparisonTableBody: document.getElementById('r-comparison-table-body'),
  rMinvarReturn: document.getElementById('r-minvar-return'),
  rMinvarVolatility: document.getElementById('r-minvar-volatility'),
  rMinvarSharpe: document.getElementById('r-minvar-sharpe'),
  rMaxsharpeReturn: document.getElementById('r-maxsharpe-return'),
  rMaxsharpeVolatility: document.getElementById('r-maxsharpe-volatility'),
  rMaxsharpeSharpe: document.getElementById('r-maxsharpe-sharpe'),

  // Diversification Score
  metricDiversificationScore: document.getElementById('metric-diversification-score'),
  metricDiversificationTag: document.getElementById('metric-diversification-tag'),
  metricDiversificationFootnote: document.getElementById('metric-diversification-footnote'),

  // Correlation Matrix
  correlationMatrixGrid: document.getElementById('correlation-matrix-grid'),

  // Historical Stress Test
  stressScenarioSelect: document.getElementById('stress-scenario-select'),
  runStressTestBtn: document.getElementById('run-stress-test-btn'),
  stressTestResults: document.getElementById('stress-test-results'),
  stressTotalReturn: document.getElementById('stress-total-return'),
  stressMaxDrawdown: document.getElementById('stress-max-drawdown'),
  stressEndValue: document.getElementById('stress-end-value'),
  stressChartCanvas: document.getElementById('stress-chart'),
  stressTestLoading: document.getElementById('stress-test-loading'),
  stressLoadingText: document.getElementById('stress-loading-text'),
  stressTestError: document.getElementById('stress-test-error')
};

let rPortfolioWeightsData = null;

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  setupEventListeners();
  renderTickerChips();
  fetchRPortfolioWeights();
});

function updateApiKeyStatusUI() {
  const hasTwelveData = Boolean(state.twelveDataKey);
  const hasOpenRouter = Boolean(state.openRouterKey);

  if (hasTwelveData) {
    elements.apiKeysStatusDot.classList.remove('hidden');
    elements.apiKeysStatusDot.title = hasOpenRouter ? 'Twelve Data & OpenRouter keys saved' : 'Twelve Data key saved';
  } else {
    elements.apiKeysStatusDot.classList.add('hidden');
  }
}

function setApiKeysCollapsed(isCollapsed) {
  if (!elements.apiKeysCollapsible) return;
  if (isCollapsed) {
    elements.apiKeysCollapsible.classList.add('collapsed');
    elements.toggleApiKeysBtn.classList.remove('active');
    elements.toggleApiKeysBtn.setAttribute('aria-expanded', 'false');
  } else {
    elements.apiKeysCollapsible.classList.remove('collapsed');
    elements.toggleApiKeysBtn.classList.add('active');
    elements.toggleApiKeysBtn.setAttribute('aria-expanded', 'true');
  }
}

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

  // Set collapsible state: collapsed if keys exist, expanded if first-time visitor with no keys
  const hasSavedKeys = Boolean(state.twelveDataKey);
  setApiKeysCollapsed(hasSavedKeys);
  updateApiKeyStatusUI();

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
  // Toggle API Keys Section
  if (elements.toggleApiKeysBtn) {
    elements.toggleApiKeysBtn.addEventListener('click', () => {
      const isCurrentlyCollapsed = elements.apiKeysCollapsible.classList.contains('collapsed');
      setApiKeysCollapsed(!isCurrentlyCollapsed);
    });
  }

  // Dismiss Banner
  elements.dismissBannerBtn.addEventListener('click', () => {
    elements.infoBanner.classList.add('hidden');
    localStorage.setItem(STORAGE_KEYS.HIDE_BANNER, 'true');
  });

  // Cancel Fetch Button
  if (elements.cancelFetchBtn) {
    elements.cancelFetchBtn.addEventListener('click', () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }

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
    updateApiKeyStatusUI();
  });

  elements.openRouterKeyInput.addEventListener('input', (e) => {
    state.openRouterKey = e.target.value.trim();
    localStorage.setItem(STORAGE_KEYS.OPENROUTER_KEY, state.openRouterKey);
    hideError(elements.openRouterKeyError);
    updateApiKeyStatusUI();
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

  // Historical Stress Test Button
  if (elements.runStressTestBtn) {
    elements.runStressTestBtn.addEventListener('click', () => {
      runStressTest();
    });
  }
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
async function enforceRateLimit(requestCount, signal) {
  const now = Date.now();
  
  // Clean up request log older than rolling window
  while (requestLog.length > 0 && now - requestLog[0] >= ROLLING_WINDOW_MS) {
    requestLog.shift();
  }

  if (requestLog.length + requestCount > TWELVEDATA_RATE_LIMIT_PER_MIN) {
    const oldestReq = requestLog[0];
    const waitTimeMs = ROLLING_WINDOW_MS - (now - oldestReq) + 1000;
    
    elements.rateLimitNotice.classList.remove('hidden');
    let remainingMs = waitTimeMs;
    
    while (remainingMs > 0) {
      if (signal?.aborted) return;
      const remainingSec = Math.ceil(remainingMs / 1000);
      elements.rateLimitText.textContent = `Twelve Data rate limit (8 req/min): Waiting ${remainingSec}s for next batch...`;
      await new Promise(r => setTimeout(r, Math.min(1000, remainingMs)));
      remainingMs -= 1000;

      const t = Date.now();
      while (requestLog.length > 0 && t - requestLog[0] >= ROLLING_WINDOW_MS) {
        requestLog.shift();
      }
      if (requestLog.length + requestCount <= TWELVEDATA_RATE_LIMIT_PER_MIN) {
        break;
      }
    }
    
    elements.rateLimitNotice.classList.add('hidden');
  }

  const timestamp = Date.now();
  for (let i = 0; i < requestCount; i++) {
    requestLog.push(timestamp);
  }
}

async function fetchSingleTicker(url, signal) {
  const response = await fetch(url, { signal });
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
    setApiKeysCollapsed(false);
    showError(elements.twelveDataKeyError, 'Twelve Data API key is required to fetch historical stock prices.');
    if (elements.twelveDataKeyInput) {
      elements.twelveDataKeyInput.focus();
    }
    return;
  }

  // AbortController for cancel capability
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  // UI Progress Setup
  state.isFetching = true;
  elements.submitBtn.disabled = true;
  elements.fetchProgressCard.classList.remove('hidden');
  updateProgress(0, `Initializing data fetch for ${state.tickers.length} tickers...`);

  const fetchedDataMap = {};
  const errorsMap = {};

  const batchSize = TWELVEDATA_RATE_LIMIT_PER_MIN; // Max 8 requests per batch
  const totalTickers = state.tickers.length;
  let processedCount = 0;

  try {
    for (let b = 0; b < totalTickers; b += batchSize) {
      if (signal.aborted) {
        throw new Error('Fetch aborted by user.');
      }

      const batch = state.tickers.slice(b, b + batchSize);

      // Wait if rate limit would be exceeded
      await enforceRateLimit(batch.length, signal);

      if (signal.aborted) {
        throw new Error('Fetch aborted by user.');
      }

      updateProgress(
        Math.round((processedCount / totalTickers) * 100),
        `Fetching batch of ${batch.length} tickers (${batch.join(', ')})...`
      );

      // Run parallel requests for this batch using Promise.all
      const batchPromises = batch.map(async (ticker) => {
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=252&apikey=${encodeURIComponent(state.twelveDataKey)}`;
        try {
          const data = await fetchSingleTicker(url, signal);
          if (!data.values || !Array.isArray(data.values) || data.values.length < 2) {
            throw new Error(`Insufficient historical price data returned for ${ticker}.`);
          }
          fetchedDataMap[ticker] = data.values;
        } catch (err) {
          if (err.name === 'AbortError' || signal.aborted) {
            throw err;
          }
          errorsMap[ticker] = err.message;
        }
      });

      await Promise.all(batchPromises);

      if (signal.aborted) {
        throw new Error('Fetch aborted by user.');
      }

      processedCount += batch.length;
      updateProgress(
        Math.round((processedCount / totalTickers) * 100),
        `Completed ${processedCount}/${totalTickers} tickers...`
      );
    }
  } catch (err) {
    elements.fetchProgressCard.classList.add('hidden');
    elements.rateLimitNotice.classList.add('hidden');
    elements.submitBtn.disabled = false;
    state.isFetching = false;

    if (err.name === 'AbortError' || err.message.includes('aborted')) {
      showError(elements.tickerError, 'Fetch operation cancelled by user.');
      return;
    }
    showError(elements.tickerError, `Fetch error: ${err.message}`);
    return;
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
// MATHEMATICAL CORE & TECHNICAL INDICATOR FUNCTIONS
// ==========================================

/**
 * Calculates 14-period Relative Strength Index (RSI) using Wilder's smoothing technique.
 * Formula:
 * RS = Smoothed Average Gain / Smoothed Average Loss
 * RSI = 100 - (100 / (1 + RS))
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length <= period) {
    return 50; // Fallback neutral if insufficient data
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // First period SMA of gains and losses
  for (let i = 0; i < period; i++) {
    const chg = changes[i];
    if (chg > 0) avgGain += chg;
    else if (chg < 0) avgLoss += Math.abs(chg);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's Exponential Smoothing for subsequent periods
  for (let i = period; i < changes.length; i++) {
    const chg = changes[i];
    const gain = chg > 0 ? chg : 0;
    const loss = chg < 0 ? Math.abs(chg) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Computes Exponential Moving Average (EMA) series
 */
function computeEMA(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [];

  let sum = 0;
  const initPeriod = Math.min(period, values.length);
  for (let i = 0; i < initPeriod; i++) {
    sum += values[i];
  }
  let currentEma = sum / initPeriod;

  for (let i = 0; i < values.length; i++) {
    if (i < initPeriod - 1) {
      ema.push(null);
    } else if (i === initPeriod - 1) {
      ema.push(currentEma);
    } else {
      currentEma = values[i] * k + currentEma * (1 - k);
      ema.push(currentEma);
    }
  }

  return ema;
}

/**
 * Calculates Moving Average Convergence Divergence (MACD 12, 26, 9)
 * Formula:
 * MACD Line = EMA_12(Prices) - EMA_26(Prices)
 * Signal Line = EMA_9(MACD Line)
 * MACD Histogram = MACD Line - Signal Line
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!prices || prices.length < 2) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }

  const fastEMA = computeEMA(prices, fastPeriod);
  const slowEMA = computeEMA(prices, slowPeriod);

  // Compute MACD Line = Fast EMA - Slow EMA
  const macdSeries = [];
  const validMacdValues = [];
  const validIndices = [];

  for (let i = 0; i < prices.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      const macdVal = fastEMA[i] - slowEMA[i];
      macdSeries.push(macdVal);
      validMacdValues.push(macdVal);
      validIndices.push(i);
    } else {
      macdSeries.push(null);
    }
  }

  if (validMacdValues.length === 0) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }

  // Signal Line = 9-period EMA of MACD Line
  const signalEma = computeEMA(validMacdValues, signalPeriod);

  const latestMacd = validMacdValues[validMacdValues.length - 1];
  const latestSignal = signalEma[signalEma.length - 1] ?? latestMacd;
  const latestHist = (latestMacd !== undefined && latestSignal !== undefined) ? (latestMacd - latestSignal) : 0;

  return {
    macdLine: latestMacd,
    signalLine: latestSignal,
    histogram: latestHist
  };
}

/**
 * Calculates Log Returns, Annualized Volatility, Inverse Volatility Weights,
 * Trading Signals (RSI 14 & MACD 12/26/9), Pairwise Pearson Correlation Matrix,
 * and Basket Diversification Score.
 * 
 * FORMULA SPECIFICATIONS:
 * 1. Log Daily Return: r_t = ln(Price_t / Price_{t-1})
 * 2. Daily Volatility: s = sqrt( sum((r_t - mean)^2) / (N - 1) )
 * 3. Annualized Volatility: vol_i = s * sqrt(252)
 * 4. Inverse Volatility Weight: w_i = (1 / vol_i) / sum(1 / vol_j)
 * 5. RSI (14-period): Wilder's smoothed momentum oscillator [0, 100]
 * 6. MACD (12, 26, 9): Fast EMA(12) - Slow EMA(26); Signal = EMA(9); Histogram = MACD - Signal
 * 7. Signal Status: PASS if RSI < 70 (not overbought) AND MACD Histogram > 0 (upward momentum), else FAIL
 * 8. Pearson Pairwise Correlation:
 *    r(X, Y) = sum((X_k - mean_X) * (Y_k - mean_Y)) / ( sqrt(sum((X_k - mean_X)^2)) * sqrt(sum((Y_k - mean_Y)^2)) )
 *    Calculates co-movement of daily log returns for ticker pair (X, Y) on overlapping trading days.
 * 9. Basket Diversification Score:
 *    Given average pairwise correlation r_avg across all N*(N-1)/2 ticker pairs:
 *    Score = Math.round(Math.max(0, Math.min(100, (1 - r_avg) * 50)))
 */
function calculateInverseVolatilityPortfolio(dataMap) {
  const tickers = Object.keys(dataMap);
  const stats = [];
  const logReturnsByDateMap = {};

  for (const ticker of tickers) {
    const rawValues = dataMap[ticker]; // Twelve Data returns newest first
    
    // Sort chronologically (oldest first at index 0, newest at end)
    const sortedItems = rawValues
      .map(item => ({ date: item.datetime, price: parseFloat(item.close) }))
      .filter(item => !isNaN(item.price) && item.price > 0)
      .reverse();

    if (sortedItems.length < 2) {
      throw new Error(`Not enough price points for ${ticker}`);
    }

    // Step 1: Compute Daily Log Returns
    const logReturns = [];
    const dateReturnsMap = {};
    for (let t = 1; t < sortedItems.length; t++) {
      const return_t = Math.log(sortedItems[t].price / sortedItems[t - 1].price);
      logReturns.push(return_t);
      dateReturnsMap[sortedItems[t].date] = return_t;
    }

    logReturnsByDateMap[ticker] = dateReturnsMap;

    // Step 2: Mean Daily Return
    const meanReturn = logReturns.reduce((sum, val) => sum + val, 0) / logReturns.length;

    // Step 3: Sample Variance & Daily Volatility
    const variance = logReturns.reduce((sum, val) => sum + Math.pow(val - meanReturn, 2), 0) / (logReturns.length - 1);
    const dailyVolatility = Math.sqrt(variance);

    // Step 4: Annualized Volatility (assuming 252 trading days/year)
    const annualizedVol = dailyVolatility * Math.sqrt(252);

    // Guard against division-by-zero / zero volatility
    if (!isFinite(annualizedVol) || annualizedVol <= 0) {
      throw new Error(`${ticker} has zero historical volatility — insufficient price variation to compute weights`);
    }

    // Step 5: Technical Indicators (RSI 14 & MACD 12/26/9)
    const priceSeries = sortedItems.map(item => item.price);
    const rsi = calculateRSI(priceSeries, 14);
    const macdResult = calculateMACD(priceSeries, 12, 26, 9);
    const macdHist = macdResult.histogram !== null ? macdResult.histogram : 0;
    const isRsiPass = rsi < 70;
    const isMacdPass = macdHist > 0;
    const signalStatus = (isRsiPass && isMacdPass) ? 'PASS' : 'FAIL';

    stats.push({
      ticker,
      dataPoints: sortedItems.length,
      annualizedVol,
      invVol: 1 / annualizedVol,
      rsi,
      macdResult,
      macdHist,
      isRsiPass,
      isMacdPass,
      signalStatus
    });
  }

  // Step 6: Compute Inverse Volatility Weights
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

  // Step 6: Compute Pairwise Pearson Correlation Matrix
  const correlationMatrix = {};
  let totalPairCorrelation = 0;
  let pairCount = 0;

  tickers.forEach(t1 => {
    correlationMatrix[t1] = {};
  });

  for (let i = 0; i < tickers.length; i++) {
    const t1 = tickers[i];
    correlationMatrix[t1][t1] = 1.0; // Self-correlation is always 1.0

    for (let j = i + 1; j < tickers.length; j++) {
      const t2 = tickers[j];

      // Match common trading dates between t1 and t2
      const map1 = logReturnsByDateMap[t1];
      const map2 = logReturnsByDateMap[t2];
      const commonDates = Object.keys(map1).filter(d => map2[d] !== undefined);

      let corrVal = 0;
      if (commonDates.length >= 2) {
        const returns1 = commonDates.map(d => map1[d]);
        const returns2 = commonDates.map(d => map2[d]);
        corrVal = computePearsonCorrelation(returns1, returns2);
      }

      correlationMatrix[t1][t2] = corrVal;
      correlationMatrix[t2][t1] = corrVal;

      totalPairCorrelation += corrVal;
      pairCount++;
    }
  }

  // Step 7: Calculate Basket Diversification Score
  const avgCorrelation = pairCount > 0 ? totalPairCorrelation / pairCount : 1.0;
  const diversificationScore = Math.round(Math.max(0, Math.min(100, (1 - avgCorrelation) * 50)));

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
    correlationMatrix,
    diversificationScore,
    avgCorrelation,
    tickersList: tickers,
    computedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
}

/**
 * Pearson Pairwise Correlation Formula:
 * r(X, Y) = sum((X_k - mean_X) * (Y_k - mean_Y)) / ( sqrt(sum((X_k - mean_X)^2)) * sqrt(sum((Y_k - mean_Y)^2)) )
 */
function computePearsonCorrelation(arr1, arr2) {
  const n = arr1.length;
  const mean1 = arr1.reduce((s, v) => s + v, 0) / n;
  const mean2 = arr2.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = arr1[i] - mean1;
    const diff2 = arr2[i] - mean2;
    num += diff1 * diff2;
    denom1 += diff1 * diff1;
    denom2 += diff2 * diff2;
  }

  const denom = Math.sqrt(denom1) * Math.sqrt(denom2);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, num / denom));
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

  // Diversification Score Card
  if (elements.metricDiversificationScore) {
    elements.metricDiversificationScore.textContent = `${results.diversificationScore}/100`;
    
    if (results.diversificationScore >= 70) {
      elements.metricDiversificationTag.textContent = 'High';
      elements.metricDiversificationTag.className = 'metric-tag tag-success';
      elements.metricDiversificationFootnote.textContent = 'Low correlation = better diversification';
    } else if (results.diversificationScore >= 45) {
      elements.metricDiversificationTag.textContent = 'Moderate';
      elements.metricDiversificationTag.className = 'metric-tag tag-neutral';
      elements.metricDiversificationFootnote.textContent = 'Moderate asset correlation across basket';
    } else {
      elements.metricDiversificationTag.textContent = 'Concentrated';
      elements.metricDiversificationTag.className = 'metric-tag tag-warning';
      elements.metricDiversificationFootnote.textContent = 'High correlation = concentrated risk';
    }
  }

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

  // 4. Render Trading Signal Summary Table
  renderTradingSignalsTable(results);

  // 5. Render R Portfolio Optimization Comparison Table
  renderRComparisonTable(results, rPortfolioWeightsData);

  // 6. Render Correlation Matrix Heatmap
  renderCorrelationMatrix(results.correlationMatrix, results.tickersList);
}

function renderCorrelationMatrix(matrix, tickers) {
  if (!elements.correlationMatrixGrid || !matrix || !tickers) return;

  let html = '<table class="corr-table"><thead><tr><th>Ticker</th>';
  tickers.forEach(t => {
    html += `<th>${t}</th>`;
  });
  html += '</tr></thead><tbody>';

  tickers.forEach(t1 => {
    html += `<tr><th class="corr-row-header">${t1}</th>`;
    tickers.forEach(t2 => {
      const r = (matrix[t1] && matrix[t1][t2] !== undefined) ? matrix[t1][t2] : 0;
      const formatted = r >= 0 ? `+${r.toFixed(2)}` : r.toFixed(2);
      
      let style = '';
      let descriptor = '';

      if (t1 === t2) {
        style = 'background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-weight: 700;';
        descriptor = 'Self Correlation';
      } else if (r < -0.1) {
        const alpha = Math.min(0.5, 0.2 + Math.abs(r) * 0.35);
        style = `background: rgba(16, 185, 129, ${alpha.toFixed(2)}); color: #34d399; font-weight: 700;`;
        descriptor = 'Negative correlation (High diversification benefit)';
      } else if (r <= 0.25) {
        style = 'background: rgba(148, 163, 184, 0.12); color: #cbd5e1;';
        descriptor = 'Low co-movement';
      } else {
        const alpha = Math.min(0.55, 0.15 + r * 0.4);
        style = `background: rgba(239, 68, 68, ${alpha.toFixed(2)}); color: #fca5a5; font-weight: 600;`;
        descriptor = r >= 0.6 ? 'Strong positive correlation' : 'Moderate positive correlation';
      }

      html += `<td class="corr-cell" style="${style}" title="${t1} vs ${t2}: ${formatted} (${descriptor})">${formatted}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  elements.correlationMatrixGrid.innerHTML = html;
}

// ==========================================
// HISTORICAL STRESS TEST ENGINE
// ==========================================

const STRESS_SCENARIOS = {
  '2020_covid': {
    name: '2020 COVID Crash',
    startDate: '2020-02-19',
    endDate: '2020-03-23'
  },
  '2022_rates': {
    name: '2022 Rate Hike Selloff',
    startDate: '2022-01-03',
    endDate: '2022-10-14'
  },
  '2023_tech': {
    name: '2023 Tech Rally',
    startDate: '2023-01-03',
    endDate: '2023-07-31'
  }
};

let stressChart = null;

async function runStressTest() {
  hideError(elements.stressTestError);

  if (!state.latestResults || !state.latestResults.tickerStats || state.latestResults.tickerStats.length === 0) {
    showError(elements.stressTestError, 'Please run the portfolio optimizer first to calculate allocation weights.');
    return;
  }

  if (!state.twelveDataKey) {
    showError(elements.stressTestError, 'Twelve Data API key is required to run the historical stress test.');
    setApiKeysCollapsed(false);
    elements.twelveDataKeyInput?.focus();
    return;
  }

  const scenarioKey = elements.stressScenarioSelect.value;
  const scenario = STRESS_SCENARIOS[scenarioKey] || STRESS_SCENARIOS['2020_covid'];

  // UI state
  elements.stressTestLoading.classList.remove('hidden');
  elements.stressLoadingText.textContent = `Fetching historical prices for ${scenario.name} (${scenario.startDate} to ${scenario.endDate})...`;
  elements.stressTestResults.classList.add('hidden');
  elements.runStressTestBtn.disabled = true;

  const tickers = state.latestResults.tickerStats.map(s => s.ticker);
  const weightsMap = {};
  state.latestResults.tickerStats.forEach(s => {
    weightsMap[s.ticker] = s.invWeight;
  });

  const stressAbortController = new AbortController();
  const signal = stressAbortController.signal;

  const fetchedDataMap = {};
  const batchSize = TWELVEDATA_RATE_LIMIT_PER_MIN;

  try {
    for (let b = 0; b < tickers.length; b += batchSize) {
      const batch = tickers.slice(b, b + batchSize);
      await enforceRateLimit(batch.length, signal);

      const batchPromises = batch.map(async (ticker) => {
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&start_date=${scenario.startDate}&end_date=${scenario.endDate}&apikey=${encodeURIComponent(state.twelveDataKey)}`;
        const data = await fetchSingleTicker(url, signal);
        if (!data.values || !Array.isArray(data.values) || data.values.length < 2) {
          throw new Error(`Insufficient price history returned for ${ticker} during ${scenario.name}.`);
        }
        fetchedDataMap[ticker] = data.values;
      });

      await Promise.all(batchPromises);
    }

    const initialCapital = state.investmentAmount && state.investmentAmount > 0 ? state.investmentAmount : 10000;
    const simulationResults = calculateStressSimulation(fetchedDataMap, weightsMap, initialCapital);

    renderStressTestChart(simulationResults, scenario.name);

    elements.stressTotalReturn.textContent = `${simulationResults.totalReturn >= 0 ? '+' : ''}${simulationResults.totalReturn.toFixed(2)}%`;
    elements.stressTotalReturn.className = `stress-metric-val ${simulationResults.totalReturn >= 0 ? 'success-text' : 'danger-text'}`;

    elements.stressMaxDrawdown.textContent = `${simulationResults.maxDrawdown.toFixed(2)}%`;
    elements.stressEndValue.textContent = formatCurrency(simulationResults.finalValue);

    elements.stressTestLoading.classList.add('hidden');
    elements.stressTestResults.classList.remove('hidden');
  } catch (err) {
    elements.stressTestLoading.classList.add('hidden');
    showError(elements.stressTestError, `Stress test error: ${err.message}`);
  } finally {
    elements.runStressTestBtn.disabled = false;
  }
}

/**
 * Calculates Portfolio Trajectory, Total Return, and Max Drawdown during Crisis Window
 * 
 * MATHEMATICAL SPECIFICATIONS:
 * 1. Portfolio Value on day t: V(t) = sum_i( Capital_i * (Price_i(t) / Price_i(0)) )
 * 2. Peak Portfolio Value up to day t: Peak_t = max_{0 <= s <= t} V(s)
 * 3. Drawdown on day t: Drawdown_t = (V(t) - Peak_t) / Peak_t
 * 4. Maximum Drawdown: MaxDrawdown = min_{0 <= t <= T} Drawdown_t
 */
function calculateStressSimulation(fetchedDataMap, weightsMap, initialCapital) {
  const tickers = Object.keys(fetchedDataMap);

  const tickerSeries = {};
  tickers.forEach(ticker => {
    tickerSeries[ticker] = fetchedDataMap[ticker]
      .map(item => ({ date: item.datetime, price: parseFloat(item.close) }))
      .filter(item => !isNaN(item.price) && item.price > 0)
      .reverse(); // oldest first
  });

  const dateSet = new Set();
  tickers.forEach(ticker => {
    tickerSeries[ticker].forEach(item => dateSet.add(item.date));
  });
  const sortedDates = Array.from(dateSet).sort();

  if (sortedDates.length < 2) {
    throw new Error('Insufficient price overlap across tickers for historical simulation.');
  }

  const priceLookup = {};
  tickers.forEach(ticker => {
    priceLookup[ticker] = {};
    tickerSeries[ticker].forEach(item => {
      priceLookup[ticker][item.date] = item.price;
    });
  });

  const initialPrices = {};
  tickers.forEach(ticker => {
    const firstItem = tickerSeries[ticker][0];
    initialPrices[ticker] = firstItem ? firstItem.price : null;
  });

  const initialAllocation = {};
  tickers.forEach(ticker => {
    const w = weightsMap[ticker] || (1 / tickers.length);
    initialAllocation[ticker] = initialCapital * w;
  });

  const timeSeries = [];
  let currentPrices = { ...initialPrices };
  let peakValue = initialCapital;
  let maxDrawdown = 0; // expressed as negative %

  sortedDates.forEach(date => {
    let portfolioValue = 0;

    tickers.forEach(ticker => {
      if (priceLookup[ticker][date]) {
        currentPrices[ticker] = priceLookup[ticker][date];
      }
      const priceRatio = currentPrices[ticker] / (initialPrices[ticker] || 1);
      portfolioValue += initialAllocation[ticker] * priceRatio;
    });

    if (portfolioValue > peakValue) {
      peakValue = portfolioValue;
    }

    const currentDrawdown = ((portfolioValue - peakValue) / peakValue) * 100;
    if (currentDrawdown < maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    timeSeries.push({
      date,
      value: portfolioValue,
      drawdown: currentDrawdown
    });
  });

  const finalValue = timeSeries[timeSeries.length - 1].value;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

  return {
    timeSeries,
    initialCapital,
    finalValue,
    totalReturn,
    maxDrawdown
  };
}

function renderStressTestChart(simulation, scenarioName) {
  const ctx = elements.stressChartCanvas.getContext('2d');
  if (stressChart) {
    stressChart.destroy();
  }

  const labels = simulation.timeSeries.map(item => item.date);
  const data = simulation.timeSeries.map(item => item.value);

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

  stressChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Portfolio Value ($)',
        data,
        borderColor: '#8b5cf6',
        borderWidth: 2,
        fill: true,
        backgroundColor: gradient,
        tension: 0.25,
        pointRadius: labels.length > 40 ? 0 : 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const val = context.raw;
              const idx = context.dataIndex;
              const dd = simulation.timeSeries[idx].drawdown.toFixed(2);
              return [
                ` Portfolio Value: ${formatCurrency(val)}`,
                ` Drawdown from Peak: ${dd}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 8,
            font: { size: 10 }
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748b',
            callback: (val) => '$' + Math.round(val).toLocaleString(),
            font: { size: 10 }
          }
        }
      }
    }
  });
}

function renderChart(results) {
  const ctx = elements.weightsChartCanvas.getContext('2d');

  if (weightsChart) {
    weightsChart.destroy();
  }

  const isMobile = window.innerWidth < 768;
  const labels = results.tickerStats.map(s => s.ticker);
  // Keep weights as numbers for Chart.js dataset
  const invWeights = results.tickerStats.map(s => s.invWeight * 100);
  const eqWeights = results.tickerStats.map(s => s.eqWeight * 100);

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
          position: isMobile ? 'bottom' : 'right',
          labels: {
            color: '#94a3b8',
            font: {
              family: 'Space Grotesk',
              size: isMobile ? 11 : 12
            },
            padding: isMobile ? 8 : 12,
            usePointStyle: true,
            pointStyle: 'circle',
            generateLabels: (chart) => {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const meta = chart.getDatasetMeta(0);
                  const style = meta.controller.getStyle(i);
                  const rawVal = data.datasets[0].data[i];
                  const formattedVal = typeof rawVal === 'number' ? rawVal.toFixed(2) : rawVal;
                  return {
                    text: `${label} (${formattedVal}%)`,
                    fillStyle: style.backgroundColor,
                    strokeStyle: style.borderColor,
                    lineWidth: style.borderWidth,
                    fontColor: '#94a3b8',
                    hidden: isNaN(rawVal) || (meta.data[i] && meta.data[i].hidden),
                    index: i
                  };
                });
              }
              return [];
            }
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
              const raw = context.raw;
              const formatted = typeof raw === 'number' ? raw.toFixed(2) : raw;
              return ` ${context.dataset.label}: ${formatted}%`;
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
      <td class="ticker-cell" data-label="Ticker">
        <span class="ticker-dot" style="background-color: ${color}"></span>
        <span>${item.ticker}</span>
      </td>
      <td data-label="Data Points">${item.dataPoints} days</td>
      <td data-label="Ann. Volatility"><strong>${volPct}%</strong></td>
      <td data-label="Inverse Vol Weight">
        <span class="weight-badge">${weightPct}%</span>
      </td>
      ${showCompare ? `<td class="eq-col" data-label="Equal Weight">${eqWeightPct}%</td>` : ''}
      ${showCompare ? `<td class="eq-col" data-label="Weight Diff">${diffBadge}</td>` : ''}
      ${showAmount ? `<td class="amount-col" data-label="Dollar Allocation"><strong>${invDollar}</strong></td>` : ''}
      ${showAmount && showCompare ? `<td class="eq-amount-col" data-label="Eq-Weight Dollar">${eqDollar}</td>` : ''}
    `;

    elements.allocationTableBody.appendChild(row);
  });
}

function renderTradingSignalsTable(results) {
  if (!elements.tradingSignalsTableBody || !results.tickerStats) return;
  elements.tradingSignalsTableBody.innerHTML = '';

  results.tickerStats.forEach((item, index) => {
    const row = document.createElement('tr');
    const color = CHART_COLORS[index % CHART_COLORS.length];

    const rsiVal = item.rsi;
    const rsiFormatted = (typeof rsiVal === 'number' && !isNaN(rsiVal)) ? rsiVal.toFixed(2) : '--';
    
    const macdHistVal = item.macdHist;
    const macdHistFormatted = (typeof macdHistVal === 'number' && !isNaN(macdHistVal))
      ? (macdHistVal >= 0 ? `+${macdHistVal.toFixed(4)}` : macdHistVal.toFixed(4))
      : '--';

    const macdClass = (typeof macdHistVal === 'number' && macdHistVal > 0) ? 'macd-val-pos' : 'macd-val-neg';

    // Status Badge (PASS / FAIL) based on: RSI < 70 AND MACD Histogram > 0
    const isPass = item.signalStatus === 'PASS';
    const statusBadge = isPass
      ? `<span class="signal-badge signal-badge-pass" title="Pass criteria met: RSI ${rsiFormatted} (< 70) and MACD Hist ${macdHistFormatted} (> 0)">PASS</span>`
      : `<span class="signal-badge signal-badge-fail" title="Failed criteria: ${!item.isRsiPass ? 'RSI >= 70 (Overbought). ' : ''}${!item.isMacdPass ? 'MACD Histogram <= 0 (Downward momentum).' : ''}">FAIL</span>`;

    // RSI descriptive tag
    let rsiTag = '';
    if (typeof rsiVal === 'number' && !isNaN(rsiVal)) {
      if (rsiVal >= 70) {
        rsiTag = `<span class="rsi-tag tag-warning" title="Overbought (>= 70)">Overbought</span>`;
      } else if (rsiVal <= 30) {
        rsiTag = `<span class="rsi-tag tag-neutral" title="Oversold (<= 30)">Oversold</span>`;
      } else {
        rsiTag = `<span class="rsi-tag" title="Normal Range (< 70)">Normal</span>`;
      }
    }

    row.innerHTML = `
      <td class="ticker-cell" data-label="Ticker">
        <span class="ticker-dot" style="background-color: ${color}"></span>
        <span>${item.ticker}</span>
      </td>
      <td data-label="RSI (14)">
        <div class="rsi-value-pill">
          <span class="rsi-val">${rsiFormatted}</span>
          ${rsiTag}
        </div>
      </td>
      <td data-label="MACD Histogram (12, 26, 9)">
        <span class="${macdClass}">${macdHistFormatted}</span>
      </td>
      <td data-label="Status">
        ${statusBadge}
      </td>
    `;

    elements.tradingSignalsTableBody.appendChild(row);
  });
}

// ==========================================
// R PORTFOLIO OPTIMIZATION COMPARISON
// ==========================================

async function fetchRPortfolioWeights() {
  const possiblePaths = [
    './ai_infra_portfolio_weights.json',
    'ai_infra_portfolio_weights.json',
    '/ai_infra_portfolio_weights.json',
    './public/ai_infra_portfolio_weights.json'
  ];

  for (const path of possiblePaths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        rPortfolioWeightsData = await res.json();
        renderRMetricsSummary(rPortfolioWeightsData);
        if (state.latestResults) {
          renderRComparisonTable(state.latestResults, rPortfolioWeightsData);
        }
        return;
      }
    } catch (e) {
      // Try next path
    }
  }
  console.warn('Could not load R portfolio weights JSON from any candidate path.');
}

function renderRMetricsSummary(data) {
  if (!data || !data.portfolio_metrics) return;
  const { min_variance, max_sharpe } = data.portfolio_metrics;

  if (min_variance) {
    if (elements.rMinvarReturn) {
      elements.rMinvarReturn.textContent = typeof min_variance.expected_return === 'number'
        ? `${(min_variance.expected_return * 100).toFixed(2)}%`
        : '--';
    }
    if (elements.rMinvarVolatility) {
      elements.rMinvarVolatility.textContent = typeof min_variance.volatility === 'number'
        ? `${(min_variance.volatility * 100).toFixed(2)}%`
        : '--';
    }
    if (elements.rMinvarSharpe) {
      elements.rMinvarSharpe.textContent = typeof min_variance.sharpe === 'number'
        ? min_variance.sharpe.toFixed(4)
        : '--';
    }
  }

  if (max_sharpe) {
    if (elements.rMaxsharpeReturn) {
      elements.rMaxsharpeReturn.textContent = typeof max_sharpe.expected_return === 'number'
        ? `${(max_sharpe.expected_return * 100).toFixed(2)}%`
        : '--';
    }
    if (elements.rMaxsharpeVolatility) {
      elements.rMaxsharpeVolatility.textContent = typeof max_sharpe.volatility === 'number'
        ? `${(max_sharpe.volatility * 100).toFixed(2)}%`
        : '--';
    }
    if (elements.rMaxsharpeSharpe) {
      elements.rMaxsharpeSharpe.textContent = typeof max_sharpe.sharpe === 'number'
        ? max_sharpe.sharpe.toFixed(4)
        : '--';
    }
  }
}

function renderRComparisonTable(results, rData) {
  if (!elements.rComparisonTableBody) return;
  elements.rComparisonTableBody.innerHTML = '';

  const rMinVarWeights = (rData && rData.min_variance_weights) || {};
  const rMaxSharpeWeights = (rData && rData.max_sharpe_weights) || {};
  const jsStatsMap = new Map();

  if (results && Array.isArray(results.tickerStats)) {
    results.tickerStats.forEach(stat => {
      jsStatsMap.set(stat.ticker.toUpperCase(), stat);
    });
  }

  // Combine unique tickers from both sides:
  // 1. First add live portfolio tickers (preserving active basket order)
  const allTickersSet = new Set();
  if (results && Array.isArray(results.tickerStats)) {
    results.tickerStats.forEach(stat => allTickersSet.add(stat.ticker.toUpperCase()));
  }

  // 2. Next add all remaining tickers from R dataset
  Object.keys(rMinVarWeights).forEach(t => allTickersSet.add(t.toUpperCase()));
  Object.keys(rMaxSharpeWeights).forEach(t => allTickersSet.add(t.toUpperCase()));

  const allTickers = Array.from(allTickersSet);

  allTickers.forEach((symbol, index) => {
    const row = document.createElement('tr');
    const color = CHART_COLORS[index % CHART_COLORS.length];

    // R Min-Variance Weight (%)
    let rMinVarFormatted = '<span class="text-dim">N/A</span>';
    if (rMinVarWeights[symbol] !== undefined && rMinVarWeights[symbol] !== null) {
      const val = Math.abs(rMinVarWeights[symbol]);
      rMinVarFormatted = `${(val * 100).toFixed(2)}%`;
    }

    // R Max-Sharpe Weight (%)
    let rMaxSharpeFormatted = '<span class="text-dim">N/A</span>';
    if (rMaxSharpeWeights[symbol] !== undefined && rMaxSharpeWeights[symbol] !== null) {
      const val = Math.abs(rMaxSharpeWeights[symbol]);
      rMaxSharpeFormatted = `${(val * 100).toFixed(2)}%`;
    }

    // JS Inverse-Vol Weight (%)
    let jsInvVolFormatted = '<span class="text-dim">N/A</span>';
    const jsStat = jsStatsMap.get(symbol);
    if (jsStat && typeof jsStat.invWeight === 'number') {
      jsInvVolFormatted = `${(jsStat.invWeight * 100).toFixed(2)}%`;
    }

    row.innerHTML = `
      <td class="ticker-cell" data-label="Ticker">
        <span class="ticker-dot" style="background-color: ${color}"></span>
        <span>${symbol}</span>
      </td>
      <td data-label="R Min-Variance Weight (%)">${rMinVarFormatted}</td>
      <td data-label="R Max-Sharpe Weight (%)">${rMaxSharpeFormatted}</td>
      <td data-label="JS Inverse-Vol Weight (%)">${jsInvVolFormatted}</td>
    `;

    elements.rComparisonTableBody.appendChild(row);
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
