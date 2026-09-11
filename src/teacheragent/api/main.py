"""FastAPI 应用入口。"""

from fastapi import FastAPI

app = FastAPI(title="TeacherAgent API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
