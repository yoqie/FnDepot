# FnDepot · 1Panel 跟随源

飞牛 fnOS 个人第三方应用源——由 GitHub Actions 跟随 [1Panel 官方源](https://github.com/1Panel-dev/appstore) 自动打包更新（Docker 型 FPK）。

- 源地址（添加到 FnDepot/AppCenter 第三方源）：`https://github.com/yoqie/FnDepot` 或 `https://raw.githubusercontent.com/yoqie/FnDepot/main/fnpack.json`
- 跟随名单：`apps.allowlist.txt`（每行一个 1Panel 应用 key，只跟同 key 最新版本）
- 同步频率：每天一次（可手动触发），有新版本时自动打包架构无关的 Docker 型 FPK 并发布 Release。

## 应用列表

| 应用 | 描述 | 上游版本 |
|------|------|----------|
| [AList](build/alist/) | 支持多存储的文件列表程序和私人网盘 | 3.64.0 |
