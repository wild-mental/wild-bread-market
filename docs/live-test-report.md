# MAKJI × 카페24 실제 연동 검증 기록

- 날짜/시각: 2026-09-__ __:__ (KST)
- 앱 주소: https://YOUR-APP.vercel.app
- 쇼핑몰: wildmental / shop_no 1
- 상품: 16 / P000000Q / 향기로운 허브 쌀치아바타 / 분류 81 / display_group 1
- 검증한 사람:

| 단계 | 기대 결과 | 실제 결과 | 통과 |
|---|---|---|---|
| 6-1 연결 | connected, 연결 상태 connected:true |  | ☐ |
| 6-2 상품 조회 | 상품명 일치, price 5200, inCategory true |  | ☐ |
| 6-3 기준값 저장 | created true → false |  | ☐ |
| 6-4 up 적용 | applied → already, 관리자 요약설명 변경 |  | ☐ |
| 6-5 down+할인 | 상품 페이지 판매가 4,940원 |  | ☐ |
| 6-6 복원 | 판매가 5,200원, 원래 요약설명 |  | ☐ |
| 7-2 공개 API | 200 + CORS wildmental, 17번 404 |  | ☐ |
| 7-3 위젯 설치 | installed → already |  | ☐ |
| 7-4 PC/모바일 | 카드 표시, 링크 utm_source=cafe24 |  | ☐ |
| 8-1 앱 링크 | 상품 16 상세 열림 |  | ☐ |

## 자동 테스트
- npm test: __ passed / __ failed
- npm run build: 성공/실패

## 미실행·문제
- 
