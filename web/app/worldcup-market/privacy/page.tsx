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
      <p>별도 「보행 GPS 이동기록 저장」 동의 시에만 도보 안내 중 약 30초 경과 또는 50m 이동 시점에 위치 좌표·정확도·방문 점포 ID·보행 시도 식별자를 함께 기록하여 이동 경로를 분석합니다. 기존 「내 위치」 저장 동의만으로 연속 GPS 이동기록 수집을 허용하지 않습니다.</p>
      <h2>2. 수집 목적</h2>
      <p>시장 지도·길 안내의 개선과 시장 내 보행 경로·경로 이탈 등 이용 통계 분석에만 사용하며, AI하우스 등 외부 협력사에 개별 GPS 이동기록을 제공하지 않습니다.</p>
      <h2>3. 보관 기간 및 파기</h2>
      <p>수집한 위치 정보는 수집일로부터 1년간 보관한 뒤 자동으로 삭제합니다.</p>
      <h2>4. 동의 거부</h2>
      <p>위치 정보 저장 동의 없이도 지도와 길 안내를 이용할 수 있습니다. 보행 이동기록 저장 동의는 길찾기 화면에서 별도로 선택·철회할 수 있으며, 철회하면 이후 GPS 이동기록 저장을 중단합니다. 이전에 저장한 기록은 아래 연락처로 삭제를 요청할 수 있습니다.</p>
      <h2>5. 운영자 및 개인정보 보호책임자</h2>
      <ul>
        <li>운영자·개인정보 보호책임자: 박다솜 (PARK DASOM)</li>
        <li>이메일: <a href="mailto:ekth3691@gmail.com">ekth3691@gmail.com</a></li>
        <li>주소: 서울 마포구 어울마당로3길 11</li>
      </ul>
      <p>개인정보 관련 문의·열람·삭제 요청은 위 이메일로 연락해 주세요.</p>
      <hr />
      <h2 lang="en">Privacy Policy (English)</h2>
      <p lang="en">Only with a separate walking-record consent do we store GPS coordinates, accuracy, store and navigation attempt IDs approximately every 30 seconds or 50 meters during navigation; one-off location consent does not authorize this continuous recording. These records are for route analysis and service improvement, not sharing with AIHows or other third parties. No IP address is stored. Location data is deleted automatically 1 year after collection. You can use navigation without recording and withdraw consent at any time to stop future location samples; request deletion of previously stored records through the contact below. Operator and privacy officer: PARK DASOM, ekth3691@gmail.com, 11 Eoulmadang-ro 3-gil, Mapo-gu, Seoul.</p>
    </main>
  );
}
