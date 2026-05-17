from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from database import get_db, User
from auth import hash_password, verify_password, create_access_token, get_current_user, invalidate_user_cache

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    user_id: int


@router.post("/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username taken")

    user = User(
        username=body.username,
        email=body.email,
        hashed_pw=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "User created", "user_id": user.id}


@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_pw):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "user_id": user.id,
    }


class ProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    bio: str | None = None

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None


@router.get("/me", response_model=ProfileResponse)
def get_me(current_user: User = Depends(get_current_user)):
    # No DB hit here — get_current_user now serves from cache
    return ProfileResponse(
        id=current_user.id,
        name=current_user.username,
        email=current_user.email,
        bio=getattr(current_user, "bio", None),
    )


@router.put("/me", response_model=ProfileResponse)
def update_me(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.name is not None:
        current_user.username = body.name
    db.commit()
    db.refresh(current_user)

    # Bust the cache so next request fetches the updated row
    invalidate_user_cache(current_user.id)

    return ProfileResponse(
        id=current_user.id,
        name=current_user.username,
        email=current_user.email,
        bio=getattr(current_user, "bio", None),
    )