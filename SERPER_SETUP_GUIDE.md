# Come Configurare Serper API per Risultati Reali

## Panoramica
JARVIS attualmente utilizza dati di esempio (mock data) per mostrare i risultati. Per ottenere risultati di ricerca reali dal web, è necessario configurare una chiave API di Serper.

## Perché Serper?
- **API Gratuita**: Piano gratuito disponibile con 1000 ricerche/mese
- **Risultati in Tempo Reale**: Ricerche Google in tempo reale
- **Facile da Integrare**: API RESTful semplice
- **Supporto Italiano**: Ricerche in italiano supportate

## Passaggi per Ottenere la Chiave API

### 1. Registrazione
1. Visita [serper.dev](https://serper.dev)
2. Clicca su "Get API Key" o "Sign Up"
3. Crea un account gratuito con la tua email

### 2. Ottieni la Chiave
1. Dopo il login, vai alla dashboard
2. La tua API key sarà mostrata nella pagina principale
3. Copia la chiave (formato: `xxxxxxxxxxxxxxxxxxx`)

### 3. Configura in JARVIS
1. Apri il file `/app/backend/.env`
2. Trova la riga:
   ```
   SERPER_API_KEY=placeholder_get_free_key_from_serper_dev
   ```
3. Sostituisci con la tua chiave:
   ```
   SERPER_API_KEY=la_tua_chiave_qui
   ```
4. Salva il file

### 4. Riavvia il Backend
```bash
cd /app/backend
# Riavvia il server
sudo supervisorctl restart backend
```

## Verifica Configurazione

Puoi verificare che la chiave sia configurata correttamente:

```bash
curl http://localhost:8001/api/health
```

La risposta dovrebbe mostrare:
```json
{
  "status": "healthy",
  "llm_configured": true,
  "serper_configured": true  // <-- Questo dovrebbe essere true
}
```

## Piani Serper

### Piano Gratuito
- **1.000 ricerche/mese**
- Perfetto per testare e uso personale
- Nessuna carta di credito richiesta

### Piano Pro (opzionale)
- 5.000+ ricerche/mese
- Per uso aziendale
- $50/mese

## Esempio di Ricerca con Serper

Una volta configurato, quando l'utente cerca:

```
"Cerco bilocale a Torino in zona San Paolo, budget 120k"
```

JARVIS:
1. ✅ Usa l'AI per estrarre le informazioni chiave
2. ✅ Genera parole chiave ottimizzate in italiano
3. ✅ Cerca su Google tramite Serper API
4. ✅ Filtra e presenta i risultati reali
5. ✅ Estrae contatti e link dai risultati

## Risoluzione Problemi

### Errore "API key invalid"
- Verifica di aver copiato correttamente la chiave
- Assicurati che non ci siano spazi prima/dopo la chiave
- Riavvia il backend dopo la modifica

### Errore "Rate limit exceeded"
- Hai superato il limite mensile gratuito (1000 ricerche)
- Attendi il prossimo mese o considera l'upgrade al piano Pro

### Serper non configurato ma chiave inserita
- Verifica che il file .env sia nel percorso corretto
- Riavvia il backend
- Controlla i log per errori: `sudo supervisorctl tail backend`

## Alternative a Serper (Future)

Se preferisci altre API di ricerca:
- **SerpAPI**: Simile a Serper, con piano gratuito
- **Google Custom Search**: API ufficiale Google
- **Bing Search API**: API Microsoft

Per ora, JARVIS è ottimizzato per Serper, ma il codice può essere facilmente adattato.

## Stato Attuale

**Senza Serper API**:
- ✅ L'app funziona perfettamente
- ✅ Mostra dati di esempio realistici
- ✅ Tutte le funzionalità UI operative
- ⚠️ Risultati non sono dal web reale

**Con Serper API**:
- ✅ Risultati reali dal web
- ✅ Ricerche su siti immobiliari, lavoro, ecc.
- ✅ Contatti e link reali
- ✅ Monitoraggio continuo possibile

## Supporto

Per domande o problemi con Serper:
- Documentazione: [serper.dev/docs](https://serper.dev/docs)
- Email: support@serper.dev

---

**Nota**: Anche senza Serper, JARVIS è completamente funzionante e può essere testato con dati di esempio. Serper è necessario solo per i risultati di ricerca reali dal web.
