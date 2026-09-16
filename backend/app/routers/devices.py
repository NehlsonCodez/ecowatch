from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app import models, schemas


router = APIRouter(prefix="/api/devices", tags=["devices"])


def _to_device_out(d: models.Device) -> schemas.DeviceOut:
    return schemas.DeviceOut(
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


@router.get("", response_model=List[schemas.DeviceOut])
def list_devices(
    room_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Device)
    if room_id is not None:
        q = q.filter(models.Device.room_id == room_id)
    devices = q.order_by(models.Device.room_id, models.Device.name).all()
    return [_to_device_out(d) for d in devices]


@router.get("/{device_id}", response_model=schemas.DeviceOut)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    d = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Device not found.")
    return _to_device_out(d)


@router.post("", response_model=schemas.DeviceOut, status_code=201)
def create_device(
    payload: schemas.DeviceCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    room = db.query(models.Room).filter(models.Room.id == payload.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    device = models.Device(
        name=payload.name,
        type=payload.type,
        room_id=payload.room_id,
        rated_power_w=payload.rated_power_w,
        standby_power_w=payload.standby_power_w,
        threshold_w=payload.threshold_w,
        is_on=payload.is_on,
        current_power_w=payload.rated_power_w if payload.is_on else payload.standby_power_w,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return _to_device_out(device)


@router.put("/{device_id}", response_model=schemas.DeviceOut)
def update_device(
    device_id: int,
    payload: schemas.DeviceUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")

    data = payload.model_dump(exclude_unset=True)
    if "room_id" in data:
        room = db.query(models.Room).filter(models.Room.id == data["room_id"]).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found.")

    for field, value in data.items():
        setattr(device, field, value)

    db.commit()
    db.refresh(device)
    return _to_device_out(device)


@router.delete("/{device_id}", status_code=204)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    db.delete(device)
    db.commit()
    return None


@router.post("/{device_id}/toggle", response_model=schemas.DeviceOut)
def toggle_device(
    device_id: int,
    payload: schemas.DeviceToggle,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Any logged-in user (admin or homeowner) can turn devices on/off."""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")

    device.is_on = payload.is_on
    if not payload.is_on:
        device.current_power_w = device.standby_power_w
    db.commit()
    db.refresh(device)
    return _to_device_out(device)


@router.get("/{device_id}/readings", response_model=List[schemas.PowerReadingOut])
def device_readings(
    device_id: int,
    limit: int = Query(default=60, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")

    readings = (
        db.query(models.PowerReading)
        .filter(models.PowerReading.device_id == device_id)
        .order_by(models.PowerReading.timestamp.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(readings))
