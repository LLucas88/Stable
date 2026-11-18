# Stable Cloud OpenAI 出口恢复

Windows 杭州网关的增量部署工具。此目录不包含节点地址、订阅或凭据。

结构：网关 → 本地路由器（10819）→ 主出口（10818）或备用出口（10828）→ OpenAI。所有监听仅绑定 127.0.0.1，隧道仅允许 api.openai.com:443；路由器不解密 TLS，不读取图片提示词或 API Key。

健康检查每轮结束后等 20 秒，使用全新代理连接访问无鉴权 `/v1/models`，严格验证 OpenAI TLS，预期 401。单轮超时 8 秒；连续 2 次失败隔离，恢复需 3 次成功；超过 55 秒没有成功结果也不再选用。新连接保持在健康线路，恢复后不频繁切回。已有连接不会因健康切换而被重放。新建隧道失败时，只有在尚未向客户端确认建立隧道、尚未转发任何应用字节之前才允许另选线路。

`GET /health` 仅本机可访问。管理员通过受权限保护的 `/api/admin/egress` 查看脱敏状态，总览页面每 20 秒刷新。状态变更保存在服务器 events.jsonl（2 MiB 滚动）；不发送站外消息。

生图在原请求结果查询之后、新预占之前检查出口状态。无健康线路时返回 `openai_egress_unavailable`，不创建请求或账本项。已保存结果仍可查询；在途/未知结果继续保持原有保护。客户端只有在**首次明确收到“尚未提交”**时允许之后用同一个请求标识恢复；不会把已有未知请求转为未提交。

## 本地验证

```powershell
node --test tools/cloud-egress/router.test.cjs
node tools/cloud-egress/verify-gateway.cjs
node --test tests/openai-responses.test.cjs tests/image-generation.test.cjs
node tools/cloud-openai/verify-integration.cjs
```

前者使用本机 TCP 假代理验证真实连接切换和不重放；后者使用实际网关路由、鉴权及 SQLite，加模拟供应商响应。没有付费生图。

`apply.cjs <gateway-source>` 为已有 image-recovery 网关增量安装源代码，先核对锚点、备份原文件。不是一键线上发布脚本。`install.ps1 -BackupCount 1` 在服务器存在经过验证的候选报告时安装一条备用与路由器的开机任务；没有可用备用或已有任务时拒绝安装。只有两条备用都通过持续验收时才使用 `-BackupCount 2`。`drill.cjs` 使用独立回环端口模拟故障，不停止生产服务；检查间隔加速，因此不能把演练耗时当成生产故障发现时延。

2026-11-05 已在杭州上线 `20261105-egress-ha`，原主出口加一条备用。新增六个候选中只有一条通过连续服务检查；另一条单次探测成功后持续断连，排除上线。不能把单次 HTTP 401 当成持续可用保证。部署和验收记录位于 `.local/egress-ha-20261105`。

局限：备用候选来自已有配置，不代表供应商、运营商或机房完全独立；同源故障仍可能同时影响多个出口。主服务器、API 供应商、账号余额或模型权限的故障也不能靠换出口修复。进程失败重启约 1 分钟；路由器自身也需要开机/失败重启保障。未知结果不得自动再付费生成。

实现参考：[Node HTTP CONNECT](https://nodejs.org/api/http.html#event-connect)、[Node Socket 超时](https://nodejs.org/api/net.html#socketsettimeouttimeout-callback)。

## 受控加密参数同步（2026-11-10）

`encryption-sync.cjs` 和配套 PowerShell 仅维护现有 primary、backup 两条 VLESS/TCP/REALITY 出口。`policy.json` 固定原订阅地址、订阅客户端、完整节点 URI（除 encryption 和显示名称）及完整本机配置（除 encryption）的 SHA256；身份、端口、凭据或其他参数变化一律停止更新，不挑选新节点。原订阅仅以 HTTPS 获取，拒绝跳转，20 秒超时、6 MiB 上限。配置与备份仅留在 SYSTEM/管理员可访问的服务器目录。

维护任务 `Stable-Cloud-Egress-Parameter-Sync` 每 10 分钟及开机运行，不重叠，8 分钟执行上限。变化先在隔离回环端口运行，严格 TLS、无鉴权 `/v1/models` 连续 3 次得到 401 后，再逐条应用。**健康或正在恢复的出口暂缓替换**，避免打断用户连接；已失效且不在使用的出口才会在三次空闲检查后修改。这样即使供应商提前发布参数，现有健康线路也保持工作，待其不再可用时再安全修复。

更新前保存原文件和事务日志，以原子替换写入，线上还需连续三轮成功；失败恢复原配置，同一候选延后 1 小时再检查。进程中断后的未完成事务会在下一轮先复核恢复；如发现其他维护者修改过文件，停止自动覆盖。`state.json`、`events.jsonl`、`last-error.json` 和各次 `journal.json` 仅记录脱敏状态，配置备份不导出。取消维护可停用上述任务，现有网关仍照常运行。

此任务不读取模型 API Key，不调用生图接口，不改账户、额度或账单，不自动重试用户请求。它只能恢复**相同节点的加密参数变化**，不承诺修复供应商停服、换地址、换凭据等问题。检查/应用失败必须保留在报告中，不能将“任务已注册”视为双线可用。

回归检查：`node --test tools/cloud-egress/encryption-sync.test.cjs`。部署时先在受保护目录放入同步源文件，执行 `encryption-sync.cjs init` 固定已核实身份，再运行 `encryption-sync-install.ps1`；已有策略或任务会拒绝覆盖。
