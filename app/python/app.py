# app/python/app.py

import sys
import json
from datetime import datetime

from sqlmodel import select
from db import get_session, init_db
from models import (
    User, Request, CallbackRequest,
    DeanBroadcast, DeanAttachment
)

# Поддержка UTF-8 вывода
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


# ============================
# Helpers
# ============================

def model_to_dict(obj):
    """универсальный дамп SQLModel → dict"""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    elif hasattr(obj, "dict"):
        return obj.dict()
    return {}


# ============================
# USER FUNCTIONS
# ============================

def ensure_user(user_id, name=None):
    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        if not u:
            u = User(
                user_id=user_id,
                name=name or "",
                role="user"
            )
            s.add(u)
            s.commit()
            s.refresh(u)
        return u.model_dump()

def get_user(user_id: int):
    """Получить данные пользователя"""
    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        return model_to_dict(u) if u else None

def list_users():
    """Получить всех пользователей (для рассылки)"""
    with get_session() as s:
        rows = s.exec(select(User).order_by(User.id.asc())).all()
        return [model_to_dict(u) for u in rows]

def set_user_role(user_id, role):
    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        if not u:
            u = User(user_id=user_id, role=role)
            s.add(u)
            s.commit()
            s.refresh(u)
        else:
            u.role = role
            s.commit()
            s.refresh(u)

        return {"status": "ok", "role": u.role}


def set_user_group(user_id: int, group: str):
    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        if not u:
            u = User(user_id=user_id, group=group)
            s.add(u)
        else:
            u.group = group
        s.commit()
        return {"status": "ok", "group": group}


# ============================
# REQUESTS (ЗАЯВКИ В ДЕКАНАТ)
# ============================

def create_request(user_id: int, req_type: str, text: str):
    """Создание новой заявки в деканат"""
    with get_session() as s:
        req = Request(
            user_id=user_id,
            type=req_type,
            text=text,
            status="new"
        )
        s.add(req)
        s.commit()
        s.refresh(req)
        return model_to_dict(req)


def list_requests():
    """Админ/деканат: получить все заявки"""
    with get_session() as s:
        rows = s.exec(select(Request).order_by(Request.id.desc())).all()
        return [model_to_dict(r) for r in rows]


def update_request_status(req_id: int, status: str):
    """Изменение статуса заявки"""
    with get_session() as s:
        r = s.get(Request, req_id)
        if not r:
            return {"error": "request_not_found"}
        r.status = status
        s.commit()
        return {"status": "ok", "request_id": req_id, "new_status": status}


# ============================
# CALLBACK REQUEST ("ПЕРЕЗВОНИТЕ МНЕ")
# ============================

def create_callback(user_id: int, phone: str, comment: str | None = None):
    with get_session() as s:
        cb = CallbackRequest(
            user_id=user_id,
            phone=phone,
            comment=comment,
            status="waiting"
        )
        s.add(cb)
        s.commit()
        s.refresh(cb)
        return model_to_dict(cb)


def list_callbacks():
    with get_session() as s:
        rows = s.exec(select(CallbackRequest).order_by(CallbackRequest.id.desc())).all()
        return [model_to_dict(r) for r in rows]


def update_callback_status(cb_id: int, status: str):
    with get_session() as s:
        cb = s.get(CallbackRequest, cb_id)
        if not cb:
            return {"error": "callback_not_found"}
        cb.status = status
        s.commit()
        return {"status": "ok", "callback_id": cb_id, "new_status": status}


# ============================
# BROADCAST (РАССЫЛКА ДЕКАНАТА)
# ============================

def create_broadcast(admin_id: int, text: str):
    """Регистрация факта рассылки"""
    with get_session() as s:
        b = DeanBroadcast(
            admin_id=admin_id,
            text=text
        )
        s.add(b)
        s.commit()
        s.refresh(b)
        return model_to_dict(b)


def add_broadcast_attachment(broadcast_id: int, type: str, url: str, filename: str | None = None):
    with get_session() as s:
        a = DeanAttachment(
            broadcast_id=broadcast_id,
            type=type,
            url=url,
            filename=filename
        )
        s.add(a)
        s.commit()
        return model_to_dict(a)


def list_broadcasts():
    with get_session() as s:
        rows = s.exec(select(DeanBroadcast).order_by(DeanBroadcast.id.desc())).all()
        return [model_to_dict(r) for r in rows]


# ============================
# ROUTER
# ============================

def route(func, args):
    """Маршрутизация вызовов из JS"""

    try:
        if func == "ensure_user":
            return ensure_user(int(args[0]), args[1] if len(args) > 1 else None)

        if func == "get_user":
            return get_user(int(args[0]))
        
        if func == "list_users":
            return list_users()

        if func == "set_user_role":
            return set_user_role(int(args[0]), args[1])

        if func == "set_user_group":
            return set_user_group(int(args[0]), args[1])

        if func == "create_request":
            return create_request(int(args[0]), args[1], " ".join(args[2:]))

        if func == "list_requests":
            return list_requests()

        if func == "update_request_status":
            return update_request_status(int(args[0]), args[1])

        if func == "create_callback":
            return create_callback(int(args[0]), args[1], " ".join(args[2:]))

        if func == "list_callbacks":
            return list_callbacks()

        if func == "update_callback_status":
            return update_callback_status(int(args[0]), args[1])

        if func == "create_broadcast":
            return create_broadcast(int(args[0]), " ".join(args[1:]))

        if func == "add_broadcast_attachment":
            return add_broadcast_attachment(int(args[0]), args[1], args[2], args[3] if len(args) > 3 else None)

        if func == "list_broadcasts":
            return list_broadcasts()

        return {"error": f"unknown function: {func}"}

    except Exception as e:
        return {"error": str(e)}


# ============================
# MAIN ENTRY
# ============================

if __name__ == "__main__":
    func = sys.argv[1]
    args = sys.argv[2:]
    #init_db()
    result = route(func, args)
    print(json.dumps(result, ensure_ascii=False))
