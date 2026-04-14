# 波动叫叫叫（H5）

面向移动端的 **GitHub Pages 静态站点**。本仓库刻意区分两件事：

1. **此站能做什么（你现在能点、能看、能验证的）**
   - 部署流水线在构建前向 Yahoo Finance 拉取 SPY 快照，写入 `quotes/last.json`
   - 浏览器同源读取该 JSON，并用页面上的滑块做 **本地阈值越线提示**
   - 嵌入 TradingView 小组件作为 **第三方对照行情**

2. **此站刻意不做什么（避免误会）**
   - **不会**发起真实电话外呼（静态托管没有常驻进程，也无法安全保存 Twilio 密钥）
   - **不会**替你完成运营商/语音服务商侧的合规与可达性配置

如果你要「到线就响铃」，需要把轮询、去重、外呼与回调跑在你自己的服务器上，再把 H5 作为配置/状态入口。

## 线上地址

https://lessthanno.github.io/bodongjiaojiaojiao/

## 本地预览

用任意静态服务器打开本目录即可，例如：

```bash
python3 -m http.server 5173
```

然后访问 `http://127.0.0.1:5173/`。

若要生成与本站相同结构的 `quotes/last.json`（需要能访问 Yahoo）：

```bash
mkdir -p quotes
curl -fsSL -A "Mozilla/5.0" \
  "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1m&range=2d&includePrePost=true" \
  -o /tmp/spy-yahoo.json
python3 scripts/update_quote.py /tmp/spy-yahoo.json quotes/last.json
```

## 发布（GitHub Pages · Actions）

`.github/workflows/deploy-pages.yml` 会在以下时机运行：

- 推送到 `main`
- 手动 `workflow_dispatch`
- **每 15 分钟** `schedule`（尝试刷新快照并重新部署站点；公开仓库 Actions 不计费）

如不需要定时刷新，删除 workflow 里的 `schedule` 段即可。
