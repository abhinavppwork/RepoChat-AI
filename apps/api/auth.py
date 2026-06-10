import json
import os

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

_bearer = HTTPBearer(auto_error=False)


def _get_service_account_info() -> dict:
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not set")

    info = json.loads(raw)
    private_key = info.get("private_key")
    if isinstance(private_key, str):
        info["private_key"] = private_key.replace("\\n", "\n")
    return info


def _init_firebase() -> None:
    if firebase_admin._apps:
        return

    cred = credentials.Certificate(_get_service_account_info())
    firebase_admin.initialize_app(cred)


def get_current_user_id(
    credentials_in: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if credentials_in is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    try:
        _init_firebase()
        decoded = firebase_auth.verify_id_token(credentials_in.credentials)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase token",
        ) from exc

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token did not contain a uid",
        )
    return uid
