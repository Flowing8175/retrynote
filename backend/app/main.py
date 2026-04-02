from app.config import settings

app_metadata = {
    "title": "Quiz Manager API",
    "version": "1.0.0",
}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title=app_metadata["title"], version=app_metadata["version"], lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import (
    auth,
    files,
    quiz,
    objections,
    wrong_notes,
    retry,
    dashboard,
    search,
    admin,
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(files.router, prefix="/files", tags=["files"])
app.include_router(quiz.router, prefix="/quiz-sessions", tags=["quiz-sessions"])
app.include_router(objections.router, prefix="/objections", tags=["objections"])
app.include_router(wrong_notes.router, prefix="/wrong-notes", tags=["wrong-notes"])
app.include_router(retry.router, prefix="/retry-sets", tags=["retry-sets"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok"}
