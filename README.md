# 安心服药 · 中文网页 Demo

这是参考 [MedTimer](https://github.com/Futsch1/medTimer) 的药品、提醒、确认与记录流程，独立实现的中文浏览器演示。原项目为 Android 应用，采用 MIT 许可证；本项目使用原生 HTML、CSS 和 JavaScript，无需安装依赖。

在线体验：[GitHub Pages](https://ranielzhang.github.io/medtimer-zh-web-demo/)。也可以下载后直接用浏览器打开 `standalone-demo.html`。

本地运行：在项目目录执行 `python3 -m http.server 8765`，然后访问 `http://localhost:8765`。

演示围绕「药品 → 提醒规则 → 当日事件 → 处理结果」运行：一种药品可有多条提醒，每条规则独立设置时间、单次用量、执行星期和启停状态。日期视图按规则生成计划；到点或手动模拟触发后，事件进入待处理状态。可确认服用、跳过或延后 10 分钟；延后保留同一事件，到时重新进入待处理。确认服用扣减库存，跳过不扣减；从记录进入事件改判时会修正库存。还能手动修正库存、筛选事件、导出 JSON 和重置虚构示例。

实现逻辑参考原项目的 [提醒生命周期说明](https://github.com/Futsch1/medTimer/blob/main/docs/reminder_flow.md) 和 [使用场景](https://github.com/Futsch1/medTimer/blob/main/docs/UseCases.md)。[设计与实现边界](docs/product-model.md) 记录了 Web Demo 与 Android 原项目的对应关系。

数据保存在当前浏览器的 `localStorage` 中，不会发送到服务端。页面打开时及打开期间会计算到点事件；关闭页面后**不会发送系统通知或在后台调度**。此项目不验证真实服药，不提供医疗建议；应按已有用药方案自行核对录入。
