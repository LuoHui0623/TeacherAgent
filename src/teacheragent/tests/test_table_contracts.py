"""表契约与 DDL 的一致性：列名与顺序必须完全一致。

这是「契约必须有强制校验」的落点——`scripts/*.sql` 的 DDL 是唯一权威，
`tables/*.ROW` 是 Python 侧镜像，二者漂移立即失败。
"""

import pytest

from teacheragent.infrastructure.store.sqlite import migrations, tables

CONTRACTS = (
    tables.llm_settings,
    tables.llm_profiles,
    tables.call_logs,
    tables.user_profiles,
)


def _ddl_columns(table_name: str) -> tuple[str, ...]:
    return migrations.table_columns(table_name)


@pytest.mark.parametrize("module", CONTRACTS, ids=lambda m: m.TABLE)
def test_table_exists_in_ddl(module):
    assert _ddl_columns(module.TABLE), f"DDL 中不存在表 {module.TABLE}"


@pytest.mark.parametrize("module", CONTRACTS, ids=lambda m: m.TABLE)
def test_row_contract_matches_ddl(module):
    assert tuple(module.ROW.__annotations__) == _ddl_columns(module.TABLE), (
        f"{module.TABLE} 的行契约与 DDL 不一致（列名或顺序）"
    )


def test_table_names_are_unique():
    names = [module.TABLE for module in CONTRACTS]
    assert len(names) == len(set(names))
