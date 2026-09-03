# FnDepot · 1Panel 跟随源

飞牛 fnOS 个人第三方应用源——由 GitHub Actions 跟随 [1Panel 官方](https://github.com/1Panel-dev/1Panel) 自动打包更新（面板本体为原生 FPK，其余为 Docker 型 FPK）。

- 源地址（添加到 FnDepot/AppCenter 第三方源）：`https://github.com/yoqie/FnDepot` 或 `https://raw.githubusercontent.com/yoqie/FnDepot/main/fnpack.json`
- 跟随：1Panel 面板本体（v1 LTS，官方 CDN）+ `apps.allowlist.txt` 名单中的应用市场应用
- 同步频率：每天一次（可手动触发），有新版本时自动打包 FPK 并发布 Release。

## 应用列表

| 应用 | 描述 | 上游版本 |
|------|------|----------|
| [1Panel](build/1panel/) | 开源服务器运维管理面板，提供可视化的 Linux 服务器管理。 | 1.10.34-lts |
| [AList](build/alist/) | 支持多存储的文件列表程序和私人网盘 | 3.64.0 |
