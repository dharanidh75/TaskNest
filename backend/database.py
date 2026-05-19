from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


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
    history     = relationship("ChatHistory", back_populates="folder", cascade="all, delete")


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


class ChatHistory(Base):
    __tablename__ = "chat_history"
    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    folder_id     = Column(Integer, ForeignKey("folders.id"), nullable=True)
    session_id    = Column(String(64), nullable=False, index=True)
    session_title = Column(String(200), nullable=True)   # first user message as heading
    role          = Column(String(10), nullable=False)
    text          = Column(Text, nullable=False)
    intent        = Column(String(50), nullable=True)
    sources       = Column(Integer, default=0)
    created_at    = Column(DateTime, default=datetime.utcnow)
    folder        = relationship("Folder", back_populates="history")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)