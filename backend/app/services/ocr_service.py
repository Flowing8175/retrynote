import io
import logging
from dataclasses import dataclass

import httpx
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

KAKAO_OCR_URL = "https://dapi.kakao.com/v2/vision/text/ocr"
MAX_DIMENSION = 1024
MAX_BYTES = 1024 * 1024
JPEG_INITIAL_QUALITY = 90
JPEG_MIN_QUALITY = 40
JPEG_QUALITY_STEP = 10
NON_JPEG_MAX_PIXELS = 50_000_000


@dataclass
class OcrResult:
    text: str
    word_count: int


def _prepare_image(image_bytes: bytes) -> bytes:
    # Bypass Pillow's MAX_IMAGE_PIXELS guard (~178M px) — we downscale everything to
    # MAX_DIMENSION, so the guard just wedges files in processing. Memory is still
    # bounded because (a) JPEGs use draft() for reduced-scale decode, and (b) non-JPEGs
    # are rejected above NON_JPEG_MAX_PIXELS before decode.
    previous_bomb_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = None
    try:
        try:
            img = Image.open(io.BytesIO(image_bytes))
        except Image.UnidentifiedImageError as e:
            logger.warning("OCR rejected unreadable image: %s", e)
            raise RuntimeError("image_unreadable") from e

        if img.format == "JPEG":
            # draft() picks the smallest DCT scale (1/1…1/8) covering the target.
            # No-op on non-JPEG formats.
            img.draft("RGB", (MAX_DIMENSION, MAX_DIMENSION))
        else:
            w, h = img.size
            if w * h > NON_JPEG_MAX_PIXELS:
                logger.warning(
                    "OCR rejected oversized %s image: %dx%d",
                    img.format,
                    w,
                    h,
                )
                raise RuntimeError("image_too_large")

        img.load()
    finally:
        Image.MAX_IMAGE_PIXELS = previous_bomb_limit

    if img.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        ratio = MAX_DIMENSION / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)

    quality = JPEG_INITIAL_QUALITY
    while quality >= JPEG_MIN_QUALITY:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        if buf.tell() <= MAX_BYTES:
            return buf.getvalue()
        quality -= JPEG_QUALITY_STEP

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_MIN_QUALITY)
    return buf.getvalue()


async def extract_text_from_image(image_bytes: bytes) -> OcrResult:
    api_key = settings.kakao_rest_api_key
    if not api_key:
        raise RuntimeError("KAKAO_REST_API_KEY is not configured")

    jpeg_data = _prepare_image(image_bytes)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            KAKAO_OCR_URL,
            headers={"Authorization": f"KakaoAK {api_key}"},
            files={"image": ("image.jpg", jpeg_data, "image/jpeg")},
        )

    if resp.status_code == 401:
        raise RuntimeError("Kakao OCR: invalid API key")
    if resp.status_code == 429:
        raise RuntimeError("Kakao OCR: rate limit exceeded")
    resp.raise_for_status()

    data = resp.json()
    results = data.get("result", [])

    if not results:
        return OcrResult(text="", word_count=0)

    words: list[str] = []
    for item in results:
        recognition = item.get("recognition_words", [])
        words.extend(recognition)

    text = " ".join(words)
    return OcrResult(text=text, word_count=len(words))
