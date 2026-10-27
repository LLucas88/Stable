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

云端整包和最终发布验证待本次执行完成后补充。
