(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const statusPill = $("statusPill");
  const statusText = $("statusText");
  const changeDisplay = $("changeDisplay");
  const priceDisplay = $("priceDisplay");
  const prevCloseDisplay = $("prevCloseDisplay");
  const timeDisplay = $("timeDisplay");
  const marketPhase = $("marketPhase");
  const gapDisplay = $("gapDisplay");
  const progressFill = $("progressFill");
  const thresholdDisplay = $("thresholdDisplay");
  const monitorDisplay = $("monitorDisplay");
  const nyTimeDisplay = $("nyTimeDisplay");
  const cnTimeDisplay = $("cnTimeDisplay");

  const THRESHOLD = 3;
  let quote = null;

  function nowNY() {
    return new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  }
  function nowCN() {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function isNYMarketOpen() {
    const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = ny.getDay();
    if (day === 0 || day === 6) return false;
    const h = ny.getHours(), m = ny.getMinutes();
    const mins = h * 60 + m;
    return mins >= 570 && mins < 960;
  }

  async function fetchQuote() {
    const resp = await fetch("./quotes/last.json?_=" + Date.now(), { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.json();
  }

  function render() {
    thresholdDisplay.textContent = "±" + THRESHOLD.toFixed(2) + "%";
    nyTimeDisplay.textContent = nowNY();
    cnTimeDisplay.textContent = nowCN();

    statusPill.className = "status-pill live";
    statusText.textContent = "自动监控中";
    monitorDisplay.textContent = "自动运行";
    monitorDisplay.style.color = "var(--green)";

    if (!quote || quote.latestPrice === 0) {
      changeDisplay.textContent = "—";
      changeDisplay.className = "hero-percent neutral";
      priceDisplay.textContent = "最新价 —";
      prevCloseDisplay.textContent = "昨收 —";
      timeDisplay.textContent = "等待数据";
      gapDisplay.textContent = "—";
      progressFill.style.width = "0%";
      return;
    }

    const pct = quote.changePercent;
    const absPct = Math.abs(pct);
    const sign = pct >= 0 ? "+" : "";
    changeDisplay.textContent = sign + pct.toFixed(2) + "%";
    changeDisplay.className = "hero-percent " + (pct > 0 ? "up" : pct < 0 ? "down" : "neutral");
    priceDisplay.textContent = "最新价 $" + quote.latestPrice.toFixed(2);
    prevCloseDisplay.textContent = "昨收 $" + quote.previousClose.toFixed(2);
    timeDisplay.textContent = quote.displayNy || quote.updatedAt || "";

    if (quote.displayNy) {
      marketPhase.textContent = isNYMarketOpen() ? "· 交易中" : "· 休市";
    }

    const gap = Math.max(THRESHOLD - absPct, 0);
    gapDisplay.textContent = gap.toFixed(2) + "%";
    const fillPct = Math.min((absPct / THRESHOLD) * 100, 100);
    progressFill.style.width = fillPct + "%";
    progressFill.className = absPct >= THRESHOLD ? "progress-fill breach" : "progress-fill";

    if (absPct >= THRESHOLD) {
      statusPill.className = "status-pill alert";
      statusText.textContent = "越线告警!";
    }
  }

  async function poll() {
    try {
      quote = await fetchQuote();
      render();
    } catch (err) {
      console.error("poll error", err);
    }
  }

  poll();
  render();
  setInterval(render, 1000);
  setInterval(poll, 60000);
})();
