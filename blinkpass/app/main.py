import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.routes import (
    biometric,
    credentials,
    developer,
    identity,
    magic_link,
    oauth2,
    otp,
    user,
)
from app.storage.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    description="Passwordless identity provider — WebAuthn · Magic Link · OTP · OIDC",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow all origins in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    logger.info("%s started", settings.APP_NAME)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


# Mount all routers
app.include_router(biometric.router)
app.include_router(magic_link.router)
app.include_router(otp.router)
app.include_router(oauth2.router)
app.include_router(identity.router)
app.include_router(credentials.router)
app.include_router(user.router)
app.include_router(developer.router)
