# 安心服药 · 中文网页 Demo

这是参考 [MedTimer](https://github.com/Futsch1/medTimer) 的药品、提醒、确认与记录流程，独立实现的中文浏览器演示。原项目为 Android 应用，采用 MIT 许可证；本项目使用原生 HTML、CSS 和 JavaScript，无需安装依赖。

在线体验：[GitHub Pages](https://ranielzhang.github.io/medtimer-zh-web-demo/)。也可以下载后直接用浏览器打开 `standalone-demo.html`。

本地运行：在项目目录执行 `python3 -m http.server 8765`，然后访问 `http://localhost:8765`。

演示包括预置的虚构药品、今日计划、手动确认或跳过、页内“稍后提醒”状态、药品管理、服药历史、JSON 导出和重置数据。数据保存在当前浏览器的 `localStorage` 中，不会发送到服务端。它不会在页面关闭后发送系统通知，也不会验证真实服药或提供医疗建议。已有用药方案应由用户核对后录入。
