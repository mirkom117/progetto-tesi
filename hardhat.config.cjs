require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const { task } = require("hardhat/config");
const ethers = require("ethers");

task("deploy", "Deploy contracts", async (taskArgs, hre) => {
  // connessione al nodo Hardhat locale
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  // recupero del primo account sbloccato dal nodo (gestione corretta dei nonce)
  const signer = await provider.getSigner(0);

  // lettura degli artifact compilati
  const CertificatoreArtifact = hre.artifacts.readArtifactSync("CertificatoreMultimetro");
  const ElaboratoreArtifact = hre.artifacts.readArtifactSync("ElaboratoreDati");

  // deploy del Certificatore
  const Certificatore = new ethers.ContractFactory(
    CertificatoreArtifact.abi,
    CertificatoreArtifact.bytecode,
    signer
  );
  const certificatore = await Certificatore.deploy();
  await certificatore.waitForDeployment();
  const addrCert = await certificatore.getAddress();
  console.log(`Indirizzo Certificatore: ${addrCert}`);

  // deploy dell'Elaboratore
  const Elaboratore = new ethers.ContractFactory(
    ElaboratoreArtifact.abi,
    ElaboratoreArtifact.bytecode,
    signer
  );
  const elaboratore = await Elaboratore.deploy();
  await elaboratore.waitForDeployment();
  const addrElab = await elaboratore.getAddress();
  console.log(`Indirizzo Elaboratore: ${addrElab}`);

  console.log("Autorizzazione account di test in corso...");
  
  // autorizzazione dei primi 4 account di test (ogni tx viene attesa prima della successiva)
  for (let i = 1; i < 5; i++) {
    const account = await provider.getSigner(i);
    const tx1 = await certificatore.autorizzaDispositivo(account.address);
    await tx1.wait();
    const tx2 = await elaboratore.autorizzaUtente(account.address);
    await tx2.wait();
  }
  console.log("Account autorizzati con successo per la demo!");
});

module.exports = {
  solidity: "0.8.28",
  defaultNetwork: "localhost",
};
