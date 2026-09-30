# DSH（DeepSeek Harness 飞牛版）

- 上游与打包: https://github.com/cliii-one/DSH_FNOS
- 构建方式: GitHub Actions（amd64 + arm64 原生双架构），发布于上游仓库 Release
- 本源仅做索引同步，不二次分发 fpk
- 服务端口: 3082（与官方 deepseek-harness 应用的 3080 互不冲突，可并存）
- 依赖: 飞牛应用中心 nodejs_v24 运行时（缺失时自动安装）
- 数据目录: /vol2/@appshare/dsh

安装后桌面出现 DSH 卡片，点击或访问 http://NAS地址:3082 使用。
