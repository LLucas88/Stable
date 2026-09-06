# 邮件自动化系统使用手册

> 定时发邮件、生日提醒、合同到期提醒、产品营销群发——全套自动化。

---

## 一、系统架构

```
┌─────────────────────────────────────────────────────┐
│                   email_automation.py               │
│                                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ SQLite   │   │ 模板引擎  │   │ SMTP发邮件    │    │
│  │ 客户数据库│   │ {name}   │   │ QQ/163/Gmail │    │
│  └────┬─────┘   └────┬─────┘   └──────┬───────┘    │
│       │              │                 │             │
│  ┌────▼──────────────▼─────────────────▼───────┐    │
│  │           APScheduler 调度引擎               │    │
│  │  • 每天8点检查关键日期                        │    │
│  │  • 每月1号发产品资讯                          │    │
│  │  • 自定义 cron/interval/date 触发器           │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 核心能力

| 能力 | 说明 | 触发方式 |
|------|------|---------|
| **生日提醒** | 提前7天自动发生日祝福邮件 | 每日8点自动检查 |
| **合同到期提醒** | 提前60/30/15/7天发续约邮件 | 每日8点自动检查 |
| **产品营销** | 群发新品/活动/促销邮件 | 手动/定时任务 |
| **节日问候** | 春节/中秋/元旦等自动问候 | 手动/定时任务 |
| **跟进邮件** | 面谈后发总结/方案 | 手动 |
| **月度报告** | 每月自动发服务报告 | 定时任务（cron） |

---

## 二、快速开始（3步）

### Step 1: 配置邮箱

```bash
cd scripts/
cp email_config.example.yaml email_config.yaml
# 编辑 email_config.yaml，填入你的SMTP信息
```

### Step 2: 初始化

```bash
python email_automation.py init
# → 自动创建数据库 + 3个演示客户 + 5个关键日期 + 2个定时任务
```

### Step 3: 测试

```bash
# 模拟发送一封生日邮件（不会真的发）
python email_automation.py send --to wangjg@chinalink.com --template birthday_wish --dry-run
```

---

## 三、所有命令详解

### 3.1 初始化

```bash
python email_automation.py init
```
→ 创建SQLite数据库 + 3个演示客户 + 预设关键日期和定时任务

### 3.2 客户管理

```bash
# 列出所有客户
python email_automation.py list-customers

# 添加新客户
python email_automation.py add-customer \
  --code C-004 \
  --name "赵小明" \
  --email "zhao@example.com" \
  --phone "138-XXXX-XXXX" \
  --company "XX公司" \
  --level A \
  --personality "支配型" \
  --birthday "1985-06-20" \
  --contract-start "2025-01-01" \
  --contract-end "2026-01-01" \
  --tags "VIP,科技" \
  --notes "看ROI"
```
→ 添加客户时自动创建生日提醒（每年重复，提前7天）和合同到期提醒（提前60天）

### 3.3 单封发送

```bash
# 用模板发送（自动填入客户信息）
python email_automation.py send --to wangjg@chinalink.com --template birthday_wish --dry-run

# 自定义邮件
python email_automation.py send --to test@test.com --subject "测试标题" --body "邮件内容" --dry-run

# 带额外变量的模板
python email_automation.py send --to wangjg@chinalink.com --template product_promotion \
  --vars '{"promo_title":"AI客服Pro","offer":"首月免费"}' --dry-run
```

### 3.4 关键日期检查

```bash
# 检查今天有没有需要触发的提醒
python email_automation.py check-dates --dry-run
```
→ 系统会扫描所有客户的关键日期，如果今天正好在提醒窗口内（比如生日还有7天），自动发邮件

### 3.5 群发营销邮件

```bash
# 群发给A级客户
python email_automation.py campaign --template product_promotion --level A --dry-run

# 群发给所有客户
python email_automation.py campaign --template festival_greeting --dry-run
```

### 3.6 启动定时调度引擎

```bash
# 前台运行（看日志，Ctrl+C停止）
python email_automation.py scheduler

# 后台守护进程模式
python email_automation.py scheduler --daemon
```
→ 启动后自动执行：
- 每天8:00 检查关键日期，自动发提醒邮件
- 每月1号10:00 给A级客户发产品资讯
- 所有数据库里自定义的定时任务

---

## 四、11个邮件模板

| 模板名 | 用途 | 变量 |
|--------|------|------|
| `birthday_wish` | 生日祝福 | `{name}` `{sender_name}` |
| `contract_renewal` | 合同续约提醒 | `{name}` `{company}` `{contract_end}` `{renewal_period}` `{offer}` `{sender_name}` |
| `product_promotion` | 产品营销 | `{name}` `{promo_title}` `{promo_features}` `{offer}` `{promo_period}` `{sender_name}` |
| `festival_greeting` | 节日问候 | `{name}` `{festival_name}` `{sender_name}` |
| `follow_up` | 面谈后跟进 | `{name}` `{summary}` `{sender_name}` |
| `monthly_report` | 月度报告 | `{name}` `{month}` `{company}` `{report_data}` `{suggestions}` `{sender_name}` |
| `renewal_success` | 续约成功通知 | `{name}` `{company}` `{amount}` `{period}` `{sender_name}` |

| `new_feature` | 新功能上线通知 | `{name}` `{product_name}` `{feature_desc}` `{sender_name}` |

| `customer_case` | 客户案例分享 | `{name}` `{case_company}` `{case_result}` `{sender_name}` |

| `annual_thanks` | 年度感谢信 | `{name}` `{year}` `{highlights}` `{sender_name}` |

| `refund_notice` | 退款通知 | `{name}` `{company}` `{amount}` `{reason}` `{sender_name}` |


### 自定义模板

在 `email_automation.py` 的 `EMAIL_TEMPLATES` 字典中添加：

```python
"my_new_template": {
    "subject": "标题 {name}",
    "body": "正文 {name}，内容..."
}
```

---

## 五、数据库表结构

### customers（客户表）
```
id | code(C-001) | name | email | phone | company | level(A/B/C/D)
personality | birthday | contract_start | contract_end | tags | notes
```

### key_dates（关键日期表）
```
id | customer_id | date_type(birthday/contract_end/custom)
date_value(MM-DD或YYYY-MM-DD) | recurring(0/1) | reminder_days
action_type(email/wechat/phone) | action_template(模板名) | note
```

### email_logs（发送记录）
```
id | customer_id | to_email | subject | body | template_name
status(sent/failed/dry_run) | error_message | sent_at
```

### scheduled_jobs（定时任务表）
```
id | job_name | trigger_type(cron/interval/date)
trigger_config(JSON) | action(check_dates/send_campaign) | enabled
```

---

## 六、与Hermes cronjob联动

可以把邮件调度引擎作为系统后台服务运行：

### 方案1：Windows定时任务

```powershell
# 每天早上8点自动检查关键日期
schtasks /create /tn "SalesEmailDaily" /tr "python C:\...\email_automation.py check-dates" /sc daily /st 08:00

# 每月1号发产品资讯
schtasks /create /tn "SalesEmailMonthly" /tr "python C:\...\email_automation.py campaign --template product_promotion --level A" /sc monthly /d 1 /st 10:00
```

### 方案2：调度引擎常驻

```bash
# 启动调度引擎（自动管理所有定时任务）
python email_automation.py scheduler --daemon
```

### 方案3：Hermes cronjob

在Hermes中设置定时任务：
- 每天8点 → 执行 `python scripts/email_automation.py check-dates`
- 每月1号 → 执行 `python scripts/email_automation.py campaign --template product_promotion --level A`

---

## 七、每日工作记录（work_logs）

> 销售每天干了什么、见了谁、推进了什么——全部记录在案。

### 7.1 添加工作记录

```bash
python email_automation.py add-log \
  --category meeting \
  --customer-code C-001 \
  --customer-name "王建国" \
  --action "电话沟通续约方案" \
  --result "客户要求降到110k" \
  --duration 30 \
  --next-step "明天发修改方案" \
  --priority high \
  --time "10:00-10:30"
```

### 7.2 查看工作记录

```bash
# 今日记录
python email_automation.py list-logs

# 最近7天
python email_automation.py list-logs --days 7
```

### 7.3 生成工作报告

```bash
# 日报（预览）
python email_automation.py work-report --period daily

# 周报（预览）
python email_automation.py work-report --period weekly

# 日报直接发邮件
python email_automation.py work-report --period daily --send
```

### 7.4 10种工作类别

| 类别名 | 中文 | 说明 |
|--------|------|------|
| meeting | 会面/电话 | 面谈、电话沟通 |
| follow_up | 客户跟进 | 微信/邮件跟进 |
| proposal | 方案/报价 | 制作方案、发送报价 |
| negotiation | 谈判/逼单 | 价格谈判、推进签约 |
| lead_gen | 线索开发 | 找新客户、初筛 |
| collection | 回款/催收 | 催进度款/尾款 |
| delivery | 交付/实施 | 项目实施、Onboarding |
| admin | 行政/内勤 | CRM更新、写报告 |
| training | 学习/培训 | 产品学习、技能提升 |
| other | 其他 | 不属于以上类别 |

---

## 八、常见问题

### Q: 怎么配置QQ邮箱？
A: `smtp.qq.com:587`，密码填**授权码**（不是QQ密码），在QQ邮箱设置→账户→POP3/SMTP服务中获取。

### Q: QQ邮箱发送报"Connection unexpectedly closed"？
A: **QQ SMTP短时间内发>10封会限流**。每封间隔≥60秒。如果已被限流，等待10-15分钟后恢复。

### Q: 后台进程(terminal background=true)报"can't open file"路径错误？
A: **Hermes后台进程在WSL bash中执行，不是PowerShell**。Windows路径会被转换为`/mnt/c/...`格式。涉及Windows路径的Python脚本必须用前台(terminal)运行，不能用background=true。

### Q: PowerShell执行python -c时triple-quote报错？
A: PowerShell会解析Python字符串中的引号。解决方案：把Python代码写到.py文件再执行，不要用python -c。

A: `smtp.qq.com:587`，密码填**授权码**（不是QQ密码），在QQ邮箱设置→账户→POP3/SMTP服务中获取。

### Q: 怎么配163邮箱？
A: `smtp.163.com:587`，同样需要授权码。

### Q: 怎么配Gmail？
A: `smtp.gmail.com:587`，需要App Password（账户→安全→两步验证→App Passwords）。

### Q: 怎么配腾讯企业邮？
A: `smtp.exmail.qq.com:465`，SSL加密，`tls: false`，端口465。

### Q: dry-run模式会真的发邮件吗？
A: 不会。dry-run只是打印邮件内容到屏幕，不连接SMTP服务器。

### Q: 怎么查看发送记录？
A: 用SQLite查看 `email_logs` 表：
```bash
python -c "import sqlite3; c=sqlite3.connect('email_automation.db'); [print(r) for r in c.execute('SELECT sent_at, to_email, subject, status FROM email_logs ORDER BY id DESC LIMIT 10').fetchall()]"
```

### Q: 怎么添加自定义关键日期？
A: 直接写数据库：
```python
import sqlite3
conn = sqlite3.connect('email_automation.db')
conn.execute("INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note) VALUES (1, 'custom', '06-18', 1, 3, 'email', 'festival_greeting', '公司周年庆')")
conn.commit()
```

### Q: 怎么给模板增加HTML格式邮件？
A: 在 `send_email` 函数中设置 `html=True`，模板body用HTML格式。

### Q: 怎么修改公司/销售人员信息？
A: 编辑 `email_config.yaml` 的 `company` 和 `agent` 配置块。所有邮件签名自动使用这些信息。模板中 `{sender_name}`=`agent.name`、`{company_name}`=`company.name`，由 `inject_profile_context()` 自动注入。

### Q: 邮件签名格式？
A: `build_signature()` 自动生成：姓名→职位→公司→电话|邮箱→网站。修改格式编辑此函数。

---

## 九、⚠️ 已知坑与解决方案

### 坑1：QQ SMTP 短时间批量发送被限流

```
现象：连续发约10封后报 "Connection unexpectedly closed"
原因：QQ邮箱SMTP频率限制（~10-15封/批，50封/小时）
解决：
  · 每封间隔 sleep(60~90)秒
  · 批量分批跑，每批 ≤ 8封
  · 被限流后等10-15分钟自动恢复
  · 大批量用 send_campaign 内置间隔
```

### 坑2：Hermes后台进程跑在WSL bash非PowerShell

```
现象：terminal(background=true) 的 Set-Location/$env: 全失效
原因：后台进程默认用 bash 执行
解决：
  · 脚本用 os.path/__file__ 自定位（不依赖PS变量）
  · 后台用完整路径：python "C:\...\script.py"
  · 超600秒的任务：拆分多次前台调用
```

### 坑3：PowerShell内嵌 python -c 引号冲突

```
现象：JSON/花括号被PowerShell吃掉
解决：复杂逻辑写独立.py文件，不用 python -c
```

### 坑4：string.Template 不支持 {name} 格式

```
现象：模板 {name} 没被替换
原因：string.Template 用 $name 不用 {name}
解决（已修复）：render_template() 改用 str.replace
```
