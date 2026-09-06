# 本地事实与经验记忆

保留原包 `src/memory.py` 的事实、经验与实体接口，使用 Stable 已提供的 Python 和 SQLite FTS5。检索是关键词全文检索，不是向量语义搜索；中文分词与 FTS 表达式支持有限，按实际查询结果说明。

从已登记的资源目录加载模块，在当前用户工作区明确指定数据库路径：

```python
import importlib.util, sys
from pathlib import Path

# resource_dir 使用技能运行信息给出的真实目录；workspace 是当前任务工作区。
module_path = Path(resource_dir) / 'src' / 'memory.py'
spec = importlib.util.spec_from_file_location('stable_agent_memory', module_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
db_dir = Path(workspace) / '.stable-memory'
db_dir.mkdir(parents=True, exist_ok=True)
mem = module.AgentMemory(db_path=str(db_dir / 'memory.db'))
```

- `remember(content, tags, source, confidence)` 保存事实，分别标注观察、用户提供的信息与推断。
- `recall(query)` 执行 FTS 查询并更新访问统计；只读任务不能把它当作完全无写入操作。
- `learn(action, context, outcome, insight)` 和 `get_lessons(context=...)` 管理经过验证的经验。
- `track_entity` 登记实体；增量改属性使用 `update_entity`，避免把原属性覆盖掉。
- `stats()` 与 `export_json()` 可检查或导出内容。删除和过期清理只在用户要求时执行。

数据库只服务当前工作区，不读取 Stable 对话库，不使用默认的用户主目录路径，不增加自动钩子。密钥和完整会话不进入记忆。
