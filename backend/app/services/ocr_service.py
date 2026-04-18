import base64
import io
import logging
from dataclasses import dataclass

import httpx
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"
LANGUAGE_HINTS = ["ko", "en"]
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
    api_key = settings.google_vision_api_key
    if not api_key:
        raise RuntimeError("GOOGLE_VISION_API_KEY is not configured")

    jpeg_data = _prepare_image(image_bytes)
    image_b64 = base64.b64encode(jpeg_data).decode("ascii")

    request_body = {
        "requests": [
            {
                "image": {"content": image_b64},
                "features": [{"type": "TEXT_DETECTION"}],
                "imageContext": {"languageHints": LANGUAGE_HINTS},
            }
        ]
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GOOGLE_VISION_URL,
            params={"key": api_key},
            json=request_body,
        )

    if resp.status_code == 401:
        raise RuntimeError("Google Vision: invalid API key")
    if resp.status_code == 403:
        raise RuntimeError("Google Vision: API key not authorized for Vision API")
    if resp.status_code == 429:
        raise RuntimeError("Google Vision: rate limit exceeded")
    resp.raise_for_status()

    data = resp.json()
    responses = data.get("responses", [])
    if not responses:
        return OcrResult(text="", word_count=0)

    first = responses[0]

    # Per-image error envelope (200 OK with embedded error payload).
    if "error" in first:
        err = first["error"]
        msg = err.get("message", "unknown")
        raise RuntimeError(f"Google Vision: {msg}")

    annotations = first.get("textAnnotations", [])
    if not annotations:
        return OcrResult(text="", word_count=0)

    # Vision returns the full transcript as the first textAnnotation; subsequent
    # entries are per-word with bounding boxes, which we use only for word_count.
    full_text = annotations[0].get("description", "")
    word_count = max(len(annotations) - 1, 0)

    return OcrResult(text=full_text, word_count=word_count)
