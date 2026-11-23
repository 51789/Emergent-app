"""Subscription plans: limits and prices (server-side source of truth)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

PlanId = Literal["free", "pro", "premium"]
BillingCycle = Literal["monthly", "yearly"]
PAID_PLANS: tuple[str, ...] = ("pro", "premium")


@dataclass(frozen=True)
class PlanDef:
    id: str
    name: str
    max_active_searches: int
    refresh_interval_hours: int
    monthly_cents: int | None
    yearly_cents: int | None
    currency: str = "eur"


PLANS: dict[str, PlanDef] = {
    "free": PlanDef("free", "Free", 3, 24, None, None),
    "pro": PlanDef("pro", "Pro", 15, 6, 299, 2999),
    "premium": PlanDef("premium", "Premium", 100, 1, 499, 4999),
}

_FEATURES: dict[str, dict[str, str]] = {
    "it": {
        "searches": "Fino a {n} ricerche attive",
        "refresh": "Aggiornamento automatico ogni {h} ore",
        "refresh1": "Aggiornamento automatico ogni ora",
        "push": "Notifiche push sui nuovi risultati",
        "favorites": "Preferiti e storico risultati",
        "priority": "Monitoraggio prioritario",
    },
    "en": {
        "searches": "Up to {n} active searches",
        "refresh": "Automatic refresh every {h} hours",
        "refresh1": "Automatic refresh every hour",
        "push": "Push notifications for new results",
        "favorites": "Favorites and result history",
        "priority": "Priority monitoring",
    },
    "es": {
        "searches": "Hasta {n} búsquedas activas",
        "refresh": "Actualización automática cada {h} horas",
        "refresh1": "Actualización automática cada hora",
        "push": "Notificaciones push de nuevos resultados",
        "favorites": "Favoritos e historial de resultados",
        "priority": "Monitorización prioritaria",
    },
    "fr": {
        "searches": "Jusqu'à {n} recherches actives",
        "refresh": "Actualisation automatique toutes les {h} heures",
        "refresh1": "Actualisation automatique toutes les heures",
        "push": "Notifications push des nouveaux résultats",
        "favorites": "Favoris et historique des résultats",
        "priority": "Surveillance prioritaire",
    },
    "de": {
        "searches": "Bis zu {n} aktive Suchen",
        "refresh": "Automatische Aktualisierung alle {h} Stunden",
        "refresh1": "Automatische Aktualisierung jede Stunde",
        "push": "Push-Benachrichtigungen bei neuen Ergebnissen",
        "favorites": "Favoriten und Ergebnisverlauf",
        "priority": "Bevorzugte Überwachung",
    },
}


def plan_features(plan: PlanDef, language: str = "it") -> list[str]:
    t = _FEATURES.get(language, _FEATURES["en"])
    refresh = (
        t["refresh1"]
        if plan.refresh_interval_hours == 1
        else t["refresh"].format(h=plan.refresh_interval_hours)
    )
    features = [
        t["searches"].format(n=plan.max_active_searches),
        refresh,
        t["push"],
        t["favorites"],
    ]
    if plan.id == "premium":
        features.append(t["priority"])
    return features


def effective_plan(plan: str, plan_expires_at: datetime | None, grace_hours: int = 72) -> str:
    """A paid plan whose expiry passed (plus a grace period for webhook delays) is 'free'."""
    if plan == "free" or plan_expires_at is None:
        return plan
    if plan_expires_at + timedelta(hours=grace_hours) < datetime.now(UTC):
        return "free"
    return plan


def get_plan(plan_id: str) -> PlanDef:
    return PLANS.get(plan_id, PLANS["free"])
