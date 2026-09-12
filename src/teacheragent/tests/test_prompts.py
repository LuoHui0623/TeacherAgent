"""提示词加载契约：按角色读取 Markdown 资产并记录引用路径。"""

from teacheragent.capabilities.llm.prompts import load_prompt
from teacheragent.constants import AgentRole


def test_load_prompt_returns_ref_and_content():
    prompt = load_prompt(AgentRole.TEACHER)
    assert prompt.ref == "prompts/teacher.md"
    assert "# 教师 Agent 提示词" in prompt.content
