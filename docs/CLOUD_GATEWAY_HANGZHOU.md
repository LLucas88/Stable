# Stable Cloud 杭州公网入口

- 网关：`https://116.62.83.85`
- 管理后台：`https://116.62.83.85/login`
- 连接无需 SSH 通道；使用原 Cloud 账号密码。证书验证必须保持开启。
- 当前默认 URL 已更新，仍可通过 STABLE_CLOUD_URL 覆盖；STABLE_CLOUD_ENABLED=1 启用云端模式。

## 已安装客户端

完全退出旧客户端后，在 PowerShell 运行（填写真实安装路径）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-cloud.ps1 -StableExe 'D:\应用\Stable\Stable.exe'
```

脚本只设置启动进程的环境变量，不复制账号或私钥。已有客户端必须支持 Stable Cloud；旧版本的登录界面可能仍是全屏。本次没有制作安装包。

## 验证范围

2026-10-21：公网可信 TLS、账号登录、管理后台 Secure/HttpOnly/SameSite Cookie、跨站来源拒绝、一次 64-token 上限 DeepSeek 流式请求及服务重启通过；未验证其他实体设备和长时间并发任务。
