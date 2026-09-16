"""
Background simulation engine for EcoWatch.

Continuously (every SIMULATION_INTERVAL_SECONDS) walks every device in the
database and generates a realistic power reading:
  - Devices that are ON fluctuate around their rated power with some noise,
    occasional short spikes (e.g. compressor kick-in on a fridge/AC), and
    device-type-specific behaviour.
  - Devices that are OFF draw their small "standby" power (0 for most, a
    couple watts for things like TVs).

Each reading is stored in `power_readings` and the device's `current_power_w`
is updated so the dashboard can show live numbers. The engine also evaluates
alert conditions (device over threshold, whole-house draw too high) and
writes rows into the `alerts` table, with a cooldown so the same alert
doesn't spam every cycle.
"""

import asyncio
from datetime import datetime, timedelta
import logging
import random

from app.config import (
    ALERT_COOLDOWN_MINUTES,
    DEVICE_OVER_THRESHOLD_FACTOR,
    HOUSEHOLD_POWER_ALERT_W,
    RATE_PER_KWH,
    READING_RETENTION_HOURS,
    SIMULATION_INTERVAL_SECONDS,
)
from app.database import SessionLocal
from app import models


logger = logging.getLogger("ecowatch.simulator")

# Devices that occasionally "spike" (compressor / heating element kick-in)
SPIKY_TYPES = {
    models.DeviceType.fridge,
    models.DeviceType.ac,
    models.DeviceType.heater,
    models.DeviceType.washing_machine,
    models.DeviceType.dishwasher,
    models.DeviceType.microwave,
}


def _simulate_power(device: models.Device) -> float:
    """Return a realistic instantaneous power draw for this device this tick."""
    if not device.is_on:
        # Off devices draw only their (usually 0) standby power, with tiny noise.
        if device.standby_power_w <= 0:
            return 0.0
        return max(0.0, device.standby_power_w * random.uniform(0.85, 1.15))

    base = device.rated_power_w

    # Everyday fluctuation: +/- 12%
    power = base * random.uniform(0.88, 1.12)

    # Occasional spike for cyclical/compressor-driven appliances
    if device.type in SPIKY_TYPES and random.random() < 0.12:
        power *= random.uniform(1.2, 1.5)

    # Lights are very stable
    if device.type == models.DeviceType.light:
        power = base * random.uniform(0.97, 1.03)

    # Rare small chance of a brief near-zero dip (e.g. fridge compressor off cycle)
    if device.type == models.DeviceType.fridge and random.random() < 0.15:
        power = base * random.uniform(0.05, 0.2)

    return max(0.0, round(power, 2))


def _recent_alert_exists(db, device_id, minutes=ALERT_COOLDOWN_MINUTES) -> bool:
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    q = db.query(models.Alert).filter(
        models.Alert.device_id == device_id,
        models.Alert.created_at >= cutoff,
    )
    return db.query(q.exists()).scalar()


def _recent_household_alert_exists(db, minutes=ALERT_COOLDOWN_MINUTES) -> bool:
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    q = db.query(models.Alert).filter(
        models.Alert.device_id.is_(None),
        models.Alert.room_id.is_(None),
        models.Alert.created_at >= cutoff,
    )
    return db.query(q.exists()).scalar()


def run_simulation_tick():
    """Run a single simulation cycle. Safe to call repeatedly."""
    db = SessionLocal()
    try:
        devices = db.query(models.Device).all()
        now = datetime.utcnow()
        interval_hours = SIMULATION_INTERVAL_SECONDS / 3600.0
        total_power = 0.0

        for device in devices:
            power = _simulate_power(device)
            device.current_power_w = power
            total_power += power

            energy_kwh = (power / 1000.0) * interval_hours
            cost = energy_kwh * RATE_PER_KWH

            reading = models.PowerReading(
                device_id=device.id,
                power_w=power,
                cost=cost,
                timestamp=now,
            )
            db.add(reading)

            # --- Device-level alert ---
            threshold = device.threshold_w or (device.rated_power_w * DEVICE_OVER_THRESHOLD_FACTOR)
            if device.is_on and power > threshold and not _recent_alert_exists(db, device.id):
                db.add(
                    models.Alert(
                        device_id=device.id,
                        room_id=device.room_id,
                        message=(
                            f"{device.name} is drawing {power:.0f}W, above its "
                            f"expected threshold of {threshold:.0f}W."
                        ),
                        severity=models.AlertSeverity.warning,
                    )
                )

        # --- Household-level alert ---
        if total_power > HOUSEHOLD_POWER_ALERT_W and not _recent_household_alert_exists(db):
            db.add(
                models.Alert(
                    device_id=None,
                    room_id=None,
                    message=(
                        f"Whole-house power usage is high: {total_power:.0f}W "
                        f"(threshold {HOUSEHOLD_POWER_ALERT_W}W)."
                    ),
                    severity=models.AlertSeverity.critical,
                )
            )

        db.commit()

        # --- Housekeeping: trim very old readings so the DB doesn't grow forever ---
        if random.random() < 0.02:  # do this occasionally, not every tick
            cutoff = now - timedelta(hours=READING_RETENTION_HOURS)
            db.query(models.PowerReading).filter(
                models.PowerReading.timestamp < cutoff
            ).delete(synchronize_session=False)
            db.commit()

    except Exception:
        logger.exception("Simulation tick failed")
        db.rollback()
    finally:
        db.close()


async def simulation_loop():
    """Runs forever, ticking the simulation every SIMULATION_INTERVAL_SECONDS."""
    logger.info("EcoWatch simulation engine started (interval=%ss)", SIMULATION_INTERVAL_SECONDS)
    while True:
        run_simulation_tick()
        await asyncio.sleep(SIMULATION_INTERVAL_SECONDS)
