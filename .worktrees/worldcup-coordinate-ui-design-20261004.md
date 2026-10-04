# Existing UI partial implementation plan/design

The user already fixed the scope. Preserve the current worldcup route, four-language selector, component tree, typography, CSS tokens and responsive behavior. Home and its styles are out of scope.

1. Store details show the existing map/walking controls only according to actual storeLocation/navigationTarget. Unknown location remains null, disabled and 미확인.
2. Street View requires real metadata availability and a recorded pano or location plus runtime Google Embed API key. Use streetViewLocation from metadata where available, otherwise storeLocation. Never infer exact storefront: metadata proves nearby panorama availability only.
3. Fallback copy has three truthful states: map and walking available; map available but walking unavailable; both unavailable/미확인. If walking available but map absent (synthetic or future data), do not claim a map is available. Keep four locales in the existing WorldCupMarketUiText block.
4. Store details and/or nearby view explain when multiple store IDs share exactly the same coordinate. Display a compact note and count; do not scatter or mutate marker positions. List selection must still select each store even when markers overlap.
5. No navigation/geolocation API changes, no new component architecture, no new dependencies. Use current map/route contract. Unit tests cover unknown, located, missing pano/key and shared coordinate availability. Parent covers data integrity, provenance and market bounds.

Data contract for VerifiedLocation: existing Coordinate (latitude/longitude), source, verifiedAt, verificationStatus plus required coordSource/evidenceAddress/sourceUrl/geocodedAddress. Parent owns the data implementation.

Deliver partial implementation and related tests only. Logs and QA notes remain outside clone. Parent runs full commands and actual Chrome pixels.

## Verified Naver panorama extension

Local Naver SDK credentials authenticated and returned live pano_status OK. Use existing NaverPanoramaAdapter for provider NAVER in a market-only viewer; do not change shared provider/home code. Parent records actual panorama provider, panoId, getLocation/getPosition capture coordinates/date, source and <=50m distance. Google paths retain their current behavior. A building address coordinate does not prove exact storefront visibility. Show provider NAVER and nearby panorama caption. Use recorded streetViewLocation for SDK lookup, cleanup sessions on unmount and fall back truthfully for missing key/network/pano mismatch. Fixed current CSS tokens and four-language UI remain intact. Tests should mock the existing adapter contract, not real credentials. A new market-only viewer helper/component is permitted for separating provider-specific hooks from the existing fallback/embed wrapper.
