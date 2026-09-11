"""基建端到端验证：迁移幂等 + settings 热更新 + 拦截器落库（含异常路径）。"""

from teacheragent.config import llm_settings
from teacheragent.shared import invoke_llm
from teacheragent.store import migrate, query

# 1. 迁移幂等
migrate()
migrate()
print("1. 迁移幂等 ok")

# 2. settings 热更新
s = llm_settings.get_settings("teacher")
llm_settings.update_settings("teacher", temperature=0.3)
s2 = llm_settings.get_settings("teacher")
assert s2["temperature"] == 0.3, "temperature 热更新失败"
print("2. settings 热更新 ok:", s2["model"], s2["temperature"])

# 3. 拦截器：无 API Key 时调用失败，但异常必须落库
try:
    invoke_llm("teacher", [{"role": "user", "content": "hi"}])
    print("3. 调用成功（有 API Key）")
except Exception as e:
    print("3. 调用失败（预期）:", type(e).__name__)

logs = query("SELECT role, model, status, duration_ms FROM call_logs ORDER BY id DESC LIMIT 1")
assert logs, "call_logs 未落库"
print("4. 日志落库 ok:", logs[0])
print("端到端验证通过")
