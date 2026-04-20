import io
import struct
import uuid
import zipfile
import zlib

import pytest
from httpx import AsyncClient
from app.middleware.auth import create_access_token, hash_password
from app.models import User, UserRole
from app.models.file import File, FileSourceType, FileStatus
from app.models.search import Job


async def _make_user_with_tier(db, tier: str) -> User:
    suffix = uuid.uuid4().hex[:8]
    user = User(
        id=str(uuid.uuid4()),
        username=f"{tier}_{suffix}",
        email=f"{tier}_{suffix}@test.example",
        password_hash=hash_password("TestPass123!"),
        role=UserRole.user,
        tier=tier,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _make_docx_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body></w:document>",
        )
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType='
            '"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
    return buf.getvalue()


def _make_png_bytes() -> bytes:
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
    ihdr = struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
    raw = zlib.compress(b"\x00\x00\x00\x00")
    idat_crc = zlib.crc32(b"IDAT" + raw) & 0xFFFFFFFF
    idat = struct.pack(">I", len(raw)) + b"IDAT" + raw + struct.pack(">I", idat_crc)
    iend_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
    iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)
    return sig + ihdr + idat + iend


class TestFileUpload:
    async def test_upload_text_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            files={
                "file": ("notes.txt", b"Hello world content", "text/plain"),
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "file_id" in data
        assert data["status"] == "uploaded"
        assert "job_id" in data

    async def test_upload_pdf_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            files={
                "file": ("document.pdf", b"%PDF-1.4 fake content", "application/pdf"),
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "file_id" in data
        assert data["status"] == "uploaded"

    async def test_upload_docx_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            files={
                "file": (
                    "report.docx",
                    _make_docx_bytes(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
            },
        )
        assert resp.status_code == 200

    async def test_upload_md_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            files={
                "file": ("readme.md", b"# Title\nContent here", "text/markdown"),
            },
        )
        assert resp.status_code == 200

    async def test_upload_png_file(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            files={
                "file": ("image.png", _make_png_bytes(), "image/png"),
            },
        )
        assert resp.status_code == 200

    async def test_upload_unsupported_file_type(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            files={
                "file": ("data.exe", b"binary content", "application/octet-stream"),
            },
        )
        assert resp.status_code == 400

    async def test_upload_manual_text(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            data={
                "manual_text": "This is manually entered text content for study.",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "file_id" in data
        assert data["status"] == "uploaded"

    async def test_upload_job_targets_created_file(
        self, auth_client: AsyncClient, db_session
    ):
        resp = await auth_client.post(
            "/files",
            data={
                "manual_text": "Job target integrity check",
            },
        )

        assert resp.status_code == 200

        data = resp.json()
        job = (
            await db_session.execute(
                __import__("sqlalchemy").select(Job).where(Job.id == data["job_id"])
            )
        ).scalar_one()

        assert job.target_id == data["file_id"]

    async def test_upload_url(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            data={
                "source_url": "https://example.com/article",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "file_id" in data

    async def test_upload_no_input(self, auth_client: AsyncClient):
        resp = await auth_client.post("/files")
        assert resp.status_code == 400

    async def test_upload_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/files",
            files={
                "file": ("test.txt", b"content", "text/plain"),
            },
        )
        assert resp.status_code == 401

    async def test_upload_with_folder(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        from app.models.file import Folder

        folder = Folder(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            name="Test Folder",
        )
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)

        resp = await auth_client.post(
            "/files",
            data={
                "manual_text": "Content in folder",
                "folder_id": folder.id,
            },
        )
        assert resp.status_code == 200


class TestFileList:
    async def test_list_files(self, auth_client: AsyncClient, ready_file):
        resp = await auth_client.get("/files")
        assert resp.status_code == 200
        data = resp.json()
        assert "files" in data
        assert "total" in data
        assert data["total"] >= 1

    async def test_list_files_pagination(self, auth_client: AsyncClient, ready_file):
        resp = await auth_client.get("/files", params={"page": 1, "size": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert "page" in data
        assert "size" in data

    async def test_list_files_filter_by_status(
        self, auth_client: AsyncClient, ready_file
    ):
        resp = await auth_client.get("/files", params={"status": "ready"})
        assert resp.status_code == 200
        data = resp.json()
        assert all(f["status"] == "ready" for f in data["files"])

    async def test_list_files_requires_auth(self, client: AsyncClient):
        resp = await client.get("/files")
        assert resp.status_code == 401


class TestFileDetail:
    async def test_get_file_detail(self, auth_client: AsyncClient, ready_file):
        resp = await auth_client.get(f"/files/{ready_file.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == ready_file.id
        assert data["status"] == "ready"
        assert data["original_filename"] == "test.pdf"
        assert data["is_searchable"] is True
        assert data["is_quiz_eligible"] is True

    async def test_get_file_not_found(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"/files/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_get_file_other_user_denied(
        self, client: AsyncClient, db_session, ready_file
    ):
        from app.models import User, UserRole
        from app.middleware.auth import hash_password

        other = User(
            id=str(uuid.uuid4()),
            username="otheruser",
            email="other@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
        )
        db_session.add(other)
        await db_session.commit()

        from app.middleware.auth import create_access_token

        token = create_access_token(other.id, other.role.value)
        resp = await client.get(
            f"/files/{ready_file.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestFileRetry:
    async def test_retry_failed_file(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            file_type="txt",
            file_size_bytes=100,
            source_type=FileSourceType.manual_text,
            status=FileStatus.failed_terminal,
            retry_count=0,
        )
        db_session.add(file)
        await db_session.commit()
        await db_session.refresh(file)

        resp = await auth_client.post(f"/files/{file.id}/retry")
        assert resp.status_code == 200
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "uploaded"

    async def test_retry_non_failed_file(self, auth_client: AsyncClient, ready_file):
        resp = await auth_client.post(f"/files/{ready_file.id}/retry")
        assert resp.status_code == 400

    async def test_retry_exceeds_max(
        self, auth_client: AsyncClient, db_session, test_user
    ):
        from app.config import settings

        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            file_type="txt",
            file_size_bytes=100,
            source_type=FileSourceType.manual_text,
            status=FileStatus.failed_terminal,
            retry_count=settings.max_retry_count,
        )
        db_session.add(file)
        await db_session.commit()
        await db_session.refresh(file)

        resp = await auth_client.post(f"/files/{file.id}/retry")
        assert resp.status_code == 400


class TestFileDelete:
    async def test_soft_delete_file(
        self, auth_client: AsyncClient, db_session, ready_file
    ):
        resp = await auth_client.delete(f"/files/{ready_file.id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

        await db_session.refresh(ready_file)
        assert ready_file.status == FileStatus.deleted
        assert ready_file.deleted_at is not None
        assert ready_file.is_searchable is False
        assert ready_file.is_quiz_eligible is False

    async def test_delete_file_not_found(self, auth_client: AsyncClient):
        resp = await auth_client.delete(f"/files/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_delete_file_other_user_denied(
        self, client: AsyncClient, db_session, ready_file
    ):
        from app.models import User, UserRole
        from app.middleware.auth import hash_password, create_access_token

        other = User(
            id=str(uuid.uuid4()),
            username="deleter",
            email="deleter@example.com",
            password_hash=hash_password("Pass123!"),
            role=UserRole.user,
            is_active=True,
        )
        db_session.add(other)
        await db_session.commit()

        token = create_access_token(other.id, other.role.value)
        resp = await client.delete(
            f"/files/{ready_file.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestFileStatusTransitions:
    async def test_initial_status_uploaded(self, auth_client: AsyncClient):
        resp = await auth_client.post(
            "/files",
            data={
                "manual_text": "status test",
            },
        )
        data = resp.json()
        assert data["status"] == "uploaded"

    async def test_file_status_flow(self, db_session, test_user):
        file = File(
            id=str(uuid.uuid4()),
            user_id=test_user.id,
            source_type=FileSourceType.upload,
            status=FileStatus.uploaded,
            file_type="txt",
            file_size_bytes=50,
        )
        db_session.add(file)
        await db_session.commit()

        file.status = FileStatus.parsing
        await db_session.commit()
        assert file.status == FileStatus.parsing

        file.status = FileStatus.parsed
        await db_session.commit()
        assert file.status == FileStatus.parsed

        file.status = FileStatus.embedding_pending
        await db_session.commit()
        assert file.status == FileStatus.embedding_pending

        file.status = FileStatus.embedding_processing
        await db_session.commit()
        assert file.status == FileStatus.embedding_processing

        file.status = FileStatus.ready
        file.is_searchable = True
        file.is_quiz_eligible = True
        await db_session.commit()
        assert file.status == FileStatus.ready


class TestUploadSizeByTier:
    @pytest.mark.parametrize(
        "tier,max_mb",
        [("free", 5), ("lite", 50), ("standard", 100), ("pro", 200)],
    )
    async def test_accept_one_mb_under_tier_limit(
        self, client: AsyncClient, db_session, tier, max_mb
    ):
        user = await _make_user_with_tier(db_session, tier)
        token = create_access_token(user.id, user.role.value)
        client.headers["Authorization"] = f"Bearer {token}"

        payload = b"a" * ((max_mb - 1) * 1024 * 1024)
        resp = await client.post(
            "/files",
            files={"file": ("boundary.txt", payload, "text/plain")},
        )
        assert resp.status_code == 200, (
            f"tier={tier} size={max_mb - 1}MB expected 200, "
            f"got {resp.status_code}: {resp.text[:200]}"
        )

    @pytest.mark.parametrize(
        "tier,max_mb",
        [("free", 5), ("lite", 50), ("standard", 100), ("pro", 200)],
    )
    async def test_reject_one_mb_over_tier_limit(
        self, client: AsyncClient, db_session, tier, max_mb
    ):
        user = await _make_user_with_tier(db_session, tier)
        token = create_access_token(user.id, user.role.value)
        client.headers["Authorization"] = f"Bearer {token}"

        payload = b"a" * ((max_mb + 1) * 1024 * 1024)
        resp = await client.post(
            "/files",
            files={"file": ("boundary.txt", payload, "text/plain")},
        )
        assert resp.status_code == 413, (
            f"tier={tier} size={max_mb + 1}MB expected 413, got {resp.status_code}"
        )
        detail = resp.json().get("detail", "")
        detail_str = str(detail) if not isinstance(detail, str) else detail
        assert str(max_mb) in detail_str, (
            f"tier={tier} expected limit '{max_mb}' in error detail, got: {detail_str}"
        )
