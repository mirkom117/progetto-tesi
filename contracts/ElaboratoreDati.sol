// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ElaboratoreDati
 * @notice Contratto per l'elaborazione on-chain dei dati già certificati dal multimetro.
 *
 * Pattern architetturali applicati:
 *   - Access Restriction: solo gli utenti autorizzati possono lanciare elaborazioni.
 *   - Memoization (Caching): se il risultato per un certo hash è già stato calcolato,
 *     viene restituito dalla cache senza ricalcolo.
 *   - Event-Driven: vengono emessi eventi diversi per calcolo nuovo e cache hit,
 *     così il frontend sa esattamente cosa è successo.
 *   - Push Sincrono: l'utente web pusha la richiesta e riceve il risultato via evento.
 *
 * Ottimizzazioni gas applicate:
 *   - RisultatoCache packed in 1 slot (uint248 + bool = 32 bytes esatti).
 *   - Una sola SLOAD per il cache-hit grazie allo storage pointer.
 *   - calldata sugli array per evitare copie in memory.
 *   - Custom errors al posto delle stringhe nei require.
 *   - unchecked nei loop dove l'overflow è impossibile.
 *   - immutable sull'owner per leggere dal bytecode.
 */
contract ElaboratoreDati {

   
    //  Custom Errors
   

    /// @notice Chiamata non autorizzata: solo l'owner può eseguire questa operazione.
    error SoloOwner();
    /// @notice L'utente chiamante non è nella lista degli autorizzati.
    error UtenteNonAutorizzato();
    /// @notice Non è possibile calcolare la media di un array vuoto.
    error ArrayTensioniVuoto();

   
    //  Stato — Access Restriction
   

    /// @notice Indirizzo del deployer. Immutable = lettura dal bytecode, costa 3 gas.
    address public immutable owner;

    /// @notice Mapping degli indirizzi autorizzati a richiedere elaborazioni.
    mapping(address => bool) public autorizzati;

   
    //  Stato — Memoization (Cache dei risultati)
   

    /**
     * @notice Struct per i risultati in cache, progettata per occupare esattamente 1 slot.
     * @dev uint248 (31 bytes) + bool (1 byte) = 32 bytes = 1 storage slot.
     *      Il flag `esiste` rimuove l'ambiguità col valore zero:
     *      anche se la media fosse 0, con `esiste = true` si tratta di un cache hit reale.
     */
    struct RisultatoCache {
        uint248 valore;   // risultato del calcolo (31 bytes, più che sufficiente)
        bool esiste;      // flag per distinguere "non calcolato" da "calcolato con valore 0"
    }

    /// @notice Cache: dato un hash, restituisce il risultato già calcolato (se presente).
    mapping(bytes32 => RisultatoCache) private _cache;

   
    //  Stato — Anti-Aliasing Allarmi
   

    struct StatoAllarme {
        uint64 timestampAllarme;  // quando è scattato l'ultimo allarme
        bool attivo;              // se c'è un allarme attivo per questo dispositivo
    }

    /// @notice Per ogni dispositivo, viene salvato lo stato dell'allarme (per l'anti-aliasing).
    mapping(bytes12 => StatoAllarme) public allarmiAttivi;

    /// @notice Tempo di cooldown tra un allarme e l'altro (in secondi).
    /// @dev Modificabile dall'owner con setCooldownAllarme(). Default: 0 (disabilitato per la demo).
    uint64 public cooldownAllarme = 0;

    /// @notice Soglia THD in centesimi di percentuale. 800 equivale a 8.00%.
    uint256 public constant SOGLIA_THD = 800;

   
    //  Eventi
   

    /// @notice Emesso quando viene calcolato un risultato nuovo e salvato in cache.
    /// @param fileHash Hash del file elaborato (indexed per query off-chain).
    /// @param risultatoMedia Valore della media in centesimi (es. 22050 = 220.50V).
    event CalcoloEseguito(
        bytes32 indexed fileHash,
        uint256 risultatoMedia
    );

    /// @notice Emesso quando il risultato era già in cache e non è stato necessario ricalcolare.
    /// @param fileHash Hash del file richiesto (indexed per query off-chain).
    /// @param risultatoMedia Valore recuperato dalla cache.
    event RisultatoRecuperatoDallaCache(
        bytes32 indexed fileHash,
        uint256 risultatoMedia
    );

    /// @notice Emesso quando il THD supera la soglia e il cooldown lo permette.
    /// @param deviceId ID del dispositivo (indexed per filtrare off-chain).
    /// @param timestamp Timestamp della rilevazione che ha fatto scattare l'allarme.
    /// @param thdCalcolato Valore THD calcolato (centesimi di percentuale).
    event AllarmeGuasto(
        bytes12 indexed deviceId,
        uint256 timestamp,
        uint256 thdCalcolato
    );

    /// @notice Emesso quando l'owner resetta manualmente un allarme.
    /// @param deviceId ID del dispositivo resettato.
    /// @param timestamp Timestamp del reset.
    event AllarmeReset(
        bytes12 indexed deviceId,
        uint256 timestamp
    );

    /// @notice Emesso quando l'owner cambia il valore del cooldown.
    /// @param nuovoValore Nuovo cooldown in secondi.
    event CooldownAggiornato(uint64 nuovoValore);

   
    //  Costruttore
   

    constructor() {
        // il deployer diventa owner e viene autorizzato automaticamente
        owner = msg.sender;
        autorizzati[msg.sender] = true;
    }

   
    //  Modifier — Controllo accessi
   

    /// @notice Blocca la chiamata se il mittente non è l'owner.
    modifier soloOwner() {
        if (msg.sender != owner) revert SoloOwner();
        _;
    }

    /// @notice Blocca la chiamata se il mittente non è nella lista autorizzati.
    modifier soloAutorizzati() {
        if (!autorizzati[msg.sender]) revert UtenteNonAutorizzato();
        _;
    }

   
    //  Gestione autorizzazioni
   

    /// @notice Aggiunge un utente alla lista degli autorizzati.
    /// @param _utente Indirizzo da autorizzare.
    function autorizzaUtente(address _utente) external soloOwner {
        autorizzati[_utente] = true;
    }

    /// @notice Rimuove un utente dalla lista degli autorizzati.
    /// @param _utente Indirizzo da revocare.
    function revocaUtente(address _utente) external soloOwner {
        autorizzati[_utente] = false;
    }

   
    //  Lettura cache (funzione view)
   

    /// @notice Verifica se per un certo hash esiste già un risultato in cache.
    /// @param _fileHash Hash da controllare.
    /// @return esiste true se il risultato è presente in cache.
    /// @return valore Il valore salvato (0 se non presente).
    function getCacheResult(bytes32 _fileHash) external view returns (bool esiste, uint256 valore) {
        RisultatoCache storage cached = _cache[_fileHash];
        return (cached.esiste, uint256(cached.valore));
    }

   
    //  Caso d'Uso 1 — Calcolo media (sincrono, con memoization)
   

    /**
     * @notice Calcola la media delle tensioni per un dato file.
     *         Se il risultato è già in cache, viene emesso direttamente senza ricalcolo.
     * @param _fileHash  Hash SHA-256 del JSON originale (funge da chiave della cache).
     * @param _tensioni  Array delle tensioni già moltiplicate per 100 (per evitare decimali).
     */
    function calcolaMediaTensione(
        bytes32 _fileHash,
        uint256[] calldata _tensioni
    ) external soloAutorizzati {
        // controllo cache: una sola SLOAD grazie allo storage pointer
        RisultatoCache storage cached = _cache[_fileHash];
        if (cached.esiste) {
            // cache hit — viene emesso l'evento e si esce senza ricalcolare
            emit RisultatoRecuperatoDallaCache(_fileHash, uint256(cached.valore));
            return;
        }

        // verifica che l'array non sia vuoto
        uint256 len = _tensioni.length;
        if (len == 0) revert ArrayTensioniVuoto();

        // calcolo media on-chain (unchecked sul contatore perché l'overflow è impossibile)
        uint256 somma;
        for (uint256 i; i < len; ) {
            somma += _tensioni[i];
            unchecked { ++i; }
        }
        uint256 media = somma / len;

        // salvataggio in cache (un singolo SSTORE per l'intero slot packed)
        cached.valore = uint248(media);
        cached.esiste = true;

        // notifica al frontend che il calcolo è stato completato
        emit CalcoloEseguito(_fileHash, media);
    }

   
    //  Caso d'Uso 2 — Verifica guasti armoniche (asincrono)
   

    /**
     * @notice Controlla se il THD supera la soglia per un dato dispositivo.
     *         Se la soglia è superata, viene emesso un allarme (rispettando il cooldown anti-aliasing).
     * @param _deviceId   ID del dispositivo.
     * @param _timestamp  Timestamp Unix della rilevazione.
     * @param _tensioneTarget Tensione fondamentale (moltiplicata per 100).
     * @param _armonicheTarget Array delle armoniche [H3, H5, H7] (moltiplicate per 100).
     */
    function verificaGuastiArmoniche(
        bytes12 _deviceId,
        uint256 _timestamp,
        uint256 _tensioneTarget,
        uint256[] calldata _armonicheTarget
    ) external soloAutorizzati {
        StatoAllarme storage stato = allarmiAttivi[_deviceId];
        
        // anti-aliasing: si procede solo se non c'è un allarme attivo, oppure se è passato il cooldown
        if (!stato.attivo || (block.timestamp - stato.timestampAllarme) >= cooldownAllarme) {
            // somma dei quadrati delle armoniche
            uint256 sommaQuadrati;
            uint256 hLen = _armonicheTarget.length;
            for (uint256 i; i < hLen; ) {
                uint256 h = _armonicheTarget[i];
                sommaQuadrati += h * h;
                unchecked { ++i; }
            }

            if (_tensioneTarget > 0) {
                // THD in centesimi di percentuale: sqrt(sommaQuadrati) * 10000 / tensioneTarget
                uint256 thdCalcolato = (sqrt(sommaQuadrati) * 10000) / _tensioneTarget;
                
                if (thdCalcolato > SOGLIA_THD) {
                    // soglia superata — aggiornamento stato ed emissione allarme
                    stato.timestampAllarme = uint64(block.timestamp);
                    stato.attivo = true;
                    emit AllarmeGuasto(_deviceId, _timestamp, thdCalcolato);
                } else if (stato.attivo) {
                    // i valori sono tornati normali, disattivazione dell'allarme
                    stato.attivo = false;
                }
            }
        }
    }

   
    //  Reset allarme (manuale, solo owner)
   

    /// @notice Resetta manualmente l'allarme di un dispositivo.
    /// @param _deviceId ID del dispositivo da resettare.
    function resetAllarme(bytes12 _deviceId) external soloOwner {
        allarmiAttivi[_deviceId].attivo = false;
        emit AllarmeReset(_deviceId, block.timestamp);
    }

    /// @notice Modifica il cooldown dell'allarme.
    /// @param _nuovoValore Nuovo valore in secondi (0 = disabilitato).
    function setCooldownAllarme(uint64 _nuovoValore) external soloOwner {
        cooldownAllarme = _nuovoValore;
        emit CooldownAggiornato(_nuovoValore);
    }

   
    //  Funzione pura — Radice quadrata intera
   

    /**
     * @notice Calcola la radice quadrata intera con il metodo babilonese (Newton).
     * @dev Funzione pura: nessun side-effect, nessuna lettura/scrittura di stato.
     *      Costo: circa 200-400 gas per valori tipici.
     * @param y Valore di cui calcolare la radice.
     * @return z Radice quadrata intera (arrotondata per difetto).
     */
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
