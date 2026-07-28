"""
Team/user management — manager-only.

Lets a manager add, list, and remove teammate accounts from the Admin panel
directly, instead of hand-editing backend/app/database.py and redeploying.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_role
from app.database import create_user, delete_user, list_users
from app.schemas import CreateUserRequest, UserOut

router = APIRouter()


@router.get("/users", response_model=list[UserOut])
def get_users(current_user: dict = Depends(require_role("manager"))):
    return list_users()


@router.post("/users", response_model=UserOut)
def add_user(body: CreateUserRequest, current_user: dict = Depends(require_role("manager"))):
    try:
        return create_user(body.email, body.name or "", body.password, body.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/users/{email}")
def remove_user(email: str, current_user: dict = Depends(require_role("manager"))):
    try:
        delete_user(email, current_user["sub"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": f"'{email}' removed."}
