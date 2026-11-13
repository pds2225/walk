import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보 처리방침 · Privacy Policy", robots: { index: false } };

const S = { maxWidth: 720, margin: "0 auto", padding: "24px 18px 48px", lineHeight: 1.7, color: "#1f2a33", fontSize: 16 } as const;

export default function WorldCupMarketPrivacyPage() {
  return (
    <main style={S}>
      <h1>개인정보 처리방침</h1>
      <p>망원 월드컵시장 안내 서비스(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 아래와 같이 처리합니다.</p>
      <h2>1. 수집 항목</h2>
      <p>이용자가 위치 정보 수집에 동의한 경우에 한해 위치 좌표(위도·경도) 및 위치 정확도 정보(고정밀 GPS 좌표 포함 가능)를 수집합니다. IP 주소는 저장하지 않습니다.</p>
      <h2>2. 수집 목적</h2>
      <p>시장 지도와 길 안내 등 서비스 개선을 위한 이용 통계 분석에만 사용합니다.</p>
      <h2>3. 보관 기간 및 파기</h2>
      <p>수집한 위치 정보는 수집일로부터 1년간 보관한 뒤 자동으로 삭제합니다.</p>
      <h2>4. 선택적 제3자 제공</h2>
      <p>AIHows 월드컵시장 PoC 방문·이동 분석을 위한 개인별 위치기록 제공은 별도 선택 동의를 받은 신규 기록에 한합니다. 제공받는 법인의 정확한 명칭, 항목(위치 좌표·정확도·기록 시각·내부 식별자), 목적 및 보유기간은 별도 동의 화면에서 고지합니다. 제공받은 날부터 최대 1년 이내, 목적 달성 또는 철회 등 사유 발생 시 관련 법령에 따라 더 이른 시점에 파기·제공 중단합니다. 기존 수집 동의만으로 외부 제공하지 않습니다.</p>
      <h2>5. 동의 거부</h2>
      <p>위치 정보 수집에 동의하지 않으셔도 지도는 그대로 이용하실 수 있으며, 이 경우 위치 정보는 저장되지 않습니다.</p>
      <h2>6. 운영자 및 개인정보 보호책임자</h2>
      <ul>
        <li>운영자·개인정보 보호책임자: 박다솜 (PARK DASOM)</li>
        <li>이메일: <a href="mailto:ekth3691@gmail.com">ekth3691@gmail.com</a></li>
        <li>주소: 서울 마포구 어울마당로3길 11</li>
      </ul>
      <p>개인정보 관련 문의·열람·삭제 요청은 위 이메일로 연락해 주세요.</p>
      <hr />
      <h2 lang="en">Privacy Policy (English)</h2>
      <p lang="en">Only if you agree, we collect your location coordinates (latitude and longitude) and accuracy (which may include precise GPS coordinates) to improve the service. We do not store your IP address. Location data is deleted automatically 1 year after collection. If you decline, you can still use the map and no location is stored. Operator and privacy officer: PARK DASOM, ekth3691@gmail.com, 11 Eoulmadang-ro 3-gil, Mapo-gu, Seoul.</p>
    </main>
  );
}
