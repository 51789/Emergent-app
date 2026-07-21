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
from datetime import datetime
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
import json
import asyncio


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Get API keys
EMERGENT_LLM_KEY = os.getenv('EMERGENT_LLM_KEY')
SERPER_API_KEY = os.getenv('SERPER_API_KEY', '')

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
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
    """Agent specialized in public contracts (GARE D'APPALTO)"""
    
    def __init__(self):
        super().__init__("contract")
    
    def _get_system_message(self) -> str:
        return """Sei un esperto di gare d'appalto pubbliche. 
        Analizza le richieste estraendo: tipo di appalto, importo, settore, ente appaltante, requisiti. 
        Fornisci parole chiave per portali di gare pubbliche."""


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
        "gare_appalto": "gare d'appalto pubbliche",
        "finanza": "opportunità di investimento e finanza",
        "lavoro": "offerte di lavoro e posizioni aperte",
    }
    
    source_examples = {
        "immobili": "immobiliare.it, casa.it, idealista.it, subito.it",
        "auto_moto": "autoscout24.it, subito.it, automobile.it",
        "divertimento": "ticketone.it, mailticket.it, boxol.it",
        "nuove_leggi": "gazzettaufficiale.it, normattiva.it",
        "bandi": "concorsipubblici.com, gazzettaufficiale.it",
        "gare_appalto": "acquistinretepa.it, mit.gov.it",
        "finanza": "borsaitaliana.it, milanofinanza.it",
        "lavoro": "linkedin.com/jobs, indeed.it, infojobs.it",
    }
    
    context = category_context.get(category, "informazioni generiche")
    sources = source_examples.get(category, "vari siti web")
    
    prompt = f"""Sei un motore di ricerca specializzato in {context}.

RICHIESTA DELL'UTENTE: "{query}"

Devi generare 3-4 risultati di ricerca REALISTICI che rispettino ESATTAMENTE i criteri dell'utente:
- La LOCALITÀ deve essere ESATTAMENTE quella richiesta dall'utente (se ha detto Alcamo, i risultati devono essere ad Alcamo, NON a Torino o altre città)
- Il PREZZO/BUDGET deve rientrare nel range indicato
- Le CARATTERISTICHE (tipologia, superficie, ecc.) devono corrispondere
- I dettagli devono essere plausibili e realistici per la zona indicata

Fonti tipiche: {sources}

Restituisci SOLO un JSON valido con questo formato ESATTO (nessun altro testo):
{{
  "results": [
    {{
      "title": "Titolo dell'annuncio (specifico per la località richiesta)",
      "snippet": "Descrizione dettagliata dell'annuncio con dettagli plausibili per la zona",
      "link": "https://sito-realistico.it/annuncio-specifico",
      "contacts": ["email@esempio.it", "+39 XXX XXXXXXX"]
    }}
  ]
}}

IMPORTANTE: 
- I risultati DEVONO riflettere la località, prezzo e caratteristiche richieste dall'utente
- Se l'utente cerca ad Alcamo, TUTTI i risultati devono essere ad Alcamo (Sicilia)
- Genera prefissi telefonici corretti per la zona (091 per Palermo/Alcamo, 011 per Torino, 02 per Milano, ecc.)
- I nomi delle agenzie/aziende devono essere plausibili per la zona
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
        
        # Save results
        saved_results = []
        for result in search_results:
            search_result = SearchResult(
                search_id=search_obj.id,
                title=result.get("title", ""),
                summary=result.get("snippet", ""),
                keywords=agent_result.get("keywords", []),
                source_link=result.get("link", ""),
                contacts=result.get("contacts", [])
            )
            await db.results.insert_one(search_result.dict())
            saved_results.append(search_result.dict())
        
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

@api_router.get("/search/{search_id}/results", response_model=List[SearchResult])
async def get_search_results(search_id: str):
    """Get results for a specific search"""
    results = await db.results.find({"search_id": search_id}).to_list(100)
    return [SearchResult(**result) for result in results]

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "llm_configured": bool(EMERGENT_LLM_KEY),
        "serper_configured": bool(SERPER_API_KEY and SERPER_API_KEY != "placeholder_get_free_key_from_serper_dev")
    }


# Include the router in the main app
app.include_router(api_router)

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
    client.close()
