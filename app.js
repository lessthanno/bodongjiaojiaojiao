(function () {
  "use strict";

  // ── State ──
  const STORAGE_KEY = "bodongjiaojiaojiao.config.v2";
  let monitoring = false;
  let pollTimer = null;
  let quote = null;
  let alertLog = [];

  // ── DOM refs ──
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
  const phoneInput = $("phoneInput");
  const thresholdInput = $("thresholdInput");
  const intervalInput = $("intervalInput");
  const redialInput = $("redialInput");
  const maxRedialInput = $("maxRedialInput");
  const startBtn = $("startBtn");
  const stopBtn = $("stopBtn");
  const testCallBtn = $("testCallBtn");
  const logContainer = $("logContainer");
  const toast = $("toast");

  // ── Config persistence ──
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (c.phone) phoneInput.value = c.phone;
      if (c.threshold) thresholdInput.value = c.threshold;
      if (c.interval) intervalInput.value = c.interval;
      if (c.redial) redialInput.value = c.redial;
      if (c.maxRedial) maxRedialInput.value = c.maxRedial;
      if (Array.isArray(c.log)) alertLog = c.log;
    } catch (_) {}
  }

  function saveConfig() {
    const c = {
      phone: phoneInput.value.trim(),
      threshold: thresholdInput.value,
      interval: intervalInput.value,
      redial: redialInput.value,
      maxRedial: maxRedialInput.value,
      log: alertLog.slice(0, 50),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  }

  // ── Toast ──
  let toastTimer = null;
  function showToast(msg, isError) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = isError ? "toast show error" : "toast show";
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 3500);
  }

  // ── Time helpers ──
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
    return mins >= 570 && mins < 960; // 9:30 - 16:00
  }

  // ── Fetch quote from static JSON (written by Actions) ──
  async function fetchQuote() {
    const resp = await fetch("./quotes/last.json?_=" + Date.now(), { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.json();
  }

  // ── Render ──
  function render() {
    const threshold = parseFloat(thresholdInput.value) || 3;
    thresholdDisplay.textContent = "±" + threshold.toFixed(2) + "%";
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

    const gap = Math.max(threshold - absPct, 0);
    gapDisplay.textContent = gap.toFixed(2) + "%";
    const fillPct = Math.min((absPct / threshold) * 100, 100);
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
    logContainer.innerHTML = alertLog
      .slice(0, 20)
      .map(function (item) {
        const tag = item.type === "call"
          ? '<span class="log-tag called">已拨号</span>'
          : '<span class="log-tag triggered">越线</span>';
        return '<div class="log-item"><div><span class="log-time">' + item.time + '</span> ' + item.msg + '</div>' + tag + '</div>';
      })
      .join("");
  }

  // ── Phone Call via Twilio (direct REST API) ──
  async function makeCall(phone, message) {
    const TWILIO_SID = localStorage.getItem("bodongjiaojiaojiao.twilio_sid") || "";
    const TWILIO_TOKEN = localStorage.getItem("bodongjiaojiaojiao.twilio_token") || "";
    const TWILIO_FROM = localStorage.getItem("bodongjiaojiaojiao.twilio_from") || "";

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      showTwilioSetup();
      throw new Error("请先配置 Twilio 凭证");
    }

    const twiml = '<Response><Say language="zh-CN">' + escapeXml(message) + '</Say><Pause length="1"/><Say language="zh-CN">' + escapeXml(message) + '</Say></Response>';
    const url = "https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Calls.json";
    const body = new URLSearchParams({
      To: phone,
      From: TWILIO_FROM,
      Twiml: twiml,
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(TWILIO_SID + ":" + TWILIO_TOKEN),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error("Twilio 错误: " + resp.status + " " + errBody.slice(0, 200));
    }

    return resp.json();
  }

  function escapeXml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showTwilioSetup() {
    const sid = prompt("输入 Twilio Account SID（以 AC 开头）\n（在 twilio.com/console 获取）", localStorage.getItem("bodongjiaojiaojiao.twilio_sid") || "");
    if (!sid) return;
    if (!sid.trim().startsWith("AC")) {
      showToast("Account SID 必须以 AC 开头，你可能填的是 Auth Token", true);
      return;
    }
    const token = prompt("输入 Twilio Auth Token", "");
    if (!token) return;
    const from = prompt("输入 Twilio 电话号码（你购买的号码，如 +12025551234）", localStorage.getItem("bodongjiaojiaojiao.twilio_from") || "");
    if (!from) return;

    localStorage.setItem("bodongjiaojiaojiao.twilio_sid", sid.trim());
    localStorage.setItem("bodongjiaojiaojiao.twilio_token", token.trim());
    localStorage.setItem("bodongjiaojiaojiao.twilio_from", from.trim());
    showToast("Twilio 配置已保存");
  }

  // ── Alert logic ──
  let lastAlertAt = 0;
  function checkAndAlert() {
    if (!monitoring || !quote || quote.latestPrice === 0) return;
    const threshold = parseFloat(thresholdInput.value) || 3;
    const absPct = Math.abs(quote.changePercent);
    if (absPct < threshold) return;

    const now = Date.now();
    const cooldown = (parseFloat(redialInput.value) || 60) * 1000;
    if (now - lastAlertAt < cooldown) return;

    const phone = phoneInput.value.trim();
    if (!phone) {
      showToast("请先填写电话号码", true);
      return;
    }

    lastAlertAt = now;
    const ts = new Date().toLocaleString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const pct = (quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(2) + "%";
    const voiceMsg = "注意，SPY 当前涨跌幅 " + pct + "，已达到你设定的 " + threshold + "% 告警阈值，请立即查看。";

    alertLog.unshift({ time: ts, msg: "SPY " + pct + " 越线", type: "triggered" });
    render();

    makeCall(phone, voiceMsg)
      .then(function () {
        alertLog.unshift({ time: ts, msg: "电话已拨出 → " + phone, type: "call" });
        showToast("电话已拨出至 " + phone);
        saveConfig();
        render();
      })
      .catch(function (err) {
        showToast("拨号失败: " + err.message, true);
      });
  }

  // ── Poll loop ──
  async function poll() {
    try {
      quote = await fetchQuote();
      render();
      checkAndAlert();
    } catch (err) {
      console.error("poll error", err);
    }
  }

  function startMonitoring() {
    const phone = phoneInput.value.trim();
    if (!phone) {
      showToast("请先填写电话号码", true);
      phoneInput.focus();
      return;
    }
    monitoring = true;
    saveConfig();
    render();
    showToast("监控已启动");
    poll();
    const sec = Math.max(parseInt(intervalInput.value) || 30, 10);
    pollTimer = setInterval(poll, sec * 1000);
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

  // ── Events ──
  startBtn.addEventListener("click", startMonitoring);
  stopBtn.addEventListener("click", stopMonitoring);

  testCallBtn.addEventListener("click", function () {
    const phone = phoneInput.value.trim();
    if (!phone) {
      showToast("请先填写电话号码", true);
      phoneInput.focus();
      return;
    }
    testCallBtn.disabled = true;
    testCallBtn.textContent = "拨号中...";
    makeCall(phone, "这是波动叫叫叫的测试电话，如果你听到了，说明电话告警功能正常工作。")
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
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        testCallBtn.disabled = false;
        testCallBtn.textContent = "测试电话";
      });
  });

  [thresholdInput, intervalInput, redialInput, maxRedialInput, phoneInput].forEach(function (el) {
    el.addEventListener("change", function () {
      saveConfig();
      render();
    });
  });

  // ── Twilio config link ──
  const configCard = $("configCard");
  const twilioLink = document.createElement("button");
  twilioLink.className = "btn btn-outline";
  twilioLink.type = "button";
  twilioLink.textContent = "配置 Twilio 凭证";
  twilioLink.style.marginTop = "10px";
  twilioLink.addEventListener("click", function () {
    showTwilioSetup();
  });
  configCard.appendChild(twilioLink);

  // ── Setup Screen ──
  const setupOverlay = $("setupOverlay");
  const mainContent = $("mainContent");
  const setupPhone = $("setupPhone");
  const setupSid = $("setupSid");
  const setupToken = $("setupToken");
  const setupFrom = $("setupFrom");
  const setupThreshold = $("setupThreshold");
  const setupInterval = $("setupInterval");
  const setupRedial = $("setupRedial");
  const setupMaxRedial = $("setupMaxRedial");
  const setupSubmit = $("setupSubmit");
  const setupSkip = $("setupSkip");

  function hasExistingConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const c = JSON.parse(raw);
      return !!(c.phone && c.phone.trim());
    } catch (_) { return false; }
  }

  function prefillSetup() {
    const sid = localStorage.getItem("bodongjiaojiaojiao.twilio_sid") || "";
    const token = localStorage.getItem("bodongjiaojiaojiao.twilio_token") || "";
    const from = localStorage.getItem("bodongjiaojiaojiao.twilio_from") || "";
    if (sid) setupSid.value = sid;
    if (token) setupToken.value = token;
    if (from) setupFrom.value = from;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.phone) setupPhone.value = c.phone;
        if (c.threshold) setupThreshold.value = c.threshold;
        if (c.interval) setupInterval.value = c.interval;
        if (c.redial) setupRedial.value = c.redial;
        if (c.maxRedial) setupMaxRedial.value = c.maxRedial;
      }
    } catch (_) {}
  }

  function showMain() {
    setupOverlay.classList.add("hidden");
    mainContent.classList.remove("hidden");
  }

  function validateSetup() {
    const phone = setupPhone.value.trim();
    const sid = setupSid.value.trim();
    const token = setupToken.value.trim();
    const from = setupFrom.value.trim();

    var sidHint = setupSid.parentElement.querySelector(".sid-hint");
    if (!sidHint) {
      sidHint = document.createElement("div");
      sidHint.className = "hint sid-hint";
      setupSid.parentElement.appendChild(sidHint);
    }

    if (sid && !sid.startsWith("AC")) {
      sidHint.textContent = "Account SID 必须以 AC 开头，请检查是否填反了";
      sidHint.style.color = "var(--red)";
      setupSubmit.disabled = true;
      return;
    } else {
      sidHint.textContent = "";
    }

    setupSubmit.disabled = !(phone.length >= 5 && sid.startsWith("AC") && token && from);
  }

  [setupPhone, setupSid, setupToken, setupFrom].forEach(function (el) {
    el.addEventListener("input", validateSetup);
  });

  setupSubmit.addEventListener("click", function () {
    const phone = setupPhone.value.trim();
    if (!phone) return;

    var sid = setupSid.value.trim();
    if (!sid.startsWith("AC")) {
      showToast("Account SID 必须以 AC 开头，请检查", true);
      setupSid.focus();
      return;
    }

    localStorage.setItem("bodongjiaojiaojiao.twilio_sid", sid);
    localStorage.setItem("bodongjiaojiaojiao.twilio_token", setupToken.value.trim());
    localStorage.setItem("bodongjiaojiaojiao.twilio_from", setupFrom.value.trim());

    phoneInput.value = phone;
    thresholdInput.value = setupThreshold.value;
    intervalInput.value = setupInterval.value;
    redialInput.value = setupRedial.value;
    maxRedialInput.value = setupMaxRedial.value;
    saveConfig();

    showMain();
    showToast("配置已保存，可以启动监控了");
  });

  setupSkip.addEventListener("click", function () {
    showMain();
  });

  // ── Boot ──
  loadConfig();
  prefillSetup();
  validateSetup();

  if (hasExistingConfig()) {
    showMain();
  }

  poll();
  render();
  setInterval(render, 1000);
  setInterval(poll, 60000);
})();
