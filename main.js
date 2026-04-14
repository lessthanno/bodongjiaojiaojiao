const THRESHOLD_STORAGE_KEY = "bodongjiaojiaojiao.thresholdPercent.v1";

function formatSignedPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function readSavedThreshold() {
  const raw = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
  if (raw === null) {
    return 3;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 3;
}

function writeSavedThreshold(value) {
  window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(value));
}

function setQuoteError(message) {
  const el = document.getElementById("quote-error");
  if (!el) {
    return;
  }
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

async function fetchQuoteSnapshot() {
  const url = `./quotes/last.json?ts=${encodeURIComponent(String(Date.now()))}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`读取 quotes/last.json 失败：HTTP ${String(response.status)}`);
  }
  return await response.json();
}

function renderQuote(snapshot, thresholdPercent) {
  const badge = document.getElementById("status-badge");
  const chip = document.getElementById("status-chip");
  const priceValue = document.getElementById("price-value");
  const priceAbsolute = document.getElementById("price-absolute");
  const prevCloseLine = document.getElementById("prev-close-line");
  const thresholdGap = document.getElementById("threshold-gap");
  const lastSync = document.getElementById("last-sync");
  const nyTime = document.getElementById("ny-time");
  const cnTime = document.getElementById("cn-time");
  const tzRow = document.getElementById("tz-row");

  if (!badge || !chip || !priceValue || !thresholdGap || !lastSync) {
    return;
  }

  const isPlaceholder =
    snapshot.source === "placeholder" || snapshot.latestPrice === 0 || snapshot.previousClose === 0;

  if (isPlaceholder) {
    chip.textContent = "占位快照";
    badge.textContent = "等待刷新";
    badge.style.background = "rgba(255, 196, 86, 0.14)";
    badge.style.color = "#ffc456";
    priceValue.textContent = "—";
    if (priceAbsolute) {
      priceAbsolute.textContent = "最新价 —";
    }
    if (prevCloseLine) {
      prevCloseLine.textContent = "昨收 —";
    }
    thresholdGap.textContent = "相对阈值：—（部署流水线成功写入 Yahoo 快照后才会显示）";
    lastSync.textContent = `快照写入时间：${snapshot.updatedAt}`;
    if (tzRow) {
      tzRow.hidden = true;
    }
    setQuoteError(
      "当前 quotes/last.json 仍是占位内容：请确认 GitHub Actions「Deploy GitHub Pages」已成功运行；成功后这里会显示 Yahoo 源的快照与越线判断。"
    );
    return;
  }

  setQuoteError("");

  const changePercent = Number(snapshot.changePercent);
  const absChange = Math.abs(changePercent);
  const distance = Math.max(thresholdPercent - absChange, 0);

  priceValue.textContent = formatSignedPercent(changePercent);
  if (priceAbsolute) {
    priceAbsolute.textContent = `最新价 ${String(snapshot.latestPrice)}`;
  }
  if (prevCloseLine) {
    prevCloseLine.textContent = `昨收 ${String(snapshot.previousClose)}`;
  }
  thresholdGap.textContent = `距离阈值还剩 ${distance.toFixed(2)}%（按 ±${thresholdPercent.toFixed(1)}% 计算）`;
  lastSync.textContent = `快照写入时间：${snapshot.updatedAt} ｜ 源：${snapshot.source}`;

  if (snapshot.displayNy && snapshot.displayCn && nyTime && cnTime && tzRow) {
    nyTime.textContent = `纽约参考：${snapshot.displayNy}`;
    cnTime.textContent = `北京参考：${snapshot.displayCn}`;
    tzRow.hidden = false;
  } else if (tzRow) {
    tzRow.hidden = true;
  }

  if (absChange >= thresholdPercent) {
    chip.textContent = "越线（仅提示）";
    badge.textContent = "已达阈值（不拨号）";
    badge.style.background = "rgba(255, 117, 117, 0.16)";
    badge.style.color = "#ff8e8e";
    return;
  }

  chip.textContent = "未越线";
  badge.textContent = "快照可读";
  badge.style.background = "rgba(43, 213, 118, 0.12)";
  badge.style.color = "#2bd576";
}

async function refresh() {
  const slider = document.getElementById("threshold-slider");
  const thresholdPercent = slider ? Number(slider.value) : readSavedThreshold();
  try {
    const snapshot = await fetchQuoteSnapshot();
    renderQuote(snapshot, Number.isFinite(thresholdPercent) ? thresholdPercent : readSavedThreshold());
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    setQuoteError(message);
  }
}

function wireThresholdControls() {
  const slider = document.getElementById("threshold-slider");
  const output = document.getElementById("threshold-output");
  if (!(slider instanceof HTMLInputElement) || !(output instanceof HTMLOutputElement)) {
    return;
  }

  const initial = readSavedThreshold();
  slider.value = String(initial);
  output.textContent = `${initial.toFixed(1)}%`;

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    output.textContent = `${value.toFixed(1)}%`;
    writeSavedThreshold(value);
    void refresh();
  });
}

function wireRefreshButton() {
  const button = document.getElementById("refresh-button");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.addEventListener("click", () => {
    void refresh();
  });
}

function boot() {
  wireThresholdControls();
  wireRefreshButton();
  void refresh();
  window.setInterval(() => {
    void refresh();
  }, 30000);
}

boot();
