import asyncio
import io
import logging
import boto3
from botocore.exceptions import ClientError
from app.config import settings

logger = logging.getLogger(__name__)


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
    def _upload():
        client = _make_client()
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    await asyncio.to_thread(_upload)


async def download_file(key: str) -> bytes:
    def _download():
        client = _make_client()
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=key)
        return response["Body"].read()

    return await asyncio.to_thread(_download)


async def delete_file(key: str) -> None:
    def _delete():
        client = _make_client()
        client.delete_object(Bucket=settings.b2_bucket_name, Key=key)

    try:
        await asyncio.to_thread(_delete)
    except ClientError as e:
        logger.warning("B2 delete failed for key %s: %s", key, e)


def public_url(key: str) -> str:
    return f"{settings.b2_endpoint_url}/{settings.b2_bucket_name}/{key}"
