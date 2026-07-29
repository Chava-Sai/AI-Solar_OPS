from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas import ChangePasswordRequest, LoginRequest, TokenResponse, UpdateNameRequest
from app.database import get_user, update_password, update_name
from app.auth import verify_password, create_access_token, get_current_user
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
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@router.post("/change-password")
def change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    user = get_user(current_user["sub"])
    if not user or not verify_password(body.current_password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters",
        )
    update_password(user["email"], body.new_password)
    return {"message": "Password updated."}

@router.put("/profile")
def update_profile(body: UpdateNameRequest, current_user: dict = Depends(get_current_user)):
    """Change display name only — email is the login identity and can't change here."""
    try:
        updated = update_name(current_user["sub"], body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Re-issue the token so its embedded "name" claim doesn't go stale until
    # the next login (chat history, etc. read the name straight off the JWT).
    token = create_access_token({
        "sub": updated["email"],
        "name": updated["name"],
        "role": updated["role"],
        "id": updated["id"],
    })
    return TokenResponse(access_token=token, user=updated)
