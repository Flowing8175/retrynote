import enum
from datetime import datetime
from sqlalchemy import (
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    BigInteger,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, CommonMixin


class Folder(CommonMixin, Base):
    __tablename__ = "folders"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_folder_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("folders.id"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    auto_classified: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    user = relationship("User", back_populates="folders")


class FileSourceType(str, enum.Enum):
    upload = "upload"
    url = "url"
    manual_text = "manual_text"


class FileStatus(str, enum.Enum):
    uploaded = "uploaded"
    parsing = "parsing"
    parsed = "parsed"
    ocr_pending = "ocr_pending"
    ocr_processing = "ocr_processing"
    embedding_pending = "embedding_pending"
    embedding_processing = "embedding_processing"
    ready = "ready"
    failed_partial = "failed_partial"
    failed_terminal = "failed_terminal"
    deleted = "deleted"


class File(CommonMixin, Base):
    __tablename__ = "files"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    folder_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("folders.id"), nullable=True
    )
    original_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    source_type: Mapped[FileSourceType] = mapped_column(
        Enum(FileSourceType), nullable=False
    )
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[FileStatus] = mapped_column(
        Enum(FileStatus), default=FileStatus.uploaded, nullable=False
    )
    parse_error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ocr_required: Mapped[bool] = mapped_column(Boolean, default=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_searchable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_quiz_eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    user = relationship("User", back_populates="files")
    parsed_document = relationship(
        "ParsedDocument", back_populates="file", uselist=False, lazy="selectin"
    )
    chunks = relationship("DocumentChunk", back_populates="file", lazy="selectin")


class ParsedDocument(CommonMixin, Base):
    __tablename__ = "parsed_documents"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id"), nullable=False, unique=True
    )
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parser_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parser_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ocr_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    file = relationship("File", back_populates="parsed_document")


class DocumentChunk(CommonMixin, Base):
    __tablename__ = "document_chunks"

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.id"), nullable=False
    )
    parsed_document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("parsed_documents.id"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_to: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding_status: Mapped[str] = mapped_column(String(50), default="pending")
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vector_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    __table_args__ = (Index("ix_document_chunks_file_chunk", "file_id", "chunk_index"),)

    file = relationship("File", back_populates="chunks")
    parsed_document = relationship("ParsedDocument")
