(function () {
  "use strict";

  var NASDAQ_TOP_50 = [
    "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","AVGO",
    "TSLA","COST","NFLX","AMD","ADBE","QCOM","PEP","TMUS",
    "LIN","CSCO","INTU","AMAT","ISRG","TXN","AMGN","CMCSA",
    "MU","BKNG","LRCX","HON","KLAC","ADI","PANW","ADP",
    "SBUX","MDLZ","GILD","REGN","MELI","SNPS","CDNS","VRTX",
    "PYPL","CRWD","CTAS","MAR","MRVL","ORLY","CEG","ABNB",
    "DASH","FTNT"
  ];

  var STORAGE_KEY = "nasdaq50alert.config.v1";
  var TWILIO_SID_KEY = "bodongjiaojiaojiao.twilio_sid";
  var TWILIO_TOKEN_KEY = "bodongjiaojiaojiao.twilio_token";
  var TWILIO_FROM_KEY = "bodongjiaojiaojiao.twilio_from";

  var monitoring = false;
  var pollTimer = null;
  var stocks = [];
  var alertLog = [];
  var lastAlertAt = 0;
  var lastAlertedSymbols = [];

  var $ = function (id) { return document.getElementById(id); };

  var statusPill = $("statusPill");
  var statusText = $("statusText");
  var alertCount = $("alertCount");
  var heroThreshold = $("heroThreshold");
  var totalDisplay = $("totalDisplay");
  var warnDisplay = $("warnDisplay");
  var updateTime = $("updateTime");
  var thresholdDisplay = $("thresholdDisplay");
  var monitorDisplay = $("monitorDisplay");
  var maxDdDisplay = $("maxDdDisplay");
  var stockGrid = $("stockGrid");
  var phoneInput = $("phoneInput");
  var thresholdInput = $("thresholdInput");
  var intervalInput = $("intervalInput");
  var startBtn = $("startBtn");
  var stopBtn = $("stopBtn");
  var testCallBtn = $("testCallBtn");
  var refreshBtn = $("refreshBtn");
  var logContainer = $("logContainer");
  var toast = $("toast");

  // ── Config persistence ──
  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var c = JSON.parse(raw);
      if (c.phone) phoneInput.value = c.phone;
      if (c.threshold) thresholdInput.value = c.threshold;
      if (c.interval) intervalInput.value = c.interval;
      if (Array.isArray(c.log)) alertLog = c.log;
    } catch (_) {}
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      phone: phoneInput.value.trim(),
      threshold: thresholdInput.value,
      interval: intervalInput.value,
      log: alertLog.slice(0, 50)
    }));
  }

  // ── Toast ──
  var toastTimer = null;
  function showToast(msg, isError) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = isError ? "toast show error" : "toast show";
    toastTimer = setTimeout(function () { toast.className = "toast"; }, 3500);
  }

  // ── Data fetching ──
  // Primary: static JSON from GitHub Actions; Fallback: Yahoo v8 chart via CORS proxy
  async function fetchQuotes() {
    // Try static file first (written by GitHub Actions every 15 min)
    try {
      var staticResp = await fetch("./quotes/nasdaq50.json?_=" + Date.now(), { cache: "no-store" });
      if (staticResp.ok) {
        var staticData = await staticResp.json();
        if (Array.isArray(staticData) && staticData.length > 0) return staticData;
      }
    } catch (_) {}

    // Fallback: fetch each symbol via Yahoo v8 chart API through CORS proxy
    var proxies = [
      function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
      function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); }
    ];

    for (var p = 0; p < proxies.length; p++) {
      try {
        var results = await fetchViaProxy(proxies[p]);
        if (results.length > 0) return results;
      } catch (_) { continue; }
    }

    throw new Error("所有数据源均失败，请稍后重试");
  }

  async function fetchViaProxy(proxyFn) {
    var batchSize = 10;
    var all = [];
    for (var i = 0; i < NASDAQ_TOP_50.length; i += batchSize) {
      var batch = NASDAQ_TOP_50.slice(i, i + batchSize);
      var promises = batch.map(function (sym) {
        var yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" + sym + "?interval=1d&range=5d";
        return fetch(proxyFn(yahooUrl), { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data) return null;
            var meta = data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
            if (!meta) return null;
            return {
              symbol: meta.symbol || sym,
              name: meta.shortName || meta.longName || sym,
              price: meta.regularMarketPrice || 0,
              high52w: meta.fiftyTwoWeekHigh || 0,
              low52w: meta.fiftyTwoWeekLow || 0,
              dayChange: 0
            };
          })
          .catch(function () { return null; });
      });
      var batchResults = await Promise.all(promises);
      batchResults.forEach(function (r) { if (r) all.push(r); });
    }
    return all;
  }

  // ── Drawdown calculation ──
  function calcDrawdown(stock) {
    if (!stock.high52w || stock.high52w <= 0 || !stock.price) return 0;
    return ((stock.high52w - stock.price) / stock.high52w) * 100;
  }

  function getLevel(dd) {
    if (dd >= 30) return "danger";
    if (dd >= 20) return "warn";
    if (dd >= 10) return "watch";
    return "safe";
  }

  // ── Render ──
  function render() {
    var threshold = parseFloat(thresholdInput.value) || 30;
    thresholdDisplay.textContent = threshold + "%";
    heroThreshold.textContent = threshold;

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

    if (!stocks.length) {
      alertCount.textContent = "—";
      alertCount.className = "hero-count safe";
      maxDdDisplay.textContent = "—";
      return;
    }

    var sorted = stocks.slice().sort(function (a, b) {
      return calcDrawdown(b) - calcDrawdown(a);
    });

    var alertStocks = sorted.filter(function (s) { return calcDrawdown(s) >= threshold; });
    var warnStocks = sorted.filter(function (s) {
      var dd = calcDrawdown(s);
      return dd >= threshold - 10 && dd < threshold;
    });

    alertCount.textContent = alertStocks.length + " 只";
    alertCount.className = alertStocks.length > 0 ? "hero-count danger" : "hero-count safe";
    totalDisplay.textContent = "共 " + stocks.length + " 只";
    warnDisplay.textContent = "预警区 " + warnStocks.length + " 只";

    if (alertStocks.length > 0 && monitoring) {
      statusPill.className = "status-pill alert";
      statusText.textContent = "回撤告警!";
    }

    var maxDd = calcDrawdown(sorted[0]);
    maxDdDisplay.textContent = maxDd.toFixed(1) + "%";
    maxDdDisplay.style.color = "var(--" + (getLevel(maxDd) === "safe" ? "green" : getLevel(maxDd) === "watch" ? "yellow" : getLevel(maxDd) === "warn" ? "orange" : "red") + ")";

    var html = "";
    for (var i = 0; i < sorted.length; i++) {
      var s = sorted[i];
      var dd = calcDrawdown(s);
      var lv = getLevel(dd);
      var rowClass = lv === "danger" ? "stock-row alert-row" : lv === "warn" ? "stock-row warn-row" : "stock-row";
      var barWidth = Math.min((dd / Math.max(threshold * 1.5, 50)) * 100, 100);

      html += '<div class="' + rowClass + '">' +
        '<div class="stock-symbol">' + s.symbol + '</div>' +
        '<div class="stock-bar-wrap"><div class="stock-bar lv-' + lv + '" style="width:' + barWidth + '%"></div></div>' +
        '<div class="stock-price">$' + (s.price ? s.price.toFixed(2) : "—") + '</div>' +
        '<div class="stock-dd lv-' + lv + '">-' + dd.toFixed(1) + '%</div>' +
        '</div>';
    }
    stockGrid.innerHTML = html;
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

  // ── Twilio call ──
  function escapeXml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function makeCall(phone, message) {
    var sid = localStorage.getItem(TWILIO_SID_KEY) || "";
    var token = localStorage.getItem(TWILIO_TOKEN_KEY) || "";
    var from = localStorage.getItem(TWILIO_FROM_KEY) || "";

    if (!sid || !token || !from) {
      throw new Error("请先在设置页面配置 Twilio 凭证");
    }

    var twiml = '<Response><Say language="zh-CN">' + escapeXml(message) + '</Say><Pause length="1"/><Say language="zh-CN">' + escapeXml(message) + '</Say></Response>';
    var url = "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Calls.json";
    var body = new URLSearchParams({ To: phone, From: from, Twiml: twiml });

    var resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(sid + ":" + token),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    });

    if (!resp.ok) {
      var errBody = await resp.text();
      throw new Error("Twilio " + resp.status + ": " + errBody.slice(0, 200));
    }
    return resp.json();
  }

  // ── Alert logic ──
  function checkAndAlert() {
    if (!monitoring || !stocks.length) return;
    var threshold = parseFloat(thresholdInput.value) || 30;
    var triggered = stocks.filter(function (s) { return calcDrawdown(s) >= threshold; });
    if (!triggered.length) return;

    var now = Date.now();
    var cooldown = 30 * 60 * 1000; // 30 min cooldown between calls
    if (now - lastAlertAt < cooldown) return;

    var newSymbols = triggered.map(function (s) { return s.symbol; }).sort().join(",");
    if (newSymbols === lastAlertedSymbols.join(",") && now - lastAlertAt < cooldown) return;

    var phone = phoneInput.value.trim();
    if (!phone) {
      showToast("请先填写电话号码", true);
      return;
    }

    lastAlertAt = now;
    lastAlertedSymbols = triggered.map(function (s) { return s.symbol; }).sort();

    var ts = new Date().toLocaleString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var top3 = triggered.slice(0, 3).map(function (s) {
      return s.symbol + " 回撤 " + calcDrawdown(s).toFixed(1) + "%";
    });
    var voiceMsg = "注意，纳斯达克有 " + triggered.length + " 只股票从52周高点回撤超过 " + threshold + "%。" +
      "最严重的是：" + top3.join("，") + "。请立即查看。";

    alertLog.unshift({ time: ts, msg: triggered.length + " 只越线: " + triggered.slice(0, 5).map(function (s) { return s.symbol; }).join(", "), type: "triggered" });
    saveConfig();
    render();

    // Browser notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("纳斯达克跌幅告警", {
        body: triggered.length + " 只股票回撤超 " + threshold + "%",
        icon: "./favicon.svg"
      });
    }

    makeCall(phone, voiceMsg)
      .then(function () {
        alertLog.unshift({ time: ts, msg: "电话已拨出 → " + phone, type: "call" });
        showToast("告警电话已拨出");
        saveConfig();
        render();
      })
      .catch(function (err) {
        showToast("拨号失败: " + err.message, true);
      });
  }

  // ── Poll ──
  async function poll() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "拉取中…";
    try {
      stocks = await fetchQuotes();
      updateTime.textContent = "更新于 " + new Date().toLocaleTimeString("zh-CN", { hour12: false });
      render();
      checkAndAlert();
      showToast("数据已更新，共 " + stocks.length + " 只");
    } catch (err) {
      console.error("fetch error:", err);
      showToast("数据拉取失败: " + err.message, true);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "刷新行情数据";
    }
  }

  function startMonitoring() {
    var phone = phoneInput.value.trim();
    if (!phone) {
      showToast("请先填写电话号码", true);
      phoneInput.focus();
      return;
    }
    monitoring = true;
    lastAlertAt = 0;
    lastAlertedSymbols = [];
    saveConfig();
    render();
    showToast("监控已启动");
    poll();
    var sec = Math.max(parseInt(intervalInput.value) || 300, 60);
    pollTimer = setInterval(poll, sec * 1000);
  }

  function stopMonitoring() {
    monitoring = false;
    clearInterval(pollTimer);
    pollTimer = null;
    saveConfig();
    render();
    showToast("监控已停止");
  }

  // ── Events ──
  startBtn.addEventListener("click", startMonitoring);
  stopBtn.addEventListener("click", stopMonitoring);
  refreshBtn.addEventListener("click", poll);

  testCallBtn.addEventListener("click", function () {
    var phone = phoneInput.value.trim();
    if (!phone) {
      showToast("请先填写电话号码", true);
      phoneInput.focus();
      return;
    }
    testCallBtn.disabled = true;
    testCallBtn.textContent = "拨号中…";
    makeCall(phone, "这是纳斯达克跌幅监控的测试电话，如果你听到了，说明电话告警功能正常工作。")
      .then(function () {
        showToast("测试电话已拨出");
        alertLog.unshift({
          time: new Date().toLocaleString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          msg: "测试电话 → " + phone,
          type: "call"
        });
        saveConfig();
        render();
      })
      .catch(function (err) { showToast(err.message, true); })
      .finally(function () {
        testCallBtn.disabled = false;
        testCallBtn.textContent = "测试电话";
      });
  });

  [thresholdInput, intervalInput, phoneInput].forEach(function (el) {
    el.addEventListener("change", function () { saveConfig(); render(); });
  });

  // ── Twilio config button ──
  var twilioLink = document.createElement("button");
  twilioLink.className = "btn btn-outline";
  twilioLink.type = "button";
  twilioLink.textContent = "配置 Twilio 凭证";
  twilioLink.style.marginTop = "10px";
  twilioLink.addEventListener("click", showTwilioSetup);
  $("configCard").appendChild(twilioLink);

  function showTwilioSetup() {
    var sid = prompt("Twilio Account SID (AC...)", localStorage.getItem(TWILIO_SID_KEY) || "");
    if (!sid) return;
    var token = prompt("Twilio Auth Token", "");
    if (!token) return;
    var from = prompt("Twilio 号码 (如 +12025551234)", localStorage.getItem(TWILIO_FROM_KEY) || "");
    if (!from) return;
    localStorage.setItem(TWILIO_SID_KEY, sid.trim());
    localStorage.setItem(TWILIO_TOKEN_KEY, token.trim());
    localStorage.setItem(TWILIO_FROM_KEY, from.trim());
    showToast("Twilio 配置已保存");
  }

  // ── Request notification permission ──
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // ── Setup Screen ──
  var setupOverlay = $("setupOverlay");
  var mainContent = $("mainContent");
  var setupPhone = $("setupPhone");
  var setupSid = $("setupSid");
  var setupToken = $("setupToken");
  var setupFrom = $("setupFrom");
  var setupThreshold = $("setupThreshold");
  var setupInterval = $("setupInterval");
  var setupSubmit = $("setupSubmit");
  var setupSkip = $("setupSkip");

  function hasConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      return !!(JSON.parse(raw).phone);
    } catch (_) { return false; }
  }

  function showMain() {
    setupOverlay.classList.add("hidden");
    mainContent.classList.remove("hidden");
  }

  // Pre-fill setup from existing Twilio config (shared with SPY app)
  var existingSid = localStorage.getItem(TWILIO_SID_KEY);
  var existingFrom = localStorage.getItem(TWILIO_FROM_KEY);
  if (existingSid) setupSid.value = existingSid;
  if (existingFrom) setupFrom.value = existingFrom;

  setupSubmit.addEventListener("click", function () {
    var phone = setupPhone.value.trim();
    if (!phone) { showToast("请填写电话号码", true); return; }

    phoneInput.value = phone;
    thresholdInput.value = setupThreshold.value;
    intervalInput.value = setupInterval.value;

    if (setupSid.value.trim()) localStorage.setItem(TWILIO_SID_KEY, setupSid.value.trim());
    if (setupToken.value.trim()) localStorage.setItem(TWILIO_TOKEN_KEY, setupToken.value.trim());
    if (setupFrom.value.trim()) localStorage.setItem(TWILIO_FROM_KEY, setupFrom.value.trim());

    saveConfig();
    showMain();
    showToast("配置已保存");
    poll();
  });

  setupSkip.addEventListener("click", function () {
    showMain();
    poll();
  });

  // ── Boot ──
  loadConfig();
  if (hasConfig()) {
    showMain();
    poll();
  }
  render();
})();
