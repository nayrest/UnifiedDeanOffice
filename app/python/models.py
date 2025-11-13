# app/python/models.py
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime


# =============================
# Пользователи
# =============================
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int  # ID пользователя в MAX
    name: Optional[str] = None
    group: Optional[str] = None
    role: str = "user"     # user | admin | dean | operator

    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )

    # Связи
    requests: List["Request"] = Relationship(back_populates="user")
    callbacks: List["CallbackRequest"] = Relationship(back_populates="user")


# =============================
# Заявка в деканат
# =============================
class Request(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(foreign_key="user.user_id")
    type: str                                  # "справка", "вопрос", "заявление"
    text: str                                  # текст заявки
    status: str = "new"                        # new | in_progress | done | rejected
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )

    # связь с юзером
    user: Optional[User] = Relationship(back_populates="requests")


# =============================
# Запрос перезвона из деканата
# =============================
class CallbackRequest(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(foreign_key="user.user_id")
    phone: str
    comment: Optional[str] = None
    status: str = "waiting"                     # waiting | processing | success | failed
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )

    user: Optional[User] = Relationship(back_populates="callbacks")


# =============================
# Массовая рассылка от деканата
# =============================
class DeanBroadcast(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    admin_id: int = Field(foreign_key="user.user_id")
    text: str
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )

    # вложения → через отдельную таблицу
    attachments: List["DeanAttachment"] = Relationship(back_populates="broadcast")


# =============================
# Вложения к рассылке
# =============================
class DeanAttachment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    broadcast_id: int = Field(foreign_key="deanbroadcast.id")

    type: str            # "image" | "video" | "file" | "audio"
    url: str             # ссылка MAX API
    filename: Optional[str] = None

    broadcast: Optional[DeanBroadcast] = Relationship(back_populates="attachments")
