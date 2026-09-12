"""landmark_photo.py — JPEG/PNG 위치 메타데이터 제거."""

import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from landmark_photo import strip_image_location_metadata


def _minimal_jpeg_with_exif() -> bytes:
    # SOI + APP1(Exif) + SOS + EOI 형태의 최소 JPEG
    exif_payload = b"Exif\x00\x00" + b"GPSFAKE"
    app1 = b"\xff\xe1" + struct.pack(">H", len(exif_payload) + 2) + exif_payload
    # APP0 JFIF kept
    app0 = (
        b"\xff\xe0"
        + struct.pack(">H", 16)
        + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    )
    sos = b"\xff\xda" + struct.pack(">H", 2) + b"\xff\xd9"
    return b"\xff\xd8" + app1 + app0 + sos


def _minimal_png_with_exif() -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = chunk(
        b"IHDR",
        struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0),
    )
    exif = chunk(b"eXIf", b"GPSFAKE")
    idat = chunk(b"IDAT", zlib.compress(b"\x00\x00\x00"))
    iend = chunk(b"IEND", b"")
    return signature + ihdr + exif + idat + iend


def test_jpeg_exif_app1_is_removed():
    original = _minimal_jpeg_with_exif()
    assert b"Exif" in original
    cleaned, changed = strip_image_location_metadata(original, ".jpg")
    assert changed is True
    assert b"Exif" not in cleaned
    assert cleaned.startswith(b"\xff\xd8")
    assert b"JFIF" in cleaned


def test_png_exif_chunk_is_removed():
    original = _minimal_png_with_exif()
    assert b"eXIf" in original
    cleaned, changed = strip_image_location_metadata(original, ".png")
    assert changed is True
    assert b"eXIf" not in cleaned
    assert cleaned.startswith(b"\x89PNG")


def test_webp_is_unchanged():
    data = b"RIFF....WEBP"
    cleaned, changed = strip_image_location_metadata(data, ".webp")
    assert cleaned == data
    assert changed is False
