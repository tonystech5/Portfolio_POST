# ==========================================================
# AI Infrastructure Portfolio Optimization
# Post-Module Assignment - Portfolio Construction (Step 2)
# Methods: Minimum Variance & Maximum Sharpe Ratio
# Concentration constraint: max 15% per single asset
# Expected-return shrinkage: toward an EXTERNAL market prior,
# not the sample's own (inflated) grand mean
# Data Source: Twelve Data (instructor-approved in class)
# ==========================================================

# install.packages(c("httr","jsonlite","PerformanceAnalytics","PortfolioAnalytics","quadprog","TTR","xts"))

library(httr)
library(jsonlite)
library(PerformanceAnalytics)
library(PortfolioAnalytics)
library(quadprog)
library(TTR)

# ----------------------------------------------------------
# STEP 1: Read Twelve Data API key from environment variable
# Stored in ~/.Renviron as: TWELVE_DATA_API=your_key_here
# ----------------------------------------------------------
TWELVE_DATA_API_KEY <- Sys.getenv("TWELVE_DATA_API")

if (TWELVE_DATA_API_KEY == "") {
  stop("TWELVE_DATA_API is not set. Check your .Renviron file and restart R (Session > Restart R).")
}

# ----------------------------------------------------------
# Tunable parameters
# ----------------------------------------------------------
MAX_WEIGHT <- 0.15            # no single asset above this weight

# SHRINKAGE_TARGET: an external, stable prior for expected return --
# NOT this sample's own average (which is inflated by an unusually
# strong trailing AI-sector rally across nearly every name). 10% is
# a standard long-run historical equity market return used as an
# anchor in Bayes-Stein / Black-Litterman style shrinkage.
SHRINKAGE_TARGET <- 0.10

# SHRINKAGE_FACTOR: how much weight goes to the external target
# vs. the stock's own trailing mean. 0.7 means 70% external prior,
# 30% raw trailing estimate -- aggressive, appropriate given how
# extreme the raw trailing sample is here.
SHRINKAGE_FACTOR <- 0.7

# ----------------------------------------------------------
# 1. Candidate universe (20 stocks, AI infrastructure thesis)
# ----------------------------------------------------------
tickers <- c("NVDA","AMD","INTC","MSFT","GOOGL","AMZN","META","AVGO","ANET","CSCO",
             "VRT","ETN","NRG","MU","WDC","ASML","AMAT","ORCL","PLTR","CRWD")

# ----------------------------------------------------------
# 2. Fetch prices from Twelve Data
# ----------------------------------------------------------
fetch_twelvedata_prices <- function(ticker, apikey, outputsize = 260) {
  url <- paste0(
    "https://api.twelvedata.com/time_series?symbol=", ticker,
    "&interval=1day&outputsize=", outputsize,
    "&apikey=", apikey
  )
  resp <- GET(url)
  data <- fromJSON(content(resp, as = "text", encoding = "UTF-8"))
  
  if (!is.null(data$status) && data$status == "error") {
    stop(paste("Twelve Data error for", ticker, ":", data$message))
  }
  
  df <- data$values
  df$datetime <- as.Date(df$datetime)
  df$close <- as.numeric(df$close)
  df <- df[order(df$datetime), c("datetime", "close")]
  colnames(df) <- c("date", ticker)
  return(df)
}

price_list <- list()
batch_size <- 8
pause_seconds <- 61

for (i in seq(1, length(tickers), by = batch_size)) {
  batch <- tickers[i:min(i + batch_size - 1, length(tickers))]
  cat("Fetching batch:", paste(batch, collapse = ", "), "\n")
  
  for (t in batch) {
    price_list[[t]] <- fetch_twelvedata_prices(t, TWELVE_DATA_API_KEY)
  }
  
  if (i + batch_size <= length(tickers)) {
    cat("Pausing", pause_seconds, "seconds for rate limit...\n")
    Sys.sleep(pause_seconds)
  }
}

prices_df <- Reduce(function(x, y) merge(x, y, by = "date"), price_list)
prices_df <- na.omit(prices_df)

prices <- xts::xts(prices_df[, -1], order.by = prices_df$date)
colnames(prices) <- tickers

# ----------------------------------------------------------
# 3. Prices to simple returns
# ----------------------------------------------------------
returns <- Return.calculate(prices, method = "discrete")
returns <- na.omit(returns)

# ----------------------------------------------------------
# 4. Covariance matrix and raw (unshrunk) expected returns
# ----------------------------------------------------------
cov_matrix <- cov(returns) * 252
mean_returns_raw <- colMeans(returns) * 252
rf <- 0.035

n <- length(tickers)

# ----------------------------------------------------------
# 4b. SHRINKAGE toward an EXTERNAL prior (not the sample's own mean)
# Covariance is untouched -- shrinkage only affects the return side.
# ----------------------------------------------------------
mean_returns_shrunk <- SHRINKAGE_FACTOR * SHRINKAGE_TARGET + (1 - SHRINKAGE_FACTOR) * mean_returns_raw

cat("\n--- Shrinkage effect on expected returns (toward", SHRINKAGE_TARGET*100, "% external prior) ---\n")
shrinkage_compare <- data.frame(
  Ticker = tickers,
  Raw_Return_Pct = round(mean_returns_raw * 100, 1),
  Shrunk_Return_Pct = round(mean_returns_shrunk * 100, 1)
)
print(shrinkage_compare[order(-shrinkage_compare$Raw_Return_Pct), ])

# Shift each daily return series by a constant so its sample mean equals
# the shrunk target, while leaving volatility and correlations unchanged.
daily_shift <- (mean_returns_shrunk - mean_returns_raw) / 252
returns_shrunk <- sweep(returns, 2, daily_shift, "+")

mean_returns <- mean_returns_shrunk

# ----------------------------------------------------------
# 5. Minimum Variance Portfolio, with max weight cap
# (Return-agnostic by construction -- shrinkage does not affect this method)
# ----------------------------------------------------------
Dmat <- 2 * cov_matrix
dvec <- rep(0, n)

Amat <- cbind(rep(1, n), diag(n), -diag(n))
bvec <- c(1, rep(0, n), rep(-MAX_WEIGHT, n))
meq  <- 1

minvar_sol <- solve.QP(Dmat, dvec, Amat, bvec, meq = meq)
w_minvar <- minvar_sol$solution
names(w_minvar) <- tickers

# ----------------------------------------------------------
# 6. Maximum Sharpe Ratio Portfolio, with max weight cap,
# using the SHRUNK returns series.
# ----------------------------------------------------------
port_spec <- portfolio.spec(assets = tickers)
port_spec <- add.constraint(port_spec, type = "full_investment")
port_spec <- add.constraint(port_spec, type = "long_only")
port_spec <- add.constraint(port_spec, type = "box", min = 0, max = MAX_WEIGHT)
port_spec <- add.objective(port_spec, type = "return", name = "mean")
port_spec <- add.objective(port_spec, type = "risk", name = "StdDev")

maxsharpe_opt <- optimize.portfolio(
  R = returns_shrunk,
  portfolio = port_spec,
  optimize_method = "ROI",
  maxSR = TRUE
)

w_sharpe <- extractWeights(maxsharpe_opt)

# ----------------------------------------------------------
# 7. Portfolio-level metrics (using shrunk expected returns)
# ----------------------------------------------------------
port_ret_mv <- as.numeric(w_minvar %*% mean_returns)
port_vol_mv <- as.numeric(sqrt(t(w_minvar) %*% cov_matrix %*% w_minvar))
sharpe_mv   <- (port_ret_mv - rf) / port_vol_mv

port_ret_s <- as.numeric(w_sharpe %*% mean_returns[tickers])
port_vol_s <- as.numeric(sqrt(t(w_sharpe) %*% cov_matrix %*% w_sharpe))
sharpe_s   <- (port_ret_s - rf) / port_vol_s

results <- data.frame(
  Ticker = tickers,
  MinVariance_Weight = round(w_minvar * 100, 2),
  MaxSharpe_Weight = round(w_sharpe[tickers] * 100, 2)
)
results <- results[order(-results$MaxSharpe_Weight), ]

summary_table <- data.frame(
  Metric = c("Expected Return (shrunk)", "Volatility", "Sharpe Ratio"),
  MinVariance = c(sprintf("%.2f%%", port_ret_mv*100), sprintf("%.2f%%", port_vol_mv*100), sprintf("%.2f", sharpe_mv)),
  MaxSharpe   = c(sprintf("%.2f%%", port_ret_s*100), sprintf("%.2f%%", port_vol_s*100), sprintf("%.2f", sharpe_s))
)

print(results)
print(summary_table)

# ----------------------------------------------------------
# 8. Rolling diagnostics (optional depth)
# ----------------------------------------------------------
roll_corr_30 <- runCor(returns[, "NVDA"], returns[, "MSFT"], n = 30)
roll_corr_90 <- runCor(returns[, "NVDA"], returns[, "MSFT"], n = 90)

# ----------------------------------------------------------
# 9. Export weights for the LLM / SPA dashboard
# ----------------------------------------------------------
export_list <- list(
  max_weight_constraint = MAX_WEIGHT,
  shrinkage_target = SHRINKAGE_TARGET,
  shrinkage_factor = SHRINKAGE_FACTOR,
  min_variance_weights = as.list(round(w_minvar, 4)),
  max_sharpe_weights = as.list(round(w_sharpe[tickers], 4)),
  portfolio_metrics = list(
    min_variance = list(expected_return = port_ret_mv, volatility = port_vol_mv, sharpe = sharpe_mv),
    max_sharpe = list(expected_return = port_ret_s, volatility = port_vol_s, sharpe = sharpe_s)
  )
)
write_json(export_list, "ai_infra_portfolio_weights.json", pretty = TRUE, auto_unbox = TRUE)
