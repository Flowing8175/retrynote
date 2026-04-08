import asyncio
import logging
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from app.config import settings

logger = logging.getLogger(__name__)

# Local filesystem fallback root (used when B2 is not configured)
_LOCAL_ROOT = Path(settings.upload_dir)


def _b2_configured() -> bool:
    return bool(
        settings.b2_endpoint_url and settings.b2_key_id and settings.b2_application_key
    )


def _make_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.b2_endpoint_url,
        aws_access_key_id=settings.b2_key_id,
        aws_secret_access_key=settings.b2_application_key,
    )


async def upload_file(
    key: str, data: bytes, content_type: str = "application/octet-stream"
) -> None:
    if _b2_configured():

        def _upload():
            client = _make_client()
            client.put_object(
                Bucket=settings.b2_bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type,
            )

        await asyncio.to_thread(_upload)
    else:
        dest = _LOCAL_ROOT / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(dest.write_bytes, data)


async def download_file(key: str) -> bytes:
    if _b2_configured():

        def _download():
            client = _make_client()
            response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
            return response["Body"].read()

        return await asyncio.to_thread(_download)
    else:
        dest = _LOCAL_ROOT / key
        return await asyncio.to_thread(dest.read_bytes)


async def delete_file(key: str) -> None:
    if _b2_configured():

        def _delete():
            client = _make_client()
            client.delete_object(Bucket=settings.b2_bucket_name, Key=key)

        try:
            await asyncio.to_thread(_delete)
        except ClientError as e:
            logger.warning("B2 delete failed for key %s: %s", key, e)
    else:
        dest = _LOCAL_ROOT / key
        try:
            await asyncio.to_thread(dest.unlink)
        except FileNotFoundError:
            logger.warning("Local delete: file not found for key %s", key)


def public_url(key: str) -> str:
    if _b2_configured():
        return f"{settings.b2_endpoint_url}/{settings.b2_bucket_name}/{key}"
    return f"/files/{key}/download"
