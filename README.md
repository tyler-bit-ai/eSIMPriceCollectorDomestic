# eSIMPriceCollector_Domestic

국내 eSIM 판매 사이트의 해외 사용 상품 가격을 수집하고 비교 대시보드로 공개하는 프로젝트입니다.

## Current Scope

- 대상 사이트: `usimsa`, `pindirect`, `rokebi`, `maaltalk`
- 대상 국가: 일본, 베트남, 미국, 필리핀
- 배포 목표: GitHub Pages 정적 대시보드
- 수집 방식: 국가별 상세 페이지 URL registry 기반
- 유심사는 `roaming`과 `총알로컬망(local)` 탭을 함께 수집하도록 반영됨
- 로밍도깨비는 HTML 내 `self.__next_f` embedded payload를 파싱함
- 말톡은 `goods_ps.php mode=option_select`를 우선 시도하고 실패 시 Playwright browser fallback으로 수집함

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
python -m app crawl --registry config/source_registry.yml --out data --publish-dashboard
```

현재 `crawl`은 공통 파이프라인까지 연결되어 아래를 수행합니다.

- `config/source_registry.yml` 로드
- 선택된 site/country 필터 적용
- 등록된 adapter 호출
- 정규 레코드 검증
- `data/latest/`, `data/history/YYYY-MM-DD/`, `data/runs/`, `data/failed.jsonl` 기록

`dashboard/data/latest.json`은 기본 crawl에서 갱신되지 않습니다. 이 파일은 GitHub Pages publish용 기본 snapshot이고, `--publish-dashboard`를 명시한 전체 실행이나 workflow에서만 갱신됩니다. full publish는 함께 `dashboard/data/index.json`, `dashboard/data/snapshots/<run_id>.json`도 생성해서 대시보드에서 이전 publish snapshot을 선택할 수 있게 합니다. `--site` 또는 `--country` 필터가 있는 subset crawl은 `--publish-dashboard`를 함께 써도 publish용 dashboard latest/index/snapshots를 덮어쓰지 않고, 로컬 확인용 `data/latest/`와 `data/history/`만 갱신합니다.

## GitHub Pages Deploy

워크플로 파일은 `.github/workflows/collect-and-deploy.yml` 입니다.

- `workflow_dispatch`: 수동 실행
- `schedule`: 6시간마다 자동 수집/배포
- 실행 순서:
  `crawl -> pytest -> dashboard artifact upload -> GitHub Pages deploy`

워크플로는 아래를 수행합니다.

- `python -m app crawl --registry config/source_registry.yml --out data --publish-dashboard`
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
python -m app crawl --registry config/source_registry.yml --out data --site usimsa --site pindirect --site rokebi --site maaltalk --country JP
```

Pages publish용 전체 실행 예시:

```powershell
python -m app crawl --registry config/source_registry.yml --out data --publish-dashboard
```

smoke 실행 후 최소 확인 대상:

- `data/latest/records.json`
- `data/latest/run_metadata.json`
- `data/history/YYYY-MM-DD/records.json`
- `data/failed.jsonl`

`dashboard/data/latest.json`과 `dashboard/data/index.json`, `dashboard/data/snapshots/`는 `--publish-dashboard` 실행 후에만 확인 대상입니다.

## Add A New Site

7개 사이트까지 확장할 때는 아래 순서를 유지합니다.

1. `config/source_registry.yml`에 새 `site`와 국가별 `source_url`을 추가합니다.
2. `app/adapters/<site>.py`를 만들고 `register_adapter("<site>", ...)`를 등록합니다.
3. 새 사이트의 수집 경로가 `embedded payload`, `direct API`, `browser fallback` 중 무엇인지 명시합니다.
4. `tests/fixtures/`에 최소 1개 HTML 또는 payload fixture를 저장합니다.
5. `tests/test_<site>_adapter.py`에서 parser와 fallback 분기를 검증합니다.
6. `python -m pytest -q`와 subset crawl로 `data/latest/` 산출물을 확인합니다.
7. Pages publish가 필요한 경우 `--publish-dashboard`로 전체 crawl을 실행해 `dashboard/data/latest.json`을 갱신합니다.
8. 스키마나 출력 계약이 바뀌면 `app/models.py`, `README.md`, `shrimp-rules.md`, 관련 dashboard 소비 로직을 함께 갱신합니다.
9. 같은 국가에 `roaming/local` URL이 따로 있으면 `config/source_registry.yml`에 같은 `country_code`를 여러 번 선언할 수 있습니다.

## Drift Response

사이트 구조가 바뀌었을 때는 아래 순서를 따릅니다.

1. `data/failed.jsonl`와 `data/latest/run_metadata.json`에서 실패 대상과 시각을 확인합니다.
2. 대상 페이지 HTML 또는 API payload를 다시 fixture로 저장합니다.
3. 기존 fixture와 새 fixture를 비교해 selector, JSON path, 응답 shape 변화를 찾습니다.
4. adapter 테스트를 먼저 수정하거나 추가한 뒤 parser를 수정합니다. 말톡처럼 direct path가 불안정한 사이트는 browser fallback도 함께 확인합니다.
5. subset crawl로 복구를 확인한 뒤 전체 workflow를 다시 실행합니다.

## Architecture Notes

- crawler runtime: `app/`
- site adapters: `app/adapters/`
- normalization/orchestration: `app/pipeline/`
- output contracts and dashboard aggregate build: `app/output/`
- static dashboard: `dashboard/`
- target registry: `config/source_registry.yml`

대시보드는 raw site payload를 읽지 않고 `dashboard/data/latest.json` 또는 publish 시 생성된 `dashboard/data/index.json` + `dashboard/data/snapshots/*.json`만 읽어야 합니다.

## Dashboard Insight Acceptance

이 대시보드는 복잡한 인사이트 카드보다, 로밍팀이 가격 흐름과 `local / roaming` 차이를 빠르게 읽는 화면으로 유지해야 합니다. 화면을 볼 때 아래 질문에 바로 답할 수 있어야 합니다.

- 특정 국가에서 일수별 최저가 흐름이 어떻게 변하는가
- 같은 사이트 안에서 `local`과 `roaming` 중 어느 쪽이 더 비싸며 차이가 얼마나 나는가
- 원하는 국가/사이트/일수/용량 조건으로 상세 옵션을 바로 좁혀 볼 수 있는가
- 상세 확인이 필요할 때 어떤 원본 링크와 수집 시각을 봐야 하는가

### Verification Checklist

정적 대시보드 변경 후에는 아래를 확인합니다.

1. 첫 화면에 `Filters`, `Price Distribution`, `Local vs Roaming`, `Drill-down`만 보여야 한다.
2. 상단 hero에서 snapshot selector로 이전 publish 데이터를 선택할 수 있어야 하고, 도움말 버튼 클릭 시 각 메뉴 설명 modal이 열려야 한다.
3. `Price Distribution`에서 국가 선택과 표시 개수 선택으로 원하는 밴드만 볼 수 있어야 한다.
4. `Local vs Roaming` 섹션에서 사이트 선택과 표시 개수 선택으로 필요한 비교 카드만 볼 수 있어야 한다.
5. 가격 분포 밴드와 local / roaming 비교 카드 클릭이 하단 drill-down 필터와 연결되어야 한다.
6. 하단 테이블은 선택된 필터 조건에 맞는 상세 옵션과 원본 링크, 수집 시각을 유지해야 하고, 우측 상단에서 CSV 다운로드가 가능해야 한다.
7. subset crawl은 publish용 `dashboard/data/latest.json`, `dashboard/data/index.json`, `dashboard/data/snapshots/`를 덮어쓰지 않고, `--publish-dashboard`가 붙은 전체 실행에서만 갱신되어야 한다.

### Validation Commands

```powershell
python -m pytest -q
python -m app crawl --registry config/source_registry.yml --out data --site usimsa --site pindirect --site rokebi --site maaltalk --country JP
python -m app crawl --registry config/source_registry.yml --out data --publish-dashboard
python -m http.server 8000
```

브라우저에서 `http://127.0.0.1:8000/dashboard/` 접속 후 위 checklist를 수동 확인합니다. subset crawl은 publish용 dashboard latest를 덮어쓰지 않아야 합니다.
