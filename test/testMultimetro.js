const { expect } = require("chai");

describe("Test Sistema Chiuso — Multimetro + Elaboratore", function () {
  let certificatore, elaboratore;
  let owner, user1;
  let ethers;

  // ── Costanti (calcolate in before) ──
  const timestamp = 1773700729;
  let deviceId;
  let fileHash;

  // Tensione fondamentale * 100 (es. 220.50V → 22050)
  const tensione = 22050;
  // Armoniche normali * 100 (valori bassi → THD < 8%)
  const armonicheNormali = [300, 200, 100]; // H3=3V, H5=2V, H7=1V
  // Armoniche guasto * 100 (valori alti → THD > 8%)
  const armonicheGuasto = [2000, 1500, 1000]; // H3=20V, H5=15V, H7=10V
  // Tensioni per l'elaboratore (array di tensioni * 100)
  const tensioniArray = [22050, 22100, 22000, 22150, 21950]; // ~220.50V media

  before(async function () {
    // ethers viene iniettato da Hardhat nel Runtime Environment
    ethers = (await import("hardhat")).ethers;

    [owner, user1] = await ethers.getSigners();

    // Calcola deviceId e hash
    const deviceIdHex = ethers.hexlify(ethers.toUtf8Bytes("48CA4339DA84"));
    deviceId = ethers.zeroPadValue(deviceIdHex, 12);
    fileHash = ethers.id("json_simulato_multimetro_v2");

    // Deploy dei contratti
    const Certificatore = await ethers.getContractFactory("CertificatoreMultimetro");
    certificatore = await Certificatore.deploy();
    await certificatore.waitForDeployment();

    const Elaboratore = await ethers.getContractFactory("ElaboratoreDati");
    elaboratore = await Elaboratore.deploy();
    await elaboratore.waitForDeployment();
  });

  // ═══════════════════════════════════════════════
  //  FASE 1: CertificatoreMultimetro
  // ═══════════════════════════════════════════════

  describe("FASE 1: Certificazione (Push Asincrono)", function () {

    it("Deve certificare un nuovo dato ed emettere DatoCertificato", async function () {
      await expect(
        certificatore.certificaRilevazione(deviceId, timestamp, fileHash, tensione, armonicheNormali)
      )
        .to.emit(certificatore, "DatoCertificato")
        .withArgs(deviceId, timestamp, fileHash);
    });

    it("Deve bloccare un hash già certificato (Memoization preventiva)", async function () {
      await expect(
        certificatore.certificaRilevazione(deviceId, timestamp, fileHash, tensione, armonicheNormali)
      ).to.be.revertedWithCustomError(certificatore, "HashGiaCertificato");
    });

    it("Deve bloccare dispositivi non autorizzati (Access Restriction)", async function () {
      const newHash = ethers.id("test_non_autorizzato");
      await expect(
        certificatore.connect(user1).certificaRilevazione(deviceId, timestamp, newHash, tensione, armonicheNormali)
      ).to.be.revertedWithCustomError(certificatore, "DispositivoNonAutorizzato");
    });

    it("Deve autorizzare un nuovo dispositivo (solo Owner)", async function () {
      await certificatore.autorizzaDispositivo(user1.address);
      expect(await certificatore.autorizzati(user1.address)).to.equal(true);
    });

    it("Deve revocare un dispositivo (solo Owner)", async function () {
      await certificatore.revocaDispositivo(user1.address);
      expect(await certificatore.autorizzati(user1.address)).to.equal(false);
    });

    it("Non deve permettere a non-owner di autorizzare dispositivi", async function () {
      await expect(
        certificatore.connect(user1).autorizzaDispositivo(user1.address)
      ).to.be.revertedWithCustomError(certificatore, "SoloOwner");
    });
  });

  // ═══════════════════════════════════════════════
  //  FASE 1b: Anti-Aliasing Allarmi
  // ═══════════════════════════════════════════════

  describe("Anti-Aliasing Allarmi (State Machine)", function () {

    it("Deve emettere AllarmeGuasto quando THD > 8% (prima volta)", async function () {
      const hashGuasto1 = ethers.id("guasto_rilevazione_1");

      await expect(
        certificatore.certificaRilevazione(deviceId, timestamp, hashGuasto1, tensione, armonicheGuasto)
      )
        .to.emit(certificatore, "AllarmeGuasto");
    });

    it("NON deve ri-emettere AllarmeGuasto durante il cooldown (anti-aliasing)", async function () {
      const hashGuasto2 = ethers.id("guasto_rilevazione_2");

      // Secondo push con THD alto → l'allarme è in cooldown, NON deve emettere AllarmeGuasto
      await expect(
        certificatore.certificaRilevazione(deviceId, timestamp + 300, hashGuasto2, tensione, armonicheGuasto)
      )
        .to.emit(certificatore, "DatoCertificato")         // Deve emettere la certificazione
        .and.to.not.emit(certificatore, "AllarmeGuasto");   // Ma NON l'allarme
    });

    it("Deve permettere il reset manuale dell'allarme (solo Owner)", async function () {
      await expect(
        certificatore.resetAllarme(deviceId)
      ).to.emit(certificatore, "AllarmeReset");

      // Verifica che lo stato sia resettato
      const stato = await certificatore.allarmiAttivi(deviceId);
      expect(stato.attivo).to.equal(false);
    });

    it("Dopo il reset, deve ri-emettere AllarmeGuasto al prossimo THD alto", async function () {
      const hashGuasto3 = ethers.id("guasto_rilevazione_3_post_reset");

      await expect(
        certificatore.certificaRilevazione(deviceId, timestamp + 600, hashGuasto3, tensione, armonicheGuasto)
      ).to.emit(certificatore, "AllarmeGuasto");
    });
  });

  // ═══════════════════════════════════════════════
  //  FASE 2: ElaboratoreDati
  // ═══════════════════════════════════════════════

  describe("FASE 2: Elaborazione Media (Push Sincrono)", function () {

    it("Deve elaborare la media e salvare in cache", async function () {
      // Media attesa: (22050+22100+22000+22150+21950) / 5 = 22050
      await expect(
        elaboratore.elaboraMediaTensione(fileHash, tensioniArray)
      )
        .to.emit(elaboratore, "CalcoloEseguito")
        .withArgs(fileHash, 22050);
    });

    it("Deve recuperare dalla cache (Memoization) con evento diverso", async function () {
      // Secondo invio con lo stesso hash → cache hit
      await expect(
        elaboratore.elaboraMediaTensione(fileHash, tensioniArray)
      )
        .to.emit(elaboratore, "RisultatoRecuperatoDallaCache")
        .withArgs(fileHash, 22050);
    });

    it("La cache hit NON deve emettere CalcoloEseguito", async function () {
      await expect(
        elaboratore.elaboraMediaTensione(fileHash, tensioniArray)
      )
        .to.not.emit(elaboratore, "CalcoloEseguito");
    });

    it("Deve bloccare array vuoti", async function () {
      const newHash = ethers.id("test_array_vuoto");
      await expect(
        elaboratore.elaboraMediaTensione(newHash, [])
      ).to.be.revertedWithCustomError(elaboratore, "ArrayTensioniVuoto");
    });

    it("Deve bloccare utenti non autorizzati", async function () {
      await expect(
        elaboratore.connect(user1).elaboraMediaTensione(fileHash, tensioniArray)
      ).to.be.revertedWithCustomError(elaboratore, "UtenteNonAutorizzato");
    });

    it("getCacheResult deve restituire il valore corretto", async function () {
      const result = await elaboratore.getCacheResult(fileHash);
      expect(result.esiste).to.equal(true);
      expect(result.valore).to.equal(22050);
    });

    it("getCacheResult deve restituire esiste=false per hash non elaborati", async function () {
      const unknownHash = ethers.id("hash_sconosciuto");
      const result = await elaboratore.getCacheResult(unknownHash);
      expect(result.esiste).to.equal(false);
      expect(result.valore).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════
  //  GAS COMPARISON
  // ═══════════════════════════════════════════════

  describe("Confronto Gas (Memoization)", function () {

    it("La cache hit deve costare meno gas del primo calcolo", async function () {
      const freshHash = ethers.id("gas_comparison_test");

      // Primo calcolo (nuovo)
      const tx1 = await elaboratore.elaboraMediaTensione(freshHash, tensioniArray);
      const receipt1 = await tx1.wait();
      const gasFirst = receipt1.gasUsed;

      // Secondo calcolo (dalla cache)
      const tx2 = await elaboratore.elaboraMediaTensione(freshHash, tensioniArray);
      const receipt2 = await tx2.wait();
      const gasCache = receipt2.gasUsed;

      console.log(`   ⛽ Gas primo calcolo:  ${gasFirst.toString()}`);
      console.log(`   ⛽ Gas da cache:       ${gasCache.toString()}`);
      console.log(`   💰 Risparmio:          ${((Number(gasFirst) - Number(gasCache)) / Number(gasFirst) * 100).toFixed(1)}%`);

      expect(gasCache).to.be.lt(gasFirst);
    });
  });
});
