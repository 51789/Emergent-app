# JARVIS - Il tuo assistente digitale

JARVIS è un assistente AI mobile progettato per facilitare ricerche intelligenti e monitoraggio continuo del web. Utilizza un sistema multi-agente specializzato per diverse categorie di ricerca.

## 🌟 Caratteristiche Principali

- **Sistema Multi-Agente AI**: 8 agenti specializzati per diverse categorie
- **Ricerca in Linguaggio Naturale**: Descrivi cosa cerchi in modo naturale
- **Risultati Intelligenti**: L'AI filtra e riassume i risultati rilevanti
- **Supporto Multilingua**: Italiano e Inglese
- **Interfaccia Moderna**: Design pulito e intuitivo per mobile
- **Monitoraggio Continuo**: Sistema pronto per ricerche periodiche

## 📱 Categorie Supportate

1. **IMMOBILI** - Ricerca case e appartamenti
2. **AUTO E MOTO** - Ricerca veicoli
3. **DIVERTIMENTO** - Eventi e attività
4. **NUOVE LEGGI** - Monitoraggio normative
5. **BANDI DI CONCORSO** - Concorsi pubblici
6. **GARE D'APPALTO** - Appalti pubblici
7. **FINANZA** - Opportunità finanziarie
8. **NUOVE RICHIESTE LAVORATIVE** - Offerte di lavoro

## 🚀 Avvio Rapido

### Backend
```bash
cd /app/backend
python server.py
```

### Frontend
```bash
cd /app/frontend
yarn start
```

## 🔑 Configurazione API

### LLM (già configurato)
- Utilizza **Emergent LLM Key** per l'AI
- Modello: OpenAI GPT-5.4
- Nessuna configurazione aggiuntiva richiesta

### Serper API (opzionale per risultati reali)
1. Registrati su [serper.dev](https://serper.dev)
2. Ottieni la tua API key gratuita
3. Aggiungi al file `/app/backend/.env`:
```
SERPER_API_KEY=your_key_here
```

**Nota**: L'app funziona con dati mock se Serper non è configurato.

## 🏗️ Architettura

### Backend (FastAPI + MongoDB)
- **Agenti Specializzati**: Ogni categoria ha un agente AI dedicato
- **Elaborazione Intelligente**: Analisi query con GPT-5.4
- **API RESTful**: Endpoint per ricerche e risultati
- **Database MongoDB**: Archiviazione persistente

### Frontend (Expo React Native)
- **Expo Router**: Navigazione basata su file
- **Zustand**: State management leggero
- **Bottom Sheet**: UX moderna per mobile
- **TypeScript**: Type safety completo

## 📁 Struttura Progetto

```
/app
├── backend/
│   ├── server.py          # API principale con agenti specializzati
│   ├── .env              # Configurazione (LLM key inclusa)
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── index.tsx     # Home con selezione categorie
│   │   ├── results.tsx   # Visualizzazione risultati
│   │   ├── history.tsx   # Cronologia ricerche
│   │   ├── settings.tsx  # Impostazioni
│   │   └── _layout.tsx   # Layout principale
│   ├── src/
│   │   ├── components/   # Componenti riutilizzabili
│   │   ├── constants/    # Categorie e traduzioni
│   │   ├── services/     # API client
│   │   ├── store/        # Zustand store
│   │   └── types/        # TypeScript types
│   └── package.json
```

## 🔌 API Endpoints

### Health Check
```bash
GET /api/health
```

### Crea Ricerca
```bash
POST /api/search/create
Body: {
  "query": "testo ricerca",
  "category": "immobili",
  "language": "it"
}
```

### Processa con AI
```bash
POST /api/search/process
Body: {
  "query": "Cerco bilocale a Torino...",
  "category": "immobili",
  "language": "it"
}
```

### Ricerche Attive
```bash
GET /api/search/active
```

### Risultati Ricerca
```bash
GET /api/search/{search_id}/results
```

## 🎯 Esempi di Utilizzo

### Esempio 1: Ricerca Immobile
```
Query: "Sto cercando casa a Torino in zona San Paolo, bilocale ristrutturato, 
        budget 100-140k euro, vicino alla metro"

L'AI estrae:
- Posizione: Torino, San Paolo
- Tipo: Bilocale
- Stato: Ristrutturato
- Budget: 100.000€ - 140.000€
- Requisiti: Metro vicina

Keywords generate: ["bilocale Torino San Paolo", "ristrutturato", ...]
```

### Esempio 2: Ricerca Lavoro
```
Query: "Cerco lavoro come sviluppatore software a Milano, 
        esperienza 3 anni, contratto indeterminato"

L'AI estrae:
- Posizione: Sviluppatore Software
- Località: Milano
- Esperienza: 3 anni
- Contratto: Indeterminato
```

## 🤖 Sistema Multi-Agente

Ogni agente è specializzato nel suo dominio:

### RealEstateAgent (Immobili)
- Estrae: posizione, tipo, budget, caratteristiche
- Fonti: Siti immobiliari italiani

### VehicleAgent (Auto e Moto)
- Estrae: marca, modello, anno, km, prezzo
- Fonti: Portali compravendita veicoli

### JobAgent (Lavoro)
- Estrae: posizione, settore, località, esperienza
- Fonti: LinkedIn, Indeed, InfoJobs

### FinanceAgent (Finanza)
- Estrae: tipo investimento, mercati, rischio
- Fonti: Siti finanziari, Borsa Italiana

E così via per tutte le 8 categorie...

## 🔄 Prossime Funzionalità

- [ ] Monitoraggio periodico automatico
- [ ] Push notifications per nuovi risultati
- [ ] Background tasks per ricerche continue
- [ ] Integrazione Serper API per risultati reali
- [ ] Autenticazione utente
- [ ] Filtri avanzati
- [ ] Esportazione risultati

## 🛠️ Tecnologie Utilizzate

**Frontend:**
- Expo SDK 54
- React Native
- TypeScript
- Zustand
- Expo Router
- Bottom Sheet
- Expo Notifications (pronto)

**Backend:**
- FastAPI
- MongoDB
- Emergent Integrations
- OpenAI GPT-5.4
- Motor (async MongoDB)

## 📱 Testing

### Test Backend
```bash
curl -X POST http://localhost:8001/api/search/process \
  -H "Content-Type: application/json" \
  -d '{
    "query":"Cerco casa a Torino",
    "category":"immobili",
    "language":"it"
  }'
```

### Test Frontend
1. Apri Expo Go sul tuo dispositivo
2. Scansiona il QR code mostrato nel terminale
3. L'app si aprirà su Expo Go

## 🌐 Deployment

L'app è pronta per il deployment su:
- **Frontend**: Expo EAS Build
- **Backend**: Qualsiasi servizio che supporta FastAPI
- **Database**: MongoDB Atlas

## 📄 Licenza

Proprietà privata - Tutti i diritti riservati

## 👨‍💻 Sviluppo

Sviluppato con ❤️ usando Emergent AI Agent System

---

**Nota**: Questa è la versione MVP. Il sistema di monitoraggio continuo e le notifiche push saranno implementate nelle prossime iterazioni.
