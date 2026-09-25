from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting
from app.utils import now_wib

REGISTRATION_OPEN_KEY = "registration_open"
DEFAULT_REGISTRATION_OPEN = "1"


def registration_is_open(db: Session) -> bool:
    setting = db.get(AppSetting, REGISTRATION_OPEN_KEY)
    return not setting or setting.value == DEFAULT_REGISTRATION_OPEN


def set_registration_open(db: Session, is_open: bool) -> None:
    value = "1" if is_open else "0"
    setting = db.get(AppSetting, REGISTRATION_OPEN_KEY)
    if setting:
        setting.value = value
        setting.updated_at = now_wib()
    else:
        db.add(AppSetting(key=REGISTRATION_OPEN_KEY, value=value, updated_at=now_wib()))
    db.commit()
