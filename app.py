"""TeacherAgent 一键启动：后端 FastAPI(uvicorn) + 前端 Vite dev。

用法：uv run python app.py
"""

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
FRONTEND = ROOT / "frontend"


def start_backend() -> subprocess.Popen:
    """启动后端 API（uvicorn，端口 8000）。"""
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "teacheragent.api.main:app",
         "--reload", "--port", "8000"],
        cwd=ROOT,
    )


def start_frontend() -> subprocess.Popen:
    """启动前端 dev server（vite，端口 5173）。"""
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    return subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=FRONTEND,
    )


def main() -> None:
    print("启动后端: http://localhost:8000")
    backend = start_backend()
    time.sleep(1)
    print("启动前端: http://localhost:5173")
    frontend = start_frontend()
    try:
        backend.wait()
    except KeyboardInterrupt:
        pass
    finally:
        for proc in (frontend, backend):
            proc.terminate()


if __name__ == "__main__":
    main()
