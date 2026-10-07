"""教材生产线的产物类型词表。

取值与前端 `contentPipelineArtifactTypes` 一致：端口靠它定型，连线两端类型相等才能相连。

门禁（人工门禁与契约门）产出的都是 `GATE_REVIEW`：评审主体（`ai` / `user`）、通过与
否、以及修订意见都在这份产物里。评估用 `contentHash` 指向被审内容的正文行，不复制
正文，因此下游拿到评估后按内容身份取内容。门禁自己的输出端口一律是评估；只有确实
产出新内容的端口才用别的类型（`quality-gate.manifest` 就是这样一份新清单）。
"""

from typing import Final

TUTOR_EVENT_BATCH: Final[str] = "TutorEventBatch"
CONTEXT_SNAPSHOT: Final[str] = "ContextSnapshot"
LEARNING_BRIEF: Final[str] = "LearningBrief"
OUTLINE: Final[str] = "Outline"
CONTENT_DRAFT: Final[str] = "ContentDraft"
REVIEW_REPORT: Final[str] = "ReviewReport"
GATE_REVIEW: Final[str] = "GateReview"
BEAUTIFIED_CONTENT: Final[str] = "BeautifiedContent"
ASSESSMENT_SET: Final[str] = "AssessmentSet"
PUBLICATION_MANIFEST: Final[str] = "PublicationManifest"

CONTENT_PIPELINE_ARTIFACT_TYPES: Final[frozenset[str]] = frozenset({
    TUTOR_EVENT_BATCH,
    CONTEXT_SNAPSHOT,
    LEARNING_BRIEF,
    OUTLINE,
    CONTENT_DRAFT,
    REVIEW_REPORT,
    GATE_REVIEW,
    BEAUTIFIED_CONTENT,
    ASSESSMENT_SET,
    PUBLICATION_MANIFEST,
})
"""教材生产线允许出现在端口上的全部产物类型。"""
