from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import RATE_PER_KWH
from app.database import get_db
from app import models, schemas


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=schemas.DashboardSummary)
def summary(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    devices = db.query(models.Device).all()
    rooms = db.query(models.Room).all()

    total_power = sum(d.current_power_w for d in devices)
    active_devices = sum(1 for d in devices if d.is_on)

    # Cost accrued today from stored readings (sum of incremental costs since midnight UTC)
    midnight = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    cost_today = (
        db.query(func.coalesce(func.sum(models.PowerReading.cost), 0.0))
        .filter(models.PowerReading.timestamp >= midnight)
        .scalar()
    ) or 0.0

    unresolved_alerts = (
        db.query(func.count(models.Alert.id)).filter(models.Alert.resolved.is_(False)).scalar()
    ) or 0

    room_breakdown = []
    for r in rooms:
        devs = r.devices
        room_breakdown.append(
            schemas.RoomBreakdown(
                room_id=r.id,
                room_name=r.name,
                current_power_w=round(sum(d.current_power_w for d in devs), 2),
                device_count=len(devs),
                active_device_count=sum(1 for d in devs if d.is_on),
            )
        )
    room_breakdown.sort(key=lambda x: x.current_power_w, reverse=True)

    top = sorted(devices, key=lambda d: d.current_power_w, reverse=True)[:5]
    top_consumers = [
        schemas.DeviceOut(
            id=d.id,
            name=d.name,
            type=d.type,
            room_id=d.room_id,
            room_name=d.room.name if d.room else None,
            rated_power_w=d.rated_power_w,
            standby_power_w=d.standby_power_w,
            threshold_w=d.threshold_w,
            is_on=d.is_on,
            current_power_w=d.current_power_w,
            created_at=d.created_at,
        )
        for d in top
    ]

    return schemas.DashboardSummary(
        total_power_w=round(total_power, 2),
        total_devices=len(devices),
        active_devices=active_devices,
        estimated_cost_today=round(cost_today, 4),
        rate_per_kwh=RATE_PER_KWH,
        unresolved_alerts=unresolved_alerts,
        rooms=room_breakdown,
        top_consumers=top_consumers,
    )
