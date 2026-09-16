from collections import OrderedDict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import RATE_PER_KWH, SIMULATION_INTERVAL_SECONDS
from app.database import get_db
from app import models, schemas


router = APIRouter(prefix="/api/reports", tags=["reports"])

WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _wh_and_cost_from_readings(readings, interval_seconds=SIMULATION_INTERVAL_SECONDS):
    """Approximate energy (Wh) from a list of instantaneous power readings."""
    interval_hours = interval_seconds / 3600.0
    total_wh = sum(r.power_w * interval_hours for r in readings)
    total_cost = sum(r.cost for r in readings)
    return total_wh, total_cost


@router.get("/today", response_model=schemas.ReportSeries)
def today_hourly(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Hour-by-hour breakdown of today's usage so far, for the dashboard chart."""
    midnight = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    readings = (
        db.query(models.PowerReading)
        .filter(models.PowerReading.timestamp >= midnight)
        .all()
    )

    buckets = OrderedDict((h, {"wh": 0.0, "cost": 0.0}) for h in range(24))
    interval_hours = SIMULATION_INTERVAL_SECONDS / 3600.0
    for r in readings:
        buckets[r.timestamp.hour]["wh"] += r.power_w * interval_hours
        buckets[r.timestamp.hour]["cost"] += r.cost

    points = [
        schemas.ReportPoint(label=f"{h:02d}:00", power_wh=round(v["wh"], 2), cost=round(v["cost"], 4))
        for h, v in buckets.items()
    ]
    total_wh = sum(p.power_wh for p in points)
    total_cost = sum(p.cost for p in points)
    return schemas.ReportSeries(points=points, total_wh=round(total_wh, 2), total_cost=round(total_cost, 4))


@router.get("/weekly", response_model=schemas.ReportSeries)
def weekly(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Day-by-day breakdown for the last 7 days."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=6)

    readings = (
        db.query(models.PowerReading)
        .filter(models.PowerReading.timestamp >= start)
        .all()
    )

    day_keys = [(start + timedelta(days=i)).date() for i in range(7)]
    buckets = OrderedDict((d, {"wh": 0.0, "cost": 0.0}) for d in day_keys)
    interval_hours = SIMULATION_INTERVAL_SECONDS / 3600.0

    for r in readings:
        d = r.timestamp.date()
        if d in buckets:
            buckets[d]["wh"] += r.power_w * interval_hours
            buckets[d]["cost"] += r.cost

    points = [
        schemas.ReportPoint(
            label=d.strftime("%a %d"),
            power_wh=round(v["wh"], 2),
            cost=round(v["cost"], 4),
        )
        for d, v in buckets.items()
    ]
    total_wh = sum(p.power_wh for p in points)
    total_cost = sum(p.cost for p in points)
    return schemas.ReportSeries(points=points, total_wh=round(total_wh, 2), total_cost=round(total_cost, 4))


@router.get("/rooms", response_model=schemas.ReportSeries)
def rooms_breakdown(
    hours: int = Query(default=24, le=24 * 14),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Energy consumed per room over the last N hours -- good for a pie/bar chart."""
    start = datetime.utcnow() - timedelta(hours=hours)
    rooms = db.query(models.Room).all()
    interval_hours = SIMULATION_INTERVAL_SECONDS / 3600.0

    points = []
    total_wh = 0.0
    total_cost = 0.0
    for r in rooms:
        device_ids = [d.id for d in r.devices]
        if not device_ids:
            points.append(schemas.ReportPoint(label=r.name, power_wh=0.0, cost=0.0))
            continue
        readings = (
            db.query(models.PowerReading)
            .filter(
                models.PowerReading.device_id.in_(device_ids),
                models.PowerReading.timestamp >= start,
            )
            .all()
        )
        wh = sum(rd.power_w * interval_hours for rd in readings)
        cost = sum(rd.cost for rd in readings)
        total_wh += wh
        total_cost += cost
        points.append(schemas.ReportPoint(label=r.name, power_wh=round(wh, 2), cost=round(cost, 4)))

    return schemas.ReportSeries(points=points, total_wh=round(total_wh, 2), total_cost=round(total_cost, 4))
