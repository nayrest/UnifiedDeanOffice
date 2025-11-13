# app/db.py
from sqlmodel import SQLModel, create_engine, Session
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./unibot.db")

# Для SQLite обязательно нужно отключить check_same_thread
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args
)


def init_db():
    """
    Создаёт все таблицы из models.py
    """
    from models import User, Request, CallbackRequest, DeanBroadcast, DeanAttachment
    SQLModel.metadata.create_all(engine)
    print("База данных инициализирована")


def get_session():
    """
    Открывает сессию к базе данных
    """
    return Session(engine)
