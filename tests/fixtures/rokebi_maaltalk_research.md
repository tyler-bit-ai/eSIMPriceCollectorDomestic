## Rokebi

- 대상 페이지는 Next App Router 기반이며 `self.__next_f.push(...)` stream이 HTML 안에 포함된다.
- 일본/베트남/필리핀/미국 URL 모두 `self.__next_f.push`와 `prodUuid` 문자열을 포함해 동일한 embedded payload 계열로 보인다.
- 일본 roaming/local URL의 raw HTML은 동일한 검색 결과 화면 구조를 포함하고, 목록 카드 안에서 `일본`과 `일본(로컬망)`이 함께 보인다.
- HTML 안에 `prodUuid`, `duration`, `localNet`, `allday`, `daily`, `volume` 등 상세 옵션 렌더링에 필요한 i18n/payload 흔적이 존재한다.
- 브라우저 클릭만으로는 별도 XHR이 잡히지 않았고, 목록 카드도 직접 `href`를 노출하지 않았다. 우선 전략은 HTML 내 RSC stream/embedded payload 파싱이다.
- fixture:
  - `rokebi_japan_roaming.html`
  - `rokebi_japan_local.html`

## Maaltalk

- 상품 상세 HTML에 1차 옵션 `select[name="optionNo_0"]`가 직접 렌더링된다.
- `gd_goods_view.js`는 `../goods/goods_ps.php`로 `mode=option_select` POST를 보내 종속 옵션과 가격을 계산한다.
- direct POST는 단독 재현 시 `500`이 났지만, 브라우저 세션 컨텍스트에서는 정상 응답했다.
- 일본 상품 `goodsNo=1000000265`에서 확인한 실제 흐름:
  - 1차 선택: `mode=option_select&optionVal[]=RD328.일본Softbank 매일 1GB&optionKey=0...`
  - 응답: `nextOption`, `optionPrice[]`, `nextKey=1`
  - 2차 선택: `mode=option_select&optionVal[]=RD328.일본Softbank 매일 1GB&optionVal[]=RD328.일본Softbank_02일&optionKey=1...`
  - 응답: `optionSno`, 최종 `optionPrice[0]`
- 일본 상품명은 `로컬망`을 포함하지만, 최종 `network_type` 판정은 source URL 또는 option text 기준 규칙으로 다시 검증해야 한다.
- 다른 베트남/필리핀/미국 URL도 모두 `goods_ps.php`, `optionCntInput`, `optionNo_0`를 포함해 동일한 Godomall 옵션 구조를 사용한다.
- fixture:
  - `maaltalk_japan.html`
  - `maaltalk_japan_option_select_step1.json`
  - `maaltalk_japan_option_select_step2.json`
  - `maaltalk_japan_option_select_trace.json`
