"""用户画像 API：当前版本、保存与恢复。"""

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.infrastructure.store.sqlite.repositories import user_profiles as repo

client = TestClient(app)


def test_empty_profile_catalog():
    response = client.get("/user-profile/versions")

    assert response.status_code == 200
    assert response.json() == {"current": None, "versions": []}


def test_save_creates_new_current_version(monkeypatch):
    ids = iter(["admin-20260919120000", "admin-20260919120001"])
    monkeypatch.setattr(repo, "build_version_id", lambda *_args, **_kwargs: next(ids))
    first = client.put("/user-profile/current", json={"content": "# 画像 v1"})
    second = client.put("/user-profile/current", json={"content": "# 画像 v2"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["content"] == "# 画像 v2"

    catalog = client.get("/user-profile/versions").json()
    assert catalog["current"]["id"] == second.json()["id"]
    assert [item["content"] for item in catalog["versions"]] == ["# 画像 v2", "# 画像 v1"]


def test_restore_copies_history_as_new_current(monkeypatch):
    ids = iter([
        "admin-20260919120000",
        "admin-20260919120001",
        "admin-20260919120002",
    ])
    monkeypatch.setattr(repo, "build_version_id", lambda *_args, **_kwargs: next(ids))
    first = client.put("/user-profile/current", json={"content": "# 画像 v1"}).json()
    client.put("/user-profile/current", json={"content": "# 画像 v2"})

    restored = client.post(f"/user-profile/versions/{first['id']}/restore")

    assert restored.status_code == 200
    assert restored.json()["content"] == "# 画像 v1"
    assert restored.json()["id"] != first["id"]

    catalog = client.get("/user-profile/versions").json()
    assert catalog["current"]["content"] == "# 画像 v1"
    assert [item["content"] for item in catalog["versions"]] == ["# 画像 v1", "# 画像 v2", "# 画像 v1"]


def test_restore_missing_version_returns_404():
    response = client.post("/user-profile/versions/admin-20990101000000/restore")

    assert response.status_code == 404
    assert response.json()["detail"] == "画像版本不存在"
