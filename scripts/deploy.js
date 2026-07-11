const hre = require("hardhat");

async function main() {
  // reset del network locale per azzerare i nonce ed evitare conflitti con tentativi precedenti
  await hre.network.provider.send("hardhat_reset");
  console.log("Memoria del nodo resettata con successo.");

  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  console.log(`Deploy in corso con l'account: ${deployer.address}`);

  // deploy del CertificatoreMultimetro (ethers gestisce i nonce automaticamente)
  const Certificatore = await hre.ethers.getContractFactory(
    "CertificatoreMultimetro",
  );
  const certificatore = await Certificatore.deploy();

  // attesa dell'inclusione della transazione nel blocco
  await certificatore.waitForDeployment();
  const addrCert = await certificatore.getAddress();
  console.log(`Indirizzo Certificatore: ${addrCert}`);

  // deploy dell'ElaboratoreDati
  const Elaboratore = await hre.ethers.getContractFactory("ElaboratoreDati");
  const elaboratore = await Elaboratore.deploy();

  await elaboratore.waitForDeployment();
  const addrElab = await elaboratore.getAddress();
  console.log(`Indirizzo Elaboratore: ${addrElab}`);

  console.log("Autorizzazione account di test in corso...");

  // autorizzazione dei primi 4 account di test su entrambi i contratti (ogni tx viene attesa prima della successiva)
  for (let i = 1; i < 5 && i < signers.length; i++) {
    console.log(`Autorizzazione per account [${i}]: ${signers[i].address}`);

    const tx1 = await certificatore.autorizzaDispositivo(signers[i].address);
    await tx1.wait(); // attesa della conferma prima di procedere

    const tx2 = await elaboratore.autorizzaUtente(signers[i].address);
    await tx2.wait(); // attesa della conferma prima del prossimo ciclo
  }

  console.log(
    "Tutti gli account sono stati autorizzati con successo per la demo!",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
