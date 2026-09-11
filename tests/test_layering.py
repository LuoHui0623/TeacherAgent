"""分层契约：`config` 不依赖 store；包入口只做汇总导出。"""

from pathlib import Path

import teacheragent

PACKAGE_ROOT = Path(teacheragent.__file__).parent


def test_config_layer_has_no_store_dependency():
    offenders = sorted(
        path.name
        for path in (PACKAGE_ROOT / "config").glob("*.py")
        if "teacheragent.store" in path.read_text(encoding="utf-8")
    )
    assert offenders == [], f"config 层不得依赖 store：{offenders}"


def test_init_modules_only_reexport():
    offenders = [
        str(path.relative_to(PACKAGE_ROOT))
        for path in PACKAGE_ROOT.rglob("__init__.py")
        if "\nclass " in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"__init__.py 不得承载定义（仅汇总导出）：{offenders}"
