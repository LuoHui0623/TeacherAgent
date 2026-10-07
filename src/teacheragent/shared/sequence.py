"""有序标识的分配：`<prefix>-<n>`。"""

from collections.abc import Sequence


def next_sequence_id(ids: Sequence[str], prefix: str) -> str:
    """按已有标识算出下一个 `<prefix>-<n>`，n 取已出现过的最大序号 + 1。

    对话消息与 run 共用这条规则：两者都是「第几条事实」，编号只要求在该序列内唯一，
    因此同一个前缀的历史里出现不合法后缀时忽略该条，不影响计数。
    """
    marker = f"{prefix}-"
    highest = 0
    for value in ids:
        if not value.startswith(marker):
            continue
        suffix = value[len(marker):]
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return f"{marker}{highest + 1}"
