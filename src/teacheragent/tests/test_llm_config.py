"""固化配置契约：yaml 是默认模型与默认温度的权威。"""

from teacheragent.config import llm


def test_default_temperature_is_read_from_yaml():
    assert llm.default_temperature() == 0.7


def test_default_model_is_read_from_yaml():
    assert llm.default_option().model == "omen-alpha"
    assert llm.role_default_option("teacher").model == "omen-alpha"


def test_model_options_are_read_from_yaml():
    options = llm.list_options()
    assert len(options) == 4
    assert options[0]["is_default"] is True
    assert options[0]["model"] == "omen-alpha"
