import os
from contextlib import contextmanager

from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:i4tpx70As@localhost:5432/unidecanat"
)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)


@contextmanager
def get_session():
    """
    Корректный контекстный менеджер для работы с БД.
    Использование:
        with get_session() as s:
            ...
    """
    with Session(engine) as session:
        yield session


def init_db():
    """
    Один раз создаёт таблицы в БД.
    Вызвать из консоли:
        python app.py init_db
    """
    from models import User, Request, CallbackRequest, DeanBroadcast, DeanAttachment  # noqa
    SQLModel.metadata.create_all(engine)
