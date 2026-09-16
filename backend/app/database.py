import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
DB_PATH = os.path.join(BASE_DIR, "ecowatch.db")

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Fix postgres:// URL prefix for SQLAlchemy 2.0+ if provided by Railway/Heroku
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()



def get_db():
    """FastAPI dependency that yields a DB session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
