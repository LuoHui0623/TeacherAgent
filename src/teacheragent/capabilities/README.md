# capabilities

Agent 原子能力层。每个能力域一个子目录，域内保持无状态、可单测。

`llm/` 负责 LLM 相关原子能力：
- `invoke.py`：读配置、建客户端、日志落库后调用。
- `call_logger.py`：一次 LLM 调用的日志统一落库。
- `prompts.py`：`prompts/*.md` 的加载与版本管理。
- `settings.py`：固化配置、表覆盖值、环境变量的合并与保存。

能力层允许依赖 store 的仓储接口，这是唯一的例外；其他能力保持纯函数。
