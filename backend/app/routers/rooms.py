from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app import models, schemas


router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.get("", response_model=List[schemas.RoomWithStats])
def list_rooms(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rooms = db.query(models.Room).all()
    out = []
    for r in rooms:
        devices = r.devices
        out.append(
            schemas.RoomWithStats(
                id=r.id,
                name=r.name,
                floor=r.floor,
                icon=r.icon,
                device_count=len(devices),
                active_device_count=sum(1 for d in devices if d.is_on),
                current_power_w=round(sum(d.current_power_w for d in devices), 2),
            )
        )
    return out


@router.post("", response_model=schemas.RoomOut, status_code=201)
def create_room(
    payload: schemas.RoomCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    if db.query(models.Room).filter(models.Room.name == payload.name).first():
        raise HTTPException(status_code=400, detail="A room with this name already exists.")
    room = models.Room(**payload.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.put("/{room_id}", response_model=schemas.RoomOut)
def update_room(
    room_id: int,
    payload: schemas.RoomUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, field, value)
    db.commit()
    db.refresh(room)
    return room


@router.delete("/{room_id}", status_code=204)
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")
    db.delete(room)
    db.commit()
    return None
