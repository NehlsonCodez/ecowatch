"""
EcoWatch configuration constants.
In a real deployment, move SECRET_KEY and other sensitive values into
environment variables (e.g. via python-dotenv).
"""

# --- Auth ---
SECRET_KEY = "ecowatch-super-secret-key-change-this-in-production-0xDEADBEEF"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# --- Electricity billing ---
RATE_PER_KWH = 0.16  # $ per kWh, used to estimate cost

# --- Simulation ---
SIMULATION_INTERVAL_SECONDS = 5   # how often device readings are generated
READING_RETENTION_HOURS = 24 * 14  # keep 14 days of raw readings

# --- Alert thresholds ---
HOUSEHOLD_POWER_ALERT_W = 6000       # total household draw considered "high"
DEVICE_OVER_THRESHOLD_FACTOR = 1.35  # device alert fires above rated_power * factor
ALERT_COOLDOWN_MINUTES = 15          # don't re-fire the same alert more than this often
