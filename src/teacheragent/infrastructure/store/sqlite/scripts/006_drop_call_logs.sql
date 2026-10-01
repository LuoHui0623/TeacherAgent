-- call_logs 已并入 llm_runs：一次调用只保留一条真实请求记录，历史行不再搬运。
DROP INDEX IF EXISTS idx_call_logs_role;
DROP TABLE IF EXISTS call_logs;
