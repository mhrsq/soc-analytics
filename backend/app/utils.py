"""Shared utility functions for the SOC Analytics backend."""

from datetime import date, datetime, timezone
from typing import Optional, Union


def parse_date_param(value: Optional[str]) -> Optional[Union[date, datetime]]:
    """Parse a date string (YYYY-MM-DD or ISO datetime) to a date or datetime object.

    Date-only strings (YYYY-MM-DD) return date objects for day-level filtering.
    Full datetime strings return datetime objects for precise filtering.
    """
    if not value:
        return None
    # Date-only pattern (YYYY-MM-DD) -> return date, not datetime
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    # Full ISO datetime
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def parse_asset_names(value: Optional[str]) -> Optional[list[str]]:
    """Parse comma-separated asset names string to a list."""
    if not value:
        return None
    names = [a.strip() for a in value.split(",") if a.strip()]
    return names or None
