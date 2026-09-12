"""配置层：路径、环境变量、LLM 配置域。

仅承载纯配置，不做任何持久化访问（持久化归 store 层）。
"""

from . import env, llm, paths

__all__ = ["env", "llm", "paths"]
