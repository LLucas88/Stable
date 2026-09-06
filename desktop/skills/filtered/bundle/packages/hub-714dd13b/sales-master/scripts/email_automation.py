#!/usr/bin/env python3
"""
销售邮件自动化系统
====================
功能：
  1. 客户数据库管理（SQLite）
  2. 邮件模板系统（支持变量插值）
  3. 定时/触发式邮件发送（SMTP）
  4. 客户重要日期提醒（生日/合同到期/续约）
  5. 产品营销邮件群发（个性化）
  6. 调度引擎（APScheduler，支持 cron/interval/date）

用法：
  python email_automation.py init              # 初始化数据库+演示数据
  python email_automation.py add-customer      # 添加客户
  python email_automation.py list-customers    # 列出所有客户
  python email_automation.py send --to EMAIL --template NAME [--dry-run]
  python email_automation.py send --to EMAIL --subject "标题" --body "内容" [--dry-run]
  python email_automation.py check-dates       # 检查今日待提醒日期
  python email_automation.py campaign --template NAME [--dry-run]
  python email_automation.py scheduler         # 启动定时调度引擎（前台）
  python email_automation.py scheduler --daemon # 启动定时调度引擎（后台守护进程）

配置文件：email_config.yaml（从 email_config.example.yaml 复制后修改）
"""

import os
import sys
import json
import sqlite3
import smtplib
import logging
import textwrap
from datetime import datetime, date, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, formatdate
from string import Template

# ============================================================
# 配置加载
# ============================================================

DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "email_config.yaml")

FALLBACK_CONFIG = {
    'smtp': {'host': 'smtp.qq.com', 'port': 587, 'tls': True,
             'email': 'noreply@example.com', 'password': '', 'name': '销售团队'},
    'scheduler': {'daily_check_time': '08:00', 'timezone': 'Asia/Shanghai'}
}

def load_config(config_path=None, allow_fallback=False):
    """加载YAML配置文件。allow_fallback=True时找不到文件返回默认配置"""
    path = config_path or DEFAULT_CONFIG_PATH
    if not os.path.exists(path):
        if allow_fallback:
            return FALLBACK_CONFIG
        print(f"⚠️ 配置文件不存在: {path}")
        print(f"   请复制 email_config.example.yaml 为 email_config.yaml 并修改配置")
        sys.exit(1)

    try:
        import yaml
    except ImportError:
        print("⚠️ 需要安装 PyYAML: pip install pyyaml")
        sys.exit(1)

    with open(path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    return config


# ============================================================
# 数据库管理
# ============================================================

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "email_automation.db")

def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """初始化数据库表结构"""
    conn = get_db()
    c = conn.cursor()

    # 客户表
    c.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,          -- 客户编号 C-001
            name TEXT NOT NULL,                 -- 姓名
            email TEXT,                         -- 邮箱
            phone TEXT,                         -- 电话
            company TEXT,                       -- 公司
            level TEXT DEFAULT 'C',             -- 级别 A/B/C/D
            personality TEXT,                   -- 性格类型
            birthday TEXT,                      -- 生日 YYYY-MM-DD
            contract_start TEXT,                -- 合同开始日
            contract_end TEXT,                  -- 合同到期日
            tags TEXT,                          -- 标签（JSON数组）
            notes TEXT,                         -- 备注
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # 重要日期表
    c.execute("""
        CREATE TABLE IF NOT EXISTS key_dates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            date_type TEXT NOT NULL,            -- birthday/contract_end/contract_start/custom
            date_value TEXT NOT NULL,           -- YYYY-MM-DD 或 MM-DD（每年重复）
            recurring INTEGER DEFAULT 0,        -- 0=一次性, 1=每年重复
            reminder_days INTEGER DEFAULT 7,    -- 提前几天提醒
            action_type TEXT,                   -- email/wechat/phone/none
            action_template TEXT,               -- 用哪个邮件模板
            note TEXT,                          -- 备注
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
    """)

    # 邮件发送记录
    c.execute("""
        CREATE TABLE IF NOT EXISTS email_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            to_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT,
            template_name TEXT,
            status TEXT DEFAULT 'pending',      -- pending/sent/failed
            sent_at TEXT,
            error_message TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        )
    """)

    # 定时任务表
    c.execute("""
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_name TEXT NOT NULL,             -- 任务名称
            trigger_type TEXT NOT NULL,         -- cron/interval/date
            trigger_config TEXT NOT NULL,       -- JSON: cron表达式/间隔秒数/运行日期
            action TEXT NOT NULL,               -- check_dates/send_campaign/send_template
            action_params TEXT,                 -- JSON参数
            enabled INTEGER DEFAULT 1,
            last_run TEXT,
            next_run TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)

    conn.commit()
    conn.close()
    print("✅ 数据库初始化完成")
    print(f"   路径: {DB_PATH}")


# ============================================================
# 客户管理
# ============================================================

def add_customer(data):
    """添加客户"""
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO customers (code, name, email, phone, company, level, personality,
                               birthday, contract_start, contract_end, tags, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get('code'), data.get('name'), data.get('email'), data.get('phone'),
        data.get('company'), data.get('level', 'C'), data.get('personality'),
        data.get('birthday'), data.get('contract_start'), data.get('contract_end'),
        json.dumps(data.get('tags', []), ensure_ascii=False),
        data.get('notes', '')
    ))
    customer_id = c.lastrowid

    # 自动添加关键日期
    if data.get('birthday'):
        c.execute("""INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note)
                     VALUES (?, 'birthday', ?, 1, 7, 'email', 'birthday_wish', '生日提醒')""",
                  (customer_id, data['birthday'][5:]))  # 只存 MM-DD
    if data.get('contract_end'):
        c.execute("""INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note)
                     VALUES (?, 'contract_end', ?, 0, 60, 'email', 'contract_renewal', '合同到期续约')""",
                  (customer_id, data['contract_end']))

    conn.commit()
    conn.close()
    print(f"✅ 客户添加成功: {data.get('name')} (ID: {customer_id})")
    return customer_id


def list_customers():
    """列出所有客户"""
    conn = get_db()
    rows = conn.execute("SELECT * FROM customers ORDER BY level, name").fetchall()
    conn.close()

    if not rows:
        print("📭 暂无客户数据。运行 'python email_automation.py init' 初始化演示数据。")
        return

    print(f"{'编号':<8} {'姓名':<8} {'公司':<16} {'级别':<4} {'邮箱':<28} {'生日':<8}")
    print("-" * 80)
    for r in rows:
        tags = json.loads(r['tags']) if r['tags'] else []
        print(f"{r['code']:<8} {r['name']:<8} {(r['company'] or ''):<16} {r['level']:<4} {(r['email'] or ''):<28} {(r['birthday'] or '')[:10]:<8}")


def get_customer_by_email(email):
    """通过邮箱获取客户"""
    conn = get_db()
    row = conn.execute("SELECT * FROM customers WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ============================================================
# 邮件模板系统
# ============================================================

EMAIL_TEMPLATES = {
    "birthday_wish": {
        "subject": "🎂 {name}，生日快乐！",
        "body": """\
亲爱的{name}，

生日快乐！🎂🎉

感谢您一直以来的信任与支持。
新的一岁，祝您身体健康，事业更上一层楼！

如有任何需要，随时联系我们。

此致，
{sender_name}团队
"""
    },
    "contract_renewal": {
        "subject": "【重要】{company} 合同续约提醒",
        "body": """\
{name} 您好，

您当前的合同将于 {contract_end} 到期。

为了不影响您的正常使用，我们已为您准备了续约方案：
- 续约周期：{renewal_period}
- 专属老客户优惠：{offer}

如有任何疑问，请随时联系我们。

此致，
{sender_name}团队
"""
    },
    "product_promotion": {
        "subject": "🎉 {sender_name} 新品发布 | {promo_title}",
        "body": """\
{name} 您好，

我们最新推出了：{promo_title}

✨ 核心亮点：
{promo_features}

🎁 老客户专享优惠：{offer}
⏰ 活动时间：{promo_period}

如有兴趣，随时联系我们。

此致，
{sender_name}团队
"""
    },
    "festival_greeting": {
        "subject": "{festival_name}快乐！{sender_name}祝您阖家幸福 🎊",
        "body": """\
亲爱的{name}，

{festival_name}快乐！🎊

感谢您一直以来的支持。
祝您和家人阖家幸福，万事如意！

此致，
{sender_name}团队
"""
    },
    "follow_up": {
        "subject": "{name}，关于上次沟通的方案",
        "body": """\
{name} 您好，

上次沟通后，我整理了一份更详细的方案，附上供您参考。

核心要点：
{summary}

有任何问题随时联系我。

此致，
{sender_name}
"""
    },
    "monthly_report": {
        "subject": "📊 {month}月度服务报告 - {company}",
        "body": """\
{name} 您好，

{month}月度服务报告如下：

📈 本月数据：
{report_data}

💡 优化建议：
{suggestions}

下个月我们会继续努力，为您提供更好的服务。

此致，
{sender_name}团队
"""
    },
    "renewal_success": {
        "subject": "[续约成功] {company} 已续约 {amount}/年",
        "body": """[续约成功通知]

客户：{company}（{name}）
合同金额：{amount}/年
合同期限：{period}
签约时间：{date}

下一步：
  - 发送合同电子版给客户盖章
  - 开具发票
  - 安排实施排期
  - 设置下一次续约提醒（到期前60天）
"""
    },
    "product_launch": {
        "subject": "[新功能] {product_name} 已上线",
        "body": """亲爱的客户，

我们的{product_name}已经上线了！

新增功能：
{features}

对您的好处：
{benefits}

如何使用：
登录后点击"{menu_path}"即可体验

有问题随时联系我们！

{sender_name}
"""
    },
    "case_study": {
        "subject": "[客户案例] {case_company} 的{case_result}",
        "body": """{name} 您好，

分享一个跟您行业相关的案例：

{case_company}的故事：
  之前：{before_state}
  之后：{after_state}
  效果：{case_result}
  周期：{case_timeline}

如果您也想实现类似效果，
我可以帮您做个定制方案。

{sender_name}
"""
    },
    "year_end_thanks": {
        "subject": "[年度感谢] {sender_name}祝您新年快乐！",
        "body": """亲爱的{name}，

感谢您这一年的信任与支持。

回顾{year}年我们一起做的事：
{year_highlights}

新的一年，祝您：
  事业蒸蒸日上
  身体健健康康
  家人平平安安

{sender_name}
"""
    },
    "refund_handling": {
        "subject": "[退款通知] {company} 退款已受理",
        "body": """{name} 您好，

已收到您的退款申请。

退款信息：
  订单号：{order_id}
  退款金额：{refund_amount}
  退款原因：{refund_reason}
  预计到账：{refund_date}（3-5个工作日）

我们非常遗憾您选择离开，为了改进我们的服务，
希望您能告诉我们具体哪里不满意。

如果未来您需要，欢迎随时回来。

{sender_name}
"""
    }
}


def render_template(template_name, context):
    """渲染邮件模板（支持 {name} 格式变量）"""
    if template_name not in EMAIL_TEMPLATES:
        print(f"⚠️ 模板不存在: {template_name}")
        print(f"   可用模板: {', '.join(EMAIL_TEMPLATES.keys())}")
        return None, None

    tpl = EMAIL_TEMPLATES[template_name]
    subject = tpl['subject']
    body = tpl['body']
    for key, val in context.items():
        subject = subject.replace('{' + key + '}', str(val))
        body = body.replace('{' + key + '}', str(val))
    return subject, body


# ============================================================
# 邮件发送
# ============================================================

def get_agent_profile(config=None):
    """从配置中提取销售人员信息"""
    if config is None:
        config = load_config(allow_fallback=True)
    agent = config.get('agent', {})
    company = config.get('company', {})
    smtp = config.get('smtp', {})
    return {
        'agent_name': agent.get('name', smtp.get('name', '')),
        'agent_title': agent.get('title', ''),
        'agent_phone': agent.get('phone', ''),
        'agent_email': agent.get('email', smtp.get('email', '')),
        'company_name': agent.get('company', company.get('name', '')),
        'company_short': company.get('short_name', ''),
        'company_website': agent.get('website', company.get('website', '')),
    }


def build_signature(config=None):
    """构建标准邮件签名"""
    p = get_agent_profile(config)
    lines = []
    lines.append("")
    lines.append("--")
    lines.append("")
    lines.append(p['agent_name'])
    if p['agent_title']:
        lines.append(f"{p['agent_title']}")
    if p['company_name']:
        lines.append(f"{p['company_name']}")
    contact_parts = []
    if p['agent_phone']:
        contact_parts.append(f"tel: {p['agent_phone']}")
    if p['agent_email']:
        contact_parts.append(f"email: {p['agent_email']}")
    if contact_parts:
        lines.append(" | ".join(contact_parts))
    if p['company_website']:
        lines.append(f"web: {p['company_website']}")
    return "\n".join(lines)


def inject_profile_context(context, config=None):
    """将agent信息注入模板上下文变量"""
    p = get_agent_profile(config)
    context.setdefault('sender_name', p['agent_name'])
    context.setdefault('sender_title', p['agent_title'])
    context.setdefault('company_name', p['company_name'])
    context.setdefault('company_short', p['company_short'])
    context.setdefault('company_website', p['company_website'])
    context.setdefault('agent_phone', p['agent_phone'])
    context.setdefault('agent_email', p['agent_email'])
    return context


def send_email(to_email, subject, body, config=None, dry_run=False, customer_id=None, template_name=None, html=False, add_signature=True):
    """发送邮件"""
    if config is None:
        config = load_config(allow_fallback=True)

    smtp_cfg = config.get('smtp', {})
    sender_email = smtp_cfg.get('email', 'noreply@example.com')
    sender_name = smtp_cfg.get('name', 'Sales Team')

    # auto-append signature
    if add_signature and '{sender_name}' not in body:
        body = body.rstrip() + build_signature(config)

    msg = MIMEMultipart('alternative') if html else MIMEText(body, 'plain', 'utf-8')
    if html:
        msg.attach(MIMEText(body, 'html', 'utf-8'))

    msg['From'] = formataddr((sender_name, sender_email))
    msg['To'] = to_email
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)

    if dry_run:
        print("=" * 60)
        print(f"🔍 DRY-RUN 模式（不实际发送）")
        print(f"   发件人: {sender_name} <{sender_email}>")
        print(f"   收件人: {to_email}")
        print(f"   主题: {subject}")
        print(f"   正文:")
        print("   " + "\n   ".join(body.split('\n')))
        print("=" * 60)
        _log_email(customer_id, to_email, subject, body, template_name, 'dry_run')
        return True

    try:
        host = smtp_cfg.get('host', 'smtp.gmail.com')
        port = smtp_cfg.get('port', 587)
        use_tls = smtp_cfg.get('tls', True)
        password = smtp_cfg.get('password', '')

        server = smtplib.SMTP(host, port)
        if use_tls:
            server.starttls()
        if password:
            server.login(sender_email, password)

        server.sendmail(sender_email, [to_email], msg.as_string())
        server.quit()

        print(f"✅ 邮件发送成功 → {to_email}")
        _log_email(customer_id, to_email, subject, body, template_name, 'sent')
        return True

    except Exception as e:
        print(f"❌ 邮件发送失败 → {to_email}: {e}")
        _log_email(customer_id, to_email, subject, body, template_name, 'failed', str(e))
        return False


def _log_email(customer_id, to_email, subject, body, template_name, status, error=None):
    """记录邮件发送日志"""
    conn = get_db()
    conn.execute("""
        INSERT INTO email_logs (customer_id, to_email, subject, body, template_name, status, error_message, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    """, (customer_id, to_email, subject, body, template_name, status, error))
    conn.commit()
    conn.close()


# ============================================================
# 关键日期检查 & 自动触发
# ============================================================

def check_key_dates(dry_run=False, config=None):
    """检查今日需要提醒的关键日期，自动触发邮件"""
    if config is None:
        config = load_config(allow_fallback=True)
    sender_name = config.get('smtp', {}).get('name', 'Sales Team')

    today = date.today()
    today_md = today.strftime('%m-%d')  # MM-DD 格式

    conn = get_db()
    # 查所有需要今天触发的日期
    rows = conn.execute("""
        SELECT kd.*, c.name, c.email, c.company, c.code, c.level
        FROM key_dates kd
        JOIN customers c ON kd.customer_id = c.id
        WHERE kd.action_type = 'email'
          AND c.email IS NOT NULL
    """).fetchall()

    triggered = []
    for row in rows:
        row = dict(row)
        date_val = row['date_value']
        reminder_days = row['reminder_days'] or 7

        # 处理每年重复日期（MM-DD格式）
        if row['recurring'] == 1 and len(date_val) == 5:
            try:
                target_date = date(today.year, int(date_val[:2]), int(date_val[3:5]))
            except ValueError:
                continue
            # 如果已过，看明年
            if target_date < today:
                try:
                    target_date = date(today.year + 1, int(date_val[:2]), int(date_val[3:5]))
                except ValueError:
                    continue
        else:
            # 一次性日期 YYYY-MM-DD
            try:
                target_date = date.fromisoformat(date_val)
            except ValueError:
                continue

        # 检查是否在提醒窗口内
        days_until = (target_date - today).days
        if days_until == reminder_days or (days_until <= reminder_days and days_until >= 0 and row['recurring'] == 1 and days_until == reminder_days):
            # 触发
            context = inject_profile_context({
                'name': row['name'],
                'company': row['company'] or '',
                'contract_end': date_val,
            }, config)

            # 合同续约额外信息
            if row['date_type'] == 'contract_end':
                context['renewal_period'] = '1年'
                context['offer'] = '续约9折优惠'

            tpl_name = row.get('action_template') or 'birthday_wish'
            subject, body = render_template(tpl_name, context)
            if subject:
                print(f"\n🔔 [{row['date_type']}] {row['name']} - 还有{days_until}天 ({target_date})")
                send_email(row['email'], subject, body, config, dry_run, row['customer_id'], tpl_name)
                triggered.append(row['name'])

    conn.close()

    if not triggered:
        print("✅ 今日无需触发任何日期提醒")
    else:
        print(f"\n📊 共触发 {len(triggered)} 封提醒邮件")

    return triggered


# ============================================================
# 营销邮件群发
# ============================================================

def send_campaign(template_name, target_level=None, dry_run=False, config=None, extra_context=None):
    """群发营销邮件"""
    if config is None:
        config = load_config(allow_fallback=True)
    sender_name = config.get('smtp', {}).get('name', 'Sales Team')

    conn = get_db()
    if target_level:
        rows = conn.execute("SELECT * FROM customers WHERE level = ? AND email IS NOT NULL", (target_level,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM customers WHERE email IS NOT NULL").fetchall()
    conn.close()

    if not rows:
        print("📭 没有符合条件的客户")
        return

    print(f"📧 准备群发 '{template_name}' 给 {len(rows)} 位客户 ({target_level or '全部'})\n")

    sent_count = 0
    for row in rows:
        row = dict(row)
        context = inject_profile_context({
            'name': row['name'],
            'company': row['company'] or '',
        }, config)
        if extra_context:
            context.update(extra_context)

        subject, body = render_template(template_name, context)
        if subject:
            success = send_email(row['email'], subject, body, config, dry_run, row['id'], template_name)
            if success:
                sent_count += 1

    print(f"\n📊 发送完毕: {sent_count}/{len(rows)} 成功")


# ============================================================
# 调度引擎
# ============================================================

def start_scheduler(config=None, daemon=False):
    """启动定时调度引擎"""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.schedulers.blocking import BlockingScheduler
        from apscheduler.triggers.cron import CronTrigger
        from apscheduler.triggers.interval import IntervalTrigger
        from apscheduler.triggers.date import DateTrigger
    except ImportError:
        print("⚠️ 需要安装 APScheduler: pip install apscheduler")
        sys.exit(1)

    if config is None:
        config = load_config(allow_fallback=True)

    scheduler_cfg = config.get('scheduler', {})
    SchedulerClass = BackgroundScheduler if daemon else BlockingScheduler
    sched = SchedulerClass(timezone='Asia/Shanghai')

    # 1. 每日关键日期检查
    check_time = scheduler_cfg.get('daily_check_time', '08:00')
    h, m = check_time.split(':')
    sched.add_job(
        lambda: check_key_dates(config=config),
        CronTrigger(hour=int(h), minute=int(m)),
        id='daily_date_check',
        name='每日关键日期检查',
        replace_existing=True
    )
    print(f"✅ 已注册: 每日关键日期检查 ({check_time})")

    # 2. 从数据库加载自定义定时任务
    conn = get_db()
    jobs = conn.execute("SELECT * FROM scheduled_jobs WHERE enabled = 1").fetchall()
    conn.close()

    for job_row in jobs:
        job = dict(job_row)
        try:
            cfg = json.loads(job['trigger_config'])
            params = json.loads(job['action_params'] or '{}')

            if job['trigger_type'] == 'cron':
                trigger = CronTrigger(**cfg)
            elif job['trigger_type'] == 'interval':
                trigger = IntervalTrigger(**cfg)
            elif job['trigger_type'] == 'date':
                trigger = DateTrigger(**cfg)
            else:
                continue

            action = job['action']
            if action == 'check_dates':
                func = lambda: check_key_dates(config=config)
            elif action == 'send_campaign':
                func = lambda t=job['action_params']: send_campaign(
                    json.loads(t).get('template'),
                    json.loads(t).get('level'),
                    config=config
                )
            else:
                continue

            sched.add_job(func, trigger, id=f"job_{job['id']}", name=job['job_name'], replace_existing=True)
            print(f"✅ 已注册: {job['job_name']} ({job['trigger_type']})")
        except Exception as e:
            print(f"⚠️ 跳过任务 {job['job_name']}: {e}")

    print(f"\n🚀 调度引擎启动 ({'守护进程' if daemon else '前台'}模式)")
    print(f"   共 {len(sched.get_jobs())} 个任务")
    print(f"   按 Ctrl+C 停止\n")

    sched.start()
    try:
        if not daemon:
            import time
            while True:
                time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        sched.shutdown()
        print("\n⏹️ 调度引擎已停止")


# ============================================================
# 初始化演示数据
# ============================================================

def init_demo_data():
    """初始化演示数据"""
    init_db()
    conn = get_db()

    # 检查是否已有数据
    count = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
    if count > 0:
        print(f"⚠️ 数据库已有 {count} 条客户数据，跳过演示数据初始化")
        conn.close()
        return

    # 3个演示客户（与 demo-clients.md 对应）
    customers = [
        {
            'code': 'C-001', 'name': '王建国', 'email': 'wangjg@chinalink.com',
            'phone': '138-XXXX-8888', 'company': '智链科技', 'level': 'A',
            'personality': '支配型', 'birthday': '1982-03-15',
            'contract_start': '2024-07-20', 'contract_end': '2026-03-01',
            'tags': ['VIP', 'SaaS', '续约中'], 'notes': '创始人CEO，看ROI，4小时响应'
        },
        {
            'code': 'C-002', 'name': '李美琪', 'email': 'limeiqi@gmail.com',
            'phone': '139-XXXX-6666', 'company': '自由职业（设计）', 'level': 'B',
            'personality': '亲和型', 'birthday': '1990-08-20',
            'contract_start': '2025-11-05', 'contract_end': '2026-11-05',
            'tags': ['保险', '个人客户', '潜力'], 'notes': '怕风险，需商量，养猫"团子"'
        },
        {
            'code': 'C-003', 'name': '张伟', 'email': 'zhangwei@dingxin-mfg.com',
            'phone': '137-XXXX-3333', 'company': '鼎鑫精密制造', 'level': 'B',
            'personality': '分析型', 'birthday': '1975-12-08',
            'contract_start': None, 'contract_end': None,
            'tags': ['制造业', '谈判中', 'B2B'], 'notes': '看数据，怕出错，茶台谈判'
        }
    ]

    for cust in customers:
        add_customer(cust)

    # 添加预设定时任务
    jobs = [
        {
            'job_name': '每日关键日期检查',
            'trigger_type': 'cron',
            'trigger_config': json.dumps({'hour': 8, 'minute': 0}),
            'action': 'check_dates',
            'action_params': '{}'
        },
        {
            'job_name': '每月产品资讯推送',
            'trigger_type': 'cron',
            'trigger_config': json.dumps({'day': 1, 'hour': 10, 'minute': 0}),
            'action': 'send_campaign',
            'action_params': json.dumps({'template': 'product_promotion', 'level': 'A'})
        }
    ]

    for job in jobs:
        conn.execute("""
            INSERT INTO scheduled_jobs (job_name, trigger_type, trigger_config, action, action_params)
            VALUES (?, ?, ?, ?, ?)
        """, (job['job_name'], job['trigger_type'], job['trigger_config'], job['action'], job['action_params']))

    conn.commit()
    conn.close()

    print("\n📋 演示数据已初始化：")
    print("   - 3个客户 (C-001王建国/C-002李美琪/C-003张伟)")
    print("   - 5个关键日期提醒（3个生日 + 2个合同到期）")
    print("   - 2个预设定时任务")
    print("\n💡 运行 'python email_automation.py list-customers' 查看客户")
    print("💡 运行 'python email_automation.py check-dates --dry-run' 测试日期检查")


# ============================================================
# CLI 命令行入口
# ============================================================

def cli_send(args):
    """发送单封邮件"""
    config = load_config(allow_fallback=True)
    sender_name = config.get('smtp', {}).get('name', 'Sales Team')

    if args.template:
        # 使用模板
        if not args.to:
            print("⚠️ 使用模板需要指定 --to")
            return
        customer = get_customer_by_email(args.to) or {}
        context = inject_profile_context({
            'name': customer.get('name', 'Customer'),
            'company': customer.get('company', ''),
            **(json.loads(args.vars) if args.vars else {})
        }, config)
        subject, body = render_template(args.template, context)
        if not subject:
            return
        send_email(args.to, subject, body, config, args.dry_run, customer.get('id'), args.template)
    else:
        # 自定义邮件
        if not args.to or not args.subject:
            print("⚠️ 需要 --to 和 --subject")
            return
        send_email(args.to, args.subject, args.body or '', config, args.dry_run)


def cli_add_customer(args):
    """CLI添加客户"""
    data = {
        'code': args.code,
        'name': args.name,
        'email': args.email,
        'phone': args.phone or '',
        'company': args.company or '',
        'level': args.level or 'C',
        'personality': args.personality or '',
        'birthday': args.birthday,
        'contract_start': args.contract_start,
        'contract_end': args.contract_end,
        'tags': args.tags.split(',') if args.tags else [],
        'notes': args.notes or ''
    }
    add_customer(data)



def send_email_with_retry(to_email, subject, body, config=None, dry_run=False,
                          customer_id=None, template_name=None, html=False,
                          max_retries=3, retry_delay=30):
    """Send email with automatic retry on SMTP rate-limit/failure."""
    import time as _time
    for attempt in range(max_retries):
        ok = send_email(to_email, subject, body, config, dry_run,
                        customer_id, template_name, html)
        if ok:
            return True
        if attempt < max_retries - 1:
            wait = retry_delay * (attempt + 1)
            print(f"  Retry in {wait}s... ({attempt+1}/{max_retries})")
            _time.sleep(wait)
    print(f"  Failed after {max_retries} retries: {to_email}")
    return False


# ============================================================
# 每日工作记录
# ============================================================

WORK_CATEGORIES = {
    'meeting': '会面/电话',
    'follow_up': '客户跟进',
    'proposal': '方案/报价',
    'negotiation': '谈判/逼单',
    'lead_gen': '线索开发',
    'collection': '回款/催收',
    'delivery': '交付/实施',
    'admin': '行政/内勤',
    'training': '学习/培训',
    'other': '其他',
}

def add_work_log(data):
    conn = get_db()
    c = conn.cursor()
    c.execute("""INSERT INTO work_logs
        (log_date, time_slot, category, customer_code, customer_name, action, result, duration_min, next_step, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.get('log_date') or date.today().isoformat(),
         data.get('time_slot', ''),
         data.get('category', 'other'),
         data.get('customer_code', ''),
         data.get('customer_name', ''),
         data.get('action', ''),
         data.get('result', ''),
         data.get('duration_min', 0),
         data.get('next_step', ''),
         data.get('priority', 'normal')))
    log_id = c.lastrowid
    conn.commit()
    conn.close()
    print(f"work log added (ID:{log_id}): {data.get('action','')[:40]}")
    return log_id


def list_work_logs(target_date=None, days=1):
    if target_date is None:
        target_date = date.today().isoformat()
    conn = get_db()
    if days > 1:
        start = (date.today() - timedelta(days=days-1)).isoformat()
        rows = conn.execute(
            "SELECT * FROM work_logs WHERE log_date >= ? AND log_date <= ? ORDER BY log_date DESC, id DESC",
            (start, target_date)).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM work_logs WHERE log_date = ? ORDER BY id DESC", (target_date,)).fetchall()
    conn.close()
    if not rows:
        print(f"no work logs for {target_date}")
        return []
    print(f"=== work logs: {target_date} ({len(rows)} entries) ===")
    print(f"{'time':<14} {'category':<12} {'customer':<10} {'action':<30} {'result':<20} {'next':<20}")
    print("-" * 110)
    for r in rows:
        r = dict(r)
        cat_cn = WORK_CATEGORIES.get(r['category'], r['category'])
        cust = r['customer_name'] or r['customer_code'] or '-'
        print(f"{(r['time_slot'] or ''):<14} {cat_cn:<12} {cust:<10} {(r['action'] or '')[:28]:<30} {(r['result'] or '')[:18]:<20} {(r['next_step'] or '')[:18]:<20}")
    return rows


def generate_work_report(target_date=None, period='daily', config=None):
    if config is None:
        config = load_config(allow_fallback=True)
    if target_date is None:
        target_date = date.today().isoformat()

    if period == 'weekly':
        start_date = (date.today() - timedelta(days=date.today().weekday())).isoformat()
        conn = get_db()
        rows = conn.execute("SELECT * FROM work_logs WHERE log_date >= ? AND log_date <= ? ORDER BY log_date, id",
                            (start_date, target_date)).fetchall()
        conn.close()
    elif period == 'monthly':
        start_date = date.today().replace(day=1).isoformat()
        conn = get_db()
        rows = conn.execute("SELECT * FROM work_logs WHERE log_date >= ? AND log_date <= ? ORDER BY log_date, id",
                            (start_date, target_date)).fetchall()
        conn.close()
    else:
        conn = get_db()
        rows = conn.execute("SELECT * FROM work_logs WHERE log_date = ? ORDER BY id", (target_date,)).fetchall()
        conn.close()

    if not rows:
        return None, None

    rows = [dict(r) for r in rows]
    profile = get_agent_profile(config)

    # stats
    total_mins = sum(r.get('duration_min', 0) or 0 for r in rows)
    by_cat = {}
    for r in rows:
        cat = WORK_CATEGORIES.get(r['category'], r['category'])
        by_cat[cat] = by_cat.get(cat, 0) + 1
    customers = set()
    for r in rows:
        if r['customer_name']:
            customers.add(r['customer_name'])

    period_cn = {'daily': 'daily', 'weekly': 'weekly', 'monthly': 'monthly'}[period]

    subject = f"[work log] {period_cn} {target_date} | {profile['agent_name']}"

    body_lines = []
    body_lines.append("=" * 50)
    if period == 'daily':
        body_lines.append(f"          {target_date} work log")
    elif period == 'weekly':
        body_lines.append(f"       weekly work log ({start_date} ~ {target_date})")
    else:
        body_lines.append(f"      monthly work log ({start_date} ~ {target_date})")
    body_lines.append("=" * 50)
    body_lines.append("")

    # group by date
    cur_date = None
    for r in rows:
        if r['log_date'] != cur_date:
            cur_date = r['log_date']
            body_lines.append(f"[{cur_date}]")
        cat_cn = WORK_CATEGORIES.get(r['category'], r['category'])
        time_s = r['time_slot'] or ''
        cust = r['customer_name'] or r['customer_code'] or ''
        pri = {'high': '[!]', 'medium': '[-]', 'low': ''}.get(r['priority'], '')
        body_lines.append(f"  {time_s:<14} {cat_cn}")
        body_lines.append(f"    action: {r['action']}")
        if r['result']:
            body_lines.append(f"    result: {r['result']}")
        if r['next_step']:
            body_lines.append(f"    next:   {r['next_step']}")
        if pri:
            body_lines.append(f"    priority: {pri}")
        body_lines.append("")

    body_lines.append("-" * 50)
    body_lines.append("summary:")
    body_lines.append(f"  total entries:    {len(rows)}")
    body_lines.append(f"  total time:       {total_mins} min ({total_mins//60}h{total_mins%60}m)")
    body_lines.append(f"  customers:        {len(customers)} ({', '.join(customers)})")
    body_lines.append(f"  by category:")
    for cat, cnt in sorted(by_cat.items(), key=lambda x: -x[1]):
        body_lines.append(f"    {cat}: {cnt}")
    body_lines.append("=" * 50)

    return subject, "\n".join(body_lines)


def send_work_report(period='daily', target_date=None, config=None):
    if config is None:
        config = load_config(allow_fallback=True)
    subject, body = generate_work_report(target_date, period, config)
    if not subject:
        print(f"no work logs found for report")
        return False
    profile = get_agent_profile(config)
    return send_email(profile['agent_email'], subject, body, config,
                      dry_run=False, template_name=f'work_{period}')


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description='销售邮件自动化系统',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
            示例:
              python email_automation.py init
              python email_automation.py list-customers
              python email_automation.py check-dates --dry-run
              python email_automation.py send --to wangjg@chinalink.com --template birthday_wish --dry-run
              python email_automation.py send --to test@test.com --subject "测试" --body "内容" --dry-run
              python email_automation.py campaign --template product_promotion --dry-run
              python email_automation.py scheduler
        """)
    )
    sub = parser.add_subparsers(dest='command')

    # init
    sub.add_parser('init', help='初始化数据库+演示数据')

    # add-customer
    p_add = sub.add_parser('add-customer', help='添加客户')
    p_add.add_argument('--code', required=True, help='客户编号 C-001')
    p_add.add_argument('--name', required=True)
    p_add.add_argument('--email')
    p_add.add_argument('--phone')
    p_add.add_argument('--company')
    p_add.add_argument('--level', choices=['A', 'B', 'C', 'D'], default='C')
    p_add.add_argument('--personality')
    p_add.add_argument('--birthday', help='YYYY-MM-DD')
    p_add.add_argument('--contract-start', help='YYYY-MM-DD')
    p_add.add_argument('--contract-end', help='YYYY-MM-DD')
    p_add.add_argument('--tags', help='逗号分隔')
    p_add.add_argument('--notes')

    # list-customers
    sub.add_parser('list-customers', help='列出所有客户')

    # send
    p_send = sub.add_parser('send', help='发送邮件')
    p_send.add_argument('--to', help='收件人邮箱')
    p_send.add_argument('--template', help='模板名称')
    p_send.add_argument('--subject', help='邮件主题')
    p_send.add_argument('--body', help='邮件正文')
    p_send.add_argument('--vars', help='模板变量 JSON格式')
    p_send.add_argument('--dry-run', action='store_true', help='模拟发送不实际发送')

    # check-dates
    p_check = sub.add_parser('check-dates', help='检查今日关键日期')
    p_check.add_argument('--dry-run', action='store_true')

    # campaign
    p_camp = sub.add_parser('campaign', help='群发营销邮件')
    p_camp.add_argument('--template', required=True, help='模板名称')
    p_camp.add_argument('--level', choices=['A', 'B', 'C', 'D'], help='只发给某级别')
    p_camp.add_argument('--dry-run', action='store_true')

    # add-log
    p_log = sub.add_parser('add-log', help='add work log entry')
    p_log.add_argument('--date', help='date YYYY-MM-DD (default: today)')
    p_log.add_argument('--time', help='time slot e.g. 10:00-11:00')
    p_log.add_argument('--category', required=True, choices=list(WORK_CATEGORIES.keys()))
    p_log.add_argument('--customer-code')
    p_log.add_argument('--customer-name')
    p_log.add_argument('--action', required=True)
    p_log.add_argument('--result')
    p_log.add_argument('--duration', type=int, help='minutes')
    p_log.add_argument('--next-step')
    p_log.add_argument('--priority', choices=['high', 'medium', 'low'], default='normal')

    # list-logs
    p_ll = sub.add_parser('list-logs', help='list work logs')
    p_ll.add_argument('--date', help='date YYYY-MM-DD (default: today)')
    p_ll.add_argument('--days', type=int, default=1, help='show N days')

    # work-report
    p_wr = sub.add_parser('work-report', help='generate work report email')
    p_wr.add_argument('--period', choices=['daily', 'weekly', 'monthly'], default='daily')
    p_wr.add_argument('--date', help='date YYYY-MM-DD')
    p_wr.add_argument('--send', action='store_true', help='email the report')
    p_wr.add_argument('--dry-run', action='store_true')

    # scheduler
    p_sched = sub.add_parser('scheduler', help='启动定时调度引擎')
    p_sched.add_argument('--daemon', action='store_true', help='后台守护进程模式')

    args = parser.parse_args()

    if args.command == 'init':
        init_demo_data()
    elif args.command == 'add-customer':
        cli_add_customer(args)
    elif args.command == 'list-customers':
        list_customers()
    elif args.command == 'send':
        cli_send(args)
    elif args.command == 'check-dates':
        check_key_dates(args.dry_run)
    elif args.command == 'campaign':
        send_campaign(args.template, args.level, args.dry_run)
    elif args.command == 'add-log':
        add_work_log({
            'log_date': args.date,
            'time_slot': args.time,
            'category': args.category,
            'customer_code': args.customer_code,
            'customer_name': args.customer_name,
            'action': args.action,
            'result': args.result,
            'duration_min': args.duration,
            'next_step': args.next_step,
            'priority': args.priority,
        })
    elif args.command == 'list-logs':
        list_work_logs(args.date, args.days)
    elif args.command == 'work-report':
        if args.send:
            send_work_report(args.period, args.date)
        else:
            subject, body = generate_work_report(args.date, args.period)
            if subject:
                print(subject)
                print()
                print(body)
            else:
                print("no work logs found")
    elif args.command == 'scheduler':
        start_scheduler(daemon=args.daemon)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
