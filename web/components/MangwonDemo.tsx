"use client";

import { useMemo, useState } from "react";
import RoadviewViewer from "./RoadviewViewer";
import { GoogleStreetViewAdapter } from "../lib/roadview";
import { MANGWON_STORES, type MangwonStore, type StoreProduct } from "../lib/mangwonStores";
import type { Coordinate } from "../lib/types";

interface MangwonDemoProps {
  readonly onStartWalking: (target: { name: string; coordinate: Coordinate }) => void;
}

const MAP_PADDING_PERCENT = 10;

function mapPoint(store: MangwonStore): { left: string; top: string } {
  const latitudes = MANGWON_STORES.map((item) => item.storeLocation.latitude);
  const longitudes = MANGWON_STORES.map((item) => item.storeLocation.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);
  const left = MAP_PADDING_PERCENT + ((store.storeLocation.longitude - minLon) / lonSpan) * (100 - MAP_PADDING_PERCENT * 2);
  const top = MAP_PADDING_PERCENT + ((maxLat - store.storeLocation.latitude) / latSpan) * (100 - MAP_PADDING_PERCENT * 2);
  return { left: `${left}%`, top: `${top}%` };
}

function streetViewLabel(store: MangwonStore): string {
  switch (store.streetView.quality) {
    case "CORRIDOR_VISIBLE":
      return "Google Street View 구간 확인됨";
    case "AVAILABLE_BUT_NOT_USEFUL":
      return "주변 pano는 있으나 점포 확인에는 부족";
    case "EXACT_FRONTAGE":
      return "점포 전면 확인됨";
    case "NEARBY_VISIBLE":
      return "인접 구간 확인됨";
    default:
      return "Google Street View 확인 필요";
  }
}

function unknownLabel(value: string | null): string {
  return value ?? "확인 중";
}

function priceLabel(product: StoreProduct): string {
  if (product.priceKrw !== null) return `${product.priceKrw.toLocaleString("ko-KR")}원`;
  return product.priceLabel ?? "가격 확인 필요";
}

function purchaseMethodLabel(store: MangwonStore): string {
  const methods: string[] = [];
  if (store.purchaseInfo.takeout === true) methods.push("포장");
  if (store.purchaseInfo.dineIn === true) methods.push("매장 식사");
  return methods.length > 0 ? methods.join(" · ") : "구매 방식 확인 필요";
}

function productSummary(store: MangwonStore): string {
  if (store.products.length === 0) return "확인 중";
  const names = store.products.slice(0, 3).map((item) => item.nameKo).join(", ");
  return store.products.length > 3 ? `${names} 외 ${store.products.length - 3}개` : names;
}

export default function MangwonDemo({ onStartWalking }: MangwonDemoProps) {
  const [selectedId, setSelectedId] = useState(MANGWON_STORES[0]?.id ?? "");
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const googleProvider = useMemo(() => new GoogleStreetViewAdapter(), []);
  const selected = MANGWON_STORES.find((store) => store.id === selectedId) ?? MANGWON_STORES[0];

  if (!selected) return null;

  return (
    <section className="mangwon-demo" aria-labelledby="mangwon-demo-title">
      <div className="mangwon-demo-header">
        <div>
          <p className="mangwon-kicker">REAL DATA DEMO</p>
          <h2 id="mangwon-demo-title">망원시장 리얼데이터</h2>
          <p>훈훈호떡에서 우이락 망원본점까지, 실제 점포 좌표로 확인합니다.</p>
        </div>
        <span className="mangwon-status">데이터 검증 중</span>
      </div>

      <div className="mangwon-map" aria-label="망원시장 실제 점포 좌표 지도">
        <div className="mangwon-map-road mangwon-map-road-a" aria-hidden="true" />
        <div className="mangwon-map-road mangwon-map-road-b" aria-hidden="true" />
        {MANGWON_STORES.map((store) => {
          const point = mapPoint(store);
          const isSelected = store.id === selected.id;
          return (
            <button
              key={store.id}
              type="button"
              className={`mangwon-marker${isSelected ? " is-selected" : ""}`}
              style={point}
              onClick={() => {
                setSelectedId(store.id);
                setStreetViewOpen(false);
              }}
              aria-label={`${store.nameKo} 지도에서 선택`}
              aria-pressed={isSelected}
            >
              <span>{MANGWON_STORES.indexOf(store) + 1}</span>
            </button>
          );
        })}
        <div className="mangwon-map-caption">
          <strong>망원시장 구간</strong>
          <span>표시 위치는 Google 대표점 좌표입니다. 출입구·통로 순서는 현장 확인 전입니다.</span>
        </div>
      </div>

      <div className="mangwon-store-list" data-testid="mangwon-store-list" aria-label="망원시장 Demo 점포 목록">
        {MANGWON_STORES.map((store, index) => (
          <div key={store.id}>
            <button
              type="button"
              className={`mangwon-store-card${store.id === selected.id ? " is-selected" : ""}`}
              onClick={() => {
                setSelectedId(store.id);
                setStreetViewOpen(false);
              }}
              aria-pressed={store.id === selected.id}
            >
              <span className="mangwon-store-number">{index + 1}</span>
              <span className="mangwon-store-card-copy">
                <strong>{store.nameKo}</strong>
                <span>{store.category}</span>
              </span>
              <span className="mangwon-store-card-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        ))}
      </div>

      <article className="mangwon-detail" aria-labelledby="mangwon-selected-title">
        <div className="mangwon-detail-heading">
          <div>
            <p className="mangwon-kicker">SELECTED STORE</p>
            <h3 id="mangwon-selected-title">{selected.nameKo}</h3>
            <p>{selected.category} · {selected.address}</p>
          </div>
          <span className={`mangwon-quality quality-${selected.streetView.quality.toLowerCase()}`}>
            {streetViewLabel(selected)}
          </span>
        </div>

        <dl className="mangwon-facts">
          <div>
            <dt>매장 좌표</dt>
            <dd>{selected.storeLocation.latitude.toFixed(7)}, {selected.storeLocation.longitude.toFixed(7)}</dd>
          </div>
          <div>
            <dt>도보 목적지</dt>
            <dd>대표점 좌표 · 출입구 현장확인 필요</dd>
          </div>
          <div>
            <dt>영업시간</dt>
            <dd>{unknownLabel(selected.businessHours)}</dd>
          </div>
          <div>
            <dt>메뉴·가격</dt>
            <dd>{productSummary(selected)}</dd>
          </div>
          <div>
            <dt>구매 방식</dt>
            <dd>{purchaseMethodLabel(selected)}</dd>
          </div>
          <div>
            <dt>전화</dt>
            <dd>{selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : "확인 중"}</dd>
          </div>
        </dl>

        <p className="mangwon-disclosure">{selected.verification.memo}</p>

        <div className="mangwon-purchase-box" data-testid="mangwon-purchase-info">
          <div className="mangwon-purchase-heading">
            <div>
              <h4>구매 가능한 메뉴</h4>
              <p>공개 메뉴 정보 기준 · 가격과 재고는 현장에서 다시 확인</p>
            </div>
            <span>{selected.products.length}개</span>
          </div>
          {selected.products.length > 0 ? (
            <div className="mangwon-product-list">
              {selected.products.map((item) => (
                <div className="mangwon-product-item" key={`${selected.id}-${item.nameKo}`}>
                  <div>
                    <strong>{item.nameKo}</strong>
                    {item.descriptionKo ? <small>{item.descriptionKo}</small> : null}
                  </div>
                  <span>{priceLabel(item)}</span>
                  {item.priceLabel && item.priceKrw !== null ? <small className="mangwon-price-note">{item.priceLabel}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mangwon-empty-products">메뉴 정보를 확인 중입니다.</p>
          )}
          {selected.purchaseInfo.orderNote ? <p className="mangwon-order-note">주문 참고: {selected.purchaseInfo.orderNote}</p> : null}
        </div>

        {streetViewOpen ? (
          <RoadviewViewer
            destination={selected.streetViewLocation ?? selected.navigationTarget}
            destinationName={selected.nameKo}
            approachOrigin={null}
            locale="ko"
            provider={googleProvider}
            onClose={() => setStreetViewOpen(false)}
          />
        ) : null}

        <div className="mangwon-actions">
          <button type="button" className="mangwon-secondary" onClick={() => setStreetViewOpen((open) => !open)}>
            {streetViewOpen ? "Street View 닫기" : "Google Street View로 현장 확인"}
          </button>
          <button
            type="button"
            className="mangwon-primary"
            onClick={() => onStartWalking({ name: selected.nameKo, coordinate: selected.navigationTarget })}
          >
            여기로 가기
          </button>
        </div>
      </article>
    </section>
  );
}
