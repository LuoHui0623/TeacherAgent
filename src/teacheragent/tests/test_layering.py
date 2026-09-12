"""分层契约：共享层不越界、能力层可依赖仓储、包入口只做汇总导出。"""

from pathlib import Path

import teacheragent

PACKAGE_ROOT = Path(teacheragent.__file__).parent


def test_config_layer_has_no_store_dependency():
    offenders = sorted(
        str(path.relative_to(PACKAGE_ROOT))
        for path in (PACKAGE_ROOT / "config").rglob("*.py")
        if path.name != "__init__.py"
        if "teacheragent.store" in path.read_text(encoding="utf-8")
    )
    assert offenders == [], f"config 层不得依赖 store：{offenders}"


def test_shared_layer_is_pure_infrastructure():
    offenders = [
        str(path.relative_to(PACKAGE_ROOT))
        for path in (PACKAGE_ROOT / "shared").rglob("*.py")
        if path.name != "__init__.py"
        if "teacheragent.store" in path.read_text(encoding="utf-8")
        or "teacheragent.capabilities" in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"shared 层不得依赖 store/capabilities：{offenders}"


def test_capabilities_use_repository_interface_only():
    offenders = [
        str(path.relative_to(PACKAGE_ROOT))
        for path in (PACKAGE_ROOT / "capabilities").rglob("*.py")
        if path.name != "__init__.py"
        if "teacheragent.store" in path.read_text(encoding="utf-8")
        and "repositories" not in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"capabilities 层不得绕开仓储接口：{offenders}"


def test_store_is_only_sql_owner():
    offenders = sorted(
        str(path.relative_to(PACKAGE_ROOT))
        for path in PACKAGE_ROOT.rglob("*.py")
        if "store" not in path.parts
        and "tests" not in path.parts
        and ("sqlite3" in path.read_text(encoding="utf-8")
             or "neo4j" in path.read_text(encoding="utf-8"))
    )
    assert offenders == [], f"SQL/图数据库驱动只能出现在 store 层：{offenders}"


def test_init_modules_only_reexport():
    offenders = [
        str(path.relative_to(PACKAGE_ROOT))
        for path in PACKAGE_ROOT.rglob("__init__.py")
        if "\nclass " in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"__init__.py 不得承载定义（仅汇总导出）：{offenders}"
