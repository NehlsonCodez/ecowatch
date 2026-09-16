"""
EcoWatch configuration constants.
Loads configuration from environment variables with safe defaults.
"""
import os

# --- Auth ---
SECRET_KEY = (
    os.getenv("SECRET_KEY")
    or os.getenv("SECRETKEY")
    or os.getenv("secretkey")
    or os.getenv("SecretKey")
    or "ecowatch-super-secret-key-change-this-in-production-0xDEADBEEF"
)
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))  # 24 hours

# --- Electricity billing ---
RATE_PER_KWH = float(os.getenv("RATE_PER_KWH", "0.16"))  # $ per kWh, used to estimate cost

# --- Simulation ---
SIMULATION_INTERVAL_SECONDS = int(os.getenv("SIMULATION_INTERVAL_SECONDS", "5"))   # how often device readings are generated
READING_RETENTION_HOURS = int(os.getenv("READING_RETENTION_HOURS", str(24 * 14)))  # keep 14 days of raw readings

# --- Alert thresholds ---
HOUSEHOLD_POWER_ALERT_W = float(os.getenv("HOUSEHOLD_POWER_ALERT_W", "6000"))       # total household draw considered "high"
DEVICE_OVER_THRESHOLD_FACTOR = float(os.getenv("DEVICE_OVER_THRESHOLD_FACTOR", "1.35"))  # device alert fires above rated_power * factor
ALERT_COOLDOWN_MINUTES = int(os.getenv("ALERT_COOLDOWN_MINUTES", "15"))          # don't re-fire the same alert more than this often

