"""教材生产线（content-pipeline）的图定义与产物类型词表。

导入即注册图定义与全部 node_id。
"""

from teacheragent.workflows.content_pipeline.artifacts import (
    CONTENT_PIPELINE_ARTIFACT_TYPES,
)
from teacheragent.workflows.content_pipeline.definition import (
    CONTENT_PIPELINE_WORKFLOW_ID,
    main_workflow_definition,
)

__all__ = [
    "CONTENT_PIPELINE_ARTIFACT_TYPES",
    "CONTENT_PIPELINE_WORKFLOW_ID",
    "main_workflow_definition",
]
