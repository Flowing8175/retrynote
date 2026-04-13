import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone

import magic
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    UploadFile,
    File as FastAPIFile,
    Form,
    Query,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings, Settings
from app.models.file import File, FileSourceType, FileStatus, Folder
from app.models.user import User
from app.models.search import Job
from app.schemas.file import (
    FileUploadResponse,
    FileDetail,
    FileListResponse,
    FileRetryResponse,
    FolderDetail,
)
from app.middleware.auth import get_current_user, get_impersonation_context
from app.middleware.rate_limit_pro import pro_rate_limit
from app.workers.celery_app import dispatch_task
from app.utils.db_helpers import paginate

router = APIRouter()
logger = logging.getLogger(__name__)


class RenameFileRequest(BaseModel):
    original_filename: str


class MoveFileRequest(BaseModel):
    folder_id: str | None = None


class CreateFolderRequest(BaseModel):
    name: str


class RenameFolderRequest(BaseModel):
    name: str


class FolderListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    folders: list[FolderDetail]


async def get_owned_file(file_id: str, db: AsyncSession, user: User) -> File:
    result = await db.execute(
        select(File).where(File.id == file_id, File.deleted_at.is_(None))
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return file


async def get_owned_folder(folder_id: str, db: AsyncSession, user: User) -> Folder:
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == user.id)
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


async def _read_and_validate_upload(
    file: UploadFile | None,
    manual_text: str | None,
    source_url: str | None,
    settings_ref: Settings,
) -> tuple[bytes | None, str | None, str | None, FileSourceType, str | None, int]:
    """Read and validate the upload input.

    Returns: (content_bytes, original_filename, file_type, source_type, content_hash, file_size)
    Raises HTTPException on validation failure.
    """
    if file:
        original_filename = file.filename
        ext = os.path.splitext(file.filename or "")[1].lstrip(".").lower()

        if ext not in settings_ref.allowed_file_types.split(","):
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

        max_size = settings_ref.max_upload_size_mb * 1024 * 1024
        chunks = []
        total_size = 0
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {settings_ref.max_upload_size_mb}MB.",
                )
            chunks.append(chunk)
        content = b"".join(chunks)

        detected_mime = magic.from_buffer(content[:2048], mime=True)
        allowed_mimes = {
            "pdf": ["application/pdf"],
            "docx": [
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/zip",
            ],
            "pptx": [
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "application/zip",
            ],
            "txt": ["text/plain"],
            "md": ["text/plain", "text/markdown"],
            "png": ["image/png"],
            "jpg": ["image/jpeg"],
            "jpeg": ["image/jpeg"],
        }
        expected_mimes = allowed_mimes.get(ext, [])
        if expected_mimes and detected_mime not in expected_mimes:
            raise HTTPException(
                status_code=400, detail=f"File content does not match extension .{ext}"
            )

        content_hash = hashlib.sha256(content).hexdigest()
        return (
            content,
            original_filename,
            ext,
            FileSourceType.upload,
            content_hash,
            total_size,
        )

    elif manual_text:
        return (
            None,
            None,
            "txt",
            FileSourceType.manual_text,
            None,
            len(manual_text.encode("utf-8")),
        )

    elif source_url:
        return None, None, "url", FileSourceType.url, None, 0

    raise HTTPException(
        status_code=400, detail="Must provide file, manual_text, or source_url"
    )


async def _check_storage_quota(
    db: AsyncSession,
    user: User,
    file_size: int,
) -> None:
    """Check user storage quota. Raises HTTPException(402) if exceeded."""
    if file_size <= 0:
        return
    from app.schemas.billing import LimitExceededError
    from app.tier_config import TIER_LIMITS, UserTier
    from app.models.billing import CreditBalance
    from app.services.usage_service import UsageService

    _tier = UserTier(user.tier)
    _limits = TIER_LIMITS[_tier]

    _credit_result = await db.execute(
        select(CreditBalance).where(CreditBalance.user_id == user.id)
    )
    _credits = _credit_result.scalar_one_or_none()
    _credit_storage = _credits.storage_credits_bytes if _credits else 0
    _total_quota = _limits.storage_bytes + _credit_storage

    _allowed, _, _ = await UsageService().check_and_consume(
        db, user, "storage", file_size
    )
    if not _allowed:
        raise HTTPException(
            status_code=402,
            detail=LimitExceededError(
                detail="저장 공간이 부족합니다. 요금제를 업그레이드하거나 저장 공간 크레딧을 구매하세요.",
                limit_type="storage",
                current_usage=user.storage_used_bytes,
                limit=_total_quota,
                upgrade_url="/pricing",
            ).model_dump(),
        )


@router.post("", response_model=FileUploadResponse)
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile | None = FastAPIFile(default=None),
    manual_text: str | None = Form(default=None),
    source_url: str | None = Form(default=None),
    folder_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate_limit: None = Depends(pro_rate_limit),
):
    effective_user, _ = await get_impersonation_context(request, user, db)

    if folder_id:
        folder_check = await db.execute(
            select(Folder).where(
                Folder.id == folder_id,
                Folder.user_id == effective_user.id,
            )
        )
        if not folder_check.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Folder not accessible")

    (
        content,
        original_filename,
        file_type,
        source_type,
        content_hash,
        file_size,
    ) = await _read_and_validate_upload(file, manual_text, source_url, settings)

    if content is not None and content_hash:
        duplicate_result = await db.execute(
            select(File).where(
                File.user_id == effective_user.id,
                File.content_hash == content_hash,
                File.deleted_at.is_(None),
            )
        )
        duplicate = duplicate_result.scalar_one_or_none()
        if duplicate:
            name = duplicate.original_filename or "알 수 없는 파일"
            raise HTTPException(
                status_code=409,
                detail=f"동일한 파일이 이미 존재합니다: '{name}'",
            )

    await _check_storage_quota(db, effective_user, file_size)

    stored_path = None
    if content is not None and original_filename:
        ext = file_type or ""
        stored_path = f"{effective_user.id}/{uuid.uuid4().hex}.{ext}"
        from app.services import storage as _storage
        import mimetypes as _mimetypes

        _mime = (
            _mimetypes.guess_type(original_filename)[0] or "application/octet-stream"
        )
        await _storage.upload_file(stored_path, content, _mime)

    file_record = File(
        user_id=effective_user.id,
        folder_id=folder_id,
        original_filename=original_filename,
        stored_path=stored_path,
        file_type=file_type,
        file_size_bytes=file_size,
        source_type=source_type,
        source_url=source_url,
        status=FileStatus.uploaded,
        content_hash=content_hash,
    )
    db.add(file_record)
    await db.flush()

    job = Job(
        id=str(uuid.uuid4()),
        job_type="file_processing",
        status="pending",
        target_type="file",
        target_id=file_record.id,
        payload_json={"manual_text": manual_text} if manual_text else {},
    )
    db.add(job)
    await db.commit()
    await db.refresh(file_record)

    background_tasks.add_task(dispatch_task, "process_file", [job.id])

    return FileUploadResponse(
        file_id=file_record.id,
        status=file_record.status.value,
        job_id=job.id,
    )


@router.get("", response_model=FileListResponse)
async def list_files(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    folder_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(File).where(File.user_id == user.id, File.deleted_at.is_(None))
    if folder_id:
        query = query.where(File.folder_id == folder_id)
    if status_filter:
        query = query.where(File.status == status_filter)

    query = query.order_by(File.created_at.desc())
    files, total = await paginate(db, query, page, size)

    return FileListResponse(
        files=[FileDetail.model_validate(f) for f in files],
        total=total,
        page=page,
        size=size,
    )


@router.get("/folders", response_model=list[FolderDetail])
async def list_folders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == user.id, Folder.status == "active")
        .order_by(Folder.sort_order.asc(), Folder.created_at.asc())
    )
    folders = result.scalars().all()
    return [FolderDetail.model_validate(folder) for folder in folders]


@router.post("/folders", response_model=FolderDetail)
async def create_folder(
    req: CreateFolderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = Folder(
        user_id=user.id,
        name=req.name.strip(),
        sort_order=0,
        status="active",
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderDetail.model_validate(folder)


@router.patch("/folders/{folder_id}", response_model=FolderDetail)
async def rename_folder(
    folder_id: str,
    req: RenameFolderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await get_owned_folder(folder_id, db, user)
    folder.name = req.name.strip()
    folder.updated_by = user.id
    folder.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(folder)
    return FolderDetail.model_validate(folder)


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = await get_owned_folder(folder_id, db, user)

    files_result = await db.execute(
        select(File).where(File.folder_id == folder.id, File.user_id == user.id)
    )
    files = files_result.scalars().all()
    for file in files:
        file.folder_id = None
        file.updated_by = user.id
        file.updated_at = datetime.now(timezone.utc)

    children_result = await db.execute(
        select(Folder).where(
            Folder.parent_folder_id == folder.id, Folder.user_id == user.id
        )
    )
    children = children_result.scalars().all()
    for child in children:
        child.parent_folder_id = None
        child.updated_by = user.id
        child.updated_at = datetime.now(timezone.utc)

    await db.delete(folder)
    await db.commit()
    return {"status": "success"}


@router.get("/{file_id}", response_model=FileDetail)
async def get_file(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await get_owned_file(file_id, db, user)
    return FileDetail.model_validate(file)


@router.post("/{file_id}/retry", response_model=FileRetryResponse)
async def retry_file(
    file_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await get_owned_file(file_id, db, user)
    retryable = {
        FileStatus.failed_partial,
        FileStatus.failed_terminal,
        FileStatus.uploaded,
    }
    if file.status not in retryable:
        raise HTTPException(status_code=400, detail="File is not in a retryable state")
    if file.retry_count >= settings.max_retry_count:
        raise HTTPException(status_code=400, detail="Max retry count exceeded")

    file.retry_count += 1
    file.status = FileStatus.uploaded

    job = Job(
        id=str(uuid.uuid4()),
        job_type="file_processing",
        status="pending",
        target_type="file",
        target_id=file.id,
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(dispatch_task, "process_file", [job.id])

    return FileRetryResponse(job_id=job.id, status=file.status.value)


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await get_owned_file(file_id, db, user)

    from datetime import datetime, timezone

    file.status = FileStatus.deleted
    file.deleted_at = datetime.now(timezone.utc)
    file.is_searchable = False
    file.is_quiz_eligible = False

    # Decrement storage used — guard against negative
    user.storage_used_bytes = max(
        0, user.storage_used_bytes - (file.file_size_bytes or 0)
    )

    job = Job(
        id=str(uuid.uuid4()),
        job_type="file_cleanup",
        status="pending",
        target_type="file",
        target_id=file.id,
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(dispatch_task, "file_cleanup", [job.id])

    return {"status": "success"}


@router.patch("/{file_id}", response_model=FileDetail)
async def rename_file(
    file_id: str,
    req: RenameFileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import re

    file = await get_owned_file(file_id, db, user)
    if req.original_filename and re.search(r'[\r\n"]', req.original_filename):
        raise HTTPException(
            status_code=400, detail="Filename contains invalid characters"
        )
    file.original_filename = req.original_filename
    file.updated_by = user.id
    file.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(file)
    return FileDetail.model_validate(file)


@router.post("/{file_id}/move", response_model=FileDetail)
async def move_file(
    file_id: str,
    req: MoveFileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = await get_owned_file(file_id, db, user)

    if req.folder_id is not None:
        await get_owned_folder(req.folder_id, db, user)

    file.folder_id = req.folder_id
    file.updated_by = user.id
    file.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(file)
    return FileDetail.model_validate(file)


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services import storage as _storage
    from fastapi.responses import Response as _Response

    file = await get_owned_file(file_id, db, user)
    if not file.stored_path:
        raise HTTPException(status_code=404, detail="File not available")

    try:
        data = await _storage.download_file(file.stored_path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not available")

    from urllib.parse import quote as _urlquote

    filename = file.original_filename or os.path.basename(file.stored_path)
    safe_name = _urlquote(filename, safe=" .-_~")
    return _Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"},
    )
