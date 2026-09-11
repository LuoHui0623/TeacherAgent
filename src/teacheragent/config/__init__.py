"""配置层：路径、环境变量、模型清单。

仅承载纯配置，不做任何持久化访问（持久化归 store 层）。
"""

from . import env, llm_catalog, paths

__all__ = ["env", "llm_catalog", "paths"]
