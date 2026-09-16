from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app import models, schemas


router = APIRouter(prefix="/api/alerts", tags=["alerts"])


def _to_alert_out(a: models.Alert) -> schemas.AlertOut:
    return schemas.AlertOut(
        id=a.id,
        device_id=a.device_id,
        room_id=a.room_id,
        device_name=a.device.name if a.device else None,
        message=a.message,
        severity=a.severity,
        created_at=a.created_at,
        resolved=a.resolved,
        resolved_at=a.resolved_at,
    )


@router.get("", response_model=List[schemas.AlertOut])
def list_alerts(
    unresolved_only: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Alert)
    if unresolved_only:
        q = q.filter(models.Alert.resolved.is_(False))
    alerts = q.order_by(models.Alert.created_at.desc()).limit(limit).all()
    return [_to_alert_out(a) for a in alerts]


@router.post("/{alert_id}/resolve", response_model=schemas.AlertOut)
def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    alert.resolved = True
    alert.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return _to_alert_out(alert)


@router.post("/resolve-all", response_model=dict)
def resolve_all(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    now = datetime.utcnow()
    updated = (
        db.query(models.Alert)
        .filter(models.Alert.resolved.is_(False))
        .update({"resolved": True, "resolved_at": now}, synchronize_session=False)
    )
    db.commit()
    return {"resolved_count": updated}
