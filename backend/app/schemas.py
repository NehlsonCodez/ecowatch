from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import AlertSeverity, DeviceType, UserRole



# ---------- Auth / Users ----------

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(default="", max_length=100)
    password: str = Field(min_length=4, max_length=128)
    role: UserRole = UserRole.homeowner


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    role: UserRole
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Rooms ----------

class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    floor: Optional[str] = "Ground Floor"
    icon: Optional[str] = "home"


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    floor: Optional[str] = None
    icon: Optional[str] = None


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    floor: Optional[str]
    icon: Optional[str]


class RoomWithStats(RoomOut):
    device_count: int = 0
    active_device_count: int = 0
    current_power_w: float = 0.0


# ---------- Devices ----------

class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: DeviceType
    room_id: int
    rated_power_w: float = Field(gt=0)
    standby_power_w: float = Field(default=0.0, ge=0)
    threshold_w: Optional[float] = None
    is_on: bool = False


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[DeviceType] = None
    room_id: Optional[int] = None
    rated_power_w: Optional[float] = None
    standby_power_w: Optional[float] = None
    threshold_w: Optional[float] = None
    is_on: Optional[bool] = None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: DeviceType
    room_id: int
    room_name: Optional[str] = None
    rated_power_w: float
    standby_power_w: float
    threshold_w: Optional[float]
    is_on: bool
    current_power_w: float
    created_at: datetime


class DeviceToggle(BaseModel):
    is_on: bool


# ---------- Readings ----------

class PowerReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_id: int
    power_w: float
    cost: float
    timestamp: datetime


# ---------- Alerts ----------

class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_id: Optional[int]
    room_id: Optional[int]
    device_name: Optional[str] = None
    message: str
    severity: AlertSeverity
    created_at: datetime
    resolved: bool
    resolved_at: Optional[datetime]


# ---------- Dashboard / Reports ----------

class RoomBreakdown(BaseModel):
    room_id: int
    room_name: str
    current_power_w: float
    device_count: int
    active_device_count: int


class DashboardSummary(BaseModel):
    total_power_w: float
    total_devices: int
    active_devices: int
    estimated_cost_today: float
    rate_per_kwh: float
    unresolved_alerts: int
    rooms: List[RoomBreakdown]
    top_consumers: List[DeviceOut]


class ReportPoint(BaseModel):
    label: str
    power_wh: float
    cost: float


class ReportSeries(BaseModel):
    points: List[ReportPoint]
    total_wh: float
    total_cost: float
