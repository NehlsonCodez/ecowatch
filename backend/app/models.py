from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from app.database import Base



class UserRole(str, enum.Enum):
    admin = "admin"
    homeowner = "homeowner"


class DeviceType(str, enum.Enum):
    tv = "TV"
    fridge = "Fridge"
    ac = "AC"
    light = "Light"
    heater = "Heater"
    washing_machine = "Washing Machine"
    dishwasher = "Dishwasher"
    microwave = "Microwave"
    computer = "Computer"
    ev_charger = "EV Charger"
    other = "Other"


class AlertSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False, default="")
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.homeowner)
    created_at = Column(DateTime, default=datetime.utcnow)


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), unique=True, nullable=False)
    floor = Column(String(40), nullable=True, default="Ground Floor")
    icon = Column(String(40), nullable=True, default="home")
    created_at = Column(DateTime, default=datetime.utcnow)

    devices = relationship("Device", back_populates="room", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(SAEnum(DeviceType), nullable=False, default=DeviceType.other)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)

    rated_power_w = Column(Float, nullable=False, default=100.0)  # nameplate / avg power
    standby_power_w = Column(Float, nullable=False, default=0.0)  # power draw while "off"
    threshold_w = Column(Float, nullable=True)  # power level that triggers an alert

    is_on = Column(Boolean, default=False)
    current_power_w = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("Room", back_populates="devices")
    readings = relationship("PowerReading", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")


class PowerReading(Base):
    __tablename__ = "power_readings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True)
    power_w = Column(Float, nullable=False)
    cost = Column(Float, nullable=False, default=0.0)  # incremental $ cost for this reading's interval
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    device = relationship("Device", back_populates="readings")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    message = Column(String(255), nullable=False)
    severity = Column(SAEnum(AlertSeverity), nullable=False, default=AlertSeverity.warning)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)

    device = relationship("Device", back_populates="alerts")
