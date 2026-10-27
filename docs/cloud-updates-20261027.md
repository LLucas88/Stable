# Stable 云端更新迁移（2026-10-27）

## 当前设计

下载地址为 `https://116.62.83.85/updates/`，复用杭州 Stable Cloud 的可信 HTTPS。GitHub Actions 继续构建和验证；发布成功后，独立的 `Publish verified release to Stable Cloud` 工作流把已经通过验证的 Release 文件通过 HTTPS 直传到云服务器。GitHub 保留过渡包，兼容尚未迁移的旧客户端。

最小过渡版为 **v1.0.05**（内部 semver `1.0.5`），基于已发布 `v1.0.03`，不包含开发树 v1.11.0 的功能改动。v1.0.04 因旧测试仍要求 GitHub 更新源而未发布，失败标签保留。旧用户通过原更新入口下载、确认安装过渡版后，后续检查、整包和 blockmap 下载自动改用云端。保留旧版下载/安装确认交互；完全无法访问 GitHub 的旧客户端仍需手动安装一次。

## 服务器和发布凭据

- `C:\stable-cloud\updates\public`：唯一公开文件目录；Caddy 静态服务支持 HEAD/Range，清单为 `Cache-Control: no-store`。
- `C:\stable-cloud\updates\incoming`：非公开暂存区。上传先写 `.partial`，校验大小和 SHA-256 后进入暂存文件。
- `Stable-Cloud-Update-Publish`：Local Service 身份、开机启动、失败重启，仅监听 `127.0.0.1:18881`；Caddy 转发 `/updates/_publish/*`。
- GitHub Secret `STABLE_UPDATE_PUBLISH_TOKEN`：专用随机发布令牌，不提供服务器管理权限。服务器副本在 `updates\publish-token`，ACL 仅允许管理员、SYSTEM 和 Local Service，目录不公开；不得提交令牌。
- 提交清单前逐个校验 SHA-256、大小及更新包 SHA-512；全部完成后同卷重命名切换 `latest.yml`。失败保留旧清单，拒绝降级以及替换已有不同内容的安装文件。同一发布可安全重试。
- `publish-state.json` 保存最后发布版本和时间。没有改变网关数据库、账号、计费或用户数据。

## 自动流程

`publish-cloud.yml` 位于默认分支，监听 `Release Stable` 成功完成事件（仅 tag push）、人工发布 Release 以及显式手动触发。使用 workflow_run 是因为 GITHUB_TOKEN 创建 Release 不保证触发另一个 release 工作流。独立发布工作流只下载已有 Release，不重新构建。发布任务串行执行。

后续版本保持 package.json 的 generic 更新源，按现有流程增加版本号和说明并推送标签。构建工作流先创建 draft、上传检查全部资产后再公开；不覆盖已发布资产。云端上传流程成功且公网 latest.yml 已更新，才表示完整发布完成。若上传失败，修复原因后重新运行 Publish verified release to Stable Cloud，输入已有标签即可，不必重建客户端。

最初尝试服务器每五分钟拉取 GitHub，但实测仅约 27 KB/s，因此改为 GitHub 主动上传。旧 `Stable-Cloud-Updates` 拉取任务已停用，不能与发布接收器同时启用。1 MiB 的本机到云端直传测试约 0.85 秒，未授权请求返回 401；这不是 GitHub 整包吞吐的保证。

## 回退

原始 Caddy 备份：`updates\Caddyfile.before`；接收器部署前配置：`updates\Caddyfile.before-receiver`。停用接收器任务并恢复后一份配置可关闭写入通道，同时保留已迁移客户端的静态下载服务。恢复最初配置会移除整个更新服务，应避免在已有迁移客户端时这样做。回退前后执行 Caddy validate/reload 和 `/api/health` 检查。

## 验证

本地更新、发布契约、接收器认证、损坏文件拒绝、清单保留、重复提交、不可变安装文件保护和 GenericProvider 地址解析共 13 项通过。完整客户端 CI 和安装升级/回滚结果以 GitHub 实际结果为准。

- 未发布构建 v1.0.04： https://github.com/LLucas88/Stable/actions/runs/40468124037
- 过渡版 v1.0.05： https://github.com/LLucas88/Stable/actions/runs/40469378613

## 最终发布结果

2026-10-27 16:38（北京时间）云端正式清单已切换到 1.0.5。自动上传工作流 [40472874120](https://github.com/LLucas88/Stable/actions/runs/40472874120) 成功，三个安装相关文件上传后均校验通过。

客户端 CI：499 项通过、3 项跳过、0 失败；真实隔离安装升级到 1.0.5，成功终态为 100|complete|success|0。可见和静默故障注入均回滚到 0.9.31，退出码 12，测试用户数据保留、运行时可用，未自动重启应用。证据保存于本机 .local/cloud-update-deploy/installer-evidence/。

服务器对正式文件独立重算 SHA-256，全部与 GitHub 资产摘要一致：

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| latest.yml | 353 | 3c3722584189888b929755c3f1784ab018ff38f126c7d467fe58db1de8d8a3f3 |
| Stable-Update-1.0.05-x64.exe | 424552298 | 3f59174eb46971f2e0085113a2c1be159db1d96e444c561372c40cd5d4e16ef5 |
| Stable-Update-1.0.05-x64.exe.blockmap | 443702 | 7f18807c0853bbed6d23b7159aedb4149abf7c7f771c9fd2ccdee3a6359f7694 |
| Stable-Setup-1.0.05-x64.exe | 593079235 | 54a601380023fade0c7d271d1c4512913c74c150f0c39135fa2e19e8a0a0aeca |

公网验收：latest.yml 返回 200 且 no-store，与 GitHub 清单一致；真实 GenericProvider 读取版本 1.0.5 并解析到云端更新包 URL；三个文件 HEAD 的长度正确，Range 返回 206 和正确 Content-Range；blockmap 完整下载 SHA-256 一致。原网关 /api/health 返回 200 / status=ok。

GitHub 官方 API 的 latest 指向公开非预发布 v1.0.05。旧 GitHubProvider 的解析和版本比较测试通过，但本机对 github.com 的实际 feed 请求出现连接超时，未声称本机旧客户端的实时网络链路已完整通过。旧客户端仍必须能访问 GitHub 完成首次过渡；无法访问时，使用云端完整安装包手动升级一次，之后走云端。这不会绕过安装确认，也不代表已替用户在本机安装。

下载地址： https://116.62.83.85/updates/Stable-Setup-1.0.05-x64.exe 。本次没有发布本机未提交的 v1.11.0 功能，已安装的更高版本不会降级到 1.0.5。

