export default function WalkPrivacy() {
  return <main style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
    <h1>WALK 위치 저장 안내</h1>
    <p>길안내에 필요한 현재 위치는 기기에서 이용합니다. 위치 저장에 동의하지 않아도 길안내를 사용할 수 있습니다.</p>
    <p>별도 동의한 경우에만 보행 시작·진행·재탐색·도착 시 위도·경도와 정확도를 서비스 개선용으로 저장합니다. 보관 기간은 1년입니다. 위치 저장 동의 화면에서 언제든 거부로 변경해 이후 전송을 중단할 수 있습니다.</p>
    <p>분석에는 방문자 별칭·탭 세션·보행 식별자, 이벤트 시각과 언어를 이용합니다. 검색어 원문과 IP는 저장하지 않습니다. 관리자의 CSV 내보내기에는 정밀좌표를 포함하지 않습니다.</p>
    <p lang="en">Navigation works without location storage consent. Only after you agree, walking events may store latitude, longitude and accuracy for service improvement for one year. Disagree at any time to stop future transmission. Admin CSV exports exclude precise coordinates.</p>
    <p><a href="/worldcup-market/privacy">운영자 정보·개인정보 문의</a></p>
  </main>;
}
