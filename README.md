# eSIMPriceCollector_Domestic

국내 eSIM 판매 사이트의 해외 사용 상품 가격을 수집하고 비교 대시보드로 공개하는 프로젝트입니다.

## Current Scope

- 대상 사이트: `usimsa`, `pindirect`
- 대상 국가: 일본, 베트남, 미국, 필리핀
- 배포 목표: GitHub Pages 정적 대시보드
- 수집 방식: 국가별 상세 페이지 URL registry 기반

## Repository Layout

- `app/`: Python 수집기 패키지
- `app/adapters/`: 사이트별 수집기
- `app/pipeline/`: 실행 조합과 정규화 파이프라인
- `app/output/`: latest/history 출력 계약
- `app/utils/`: 공통 유틸리티
- `config/source_registry.yml`: 사이트/국가 URL 레지스트리
- `dashboard/`: GitHub Pages용 정적 대시보드
- `tests/`: fixture 및 회귀 테스트

## Canonical Record Contract

정규 가격 레코드는 아래 필드를 기준으로 유지합니다.

- `site`
- `site_label`
- `country_code`
- `country_name_ko`
- `source_url`
- `option_name`
- `days`
- `data_quota_mb`
- `data_quota_label`
- `speed_policy`
- `network_type`
- `product_type`
- `price_krw`
- `currency`
- `availability_status`
- `collected_at`
- `parser_mode`
- `evidence`
- `raw_payload_hash`

실행 메타데이터는 run 단위로 아래를 포함합니다.

- `run_id`
- `collected_at`
- `registry_path`
- `output_root`
- `selected_sites`
- `selected_countries`
- `success_count`
- `failure_count`

## Output Contract

- `data/latest/`: 대시보드가 읽는 최신 스냅샷
- `data/history/YYYY-MM-DD/`: 일자별 이력 스냅샷
- `data/runs/`: 실행 단위 메타데이터
- `data/failed.jsonl`: 부분 실패 로그

## CLI Stub

```powershell
python -m app crawl --help
python -m app crawl --registry config/source_registry.yml --out data
```

현재 `crawl`은 공통 파이프라인까지 연결되어 아래를 수행합니다.

- `config/source_registry.yml` 로드
- 선택된 site/country 필터 적용
- 등록된 adapter 호출
- 정규 레코드 검증
- `data/latest/`, `data/history/YYYY-MM-DD/`, `data/runs/`, `data/failed.jsonl` 기록

실제 사이트 adapter는 다음 task들에서 추가합니다. 아직 adapter가 없는 사이트는 실패 로그로 남기고 다른 대상 처리는 계속 진행합니다.

## GitHub Pages Deploy

워크플로 파일은 `.github/workflows/collect-and-deploy.yml` 입니다.

- `workflow_dispatch`: 수동 실행
- `schedule`: 6시간마다 자동 수집/배포
- 실행 순서:
  `crawl -> pytest -> dashboard artifact upload -> GitHub Pages deploy`

워크플로는 아래를 수행합니다.

- `python -m app crawl --registry config/source_registry.yml --out data`
- `python -m pytest -q`
- `dashboard/` 디렉터리를 Pages artifact로 업로드
- `data/failed.jsonl`, `data/runs/`, `data/latest/run_metadata.json`를 로그 artifact로 업로드

부분 실패 정책:

- `crawl` 종료 코드 `0`: 전체 성공
- `crawl` 종료 코드 `2`: 일부 사이트 실패가 있었지만 배포는 계속 진행
- 그 외 종료 코드: workflow 실패 처리

GitHub 저장소 설정에서 Pages source를 `GitHub Actions`로 맞춰야 배포가 완료됩니다.

## Regression And Smoke Checks

핵심 회귀 테스트 명령:

```powershell
python -m pytest -q
```

핵심 smoke 실행 예시:

```powershell
python -m app crawl --registry config/source_registry.yml --out data --site usimsa --site pindirect --country JP
```

smoke 실행 후 최소 확인 대상:

- `data/latest/records.json`
- `data/latest/run_metadata.json`
- `data/history/YYYY-MM-DD/records.json`
- `dashboard/data/latest.json`
- `data/failed.jsonl`

## Add A New Site

7개 사이트까지 확장할 때는 아래 순서를 유지합니다.

1. `config/source_registry.yml`에 새 `site`와 국가별 `source_url`을 추가합니다.
2. `app/adapters/<site>.py`를 만들고 `register_adapter("<site>", ...)`를 등록합니다.
3. 새 사이트의 수집 경로가 `SSR only`, `direct API`, `browser fallback` 중 무엇인지 명시합니다.
4. `tests/fixtures/`에 최소 1개 HTML 또는 payload fixture를 저장합니다.
5. `tests/test_<site>_adapter.py`에서 parser와 fallback 분기를 검증합니다.
6. `python -m pytest -q`와 subset crawl로 `dashboard/data/latest.json` 생성까지 확인합니다.
7. 스키마나 출력 계약이 바뀌면 `app/models.py`, `README.md`, `shrimp-rules.md`, 관련 dashboard 소비 로직을 함께 갱신합니다.

## Drift Response

사이트 구조가 바뀌었을 때는 아래 순서를 따릅니다.

1. `data/failed.jsonl`와 `data/latest/run_metadata.json`에서 실패 대상과 시각을 확인합니다.
2. 대상 페이지 HTML 또는 API payload를 다시 fixture로 저장합니다.
3. 기존 fixture와 새 fixture를 비교해 selector, JSON path, 응답 shape 변화를 찾습니다.
4. adapter 테스트를 먼저 수정하거나 추가한 뒤 parser를 수정합니다.
5. subset crawl로 복구를 확인한 뒤 전체 workflow를 다시 실행합니다.

## Architecture Notes

- crawler runtime: `app/`
- site adapters: `app/adapters/`
- normalization/orchestration: `app/pipeline/`
- output contracts and dashboard aggregate build: `app/output/`
- static dashboard: `dashboard/`
- target registry: `config/source_registry.yml`

대시보드는 raw site payload를 읽지 않고 `dashboard/data/latest.json`만 읽어야 합니다.
