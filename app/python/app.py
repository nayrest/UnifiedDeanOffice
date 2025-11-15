# app/python/app.py

import sys
import json
from datetime import datetime, date

from sqlmodel import select

from db import get_session, init_db
from models import (
    User, Request, CallbackRequest,
    DeanBroadcast, DeanAttachment
)

# Гарантируем UTF-8 вывод
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


# ======================================================
#  HELPER: сериализация моделей в dict
# ======================================================
def model_to_dict(obj):
    if obj is None:
        return None

    if isinstance(obj, (datetime, date)):
        return obj.isoformat()

    if isinstance(obj, list):
        return [model_to_dict(o) for o in obj]

    if hasattr(obj, "model_dump"):
        # SQLModel ≥ 0.0.16
        return obj.model_dump(mode="json")

    if hasattr(obj, "dict"):
        return obj.dict()

    return obj


# ======================================================
#  USER FUNCTIONS
# ======================================================
def ensure_user(user_id: int, name: str | None = None):
    """
    Авто-регистрация пользователя.
    Первый пользователь системы → role="admin".
    Остальные → role="user".
    """
    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()

        # Есть ли хоть один пользователь в системе?
        any_user = s.exec(select(User).limit(1)).first()

        if not u:
            u = User(
                user_id=user_id,
                name=name or "",
                role="admin" if not any_user else "user"
            )
            s.add(u)
            s.commit()
            s.refresh(u)

        return model_to_dict(u)


def get_user(user_id: int):
    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        return model_to_dict(u) if u else None

VALID_ROLES = {"admin", "dekanat", "user"}

def set_user_role(user_id, role):
    if role not in VALID_ROLES:
        return {"error": f"invalid_role: {role}"}

    with get_session() as s:
        u = s.exec(select(User).where(User.user_id == user_id)).first()

        if not u:
            return {"error": "user_not_found"}

        u.role = role
        s.commit()
        s.refresh(u)

        return {"status": "ok", "role": u.role}


def list_users():
    """
    Список всех пользователей — используется для рассылки.
    """
    with get_session() as s:
        rows = s.exec(select(User).order_by(User.id)).all()
        return [model_to_dict(r) for r in rows]


# ======================================================
#  REQUESTS — заявки в деканат
# ======================================================
def create_request(user_id: int, req_type: str, text: str):
    with get_session() as s:
        # ищем внутренний id пользователя
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        if not u:
            return {"error": "user not found"}

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
    with get_session() as s:
        # Достаём заявки + сразу имя пользователя через JOIN
        stmt = (
            select(Request, User.name, User.user_id)
            .join(User, Request.user_id == User.user_id)  # ← если ты уже перешёл на foreign_key="users.user_id"
            .order_by(Request.id.desc())
        )
        rows = s.exec(stmt).all()

        result = []
        for req, user_name, external_user_id in rows:
            d = model_to_dict(req)
            d["user_id"] = external_user_id   # внешний ID из MAX
            d["user_name"] = user_name or "Без имени"  # ← добавляем имя!
            result.append(d)
        return result

def list_user_requests(user_id: int):
    with get_session() as s:
        rows = s.exec(
            select(Request).where(Request.user_id == user_id)
        ).all()

        return [model_to_dict(r) for r in rows]

# === Обновить статус заявки ===
def update_request_status(request_id: int, status: str, comment: str | None = None, admin_user_id: int | None = None):
    valid_statuses = {"new", "in_progress", "done", "rejected"}
    if status not in valid_statuses:
        return {"error": "invalid_status"}

    with get_session() as s:
        req = s.get(Request, request_id)
        if not req:
            return {"error": "not_found"}

        req.status = status
        
        # Обновляем комментарий если он передан
        if comment is not None:
            req.comment = comment
        
        # Записываем кто обработал заявку
        if admin_user_id:
            req.processed_by = admin_user_id
            
        # Время обработки
        req.processed_at = datetime.utcnow()

        s.add(req)
        s.commit()
        s.refresh(req)

        return model_to_dict(req)


# === Получить одну заявку по ID (для уведомления) ===
def get_request(request_id: int):
    with get_session() as s:
        req = s.get(Request, request_id)
        if not req:
            return None
        return model_to_dict(req)

def list_requests_filtered(filter_status: str = "all"):
    with get_session() as s:
        query = select(Request, User.name, User.user_id).join(
            User, Request.user_id == User.user_id
        )

        if filter_status != "all":
            query = query.where(Request.status == filter_status)

        rows = s.exec(query.order_by(Request.id.desc())).all()

        result = []
        for req, user_name, external_user_id in rows:
            d = model_to_dict(req)
            d["user_id"] = external_user_id
            d["user_name"] = user_name or "Без имени"
            result.append(d)
        return result

# ======================================================
#  CALLBACK REQUESTS — «Перезвоните мне»
# ======================================================
def create_callback(user_id: int, phone: str, comment: str | None = None):
    with get_session() as s:
        # Проверяем, существует ли пользователь
        u = s.exec(select(User).where(User.user_id == user_id)).first()
        if not u:
            # Если нет — создаём
            u = User(user_id=user_id, name="", role="user")
            s.add(u)
            s.commit()
            s.refresh(u)

        cb = CallbackRequest(
            user_id=user_id,    # ← ВНЕШНИЙ ID! (3483292, а не внутренний 5)
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
        # Лучше через JOIN — быстрее и надёжнее
        stmt = (
            select(CallbackRequest, User.name, User.user_id)
            .join(User, CallbackRequest.user_id == User.user_id)
            .order_by(CallbackRequest.id.desc())
        )
        rows = s.exec(stmt).all()

        result = []
        for cb, user_name, external_user_id in rows:
            d = model_to_dict(cb)
            d["user_id"] = external_user_id
            d["user_name"] = user_name or "Без имени"
            result.append(d)
        return result


# ======================================================
#  BROADCAST — логирование рассылок
# ======================================================
def create_broadcast(admin_user_id: int, text: str):
    """
    Логируем рассылку. admin_user_id — внешний user_id из MAX.
    """
    with get_session() as s:
        admin = s.exec(select(User).where(User.user_id == admin_user_id)).first()
        if not admin:
            admin = User(user_id=admin_user_id, name="", role="admin")
            s.add(admin)
            s.commit()
            s.refresh(admin)

        b = DeanBroadcast(
            admin_id=admin.id,
            text=text
        )
        s.add(b)
        s.commit()
        s.refresh(b)
        return model_to_dict(b)


def list_broadcasts():
    with get_session() as s:
        rows = s.exec(select(DeanBroadcast).order_by(DeanBroadcast.id.desc())).all()
        return [model_to_dict(r) for r in rows]


# ======================================================
#  ROUTER — вход из Node.js
# ======================================================
def route(func: str, args: list[str]):
    try:
        if func == "init_db":
            init_db()
            return {"status": "ok"}

        if func == "ensure_user":
            return ensure_user(int(args[0]), args[1] if len(args) > 1 else None)

        if func == "get_user":
            return get_user(int(args[0]))

        if func == "set_user_role":
            return set_user_role(int(args[0]), args[1])

        if func == "list_users":
            return list_users()

        if func == "create_request":
            # user_id, type, text...
            user_id = int(args[0])
            req_type = args[1]
            text = " ".join(args[2:])
            return create_request(user_id, req_type, text)

        if func == "list_requests":
            return list_requests()
        
        if func == "list_user_requests":
            return list_user_requests(int(args[0]))

        if func == "create_callback":
            user_id = int(args[0])
            phone = args[1]
            comment = " ".join(args[2:]) if len(args) > 2 else None
            return create_callback(user_id, phone, comment)

        if func == "list_callbacks":
            return list_callbacks()

        if func == "create_broadcast":
            admin_user_id = int(args[0])
            text = " ".join(args[1:])
            return create_broadcast(admin_user_id, text)

        if func == "list_broadcasts":
            return list_broadcasts()
        
        if func == "list_requests_filtered":
            filter_status = args[0] if args else "all"
            return list_requests_filtered(filter_status)

        if func == "update_request_status":           # ← ЭТА СТРОКА
            req_id = int(args[0])
            status = args[1]
            comment = args[2] if len(args) > 2 and args[2] else None
            admin_id = int(args[3]) if len(args) > 3 and args[3] else None
            return update_request_status(req_id, status, comment, admin_id)

        if func == "get_request":                     # ← И ЭТА
            return get_request(int(args[0]))

        return {"error": f"unknown function: {func}"}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    func = sys.argv[1]
    args = sys.argv[2:]
    result = route(func, args)
    print(json.dumps(result, ensure_ascii=False))
