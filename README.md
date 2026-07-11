# Progetto d'Esempio Hardhat 3 Beta (`mocha` ed `ethers`)

Questo progetto mostra un progetto Hardhat 3 Beta che utilizza `mocha` per i test e la libreria `ethers` per le interazioni con Ethereum.

Per saperne di più su Hardhat 3 Beta, visita la [Guida Introduttiva](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3). Per condividere il tuo feedback, unisciti al nostro gruppo Telegram [Hardhat 3 Beta](https://hardhat.org/hardhat3-beta-telegram-group) o [apri una issue](https://github.com/NomicFoundation/hardhat/issues/new) nel nostro tracker su GitHub.

## Panoramica del Progetto

Questo progetto di esempio include:

- Un semplice file di configurazione di Hardhat.
- Test unitari in Solidity compatibili con Foundry.
- Test di integrazione in TypeScript utilizzando `mocha` ed ethers.js.
- Esempi che dimostrano come connettersi a diversi tipi di reti, inclusa la simulazione locale della mainnet di OP.
- **Backend Express & MongoDB**: Un backend Node.js (`backend/server.js`) connesso a MongoDB per archiviare dati off-chain in modo sicuro e persistente.

## Utilizzo

### Avviare il Backend

Per avviare il server backend che gestisce l'archiviazione dei dati off-chain:
1. Assicurati di avere MongoDB in esecuzione localmente (o aggiorna il file `.env` con la stringa di connessione del tuo cluster).
2. Avvia il server:
```shell
npm run start:backend
```
Il backend sarà in esecuzione su `http://localhost:3000`.

### Eseguire i Test

Per eseguire tutti i test del progetto, esegui il seguente comando:

```shell
npx hardhat test
```

Puoi anche eseguire selettivamente i test Solidity o `mocha`:

```shell
npx hardhat test solidity
npx hardhat test mocha
```

### Effettuare un deployment su Sepolia

Questo progetto include un modulo Ignition di esempio per effettuare il deployment del contratto. Puoi distribuire questo modulo su una chain simulata localmente o su Sepolia.

Per eseguire il deployment su una chain locale:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

Per eseguire il deployment su Sepolia, hai bisogno di un account con dei fondi per inviare la transazione. La configurazione di Hardhat fornita include una variabile di configurazione chiamata `SEPOLIA_PRIVATE_KEY`, che puoi usare per impostare la chiave privata dell'account che desideri utilizzare.

Puoi impostare la variabile `SEPOLIA_PRIVATE_KEY` usando il plugin `hardhat-keystore` o impostandola come variabile d'ambiente.

Per impostare la variabile di configurazione `SEPOLIA_PRIVATE_KEY` usando `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

Dopo aver impostato la variabile, puoi avviare il deployment sulla rete Sepolia:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
