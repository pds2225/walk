/** 한국 전화번호: 02 / 지역번호 0xx / 070 / 휴대폰 010·011·016·017·018·019. */
export const KOREAN_PHONE_PATTERN = /^(?:02-\d{3,4}|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4]|70)-\d{3,4}|01[016789]-\d{3,4})-\d{4}$/;

export interface StorePhoneLink {
  /** 화면에 그대로 보여줄 표기(예: "02-323-0906~7"). */
  readonly label: string;
  /** 숫자만 남긴 tel: 링크(예: "tel:023230906"). */
  readonly href: string;
}

/**
 * 블로그 표기("02-332-6625 / 010-5354-8682", "02-323-0906~7")를 번호별 링크로 나눈다.
 * "~7" 같은 연번 표기는 화면에는 남기고 링크는 첫 번호로 건다. 형식이 맞지 않는 번호는 버린다.
 */
export function parseStorePhones(phone: string | null): readonly StorePhoneLink[] {
  if (!phone) return [];
  return phone.split("/").flatMap((part) => {
    const label = part.trim();
    const number = label.replace(/~\d+$/, "");
    if (!KOREAN_PHONE_PATTERN.test(number)) return [];
    return [{ label, href: `tel:${number.replace(/\D/g, "")}` }];
  });
}
