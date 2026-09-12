"""TeacherAgent 开发启动：后端 FastAPI(uvicorn) + 前端 Vite dev。"""

import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import TextIO


ROOT = Path(__file__).parent.parent
FRONTEND = ROOT / "frontend"
BACKEND_LOG_DIR = ROOT / "logs" / "backend"
FRONTEND_LOG_DIR = ROOT / "logs" / "frontend"

BACKEND_LOG_DIR.mkdir(parents=True, exist_ok=True)
FRONTEND_LOG_DIR.mkdir(parents=True, exist_ok=True)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def _start_backend() -> subprocess.Popen[str]:
    """启动后端 API（uvicorn，端口 8000）。"""
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "teacheragent.api.main:app",
            "--reload",
            "--port",
            "8000",
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def _start_frontend() -> subprocess.Popen[str]:
    """启动前端 dev server（vite，端口 5173）。"""
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    return subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=FRONTEND,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def _drain(stream: TextIO | None, name: str, log_path: Path) -> None:
    """透传并记录子进程输出，避免启动异常被吞。"""
    if not stream:
        return
    with log_path.open("w", encoding="utf-8") as log_file:
        for line in stream:
            text = f"[{name}] {line.rstrip()}"
            print(text, flush=True)
            log_file.write(f"{text}\n")
            log_file.flush()


def _start_drain(
    process: subprocess.Popen[str],
    name: str,
    log_path: Path,
) -> threading.Thread:
    """启动一条输出转发线程。"""
    thread = threading.Thread(
        target=_drain,
        args=(process.stdout, name, log_path),
        daemon=True,
    )
    thread.start()
    return thread


def main() -> None:
    print("启动后端: http://localhost:8000")
    backend = _start_backend()
    _start_drain(backend, "backend stdout", BACKEND_LOG_DIR / "out.log")
    _start_drain(backend, "backend stderr", BACKEND_LOG_DIR / "err.log")
    time.sleep(1)
    print("启动前端: http://localhost:5173")
    frontend = _start_frontend()
    _start_drain(frontend, "frontend stdout", FRONTEND_LOG_DIR / "out.log")
    _start_drain(frontend, "frontend stderr", FRONTEND_LOG_DIR / "err.log")

    try:
        while True:
            if backend.poll() is not None:
                print(f"后端退出，返回码 {backend.returncode}", flush=True)
                break
            if frontend.poll() is not None:
                print(f"前端退出，返回码 {frontend.returncode}", flush=True)
                break
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    finally:
        for process in (frontend, backend):
            if process.poll() is None:
                process.terminate()


if __name__ == "__main__":
    main()
