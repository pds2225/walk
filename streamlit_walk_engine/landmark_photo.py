"""랜드마크 사진에서 위치 메타데이터를 제거한다.

Pillow 없이 JPEG APP1 Exif·PNG eXIf 청크만 제거한다. WEBP는 원본을 유지하되
호출부가 경고할 수 있게 변경 여부를 반환한다.
"""

from __future__ import annotations

from pathlib import Path


def strip_image_location_metadata(data: bytes, suffix: str) -> tuple[bytes, bool]:
    """위치 메타데이터를 제거한 바이트와 변경 여부를 반환한다."""
    normalized = suffix.lower() if suffix.startswith(".") else f".{suffix.lower()}"
    if normalized in {".jpg", ".jpeg"}:
        cleaned = _strip_jpeg_exif(data)
        return cleaned, cleaned != data
    if normalized == ".png":
        cleaned = _strip_png_exif(data)
        return cleaned, cleaned != data
    return data, False


def strip_image_file(path: Path) -> bool:
    """파일 경로의 위치 메타데이터를 제자리 제거하고 변경 여부를 반환한다."""
    data = path.read_bytes()
    cleaned, changed = strip_image_location_metadata(data, path.suffix)
    if changed:
        path.write_bytes(cleaned)
    return changed


def _strip_jpeg_exif(data: bytes) -> bytes:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return data
    output = bytearray(b"\xff\xd8")
    index = 2
    length = len(data)
    while index < length:
        if data[index] != 0xFF:
            output.extend(data[index:])
            break
        while index < length and data[index] == 0xFF:
            index += 1
        if index >= length:
            break
        marker = data[index]
        index += 1
        if marker == 0xDA:  # Start of Scan — remainder is image data
            output.append(0xFF)
            output.append(marker)
            output.extend(data[index:])
            break
        if marker == 0xD9:  # EOI
            output.append(0xFF)
            output.append(marker)
            break
        if marker in {0x01} or 0xD0 <= marker <= 0xD7:
            output.append(0xFF)
            output.append(marker)
            continue
        if index + 2 > length:
            break
        segment_length = int.from_bytes(data[index : index + 2], "big")
        if segment_length < 2 or index + segment_length > length:
            output.extend(data[index - 2 :])
            break
        segment = data[index : index + segment_length]
        index += segment_length
        # APP1 Exif (and XMP often in APP1) — drop Exif GPS/orientation block
        if marker == 0xE1 and len(segment) >= 6 and segment[2:6] == b"Exif":
            continue
        output.append(0xFF)
        output.append(marker)
        output.extend(segment)
    return bytes(output)


def _strip_png_exif(data: bytes) -> bytes:
    if len(data) < 8 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return data
    output = bytearray(data[:8])
    index = 8
    length = len(data)
    changed = False
    while index + 8 <= length:
        chunk_len = int.from_bytes(data[index : index + 4], "big")
        chunk_type = data[index + 4 : index + 8]
        chunk_end = index + 12 + chunk_len
        if chunk_end > length:
            output.extend(data[index:])
            break
        if chunk_type == b"eXIf":
            changed = True
            index = chunk_end
            continue
        output.extend(data[index:chunk_end])
        index = chunk_end
        if chunk_type == b"IEND":
            break
    return bytes(output) if changed else data
