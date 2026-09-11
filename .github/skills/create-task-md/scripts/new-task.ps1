<#
.SYNOPSIS
    把固定模板写入项目根目录 Task.md（直接覆盖）。

.DESCRIPTION
    用法（在项目根目录执行）：
        powershell -File .github/skills/create-task-md/scripts/new-task.ps1
        powershell -File .github/skills/create-task-md/scripts/new-task.ps1 -Title "T2 后端基础层"

    行为：
    - 模板固定为脚本同目录 ../assets/Task.template.md
    - 目标固定为项目根目录 Task.md（以脚本位置向上定位仓库根，即含 .github 的目录）
    - 直接覆盖已有 Task.md（语义：讨论确认后的整理落盘，无需归档确认）
    - 指定 -Title 时，把模板首行 "# <业务主题>" 替换为 "# <Title>"

.PARAMETER Title
    可选任务主题，写入文档标题。
#>
[CmdletBinding()]
param(
    [string]$Title
)

$ErrorActionPreference = 'Stop'

# 定位：脚本位于 .github/skills/create-task-md/scripts/，仓库根为其上四级
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Resolve-Path (Join-Path $scriptDir '..\..\..\..')
$template  = Join-Path $scriptDir '..\assets\Task.template.md'
$target    = Join-Path $repoRoot 'Task.md'

if (-not (Test-Path $template)) {
    Write-Error "模板不存在：$template"
    exit 1
}

$content = Get-Content -Path $template -Raw -Encoding UTF8

if ($Title) {
    $content = $content -replace '^# <业务主题>', ("# $Title")
}

# UTF-8（无 BOM）写入，避免中文乱码
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $utf8NoBom)

Write-Host "已整理：$target（直接覆盖）"
if ($Title) { Write-Host "标题：# $Title" }
Write-Host "下一步：按'先讨论'协议执行已确认的任务。"
