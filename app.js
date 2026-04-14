(function () {
  "use strict";

  var API_BASE = "https://154.17.29.16";

  var STORAGE_KEY = "bodongjiaojiaojiao.config.v3";
  var monitoring = false;
  var pollTimer = null;
  var quote = null;
  var alertLog = [];

  var $ = function (id) { return document.getElementById(id); };
  var statusPill = $("statusPill");
  var statusText = $("statusText");
  var changeDisplay = $("changeDisplay");
  var priceDisplay = $("priceDisplay");
  var prevCloseDisplay = $("prevCloseDisplay");
  var timeDisplay = $("timeDisplay");
  var marketPhase = $("marketPhase");
  var gapDisplay = $("gapDisplay");
  var progressFill = $("progressFill");
  var thresholdDisplay = $("thresholdDisplay");
  var monitorDisplay = $("monitorDisplay");
  var nyTimeDisplay = $("nyTimeDisplay");
  var cnTimeDisplay = $("cnTimeDisplay");
  var phoneInput = $("phoneInput");
  var thresholdInput = $("thresholdInput");
  var startBtn = $("startBtn");
  var stopBtn = $("stopBtn");
  var testCallBtn = $("testCallBtn");
  var logContainer = $("logContainer");
  var toast = $("toast");

  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var c = JSON.parse(raw);
      if (c.phone) phoneInput.value = c.phone;
      if (c.threshold) thresholdInput.value = c.threshold;
      if (Array.isArray(c.log)) alertLog = c.log;
    } catch (_) {}
  }

  function saveConfig() {
    var c = {
      phone: phoneInput.value.trim(),
      threshold: thresholdInput.value,
      log: alertLog.slice(0, 50),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  }

  var toastTimer = null;
  function showToast(msg, isError) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = isError ? "toast show error" : "toast show";
    toastTimer = setTimeout(function () { toast.className = "toast"; }, 3500);
  }

  function nowNY() {
    return new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  }
  function nowCN() {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function isNYMarketOpen() {
    var ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    var day = ny.getDay();
    if (day === 0 || day === 6) return false;
    var h = ny.getHours(), m = ny.getMinutes();
    var mins = h * 60 + m;
    return mins >= 570 && mins < 960;
  }

  function fetchQuote() {
    return fetch("./quotes/last.json?_=" + Date.now(), { cache: "no-store" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      });
  }

  function makeCall(phone, message) {
    return fetch(API_BASE + "/api/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone, message: message }),
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.error || "Call failed");
        return data;
      });
    });
  }

  function render() {
    var threshold = parseFloat(thresholdInput.value) || 3;
    thresholdDisplay.textContent = "\u00b1" + threshold.toFixed(2) + "%";
    nyTimeDisplay.textContent = nowNY();
    cnTimeDisplay.textContent = nowCN();

    if (monitoring) {
      statusPill.className = "status-pill live";
      statusText.textContent = "监控中";
      monitorDisplay.textContent = "运行中";
      monitorDisplay.style.color = "var(--green)";
      startBtn.style.display = "none";
      stopBtn.style.display = "";
    } else {
      statusPill.className = "status-pill";
      statusText.textContent = "未启动";
      monitorDisplay.textContent = "未启动";
      monitorDisplay.style.color = "";
      startBtn.style.display = "";
      stopBtn.style.display = "none";
    }

    if (!quote || quote.latestPrice === 0) {
      changeDisplay.textContent = "\u2014";
      changeDisplay.className = "hero-percent neutral";
      priceDisplay.textContent = "最新价 \u2014";
      prevCloseDisplay.textContent = "昨收 \u2014";
      timeDisplay.textContent = "等待数据";
      gapDisplay.textContent = "\u2014";
      progressFill.style.width = "0%";
      renderLog();
      return;
    }

    var pct = quote.changePercent;
    var absPct = Math.abs(pct);
    var sign = pct >= 0 ? "+" : "";
    changeDisplay.textContent = sign + pct.toFixed(2) + "%";
    changeDisplay.className = "hero-percent " + (pct > 0 ? "up" : pct < 0 ? "down" : "neutral");
    priceDisplay.textContent = "最新价 $" + quote.latestPrice.toFixed(2);
    prevCloseDisplay.textContent = "昨收 $" + quote.previousClose.toFixed(2);
    timeDisplay.textContent = quote.displayNy || quote.updatedAt || "";

    if (quote.displayNy) {
      marketPhase.textContent = isNYMarketOpen() ? "\u00b7 交易中" : "\u00b7 休市";
    }

    var gap = Math.max(threshold - absPct, 0);
    gapDisplay.textContent = gap.toFixed(2) + "%";
    var fillPct = Math.min((absPct / threshold) * 100, 100);
    progressFill.style.width = fillPct + "%";
    progressFill.className = absPct >= threshold ? "progress-fill breach" : "progress-fill";

    if (absPct >= threshold && monitoring) {
      statusPill.className = "status-pill alert";
      statusText.textContent = "越线告警!";
    }

    renderLog();
  }

  function renderLog() {
    if (!alertLog.length) {
      logContainer.innerHTML = '<div class="log-empty">暂无告警记录</div>';
      return;
    }
    logContainer.innerHTML = alertLog.slice(0, 20).map(function (item) {
      var tag = item.type === "call"
        ? '<span class="log-tag called">已拨号</span>'
        : '<span class="log-tag triggered">越线</span>';
      return '<div class="log-item"><div><span class="log-time">' + item.time + '</span> ' + item.msg + '</div>' + tag + '</div>';
    }).join("");
  }

  var lastAlertAt = 0;
  function checkAndAlert() {
    if (!monitoring || !quote || quote.latestPrice === 0) return;
    var threshold = parseFloat(thresholdInput.value) || 3;
    var absPct = Math.abs(quote.changePercent);
    if (absPct < threshold) return;

    var now = Date.now();
    if (now - lastAlertAt < 60000) return;

    var phone = phoneInput.value.trim();
    if (!phone) { showToast("请先填写电话号码", true); return; }

    lastAlertAt = now;
    var ts = new Date().toLocaleString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var pctStr = (quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(2) + "%";

    alertLog.unshift({ time: ts, msg: "SPY " + pctStr + " 越线", type: "triggered" });
    render();

    makeCall(phone, "注意，SPY 当前涨跌幅 " + pctStr + "，已达到你设定的 " + threshold + "% 告警阈值，请立即查看。")
      .then(function () {
        alertLog.unshift({ time: ts, msg: "电话已拨出 \u2192 " + phone, type: "call" });
        showToast("电话已拨出至 " + phone);
        saveConfig();
        render();
      })
      .catch(function (err) {
        showToast("拨号失败: " + err.message, true);
      });
  }

  function poll() {
    fetchQuote()
      .then(function (data) { quote = data; render(); checkAndAlert(); })
      .catch(function (err) { console.error("poll error", err); });
  }

  function startMonitoring() {
    var phone = phoneInput.value.trim();
    if (!phone) { showToast("请先填写电话号码", true); phoneInput.focus(); return; }
    monitoring = true;
    saveConfig();
    render();
    showToast("监控已启动");
    poll();
    var sec = Math.max(parseInt(thresholdInput.value) || 30, 10);
    pollTimer = setInterval(poll, 30000);
  }

  function stopMonitoring() {
    monitoring = false;
    clearInterval(pollTimer);
    pollTimer = null;
    lastAlertAt = 0;
    saveConfig();
    render();
    showToast("监控已停止");
  }

  startBtn.addEventListener("click", startMonitoring);
  stopBtn.addEventListener("click", stopMonitoring);

  var trustHint = $("trustHint");

  testCallBtn.addEventListener("click", function () {
    var phone = phoneInput.value.trim();
    if (!phone) { showToast("请先填写电话号码", true); phoneInput.focus(); return; }
    testCallBtn.disabled = true;
    testCallBtn.textContent = "拨号中...";
    if (trustHint) trustHint.style.display = "none";
    makeCall(phone, "这是波动叫叫叫的测试电话，如果你听到了，说明电话告警功能正常工作。")
      .then(function () {
        showToast("测试电话已拨出");
        alertLog.unshift({
          time: new Date().toLocaleString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          msg: "测试电话 \u2192 " + phone,
          type: "call"
        });
        saveConfig();
        render();
      })
      .catch(function (err) {
        showToast("请求失败，请先信任 API 证书", true);
        if (trustHint) trustHint.style.display = "block";
      })
      .finally(function () { testCallBtn.disabled = false; testCallBtn.textContent = "测试电话"; });
  });

  [thresholdInput, phoneInput].forEach(function (el) {
    el.addEventListener("change", function () { saveConfig(); render(); });
  });

  loadConfig();
  poll();
  render();
  setInterval(render, 1000);
  setInterval(poll, 60000);
})();
