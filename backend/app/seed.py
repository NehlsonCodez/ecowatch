"""
Seeds the database with sample data on first run:
 - An admin account and a homeowner account
 - A handful of rooms
 - Realistic devices per room, some ON and some OFF by default
"""

import logging

from sqlalchemy.orm import Session

from app.auth import hash_password
from app import models

logger = logging.getLogger("ecowatch.seed")



def seed_if_empty(db: Session):
    if db.query(models.User).first():
        return  # already seeded

    logger.info("Seeding EcoWatch sample data...")

    # --- Users ---
    admin = models.User(
        username="admin",
        full_name="System Administrator",
        hashed_password=hash_password("admin123"),
        role=models.UserRole.admin,
    )
    homeowner = models.User(
        username="homeowner",
        full_name="Jane Homeowner",
        hashed_password=hash_password("home123"),
        role=models.UserRole.homeowner,
    )
    db.add_all([admin, homeowner])
    db.flush()

    # --- Rooms ---
    room_defs = [
        ("Living Room", "Ground Floor", "sofa"),
        ("Kitchen", "Ground Floor", "kitchen"),
        ("Master Bedroom", "First Floor", "bed"),
        ("Kids Bedroom", "First Floor", "bed"),
        ("Garage", "Ground Floor", "garage"),
        ("Home Office", "First Floor", "office"),
    ]
    rooms = {}
    for name, floor, icon in room_defs:
        r = models.Room(name=name, floor=floor, icon=icon)
        db.add(r)
        rooms[name] = r
    db.flush()

    # --- Devices: (name, type, room, rated_w, standby_w, threshold_w, is_on) ---
    device_defs = [
        ("Living Room TV", models.DeviceType.tv, "Living Room", 140, 2, 220, True),
        ("Living Room AC", models.DeviceType.ac, "Living Room", 1800, 0, 2400, True),
        ("Living Room Lights", models.DeviceType.light, "Living Room", 45, 0, 70, True),
        ("Soundbar", models.DeviceType.other, "Living Room", 60, 1, 100, False),

        ("Refrigerator", models.DeviceType.fridge, "Kitchen", 180, 0, 320, True),
        ("Microwave", models.DeviceType.microwave, "Kitchen", 1100, 0, 1500, False),
        ("Dishwasher", models.DeviceType.dishwasher, "Kitchen", 1500, 0, 2000, True),
        ("Kitchen Lights", models.DeviceType.light, "Kitchen", 35, 0, 60, True),

        ("Master Bedroom AC", models.DeviceType.ac, "Master Bedroom", 1600, 0, 2200, True),
        ("Master Bedroom Lights", models.DeviceType.light, "Master Bedroom", 25, 0, 45, False),
        ("Space Heater", models.DeviceType.heater, "Master Bedroom", 1500, 0, 2000, False),

        ("Kids Bedroom Lights", models.DeviceType.light, "Kids Bedroom", 20, 0, 40, True),
        ("Kids Bedroom AC", models.DeviceType.ac, "Kids Bedroom", 1200, 0, 1700, False),

        ("Washing Machine", models.DeviceType.washing_machine, "Garage", 700, 0, 1000, False),
        ("EV Charger", models.DeviceType.ev_charger, "Garage", 3200, 0, 4000, True),
        ("Garage Lights", models.DeviceType.light, "Garage", 30, 0, 55, False),

        ("Desktop Computer", models.DeviceType.computer, "Home Office", 320, 3, 450, True),
        ("Office Lights", models.DeviceType.light, "Home Office", 28, 0, 50, True),
        ("Office AC", models.DeviceType.ac, "Home Office", 1000, 0, 1400, False),
    ]

    for name, dtype, room_name, rated, standby, threshold, is_on in device_defs:
        db.add(
            models.Device(
                name=name,
                type=dtype,
                room_id=rooms[room_name].id,
                rated_power_w=rated,
                standby_power_w=standby,
                threshold_w=threshold,
                is_on=is_on,
                current_power_w=rated if is_on else standby,
            )
        )

    db.commit()
    logger.info(
        "Seed complete: %d users, %d rooms, %d devices",
        db.query(models.User).count(),
        db.query(models.Room).count(),
        db.query(models.Device).count(),
    )
