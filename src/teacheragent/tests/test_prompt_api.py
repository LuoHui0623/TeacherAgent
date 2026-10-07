"""提示词读接口：正文与变量清单、历史版本、版本间 diff。"""

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.infrastructure.llm.prompts import load_prompt
from teacheragent.infrastructure.store.sqlite.repositories import prompt_snapshots

TUTOR_REF = "agent/prompts/tutor.md"
OUTLINE_REF = "agent/prompts/outline-architect.md"
OLD_HASH = "sha256:old"
OLD_CONTENT = "# 旧版导师提示词\n\n## 角色设定\n\n你是一位 IT 学习导师。\n"


def _save_old_version(ref: str = TUTOR_REF) -> None:
    prompt_snapshots.save_snapshot(ref=ref, content_hash=OLD_HASH, content=OLD_CONTENT)


def test_get_prompt_returns_template_variables_and_content_identity():
    prompt = load_prompt(OUTLINE_REF)

    with TestClient(app) as client:
        response = client.get(f"/prompts/{OUTLINE_REF}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ref"] == OUTLINE_REF
    assert payload["contentHash"] == prompt.content_hash
    assert payload["currentHash"] == prompt.content_hash
    assert payload["source"] == "asset"
    assert payload["variables"] == ["brief", "learnerProfile"]
    assert payload["template"] == prompt.content


def test_versions_list_marks_the_current_file_version():
    _save_old_version()
    prompt = load_prompt(TUTOR_REF)

    with TestClient(app) as client:
        response = client.get(f"/prompts/{TUTOR_REF}/versions")

    assert response.status_code == 200
    payload = response.json()
    assert payload["currentHash"] == prompt.content_hash
    assert {item["contentHash"] for item in payload["versions"]} == {OLD_HASH, prompt.content_hash}
    current = [item for item in payload["versions"] if item["isCurrent"]]
    assert [item["contentHash"] for item in current] == [prompt.content_hash]


def test_diff_reports_the_change_between_two_versions():
    prompt = load_prompt(TUTOR_REF)
    _save_old_version()

    with TestClient(app) as client:
        response = client.get(
            f"/prompts/{TUTOR_REF}/diff",
            params={"from": OLD_HASH, "to": prompt.content_hash},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["changed"] is True
    assert f"--- {OLD_HASH}" in payload["unifiedDiff"]
    assert f"+++ {prompt.content_hash}" in payload["unifiedDiff"]
    assert "-你是一位 IT 学习导师。" in payload["unifiedDiff"]


def test_diff_of_one_version_against_itself_is_empty():
    prompt = load_prompt(TUTOR_REF)

    with TestClient(app) as client:
        response = client.get(
            f"/prompts/{TUTOR_REF}/diff",
            params={"from": prompt.content_hash, "to": prompt.content_hash},
        )

    assert response.status_code == 200
    assert response.json() == {
        "ref": TUTOR_REF,
        "from": prompt.content_hash,
        "to": prompt.content_hash,
        "changed": False,
        "unifiedDiff": "",
    }


def test_get_prompt_can_replay_a_historical_version():
    prompt = load_prompt(TUTOR_REF)
    _save_old_version()

    with TestClient(app) as client:
        response = client.get(f"/prompts/{TUTOR_REF}", params={"content_hash": OLD_HASH})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "snapshot"
    assert payload["contentHash"] == OLD_HASH
    assert payload["template"] == OLD_CONTENT
    assert payload["variables"] == []
    assert payload["currentHash"] == prompt.content_hash


def test_unknown_version_reports_404():
    load_prompt(TUTOR_REF)

    with TestClient(app) as client:
        missing = client.get(f"/prompts/{TUTOR_REF}", params={"content_hash": "sha256:nope"})
        diff = client.get(f"/prompts/{TUTOR_REF}/diff", params={"from": "sha256:nope", "to": "sha256:nope"})

    assert missing.status_code == 404
    assert diff.status_code == 404


def test_unknown_asset_reports_404():
    with TestClient(app) as client:
        response = client.get("/prompts/agent/prompts/不存在.md")

    assert response.status_code == 404


def test_malformed_ref_reports_400():
    with TestClient(app) as client:
        response = client.get("/prompts/not-a-prompt-asset.md")

    assert response.status_code == 400
