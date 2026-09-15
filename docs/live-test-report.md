# MAKJI × 카페24 실제 연동 검증 기록

단계 번호는 교육가이드 v3 쪽 번호다. 토큰·Client Secret·Secret key는 이 문서와 캡처에 적지 않는다.

- 날짜/시각: 2026-09-__ __:__ (KST)
- 앱 주소: https://YOUR-APP.vercel.app
- 쇼핑몰: wildmental / shop_no 1
- 상품: 16 / P000000Q / 향기로운 허브 쌀치아바타 / 분류 81 / display_group 1
- 검증한 사람:

| 단계 | 기대 결과 | 실제 결과 | 통과 |
|---|---|---|---|
| 5-3 준비 상태 점검 | `/admin/setup` 필요(fail) 0, DB·관리자 OK |  | ☐ |
| 7-1 연결 | connected, 연결 상태 connected:true |  | ☐ |
| 7-2 상품 조회 | 상품명 일치, price 5200, inCategory true |  | ☐ |
| 7-3 기준값 저장 | created true → false |  | ☐ |
| 7-4 up 적용 | applied → already, 관리자 요약설명 변경 |  | ☐ |
| 7-5 down+할인 | 상품 페이지 판매가 4,940원 |  | ☐ |
| 7-6 복원 | 판매가 5,200원, 원래 요약설명 |  | ☐ |
| 8-2 공개 API | 200 + CORS wildmental, 17번 404 |  | ☐ |
| 8-3 위젯 설치 | installed → already |  | ☐ |
| 8-4 PC/모바일 | 카드 표시, 링크 utm_source=cafe24 |  | ☐ |
| 9-1 앱 링크 | 상품 16 상세 열림 |  | ☐ |
| 9-2 체험 화면 | /predict 제출·수정, /result 66.7% |  | ☐ |

## 자동 점검
- npm run db:setup: SETUP: ok=__ warn=__ fail=__ (비밀번호·접속 문자열은 적지 않음)
- npm test: __ passed / __ failed
- npm run build: 성공/실패

## 미실행·문제
- 
