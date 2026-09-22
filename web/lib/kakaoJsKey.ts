/**
 * Kakao Maps JS SDK(로드뷰)용 JavaScript 키.
 *
 * REST API 키·네이티브 앱 키는 읽지 않는다. 로드뷰는 브라우저 SDK 이므로
 * `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` 만 쓴다. 키 값은 카카오가 허용 도메인으로
 * 묶는 공개 앱키라 번들에 실리는 것이 정상이다. 값은 로그·화면에 출력하지 않는다.
 */
export function kakaoJavascriptKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim();
  return key ? key : null;
}
