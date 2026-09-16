# ⚡ EcoWatch — Smart Home Electricity Monitoring System

EcoWatch is a full-stack demo application for monitoring and controlling a
smart home's electricity usage in real time. A background engine
continuously simulates realistic IoT device readings (fluctuations, spikes,
standby draw), and the dashboard, rooms, devices, reports and alerts all
update live from that data.

```
Backend:  FastAPI + SQLAlchemy + SQLite, JWT auth, background asyncio simulator
Frontend: Static HTML/CSS/JS (no build step), dark "control room" theme,
          canvas-based charts (no external chart library)
```

---

## Features

- **Auth** — register/login as an Admin or Homeowner, JWT-based sessions
- **Live dashboard** — total power draw, active devices, estimated cost
  today, unresolved alerts, power-by-room breakdown, top consumers, live
  sparkline
- **Simulated IoT devices** — TVs, fridges, ACs, lights, heaters, washing
  machines, dishwashers, microwaves, computers, EV chargers — each with
  realistic fluctuation, occasional spikes (compressor/heating-element
  kick-in), and standby power while "off"
- **Device control** — turn any device on/off from the website; the change
  is reflected in the simulation immediately
- **Rooms view** — per-room live power draw and device counts
- **Alerts** — automatic alerts when a device or the whole house draws
  unusually high power, with resolve / resolve-all actions
- **Reports** — hourly usage for today, daily usage for the last 7 days,
  and a per-room usage breakdown, all chart-backed
- **Admin console** — add, edit and delete rooms and devices

---

## Project structure

```
ecowatch/
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py            # FastAPI app entrypoint, serves the frontend too
│       ├── config.py          # rates, thresholds, JWT secret, simulation interval
│       ├── database.py        # SQLAlchemy engine/session (SQLite)
│       ├── models.py          # User, Room, Device, PowerReading, Alert
│       ├── schemas.py         # Pydantic request/response models
│       ├── auth.py            # password hashing, JWT, auth dependencies
│       ├── simulator.py       # background loop generating live power readings
│       ├── seed.py            # sample users / rooms / devices on first run
│       └── routers/
│           ├── auth.py        # /api/auth/*
│           ├── rooms.py       # /api/rooms/*
│           ├── devices.py     # /api/devices/*
│           ├── dashboard.py   # /api/dashboard/summary
│           ├── alerts.py      # /api/alerts/*
│           └── reports.py     # /api/reports/*
└── frontend/
    ├── index.html              # single-page app shell
    ├── css/style.css
    └── js/
        ├── api.js              # fetch wrapper for the backend API
        ├── charts.js           # tiny dependency-free canvas charts
        └── app.js              # views, state, rendering, polling
```

---

## Setup

### Requirements

- Python 3.10+

### 1. Install backend dependencies

```bash
cd ecowatch/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run the server

```bash
python -m uvicorn app.main:app --reload --port 8000
```

On first run, EcoWatch automatically:
- creates `ecowatch.db` (SQLite) next to `requirements.txt`
- seeds two demo accounts, six rooms and nineteen devices
- starts the background simulation engine (new readings every 5 seconds)

### 3. Open the app

Visit **http://localhost:8000** — FastAPI serves the frontend directly, so
there's nothing else to run. The interactive API docs are available at
**http://localhost:8000/docs**.

### Demo accounts

| Role      | Username    | Password   |
|-----------|-------------|------------|
| Admin     | `admin`     | `admin123` |
| Homeowner | `homeowner` | `home123`  |

You can also register your own account from the login screen (choose
"Homeowner" or "Admin").

---

## How the simulation works

Every 5 seconds (`SIMULATION_INTERVAL_SECONDS` in `app/config.py`), the
background engine:

1. Walks every device in the database.
2. If a device is **on**, it draws power around its `rated_power_w` with
   ±12% everyday noise. Compressor/heating-driven appliances (fridge, AC,
   heater, washing machine, dishwasher, microwave) occasionally spike
   20–50% higher; lights stay very stable; fridges occasionally dip low to
   mimic a compressor off-cycle.
3. If a device is **off**, it draws its (usually small or zero)
   `standby_power_w`.
4. Stores a `PowerReading` row (power + incremental cost) for history and
   updates the device's live `current_power_w`.
5. Compares each device's draw to its `threshold_w` (defaults to 135% of
   rated power) and the whole house's total draw to
   `HOUSEHOLD_POWER_ALERT_W` (default 6000 W) — creating an `Alert` when
   exceeded, with a cooldown so the same alert doesn't spam every cycle.

All of this is configurable in `backend/app/config.py`:

```python
RATE_PER_KWH = 0.16                 # $ per kWh used for cost estimates
SIMULATION_INTERVAL_SECONDS = 5     # how often readings are generated
HOUSEHOLD_POWER_ALERT_W = 6000      # whole-house alert threshold
DEVICE_OVER_THRESHOLD_FACTOR = 1.35 # default per-device alert threshold
ALERT_COOLDOWN_MINUTES = 15         # minimum gap between repeat alerts
```

---

## API overview

All endpoints are prefixed with `/api` and (except register/login) require
`Authorization: Bearer <token>`. Full interactive docs: `/docs`.

| Area      | Endpoints |
|-----------|-----------|
| Auth      | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Dashboard | `GET /api/dashboard/summary` |
| Rooms     | `GET /api/rooms`, `POST/PUT/DELETE /api/rooms/{id}` *(admin write)* |
| Devices   | `GET /api/devices`, `POST/PUT/DELETE /api/devices/{id}` *(admin write)*, `POST /api/devices/{id}/toggle`, `GET /api/devices/{id}/readings` |
| Alerts    | `GET /api/alerts`, `POST /api/alerts/{id}/resolve`, `POST /api/alerts/resolve-all` |
| Reports   | `GET /api/reports/today`, `GET /api/reports/weekly`, `GET /api/reports/rooms` |

Homeowners can view everything and toggle devices on/off; only Admins can
create, edit or delete rooms and devices (enforced server-side, not just
hidden in the UI).

---

## Notes for production use

This project is built as a realistic demo/prototype. Before deploying it
for real:

- Move `SECRET_KEY` (in `app/config.py`) into an environment variable.
- Swap SQLite for Postgres/MySQL for concurrent multi-user use.
- Put the app behind HTTPS and tighten the CORS policy in `app/main.py`
  (currently `allow_origins=["*"]` for easy local development).
- Add rate limiting / account lockout to the auth endpoints.
- Replace the simulated devices with real IoT integrations (MQTT, Zigbee
  bridge, smart plug APIs, etc.) feeding into the same `PowerReading` model.

---

## Troubleshooting

- **`bcrypt` / `passlib` error on install** — the pinned versions in
  `requirements.txt` (`bcrypt==4.0.1`, `passlib==1.7.4`) are known to work
  together; a newer bcrypt can break passlib's hash length check.
- **Port 8000 already in use** — run with `--port 8001` (and open
  `http://localhost:8001` instead).
- **Fresh start** — stop the server and delete `backend/ecowatch.db`; it
  will be recreated and reseeded on the next run.
