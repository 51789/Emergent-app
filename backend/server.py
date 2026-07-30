from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
import json
import asyncio
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Get API keys
EMERGENT_LLM_KEY = os.getenv('EMERGENT_LLM_KEY')
SERPER_API_KEY = os.getenv('SERPER_API_KEY', '')

# ---------- Emergent Push Notifications (SuprSend relay) ----------
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

# ---------- Auth (JWT + bcrypt) ----------
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import EmailStr

JWT_SECRET = os.getenv("JWT_SECRET", "changeme-in-production-please")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Two seed admins per user request. Password can be rotated later via API.
SEED_ADMINS = [
    ("marcolombardo595@gmail.com", "Jarvis.2026"),
    ("davidepioggia.mx96@gmail.com", "Jarvis.2026"),
]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(payload: Dict[str, Any]) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)


# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ==================== MODELS ====================
class SearchQuery(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    query: str
    category: str
    language: str = "it"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    
class SearchQueryCreate(BaseModel):
    query: str
    category: str
    language: str = "it"

class SearchResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    search_id: str
    title: str
    summary: str
    keywords: List[str]
    source_link: str
    contacts: Optional[List[str]] = []
    seller_type: Optional[str] = None
    status: Optional[str] = "ATTIVO"
    posted_date: Optional[str] = None
    expiry_date: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    viewed: bool = False
    is_favorite: bool = False

class AgentResponse(BaseModel):
    agent_type: str
    summary: str
    keywords: List[str]
    results: List[Dict[str, Any]]


# ==================== SPECIALIZED AGENTS ====================
class SpecializedAgent:
    """Base class for specialized agents"""
    
    def __init__(self, agent_type: str):
        self.agent_type = agent_type
        self.chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{agent_type}-{str(uuid.uuid4())}",
            system_message=self._get_system_message()
        ).with_model("openai", "gpt-5.4")
    
    def _get_system_message(self) -> str:
        """Override in subclasses"""
        return "You are a helpful AI assistant."
    
    async def process_query(self, query: str, language: str = "it") -> Dict[str, Any]:
        """Process user query and return structured response"""
        try:
            prompt = self._create_prompt(query, language)
            
            response_text = ""
            user_message = UserMessage(text=prompt)
            
            async for event in self.chat.stream_message(user_message):
                if isinstance(event, TextDelta):
                    response_text += event.content
                elif isinstance(event, StreamDone):
                    break
            
            return self._parse_response(response_text)
        except Exception as e:
            logging.error(f"LLM processing error: {str(e)}")
            # Fallback to basic extraction if LLM fails
            return self._fallback_extraction(query, language)
    
    def _create_prompt(self, query: str, language: str) -> str:
        """Create prompt for the agent"""
        lang_instruction = "Rispondi in italiano." if language == "it" else "Respond in English."
        return f"""{lang_instruction}

Query dell'utente: {query}

Analizza questa richiesta e fornisci:
1. Un riassunto delle informazioni chiave da cercare
2. 5-7 parole chiave rilevanti per la ricerca
3. Suggerimenti su dove cercare queste informazioni

Rispondi in formato JSON con questa struttura:
{{
    "summary": "riassunto della richiesta",
    "keywords": ["keyword1", "keyword2", ...],
    "search_suggestions": ["sito1", "sito2", ...]
}}"""
    
    def _parse_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM response"""
        try:
            # Try to extract JSON from response
            start = response.find('{')
            end = response.rfind('}') + 1
            if start >= 0 and end > start:
                json_str = response[start:end]
                return json.loads(json_str)
        except (json.JSONDecodeError, ValueError):
            pass
        
        # Fallback
        return {
            "summary": response[:200],
            "keywords": [],
            "search_suggestions": []
        }
    
    def _fallback_extraction(self, query: str, language: str) -> Dict[str, Any]:
        """Fallback keyword extraction when LLM is unavailable"""
        # Simple keyword extraction from query
        words = query.lower().split()
        # Remove common words
        common_words = {'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'di', 'da', 'a', 'in', 'su', 'per', 'con', 'tra', 'fra', 'e', 'o', 'ma', 'se', 'come', 'quando', 'dove', 'perché', 'che', 'chi', 'cui', 'quale', 'quanto', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        keywords = [w for w in words if len(w) > 3 and w not in common_words][:7]
        
        return {
            "summary": f"Ricerca: {query[:100]}",
            "keywords": keywords,
            "search_suggestions": ["Google", "Siti specializzati"]
        }


class RealEstateAgent(SpecializedAgent):
    """Agent specialized in real estate searches (IMMOBILI)"""
    
    def __init__(self):
        super().__init__("real_estate")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto immobiliare che aiuta le persone a trovare case e proprietà. 
        Analizza le richieste immobiliari estraendo: posizione, tipo di proprietà, budget, caratteristiche richieste, 
        e servizi nelle vicinanze. Fornisci parole chiave ottimizzate per la ricerca su siti immobiliari."""


class VehicleAgent(SpecializedAgent):
    """Agent specialized in vehicle searches (AUTO E MOTO)"""
    
    def __init__(self):
        super().__init__("vehicle")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto di auto e moto che aiuta le persone a trovare veicoli. 
        Analizza le richieste estraendo: marca, modello, anno, chilometraggio, prezzo, tipo di carburante, 
        e caratteristiche speciali. Fornisci parole chiave per siti di compravendita veicoli."""


class EntertainmentAgent(SpecializedAgent):
    """Agent specialized in entertainment (DIVERTIMENTO)"""
    
    def __init__(self):
        super().__init__("entertainment")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto di intrattenimento che aiuta le persone a trovare eventi, spettacoli e attività. 
        Analizza le richieste estraendo: tipo di evento, località, date, preferenze, budget. 
        Fornisci parole chiave per siti di eventi e intrattenimento."""


class LegalAgent(SpecializedAgent):
    """Agent specialized in laws and regulations (NUOVE LEGGI)"""
    
    def __init__(self):
        super().__init__("legal")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto legale che monitora nuove leggi e regolamenti. 
        Analizza le richieste estraendo: area legale, giurisdizione, data di entrata in vigore. 
        Fornisci parole chiave per gazzette ufficiali e siti di informazione legale."""


class TenderAgent(SpecializedAgent):
    """Agent specialized in public tenders (BANDI DI CONCORSO)"""
    
    def __init__(self):
        super().__init__("tender")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto di bandi pubblici che aiuta a trovare concorsi e bandi. 
        Analizza le richieste estraendo: tipo di bando, ente pubblico, requisiti, scadenze, area geografica. 
        Fornisci parole chiave per portali di bandi pubblici."""


class ContractAgent(SpecializedAgent):
    """Agent specialized in public contracts and state/regional funds
    (GARE D'APPALTO / FONDI STATALI E REGIONALI)"""
    
    def __init__(self):
        super().__init__("contract")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto di gare d'appalto pubbliche e di fondi statali e regionali. 
        Analizza le richieste estraendo: tipo di appalto o fondo (bando, contributo, sovvenzione), 
        importo o stanziamento, settore, ente appaltante o ente erogante (Ministero, Regione, Comune, GSE, 
        Invitalia, ecc.), requisiti, scadenze, e area geografica di applicazione (nazionale, regionale). 
        Fornisci parole chiave per portali di gare pubbliche (acquistinretepa, ANAC) e per fondi (Bandi Regione, 
        Ministero, Simest, Invitalia, PNRR)."""


class FinanceAgent(SpecializedAgent):
    """Agent specialized in finance (FINANZA)"""
    
    def __init__(self):
        super().__init__("finance")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto finanziario che monitora opportunità di investimento e informazioni finanziarie. 
        Analizza le richieste estraendo: tipo di investimento, mercati, rischio, rendimenti, settori. 
        Fornisci parole chiave per siti finanziari e di investimento."""


class JobAgent(SpecializedAgent):
    """Agent specialized in job opportunities (NUOVE RICHIESTE LAVORATIVE)"""
    
    def __init__(self):
        super().__init__("job")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto di ricerca lavoro che aiuta a trovare opportunità lavorative. 
        Analizza le richieste estraendo: posizione, settore, esperienza richiesta, località, tipo di contratto. 
        Fornisci parole chiave per portali di lavoro."""


# Agent factory
def get_agent_for_category(category: str) -> SpecializedAgent:
    """Get the appropriate agent for a category"""
    agents = {
        "immobili": RealEstateAgent,
        "auto_moto": VehicleAgent,
        "divertimento": EntertainmentAgent,
        "nuove_leggi": LegalAgent,
        "bandi": TenderAgent,
        "gare_appalto": ContractAgent,
        "finanza": FinanceAgent,
        "lavoro": JobAgent,
    }
    
    agent_class = agents.get(category, SpecializedAgent)
    return agent_class()


# ==================== AI-POWERED RESULT GENERATION ====================
async def generate_ai_results(query: str, category: str, language: str = "it") -> List[Dict[str, Any]]:
    """Use LLM to generate contextually relevant mock results based on the user's actual query.
    
    This function uses AI to create realistic search results that reflect the user's
    specific request (location, price, features, etc.) instead of returning hardcoded data.
    """
    category_context = {
        "immobili": "annunci immobiliari (case, appartamenti in vendita/affitto)",
        "auto_moto": "annunci di veicoli (auto, moto usate/nuove)",
        "divertimento": "eventi, spettacoli, attività ricreative",
        "nuove_leggi": "nuove leggi e normative italiane",
        "bandi": "bandi di concorso pubblici",
        "gare_appalto": "gare d'appalto pubbliche E fondi statali/regionali (contributi, sovvenzioni, PNRR, Simest, Invitalia)",
        "finanza": "opportunità di investimento e finanza",
        "lavoro": "offerte di lavoro e posizioni aperte",
    }
    
    source_examples = {
        "immobili": "immobiliare.it, casa.it, idealista.it, subito.it",
        "auto_moto": "autoscout24.it, subito.it, automobile.it",
        "divertimento": "ticketone.it, mailticket.it, boxol.it",
        "nuove_leggi": "gazzettaufficiale.it, normattiva.it",
        "bandi": "concorsipubblici.com, gazzettaufficiale.it",
        "gare_appalto": "acquistinretepa.it, mit.gov.it, invitalia.it, simest.it, bandi.regione.[nome].it, ANAC",
        "finanza": "borsaitaliana.it, milanofinanza.it",
        "lavoro": "linkedin.com/jobs, indeed.it, infojobs.it",
    }
    
    context = category_context.get(category, "informazioni generiche")
    sources = source_examples.get(category, "vari siti web")
    
    # Seller-type taxonomy per category — the AI MUST pick from this list.
    seller_type_options = {
        "immobili": '"Privato" | "Agenzia Immobiliare"',
        "auto_moto": '"Privato" | "Rivenditore Ufficiale" | "Concessionario"',
        "divertimento": '"Organizzatore Ufficiale" | "Rivenditore Autorizzato" | "Privato"',
        "nuove_leggi": '"Ente Pubblico"',
        "bandi": '"Ente Pubblico"',
        "gare_appalto": '"Ente Pubblico" | "Amministrazione Locale" | "Regione" | "Ministero" | "Ente Erogante Fondi"',
        "finanza": '"Istituto Finanziario" | "Broker Autorizzato" | "Privato"',
        "lavoro": '"Azienda" | "Agenzia per il Lavoro" | "Ente Pubblico" | "Privato"',
    }
    seller_options = seller_type_options.get(category, '"Privato" | "Azienda"')
    
    today = datetime.now(timezone.utc)
    today_str = today.strftime("%d/%m/%Y")
    year = today.year
    
    # Categories that REQUIRE an explicit expiry_date to be considered active
    requires_expiry = category in ("gare_appalto", "bandi")
    expiry_instruction = (
        f"OBBLIGATORIO: ogni risultato DEVE includere `expiry_date` (formato DD/MM/YYYY) "
        f"posteriore a {today_str}. Se un bando/appalto/fondo è già scaduto, NON includerlo. "
        f"Ordina i risultati dal più recente (`posted_date` DESC)."
        if requires_expiry
        else f"Includi `expiry_date` solo se applicabile (es. offerte a scadenza), altrimenti null."
    )
    
    prompt = f"""Sei un motore di ricerca specializzato in {context}.
DATA ODIERNA: {today_str}
ANNO CORRENTE: {year}

RICHIESTA DELL'UTENTE: "{query}"

Devi generare 3-4 risultati di ricerca REALISTICI, AGGIORNATI ALLA DATA ODIERNA e ATTUALMENTE VALIDI/ATTIVI:
- Tutti i risultati devono essere ANCORA IN CORSO / VALIDI oggi ({today_str})
- NON includere annunci scaduti, chiusi, ritirati, o vecchi di più di 60 giorni per `posted_date`
- La LOCALITÀ deve essere ESATTAMENTE quella richiesta dall'utente
- Il PREZZO/BUDGET deve rientrare nel range indicato
- Le CARATTERISTICHE devono corrispondere alla richiesta
- Ordina i risultati dal PIÙ RECENTE al più vecchio (per `posted_date`)

{expiry_instruction}

Fonti tipiche: {sources}
Valori validi per seller_type in questa categoria: {seller_options}

Restituisci SOLO un JSON valido con questo formato ESATTO (nessun altro testo):
{{
  "results": [
    {{
      "title": "Titolo dell'annuncio (specifico per la località e ATTUALE)",
      "snippet": "Descrizione dettagliata dell'annuncio con dettagli plausibili per la zona",
      "link": "https://sito-realistico.it/annuncio-specifico",
      "contacts": ["email@esempio.it", "+39 XXX XXXXXXX"],
      "seller_type": "uno dei valori validi elencati sopra",
      "status": "ATTIVO",
      "posted_date": "DD/MM/YYYY (data recente, entro gli ultimi 60 giorni)",
      "expiry_date": "DD/MM/YYYY (data futura) oppure null se non applicabile"
    }}
  ]
}}

IMPORTANTE: 
- I risultati DEVONO riflettere la località, prezzo e caratteristiche richieste dall'utente
- Se l'utente cerca ad Alcamo, TUTTI i risultati devono essere ad Alcamo (Sicilia)
- Genera prefissi telefonici corretti per la zona (091 per Palermo/Alcamo, 011 per Torino, 02 per Milano, ecc.)
- I nomi delle agenzie/aziende devono essere plausibili per la zona
- Varia i seller_type tra i risultati (es. mix di Privato e Agenzia) per realismo
- I contatti (email/telefono) devono essere coerenti col seller_type
- `status` DEVE essere sempre "ATTIVO" (perché filtriamo solo annunci validi)
- `posted_date` deve essere una data reale degli ultimi 60 giorni, coerente con {today_str}
- Ordina la lista di `results` dal più recente al più vecchio per `posted_date`
"""
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"results-gen-{str(uuid.uuid4())}",
            system_message="Sei un motore di ricerca AI che genera risultati contestualizzati e realistici."
        ).with_model("openai", "gpt-5.4-mini")
        
        response_text = ""
        async for event in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(event, TextDelta):
                response_text += event.content
            elif isinstance(event, StreamDone):
                break
        
        # Parse JSON response
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start >= 0 and end > start:
            data = json.loads(response_text[start:end])
            results = data.get("results", [])
            if results:
                return results
    except Exception as e:
        logging.error(f"AI result generation failed: {str(e)}")
    
    # Ultimate fallback: use query in the result so it's at least contextual
    return [
        {
            "title": f"Ricerca in corso per: {query[:80]}",
            "snippet": f"Configura la chiave API Serper per ottenere risultati reali dal web che corrispondono a: {query[:150]}",
            "link": "https://serper.dev",
            "contacts": []
        }
    ]


# ==================== MOCK SEARCH RESULTS (Legacy fallback) ====================
def get_mock_results(query: str, category: str) -> List[Dict[str, Any]]:
    """Legacy fallback - returns a single query-aware placeholder"""
    return [
        {
            "title": f"Risultato per: {query[:80]}",
            "snippet": f"Per ottenere risultati reali che corrispondano alla tua ricerca, configura la chiave API Serper. Query: {query[:200]}",
            "link": "https://serper.dev",
            "contacts": []
        }
    ]


# ==================== API ENDPOINTS ====================
@api_router.get("/notifications/unviewed-count")
async def get_unviewed_count():
    """Get the count of unviewed results (for notification bell).
    Returns total count and breakdown by category."""
    unviewed = await db.results.count_documents({"viewed": False})
    
    # Get counts per category (join with searches collection)
    pipeline = [
        {"$match": {"viewed": False}},
        {"$lookup": {
            "from": "searches",
            "localField": "search_id",
            "foreignField": "id",
            "as": "search",
        }},
        {"$unwind": "$search"},
        {"$group": {
            "_id": "$search.category",
            "count": {"$sum": 1},
        }},
    ]
    per_category_cursor = db.results.aggregate(pipeline)
    per_category = {}
    async for doc in per_category_cursor:
        per_category[doc["_id"]] = doc["count"]
    
    return {
        "total": unviewed,
        "per_category": per_category,
    }


@api_router.post("/searches/{search_id}/mark-viewed")
async def mark_search_results_viewed(search_id: str):
    """Mark all results of a search as viewed"""
    result = await db.results.update_many(
        {"search_id": search_id, "viewed": False},
        {"$set": {"viewed": True}},
    )
    return {
        "message": "Results marked as viewed",
        "search_id": search_id,
        "updated_count": result.modified_count,
    }


@api_router.get("/notifications/unviewed")
async def get_unviewed_notifications():
    """Return the list of all unread search results with their category info.
    Used by the dedicated Notifications screen (bell icon)."""
    pipeline = [
        {"$match": {"viewed": False}},
        {"$lookup": {
            "from": "searches",
            "localField": "search_id",
            "foreignField": "id",
            "as": "search",
        }},
        {"$unwind": {"path": "$search", "preserveNullAndEmptyArrays": True}},
        {"$sort": {"created_at": -1}},
        {"$project": {
            "_id": 0,
            "id": 1,
            "search_id": 1,
            "title": 1,
            "summary": 1,
            "keywords": 1,
            "source_link": 1,
            "contacts": 1,
            "seller_type": 1,
            "status": 1,
            "posted_date": 1,
            "expiry_date": 1,
            "created_at": 1,
            "viewed": 1,
            "is_favorite": 1,
            "category": "$search.category",
            "query": "$search.query",
        }},
    ]
    cursor = db.results.aggregate(pipeline)
    items: List[Dict[str, Any]] = []
    async for doc in cursor:
        # Ensure created_at is JSON-serializable
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        items.append(doc)
    return items


@api_router.post("/notifications/mark-all-viewed")
async def mark_all_notifications_viewed():
    """Mark ALL unread results as viewed. Used when the user opens the
    Notifications screen and later dismisses it, or explicitly taps 'clear'."""
    res = await db.results.update_many(
        {"viewed": False},
        {"$set": {"viewed": True}},
    )
    return {"updated_count": res.modified_count}


# ==================== PUSH NOTIFICATIONS ====================
class RegisterPushBody(BaseModel):
    user_id: str
    platform: str   # "android" | "ios"
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    """Register a device push token via the Emergent managed relay (SuprSend).

    Always persists the (user_id, platform, device_token) locally so that
    `send_push` has recipients even when the EMERGENT_PUSH_KEY is still a
    placeholder (dev/preview). The relay call is best-effort in that case."""
    # Local upsert first — idempotent, keyed by (user_id, platform)
    await db.push_tokens.update_one(
        {"user_id": body.user_id, "platform": body.platform},
        {"$set": {
            "user_id": body.user_id,
            "platform": body.platform,
            "device_token": body.device_token,
            "updated_at": datetime.utcnow(),
        }},
        upsert=True,
    )

    # Attempt to relay to Emergent push provider
    try:
        resp = await _push_client.post(
            "/api/v1/push/users/register",
            json=body.model_dump(),
        )
        if resp.status_code == 401:
            # Placeholder key or misconfigured — deployment pipeline will fix.
            logging.info("register_push: EMERGENT_PUSH_KEY placeholder/invalid, saved locally only")
            return {"status": "queued", "note": "push key not yet configured"}
        if resp.status_code >= 500:
            logging.warning("register_push: relay unavailable, saved locally only")
            return {"status": "queued", "note": "relay unavailable"}
        resp.raise_for_status()
        return {"status": "registered"}
    except Exception as e:
        logging.warning(f"register_push relay failed (saved locally): {e}")
        return {"status": "queued", "note": "relay error"}


async def send_push(
    recipients: List[str],
    data: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> None:
    """Trigger a push notification via the Emergent relay.
    Never blocks the caller — errors are logged but not raised upstream."""
    if not recipients:
        return
    if len(recipients) > 100:
        # Chunk to keep the relay happy
        for i in range(0, len(recipients), 100):
            await send_push(recipients[i : i + 100], data, idempotency_key)
        return
    if "title" not in data or "message" not in data:
        raise ValueError("send_push data must include 'title' and 'message'")

    payload: Dict[str, Any] = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key

    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


async def _get_all_recipient_ids() -> List[str]:
    """Return all known user_ids that registered a push token.
    In this app (no auth), we broadcast to every registered device user_id."""
    ids: List[str] = []
    cursor = db.push_tokens.find({}, {"_id": 0, "user_id": 1})
    async for doc in cursor:
        uid = doc.get("user_id")
        if uid and uid not in ids:
            ids.append(uid)
    return ids


@api_router.get("/search/active/counts")
async def get_active_search_counts_per_category():
    """Get active search count per category, for the home screen."""
    pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {
            "_id": "$category",
            "count": {"$sum": 1},
        }},
    ]
    cursor = db.searches.aggregate(pipeline)
    per_category = {}
    total = 0
    async for doc in cursor:
        per_category[doc["_id"]] = doc["count"]
        total += doc["count"]
    
    return {
        "total": total,
        "per_category": per_category,
    }


@api_router.post("/results/{result_id}/toggle-favorite")
async def toggle_result_favorite(result_id: str):
    """Toggle the favorite status of a result"""
    result = await db.results.find_one({"id": result_id}, {"_id": 0})
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    new_state = not result.get("is_favorite", False)
    await db.results.update_one(
        {"id": result_id},
        {"$set": {"is_favorite": new_state}},
    )
    
    return {
        "result_id": result_id,
        "is_favorite": new_state,
    }


@api_router.get("/results/favorites")
async def get_favorite_results():
    """Get all favorite results across all searches"""
    cursor = db.results.find({"is_favorite": True}, {"_id": 0}).sort("created_at", -1)
    favorites = await cursor.to_list(500)
    return [SearchResult(**doc) for doc in favorites]


@api_router.get("/")
async def root():
    return {"message": "JARVIS API - Your Digital Assistant"}

@api_router.post("/search/create", response_model=SearchQuery)
async def create_search(input: SearchQueryCreate):
    """Create a new search query"""
    search_dict = input.dict()
    search_obj = SearchQuery(**search_dict)
    
    # Save to database
    await db.searches.insert_one(search_obj.dict())
    
    return search_obj

@api_router.get("/search/active", response_model=List[SearchQuery])
async def get_active_searches():
    """Get all active searches"""
    searches = await db.searches.find({"is_active": True}).sort("created_at", -1).to_list(100)
    return [SearchQuery(**search) for search in searches]

@api_router.get("/search/{search_id}")
async def get_search(search_id: str):
    """Get a specific search by ID"""
    search = await db.searches.find_one({"id": search_id})
    if not search:
        raise HTTPException(status_code=404, detail="Search not found")
    return SearchQuery(**search)

@api_router.delete("/search/{search_id}")
async def delete_search(search_id: str):
    """Delete a search and all its results"""
    # Delete the search
    search_result = await db.searches.delete_one({"id": search_id})
    
    if search_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Search not found")
    
    # Also delete all results for this search
    await db.results.delete_many({"search_id": search_id})
    
    return {"message": "Search and results deleted successfully", "search_id": search_id}


class BulkDeleteInput(BaseModel):
    ids: List[str]


class BulkToggleInput(BaseModel):
    ids: List[str]
    is_active: bool


@api_router.patch("/search/{search_id}/toggle-active")
async def toggle_search_active(search_id: str, is_active: bool = True):
    """Toggle the `is_active` flag of a single search without deleting it.
    Deactivated searches keep their history and results, but no longer show up
    in the active counters on the home."""
    updated = await db.searches.update_one(
        {"id": search_id}, {"$set": {"is_active": is_active}}
    )
    if updated.matched_count == 0:
        raise HTTPException(status_code=404, detail="Search not found")
    return {"search_id": search_id, "is_active": is_active}


@api_router.post("/search/toggle-active-many")
async def toggle_active_many(input: BulkToggleInput):
    """Bulk deactivate (or reactivate) multiple searches at once."""
    if not input.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    res = await db.searches.update_many(
        {"id": {"$in": input.ids}}, {"$set": {"is_active": input.is_active}}
    )
    return {
        "matched_count": res.matched_count,
        "modified_count": res.modified_count,
        "is_active": input.is_active,
    }


@api_router.post("/search/delete-many")
async def delete_many_searches(input: BulkDeleteInput):
    """Delete multiple searches and their results at once"""
    if not input.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    searches_result = await db.searches.delete_many({"id": {"$in": input.ids}})
    await db.results.delete_many({"search_id": {"$in": input.ids}})
    
    return {
        "message": "Searches deleted successfully",
        "deleted_count": searches_result.deleted_count,
        "requested_count": len(input.ids),
    }


@api_router.delete("/results/{result_id}")
async def delete_result(result_id: str):
    """Delete a single result"""
    result = await db.results.delete_one({"id": result_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Result not found")
    return {"message": "Result deleted successfully", "result_id": result_id}


@api_router.post("/results/delete-many")
async def delete_many_results(input: BulkDeleteInput):
    """Delete multiple results at once"""
    if not input.ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    result = await db.results.delete_many({"id": {"$in": input.ids}})
    
    return {
        "message": "Results deleted successfully",
        "deleted_count": result.deleted_count,
        "requested_count": len(input.ids),
    }


@api_router.post("/search/process")
async def process_search_query(input: SearchQueryCreate):
    """Process a search query with specialized agent and generate context-aware results"""
    try:
        # Get the appropriate agent for the category
        agent = get_agent_for_category(input.category)
        
        # Try to process with AI, fall back to basic extraction if it fails
        try:
            agent_result = await agent.process_query(input.query, input.language)
        except Exception as llm_error:
            logging.warning(f"LLM agent processing failed, using fallback: {str(llm_error)}")
            agent_result = agent._fallback_extraction(input.query, input.language)
        
        # Generate context-aware results using AI (based on user's actual query)
        try:
            search_results = await generate_ai_results(input.query, input.category, input.language)
        except Exception as gen_error:
            logging.warning(f"AI result generation failed, using fallback: {str(gen_error)}")
            search_results = get_mock_results(input.query, input.category)
        
        # Save search query
        search_obj = SearchQuery(**input.dict())
        await db.searches.insert_one(search_obj.dict())
        
        # Save results — the AI is instructed to return them sorted from newest
        # to oldest by posted_date, so we preserve that order.
        saved_results = []
        for result in search_results:
            search_result = SearchResult(
                search_id=search_obj.id,
                title=result.get("title", ""),
                summary=result.get("snippet", ""),
                keywords=agent_result.get("keywords", []),
                source_link=result.get("link", ""),
                contacts=result.get("contacts", []),
                seller_type=result.get("seller_type"),
                status=result.get("status") or "ATTIVO",
                posted_date=result.get("posted_date"),
                expiry_date=result.get("expiry_date"),
            )
            await db.results.insert_one(search_result.dict())
            saved_results.append(search_result.dict())

        # Fire a native push notification (non-blocking) so users are alerted
        # to new announcements even when the app is in the background.
        try:
            recipients = await _get_all_recipient_ids()
            if recipients and saved_results:
                first = saved_results[0]
                count = len(saved_results)
                title = f"JARVIS · {input.category}"
                if count == 1:
                    message = first.get("title") or input.query
                else:
                    message = f"{count} nuovi annunci per: {input.query}"
                await send_push(
                    recipients=recipients,
                    data={
                        "title": title[:80],
                        "message": message[:180],
                        "action_url": "/notifications",
                    },
                    idempotency_key=f"search-{search_obj.id}",
                )
        except Exception as push_err:
            logging.warning(f"Push notification failed (non-blocking): {push_err}")

        return {
            "search_id": search_obj.id,
            "agent_type": agent.agent_type,
            "summary": agent_result.get("summary", ""),
            "keywords": agent_result.get("keywords", []),
            "results": saved_results,
            "note": "AI-generated context-aware results. Add Serper API key for real web results."
        }
        
    except Exception as e:
        logging.error(f"Error processing search: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def _parse_dmy(s: Optional[str]) -> Optional[datetime]:
    """Best-effort parse of a DD/MM/YYYY string. Returns None on failure."""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y")
    except (ValueError, AttributeError):
        return None


@api_router.get("/search/{search_id}/results", response_model=List[SearchResult])
async def get_search_results(search_id: str):
    """Get results for a specific search, sorted by posted_date DESC
    (most recent first). Results without a parseable posted_date fall back to
    the DB insertion order (created_at DESC)."""
    results = await db.results.find({"search_id": search_id}, {"_id": 0}).to_list(100)
    
    def sort_key(r):
        dt = _parse_dmy(r.get("posted_date"))
        if dt is not None:
            return (1, dt)
        # Fallback to created_at
        return (0, r.get("created_at") or datetime.min)
    
    results.sort(key=sort_key, reverse=True)
    return [SearchResult(**result) for result in results]

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "llm_configured": bool(EMERGENT_LLM_KEY),
        "serper_configured": bool(SERPER_API_KEY and SERPER_API_KEY != "placeholder_get_free_key_from_serper_dev")
    }


# ==================== AUTH & USERS ====================
from fastapi import Depends, Header

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    role: str
    is_active: bool
    plan: Optional[str] = "free"
    plan_status: Optional[str] = "inactive"
    plan_started_at: Optional[str] = None
    plan_expires_at: Optional[str] = None
    created_at: Optional[str] = None

class UserUpdateAdmin(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    plan: Optional[str] = None
    plan_status: Optional[str] = None

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _user_to_out(doc: Dict[str, Any]) -> UserOut:
    """Convert a DB user document to the public UserOut model."""
    def _iso(v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v
    return UserOut(
        id=doc.get("id") or str(doc.get("_id")),
        email=doc["email"],
        role=doc.get("role", "user"),
        is_active=doc.get("is_active", True),
        plan=doc.get("plan", "free"),
        plan_status=doc.get("plan_status", "inactive"),
        plan_started_at=_iso(doc.get("plan_started_at")),
        plan_expires_at=_iso(doc.get("plan_expires_at")),
        created_at=_iso(doc.get("created_at")),
    )


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Decode JWT (email/password login) OR resolve Google session_token.

    Try local JWT first; on failure fall back to a `user_sessions` lookup so that
    Google-authenticated users (whose "token" is the Emergent session_token) can
    use the same protected endpoints as password users.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(None, 1)[1].strip()

    # Path 1: local JWT
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            user = await db.users.find_one({"id": user_id}, {"_id": 0})
            if not user or not user.get("is_active", True):
                raise HTTPException(status_code=401, detail="User not found or inactive")
            return user
    except JWTError:
        # Not a JWT — fall through and try Google session
        pass

    # Path 2: Emergent Google session_token
    from routers.google_auth import get_user_from_session_token
    user = await get_user_from_session_token(db, token)
    if user:
        return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user


@api_router.post("/auth/register", response_model=TokenOut, status_code=201)
async def auth_register(body: UserRegister):
    """Register a new regular user (role=user by default)."""
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "hashed_password": hash_password(body.password),
        "role": "user",
        "is_active": True,
        "plan": "free",
        "plan_status": "inactive",
        "plan_started_at": None,
        "plan_expires_at": None,
        "created_at": datetime.utcnow(),
    }
    await db.users.insert_one(doc)
    token = create_access_token({"sub": uid, "role": "user", "email": doc["email"]})
    return TokenOut(access_token=token, user=_user_to_out(doc))


@api_router.post("/auth/login", response_model=TokenOut)
async def auth_login(body: UserLogin):
    """Login with email and password. Returns JWT + user info."""
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Email o password errati")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disattivato")
    token = create_access_token({
        "sub": user["id"],
        "role": user.get("role", "user"),
        "email": user["email"],
    })
    return TokenOut(access_token=token, user=_user_to_out(user))


@api_router.get("/auth/me", response_model=UserOut)
async def auth_me(user: Dict[str, Any] = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return _user_to_out(user)


# ---------- Admin: user management ----------
@api_router.get("/admin/users", response_model=List[UserOut])
async def admin_list_users(_: Dict[str, Any] = Depends(require_admin)):
    """List all users (both admins and regular users)."""
    users: List[UserOut] = []
    cursor = db.users.find({}, {"_id": 0}).sort("created_at", -1)
    async for doc in cursor:
        users.append(_user_to_out(doc))
    return users


@api_router.post("/admin/users", response_model=UserOut, status_code=201)
async def admin_create_user(body: UserRegister, admin: Dict[str, Any] = Depends(require_admin)):
    """Create a new user or admin. Set role via subsequent PATCH."""
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "hashed_password": hash_password(body.password),
        "role": "user",
        "is_active": True,
        "plan": "free",
        "plan_status": "inactive",
        "plan_started_at": None,
        "plan_expires_at": None,
        "created_at": datetime.utcnow(),
    }
    await db.users.insert_one(doc)
    return _user_to_out(doc)


@api_router.patch("/admin/users/{user_id}", response_model=UserOut)
async def admin_update_user(
    user_id: str,
    body: UserUpdateAdmin,
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Update a user (email, password, role, active, plan). Password is
    hashed if provided. Admins cannot demote themselves to prevent lockouts."""
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    update: Dict[str, Any] = {}
    if body.email is not None:
        new_email = body.email.lower()
        if new_email != target["email"]:
            clash = await db.users.find_one({"email": new_email})
            if clash:
                raise HTTPException(status_code=400, detail="Email già in uso")
        update["email"] = new_email
    if body.password:
        update["hashed_password"] = hash_password(body.password)
    if body.role is not None:
        if body.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Ruolo non valido")
        if user_id == admin["id"] and body.role != "admin":
            raise HTTPException(status_code=400, detail="Non puoi rimuovere il tuo ruolo admin")
        update["role"] = body.role
    if body.is_active is not None:
        if user_id == admin["id"] and body.is_active is False:
            raise HTTPException(status_code=400, detail="Non puoi disattivare te stesso")
        update["is_active"] = body.is_active
    if body.plan is not None:
        update["plan"] = body.plan
    if body.plan_status is not None:
        update["plan_status"] = body.plan_status

    if not update:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")

    await db.users.update_one({"id": user_id}, {"$set": update})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    return _user_to_out(updated)


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    """Delete a user. Admins cannot delete themselves."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Non puoi eliminare te stesso")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return {"deleted_id": user_id}



# Analytics endpoints are mounted from routers/analytics.py (see below)



async def _seed_admins():
    """Idempotent seeding of the two admin accounts requested by the owner."""
    for email, pw in SEED_ADMINS:
        email_l = email.lower()
        existing = await db.users.find_one({"email": email_l})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email_l,
                "hashed_password": hash_password(pw),
                "role": "admin",
                "is_active": True,
                "plan": "premium",
                "plan_status": "active",
                "plan_started_at": datetime.utcnow(),
                "plan_expires_at": None,
                "created_at": datetime.utcnow(),
            })
            logging.info(f"Seeded admin account: {email_l}")
        else:
            # Ensure the account is admin & active; do NOT overwrite password
            # unless someone explicitly rotates it via the API.
            fixes: Dict[str, Any] = {}
            if existing.get("role") != "admin":
                fixes["role"] = "admin"
            if not existing.get("is_active", True):
                fixes["is_active"] = True
            if fixes:
                await db.users.update_one({"email": email_l}, {"$set": fixes})


# Include the router in the main app
app.include_router(api_router)

# Mount the analytics sub-router under /api (extracted for maintainability)
from routers.analytics import build_analytics_router  # noqa: E402
app.include_router(build_analytics_router(db, require_admin), prefix="/api")

# Mount the billing (Stripe subscriptions) sub-router under /api
from routers.billing import build_billing_router  # noqa: E402
app.include_router(build_billing_router(db, get_current_user), prefix="/api")

# Mount the Google Auth (Emergent-managed OAuth) sub-router under /api
from routers.google_auth import build_google_auth_router  # noqa: E402
app.include_router(build_google_auth_router(db), prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        await _push_client.aclose()
    except Exception:
        pass
    client.close()


@app.on_event("startup")
async def startup_seed_admins():
    """Ensure the two seed admin accounts exist and unique email index."""
    try:
        await db.users.create_index("email", unique=True)
        await db.push_tokens.create_index([("user_id", 1), ("platform", 1)], unique=True)
    except Exception as e:
        logging.warning(f"Index creation warning: {e}")
    try:
        await _seed_admins()
    except Exception as e:
        logging.error(f"Admin seeding failed: {e}")
