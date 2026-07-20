from fastapi import APIRouter, HTTPException, status
from app.schemas import LoginRequest, TokenResponse
from app.database import get_user
from app.auth import verify_password, create_access_token
from app.usage import record_login

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = get_user(body.email)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    record_login(user["email"])
    token = create_access_token({
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "id": user["id"],
    })
    return TokenResponse(
        access_token=token,
        user={
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        }
    )

@router.get("/me")
def get_me(current_user: dict = __import__('fastapi').Depends(
    __import__('app.auth', fromlist=['get_current_user']).get_current_user
)):
    return current_user
