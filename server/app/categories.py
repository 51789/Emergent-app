"""Monitoring categories: ids, labels, search hints, trusted sources and seller types."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit

CategoryId = Literal[
    "immobili",
    "bandi",
    "auto_moto",
    "gare_appalto",
    "divertimento",
    "finanza",
    "nuove_leggi",
    "lavoro",
]
LanguageCode = Literal["it", "en", "es", "fr", "de"]

LANGUAGES: tuple[str, ...] = ("it", "en", "es", "fr", "de")


@dataclass(frozen=True)
class Category:
    id: str
    labels: dict[str, str]
    description: str  # English, for the LLM
    site_hints: tuple[str, ...]
    seller_types: tuple[str, ...]
    # Serper/Google time filter applied to web searches ("qdr:w" = past week, "qdr:m" = month).
    recency: str | None
    expiry_relevant: bool = False
    # Source trust (see classify_source). Entries are domains (subdomains included), optional
    # "*" wildcards matching exactly one label ("regione.*.it"), or "domain/path" prefixes.
    official: tuple[str, ...] = ()  # category-specific public bodies (plus OFFICIAL_COMMON)
    trusted: tuple[str, ...] = ()  # established portals for this category
    detail_site: str | None = None  # search scope for individual records on the source

    def label(self, language: str) -> str:
        return self.labels.get(language) or self.labels["en"]


CATEGORIES: dict[str, Category] = {
    c.id: c
    for c in (
        Category(
            id="immobili",
            labels={
                "it": "Immobili",
                "en": "Real estate",
                "es": "Inmuebles",
                "fr": "Immobilier",
                "de": "Immobilien",
            },
            description="real-estate listings (houses and flats for sale or rent)",
            site_hints=("immobiliare.it", "casa.it", "idealista.it", "subito.it"),
            seller_types=("Privato", "Agenzia Immobiliare"),
            recency=None,
            detail_site="pcase.it/immobili",
            official=(),
            trusted=(
                "immobiliare.it",
                "idealista.it",
                "casa.it",
                "subito.it",
                "wikicasa.it",
                "tecnocasa.it",
            ),
        ),
        Category(
            id="bandi",
            labels={
                "it": "Bandi di concorso",
                "en": "Public competitions",
                "es": "Oposiciones",
                "fr": "Concours publics",
                "de": "Öffentliche Ausschreibungen",
            },
            description="Italian public competitions and calls (bandi di concorso)",
            site_hints=("inpa.gov.it", "concorsipubblici.com", "gazzettaufficiale.it"),
            seller_types=("Ente Pubblico",),
            recency=None,
            detail_site="inpa.gov.it/bandi-e-avvisi/dettaglio-bando-avviso",
            expiry_relevant=True,
            official=("inpa.gov.it", "concorsi.gov.it"),
            trusted=("concorsipubblici.com", "concorsando.it", "ticonsiglio.com"),
        ),
        Category(
            id="auto_moto",
            labels={
                "it": "Auto e Moto",
                "en": "Cars & motorbikes",
                "es": "Coches y motos",
                "fr": "Autos et motos",
                "de": "Autos & Motorräder",
            },
            description="vehicle listings (new or used cars and motorbikes)",
            site_hints=("autoscout24.it", "subito.it", "automobile.it", "moto.it"),
            seller_types=("Privato", "Rivenditore Ufficiale", "Concessionario"),
            recency="qdr:m",
            official=(),
            trusted=(
                "autoscout24.it",
                "automobile.it",
                "subito.it",
                "moto.it",
                "autosupermarket.it",
            ),
        ),
        Category(
            id="gare_appalto",
            labels={
                "it": "Gare d'appalto e fondi",
                "en": "Tenders & public funds",
                "es": "Licitaciones y fondos",
                "fr": "Appels d'offres et fonds",
                "de": "Vergaben & Fördermittel",
            },
            description=(
                "public procurement tenders and state/regional funding (grants, "
                "contributions, PNRR, Simest, Invitalia)"
            ),
            site_hints=(
                "acquistinretepa.it",
                "anticorruzione.it",
                "invitalia.it",
                "simest.it",
                "italiadomani.gov.it",
                "mimit.gov.it",
            ),
            seller_types=(
                "Ente Pubblico",
                "Amministrazione Locale",
                "Regione",
                "Ministero",
                "Ente Erogante Fondi",
            ),
            recency="qdr:m",
            expiry_relevant=True,
            official=(
                "anticorruzione.it",
                "invitalia.it",
                "simest.it",
                "consip.it",
                "mit.gov.it",
                "mimit.gov.it",
                "italiadomani.gov.it",
            ),
            trusted=("acquistinretepa.it", "appaltiamo.eu", "infobandi.it"),
        ),
        Category(
            id="divertimento",
            labels={
                "it": "Divertimento",
                "en": "Entertainment",
                "es": "Ocio",
                "fr": "Divertissement",
                "de": "Unterhaltung",
            },
            description="events, shows, concerts and leisure activities",
            site_hints=("ticketone.it", "vivaticket.com", "eventbrite.it", "mailticket.it"),
            seller_types=("Organizzatore Ufficiale", "Rivenditore Autorizzato", "Privato"),
            recency="qdr:m",
            expiry_relevant=True,
            official=(),
            trusted=(
                "ticketone.it",
                "vivaticket.com",
                "eventbrite.it",
                "mailticket.it",
                "boxol.it",
            ),
        ),
        Category(
            id="finanza",
            labels={
                "it": "Finanza",
                "en": "Finance",
                "es": "Finanzas",
                "fr": "Finance",
                "de": "Finanzen",
            },
            description="investment opportunities and financial news",
            site_hints=("borsaitaliana.it", "milanofinanza.it", "ilsole24ore.com"),
            seller_types=("Istituto Finanziario", "Broker Autorizzato", "Privato"),
            recency="qdr:w",
            official=("consob.it", "bancaditalia.it"),
            trusted=("borsaitaliana.it", "milanofinanza.it", "ilsole24ore.com", "teleborsa.it"),
        ),
        Category(
            id="nuove_leggi",
            labels={
                "it": "Nuove leggi",
                "en": "New laws",
                "es": "Nuevas leyes",
                "fr": "Nouvelles lois",
                "de": "Neue Gesetze",
            },
            description="new Italian laws, decrees and regulations",
            site_hints=("gazzettaufficiale.it", "normattiva.it", "senato.it"),
            seller_types=("Ente Pubblico",),
            recency=None,
            detail_site="gazzettaufficiale.it/eli/id",
            official=("senato.it", "camera.it", "normattiva.it", "gazzettaufficiale.it"),
            trusted=("altalex.com", "brocardi.it", "ilsole24ore.com"),
        ),
        Category(
            id="lavoro",
            labels={"it": "Lavoro", "en": "Jobs", "es": "Empleo", "fr": "Emploi", "de": "Jobs"},
            description="job offers and open positions",
            site_hints=("linkedin.com/jobs", "indeed.com", "infojobs.it", "subito.it"),
            seller_types=("Azienda", "Agenzia per il Lavoro", "Ente Pubblico", "Privato"),
            recency="qdr:m",
            official=("cliclavoro.gov.it", "lavoro.gov.it"),
            trusted=(
                "indeed.it",
                "indeed.com",
                "infojobs.it",
                "linkedin.com/jobs",
                "subito.it",
                "monster.it",
            ),
        ),
    )
}

CATEGORY_IDS: tuple[str, ...] = tuple(CATEGORIES)

SourceTrust = Literal["official", "trusted", "other"]

# Public bodies are "official" sources for every category.
OFFICIAL_COMMON: tuple[str, ...] = (
    "*.gov.it",
    "gazzettaufficiale.it",
    "normattiva.it",
    "regione.*.it",
    "comune.*.it",
    "provincia.*.it",
    "governo.it",
    "senato.it",
    "camera.it",
    "inps.it",
    "inail.it",
    "istat.it",
    "anticorruzione.it",
    "invitalia.it",
    "simest.it",
    "esteri.it",
    "europa.eu",
)


def _host_matches(host: str, pattern: str) -> bool:
    """Match `host` or any parent domain against `pattern`; "*" matches exactly one label."""
    pattern_labels = pattern.lower().split(".")
    labels = host.lower().rstrip(".").split(".")
    for start in range(len(labels)):
        candidate = labels[start:]
        if len(candidate) != len(pattern_labels):
            continue
        if all(p == "*" or p == c for p, c in zip(pattern_labels, candidate, strict=True)):
            return True
    return False


def _entry_matches(host: str, path: str, entry: str) -> bool:
    domain, _, prefix = entry.partition("/")
    if not _host_matches(host, domain):
        return False
    return not prefix or path.lstrip("/").startswith(prefix)


def classify_source(url: str, category: Category) -> SourceTrust:
    parts = urlsplit(url)
    host = parts.hostname or ""
    if not host:
        return "other"
    if any(_entry_matches(host, parts.path, e) for e in OFFICIAL_COMMON + category.official):
        return "official"
    if any(_entry_matches(host, parts.path, e) for e in category.trusted):
        return "trusted"
    return "other"


def get_category(category_id: str) -> Category:
    return CATEGORIES[category_id]
