# 每日新闻文字简报

读取当前可访问的公开 RSS，按用户指定的时间窗口归纳新闻。可从 BBC、NPR、Al Jazeera 等不同来源寻找线索；不可用的来源不充作已读取。

```powershell
$feed = Invoke-RestMethod -Uri 'https://feeds.bbci.co.uk/news/world/rss.xml' -TimeoutSec 20
$feed | Select-Object title,link,pubDate,description
```

使用 XML/RSS 解析器提取标题、链接、发布时间和摘要，不用删除 HTML 标签的正则代替完整 XML 解析。对重点新闻读取原文、检查发布时间，合并转载和重复事件。每条摘要附上来源，不编造未确认细节。

本迁移版提供文字简报。只有当用户明确请求音频且本轮具备已配置 TTS 时才生成语音；不假设存在 OpenAI API 密钥，不自动发送音频或创建每日定时任务。
