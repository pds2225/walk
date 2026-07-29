# walk 자동 커밋·push 작업은 2026-07-28부터 안전을 위해 격리되었습니다.
#
# 과거 스크립트는 main에서 stash/pull/pop/add/commit/push를 반복해 빈 커밋,
# worktree 파일 유입, 백업 브랜치 장기 분기를 만들 수 있었습니다. 이 파일은 기존
# 스케줄러가 같은 경로를 호출하더라도 Git 상태를 변경하지 않도록 의도적으로
# fail-closed 상태를 유지합니다.
#
# 백업이 필요하면 Git 브랜치를 자동으로 변경하지 않는 파일 단위 백업 도구를 별도로
# 설계하고, 저장 위치·보존기간·복원 테스트를 검토한 뒤 새 스크립트로 도입하세요.

[CmdletBinding()]
param()

Write-Warning "walk git auto-backup is disabled. No files, commits, branches, or remotes were changed."
exit 2
