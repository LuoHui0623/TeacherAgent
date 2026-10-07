"""时间工具的公共口径：ISO8601 UTC 字符串。

库表的时间列由仓储写入这个格式，不用 DDL 的 `DEFAULT (datetime('now'))`：格式统一才能按字符串排序，也才能让调用方在测试与恢复中显式给出可复现的时间。
"""

from datetime import UTC, datetime


def to_iso(at: datetime | None = None) -> str:
    """转成 ISO8601 UTC 字符串；缺省取当前时间。"""
    return (at or datetime.now(UTC)).isoformat()


def parse_iso(value: str) -> datetime:
    """解析本模块写出的 ISO8601 时间；带时区偏移的字符串原样保留其时区。"""
    return datetime.fromisoformat(value)
