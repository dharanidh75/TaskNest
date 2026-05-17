from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db, User
import os
from dotenv import load_dotenv
from cachetools import TTLCache
import threading

load_dotenv()

SECRET_KEY     = os.getenv("SECRET_KEY", "changeme")
ALGORITHM      = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 10080))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ── User cache ────────────────────────────────────────────────────────────────
# Every authenticated request previously hit the DB to fetch the user row.
# For /auth/me and every folder/task/note load that's 1 extra query per request.
# Cache maps user_id → User object for 5 minutes.
# Thread-safe via a lock (FastAPI runs in a thread pool).
_user_cache: TTLCache = TTLCache(maxsize=500, ttl=300)
_cache_lock = threading.Lock()


def _get_cached_user(user_id: int, db: Session) -> User | None:
    with _cache_lock:
        if user_id in _user_cache:
            return _user_cache[user_id]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        with _cache_lock:
            _user_cache[user_id] = user
    return user


def invalidate_user_cache(user_id: int):
    """Call this after any profile update so stale data isn't served."""
    with _cache_lock:
        _user_cache.pop(user_id, None)


# ── Password hashing ──────────────────────────────────────────────────────────
# bcrypt.gensalt() defaults to rounds=12 which takes ~250ms.
# rounds=10 takes ~60ms and is still extremely secure for web apps.
_BCRYPT_ROUNDS = 10


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    ).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Cached DB lookup — eliminates the extra query on every authenticated request
    user = _get_cached_user(int(user_id), db)
    if user is None:
        raise credentials_exception
    return user