"""工作流层的异常契约。"""


class WorkflowDefinitionError(ValueError):
    """图定义未通过校验，或同一 workflow id 被重复注册。"""


class WorkflowNotFoundError(LookupError):
    """按 workflow id 取不到已注册的图定义。"""


class UnknownNodeError(LookupError):
    """node_id 不属于该工作流的图定义。"""


class TriggerMessageNotFoundError(LookupError):
    """发起运行引用的那条对话消息不存在。"""


class ProposalRequiredError(ValueError):
    """引用的对话消息不是 proposal，而只有 proposal 能发起运行（口径 1）。"""


class NodeExecutionError(RuntimeError):
    """节点执行失败；错误信息会写进 `node_runs.error` 并让该行进入终态。"""


class UnsupportedNodeKindError(NodeExecutionError):
    """该节点类型当前没有执行实现。"""


class MissingNodeImplementationError(NodeExecutionError):
    """该节点角色没有注册能力实现。"""
