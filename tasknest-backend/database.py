from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# ── Engine with connection pooling ────────────────────────────────────────────
# Without this, every request opens a fresh DB connection (~50-200ms overhead).
# pool_size=10  → keep 10 connections alive permanently
# max_overflow=20 → allow 20 extra under burst load
# pool_pre_ping=True → discard stale connections automatically
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,   # recycle connections every 30 min (avoids MySQL gone-away)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id         = Column(Integer, primary_key=True, index=True)
    username   = Column(String(100), unique=True, nullable=False)
    email      = Column(String(150), unique=True, nullable=False)
    hashed_pw  = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    folders    = relationship("Folder", back_populates="owner", cascade="all, delete")


class Folder(Base):
    __tablename__ = "folders"
    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
    owner       = relationship("User", back_populates="folders")
    resources   = relationship("Resource", back_populates="folder", cascade="all, delete")
    notes       = relationship("Note", back_populates="folder", cascade="all, delete")
    tasks       = relationship("Task", back_populates="folder", cascade="all, delete")


class Resource(Base):
    __tablename__ = "resources"
    id          = Column(Integer, primary_key=True, index=True)
    filename    = Column(String(255), nullable=False)
    filepath    = Column(String(500), nullable=False)
    folder_id   = Column(Integer, ForeignKey("folders.id"), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    indexed     = Column(Boolean, default=False)
    folder      = relationship("Folder", back_populates="resources")


class Note(Base):
    __tablename__ = "notes"
    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String(300), nullable=False, default="Untitled Note")
    content    = Column(Text, nullable=True)
    folder_id  = Column(Integer, ForeignKey("folders.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    folder     = relationship("Folder", back_populates="notes")


class Task(Base):
    __tablename__ = "tasks"
    id          = Column(Integer, primary_key=True, index=True)
    text        = Column(String(500), nullable=False)
    completed   = Column(Boolean, default=False)
    deadline    = Column(DateTime, nullable=True)
    folder_id   = Column(Integer, ForeignKey("folders.id"), nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
    folder      = relationship("Folder", back_populates="tasks")


# ── Dependency ────────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)