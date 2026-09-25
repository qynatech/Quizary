import contextvars
import logging
import os
import re
import uuid

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.routers import admin, auth, categories, forms, questions, profile, public_access, submissions, results, import_questions, ai
from app.utils import UPLOAD_DIR

app = FastAPI(title="Quizary API")

# Request-ID terstruktur (stdlib saja): middleware terima/buat X-Request-ID,
# simpan di contextvars agar terbawa ke threadpool endpoint sync (def) dan
# muncul di semua log quizary tanpa mengubah tiap logger call-site.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(asctime)s [%(request_id)s] %(name)s %(levelname)s: %(message)s"))
_handler.addFilter(_RequestIdFilter())
_quizary_logger = logging.getLogger("quizary")
if not _quizary_logger.handlers:
    _quizary_logger.addHandler(_handler)
_quizary_logger.setLevel(logging.INFO)


app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

logger = logging.getLogger("quizary")

_CORS_ORIGIN_RE = re.compile(r"^https://[a-z0-9-]+\.trycloudflare\.com$")
_CORS_LOCA_RE = re.compile(r"^https://[a-z0-9-]+\.loca\.lt$")
_CORS_NGROK_RE = re.compile(r"^https://[a-z0-9-]+\.ngrok(-free)?\.(dev|io|app)$")
_CORS_LAN_RE = re.compile(r"^https?://(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\.\d{1,3}\.\d{1,3}(:\d+)?$")
_CORS_LOCALHOST_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")
_CORS_STATIC_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "exp://localhost:8081",
    "exp://127.0.0.1:8081",
    "exp://localhost:19006",
    "https://quizary.vercel.app"
}

# Domain prod eksak via env (tanpa wildcard) — cth: CORS_EXTRA_ORIGINS=https://quizary.id,https://app.quizary.id
_CORS_EXTRA_ORIGINS = frozenset(
    o.strip().rstrip("/") for o in os.getenv("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[*_CORS_STATIC_ORIGINS, *_CORS_EXTRA_ORIGINS],
    allow_origin_regex=r"https://.*\.(trycloudflare\.com|loca\.lt|ngrok-free\.dev|ngrok\.io|ngrok\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers(request: Request) -> dict[str, str]:
    """Keep CORS on errors too.

    Starlette's exception middleware can turn an unhandled exception into a
    response outside CORSMiddleware. Without this header, browsers report a
    misleading CORS failure and hide the actual HTTP 500 payload.
    """
    origin = request.headers.get("origin", "")
    if (
        origin in _CORS_STATIC_ORIGINS
        or origin in _CORS_EXTRA_ORIGINS
        or _CORS_ORIGIN_RE.fullmatch(origin)
        or _CORS_LOCA_RE.fullmatch(origin)
        or _CORS_NGROK_RE.fullmatch(origin)
        or _CORS_LAN_RE.fullmatch(origin)
        or _CORS_LOCALHOST_RE.fullmatch(origin)
    ):
        headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
        # CORSMiddleware would also set Allow-Credentials when origin is allowed
        # Include it here so preflight error responses still pass browser check.
        headers["Access-Control-Allow-Credentials"] = "true"
        return headers
    return {}
        
os.makedirs(os.path.join(UPLOAD_DIR, "banners"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "question-images"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "avatars"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    token = request_id_var.set(rid)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = rid
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = err.get("loc", [])
        field = ".".join(str(x) for x in loc[1:]) if len(loc) > 1 else "_schema"
        msg = err.get("msg", "Invalid value")
        if err.get("type") == "value_error" and "ctx" in err and "error" in err["ctx"]:
            msg = str(err["ctx"]["error"])
        errors.append({field: msg})
    return JSONResponse(
        status_code=422,
        content={"message": "Invalid fields", "errors": errors},
        headers=_cors_headers(request),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
        headers=_cors_headers(request),
    )


@app.exception_handler(Exception)
async def catch_all_handler(request: Request, exc: Exception):
    # Log full trace server-side; never leak internals (paths, SQL, stack) to clients.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error"},
        headers=_cors_headers(request),
    )


app.include_router(admin.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(forms.router, prefix="/api")
app.include_router(questions.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(public_access.router, prefix="/api")
app.include_router(submissions.router, prefix="/api")
app.include_router(results.router, prefix="/api")
app.include_router(import_questions.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
