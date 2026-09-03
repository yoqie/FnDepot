# FnDepot · 1Panel 跟随源

飞牛 fnOS 个人第三方应用源——由 GitHub Actions 跟随 [1Panel 官方](https://github.com/1Panel-dev/1Panel)、官方 Node.js 与 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 自动打包更新。

- 源地址（添加到 FnDepot/AppCenter 第三方源）：`https://github.com/yoqie/FnDepot` 或 `https://raw.githubusercontent.com/yoqie/FnDepot/main/fnpack.json`
- 跟随：1Panel 面板 v2 + Node.js v24 + DeepSeek Harness 官方源 + `apps.allowlist.txt` 名单中的应用市场应用
- 同步频率：每天一次（可手动触发），有新版本时自动打包 FPK 并发布 Release。

## 应用列表

| 应用 | 描述 | 上游版本 |
|------|------|----------|
| [1Panel](build/1panel/) | 开源服务器运维管理面板，提供可视化的 Linux 服务器管理。 | 2.2.5 |
| [Node.js v24](build/nodejs_v24/) | Node.js® v24 LTS 运行时，作为 DeepSeek Harness 等应用的运行时依赖。 | 24.20.0 |
| [DeepSeek Harness](build/deepseek_harness/) | DeepSeek Harness 官方原生版：内置完整 DSH 运行时与 Agent 能力，端口 3080。 | 0.1.1-rc.2 |
