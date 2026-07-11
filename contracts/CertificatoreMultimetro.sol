// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CertificatoreMultimetro
 * @notice Contratto per la certificazione on-chain dei dati provenienti dal multimetro IoT.
 *
 * Pattern architetturali applicati:
 *   - Access Restriction: solo i dispositivi autorizzati possono pushare dati.
 *   - Off-Chain Data Storage (Hash-based): nessun dato grezzo on-chain, viene salvato solo l'hash SHA-256.
 *   - Oracle Pattern (Inbound): il dispositivo IoT funge da oracolo che pusha i dati.
 *   - Memoization: l'hash viene registrato per impedire duplicati.
 *   - Push Asincrono: il dispositivo pusha periodicamente e il contratto reagisce in autonomia.
 *
 * Ottimizzazioni gas applicate:
 *   - Nessun array o struct in storage (eliminato il vecchio `registro[]` e `CertificatoMisure`).
 *   - bytes12 per il deviceId invece di string (un solo slot, niente ABI-encoding dinamico).
 *   - calldata sugli array per evitare copie in memory.
 *   - Custom errors al posto delle stringhe nei require (~200 gas/byte risparmiati).
 *   - immutable sull'owner (lettura dal bytecode: 3 gas vs 2100 gas di una SLOAD).
 *   - unchecked nei loop (skip overflow check: ~60 gas per iterazione).
 *   - Evento DatoCertificato per il trigger asincrono verso ElaboratoreDati.
 */
contract CertificatoreMultimetro {
    //  Custom Errors

    /// @notice Chiamata non autorizzata: solo l'owner può eseguire questa operazione.
    error SoloOwner();
    /// @notice Il dispositivo chiamante non è nella lista degli autorizzati.
    error DispositivoNonAutorizzato();
    /// @notice L'hash è già stato certificato — non vengono ammessi duplicati.
    error HashGiaCertificato();

    //  Stato — Access Restriction

    /// @notice Indirizzo del deployer. Immutable = lettura dal bytecode, costa 3 gas.
    address public immutable owner;

    /// @notice Mapping degli indirizzi (dispositivi IoT) autorizzati a pushare dati.
    mapping(address => bool) public autorizzati;

    //  Stato — Memoization (registro hash)

    /// @notice Per ogni hash, true se è già stato certificato. Serve a bloccare i duplicati.
    mapping(bytes32 => bool) public hashEsistenti;

    //  Eventi

    /// @notice Emesso quando una nuova rilevazione viene certificata con successo.
    /// @param deviceId ID del dispositivo (indexed per filtrare off-chain per dispositivo).
    /// @param timestamp Timestamp Unix della rilevazione.
    /// @param fileHash Hash SHA-256 del JSON completo (indexed per lookup rapido).
    event DatoCertificato(
        bytes12 indexed deviceId,
        uint256 timestamp,
        bytes32 indexed fileHash
    );

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

    /// @notice Blocca la chiamata se il dispositivo non è autorizzato.
    modifier soloAutorizzati() {
        if (!autorizzati[msg.sender]) revert DispositivoNonAutorizzato();
        _;
    }

    //  Gestione autorizzazioni

    /// @notice Aggiunge un dispositivo alla lista degli autorizzati.
    /// @param _dispositivo Indirizzo del dispositivo da autorizzare.
    function autorizzaDispositivo(address _dispositivo) external soloOwner {
        autorizzati[_dispositivo] = true;
    }

    /// @notice Rimuove un dispositivo dalla lista degli autorizzati.
    /// @param _dispositivo Indirizzo del dispositivo da revocare.
    function revocaDispositivo(address _dispositivo) external soloOwner {
        autorizzati[_dispositivo] = false;
    }

    //  Funzione principale — Certificazione rilevazione

    /**
     * @notice Certifica una nuova rilevazione proveniente dal multimetro.
     *         Verifica che l'hash non sia già registrato, lo salva ed emette l'evento.
     * @param _deviceId   ID del dispositivo (bytes12, es. 0x343843413433333944413834).
     * @param _timestamp  Timestamp Unix della rilevazione.
     * @param _fileHash   Hash SHA-256 del JSON completo (calcolato off-chain).
     */
    function certificaRilevazione(
        bytes12 _deviceId,
        uint256 _timestamp,
        bytes32 _fileHash
    ) external soloAutorizzati {
        // se l'hash è già presente, la transazione viene bloccata — niente duplicati
        if (hashEsistenti[_fileHash]) revert HashGiaCertificato();

        // registrazione dell'hash (viene salvato SOLO l'hash, i dati grezzi restano off-chain)
        hashEsistenti[_fileHash] = true;

        // notifica al frontend (e a qualsiasi listener) della nuova certificazione
        emit DatoCertificato(_deviceId, _timestamp, _fileHash);
    }
}
