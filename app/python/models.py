from datetime import datetime
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship


# =======================================================
# USERS
# =======================================================

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, unique=True)           # внешний ID MAX
    name: Optional[str] = Field(default=None)
    role: str = Field(default="user")
    group: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    requests: List["Request"] = Relationship(back_populates="user")
    callbacks: List["CallbackRequest"] = Relationship(back_populates="user")
    broadcasts: List["DeanBroadcast"] = Relationship(back_populates="admin")


# =======================================================
# REQUESTS
# =======================================================

class Request(SQLModel, table=True):
    __tablename__ = "requests"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.user_id", index=True)
    type: str
    text: str
    status: str = "new"
    comment: Optional[str] = Field(default=None)  # ← ДОБАВЬТЕ ЭТУ СТРОКУ
    processed_by: Optional[int] = Field(default=None)  # ← внешний ID админа
    processed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional[User] = Relationship(
        back_populates="requests",
        sa_relationship_kwargs={"foreign_keys": "Request.user_id"}
    )



# =======================================================
# CALLBACK REQUESTS
# =======================================================

class CallbackRequest(SQLModel, table=True):
    __tablename__ = "callback_requests"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.user_id", index=True)  # ← внешний ID
    phone: str
    comment: Optional[str] = Field(default=None)
    status: str = Field(default="waiting")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # ← Правильный способ указать, какой именно столбец участвует в связи
    user: Optional[User] = Relationship(
        back_populates="callbacks",
        sa_relationship_kwargs={"foreign_keys": "CallbackRequest.user_id"}
    )


# =======================================================
# BROADCASTS
# =======================================================

class DeanBroadcast(SQLModel, table=True):
    __tablename__ = "dean_broadcasts"

    id: Optional[int] = Field(default=None, primary_key=True)
    admin_id: int = Field(foreign_key="users.id")
    text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    admin: Optional[User] = Relationship(back_populates="broadcasts")
    attachments: List["DeanAttachment"] = Relationship(back_populates="broadcast")


# =======================================================
# BROADCAST ATTACHMENTS
# =======================================================

class DeanAttachment(SQLModel, table=True):
    __tablename__ = "dean_attachments"

    id: Optional[int] = Field(default=None, primary_key=True)
    broadcast_id: int = Field(foreign_key="dean_broadcasts.id")
    type: str
    url: str
    filename: Optional[str] = None

    broadcast: Optional[DeanBroadcast] = Relationship(back_populates="attachments")
