from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class AdminRole(str, Enum):
    admin = "admin"
    user = "user"


class AdminStatsResponse(BaseModel):
    total_users: int
    total_submissions: int
    total_forms: int
    total_ai_generations: int


class AdminUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    deleted_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    page: int
    limit: int
    total: int
    pages: int


class AdminUserRoleUpdate(BaseModel):
    role: AdminRole


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminUserIdsRequest(BaseModel):
    user_ids: list[Annotated[int, Field(ge=1)]] = Field(min_length=1, max_length=100)


class AdminBulkStatusRequest(AdminUserIdsRequest):
    is_active: bool


class AdminBulkDeleteRequest(AdminUserIdsRequest):
    permanent: bool = False


class AdminPermanentDeleteRequest(BaseModel):
    confirmation: str = Field(min_length=1, max_length=150)


class RegistrationStatusResponse(BaseModel):
    registration_open: bool


class RegistrationStatusUpdate(BaseModel):
    is_open: bool
