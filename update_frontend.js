const fs = require('fs');

async function main() {
    // lettura degli artifact compilati dei due contratti
    const certArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/CertificatoreMultimetro.sol/CertificatoreMultimetro.json', 'utf8'));
    const elabArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/ElaboratoreDati.sol/ElaboratoreDati.json', 'utf8'));

    let indexHtml = fs.readFileSync('./index.html', 'utf8');


    indexHtml = indexHtml.replace(
        /const abiCertificatore = \[[\s\S]*?\];/,
        `const abiCertificatore = ${JSON.stringify(certArtifact.abi, null, 4)};`
    );

    indexHtml = indexHtml.replace(
        /const abiElaboratore = \[[\s\S]*?\];/,
        `const abiElaboratore = ${JSON.stringify(elabArtifact.abi, null, 4)};`
    );


    indexHtml = indexHtml.replace(
        /contrattoCertificatore\.on\('AllarmeGuasto'/g,
        "contrattoElaboratore.on('AllarmeGuasto'"
    );


    indexHtml = indexHtml.replace(
        /const tx = await contrattoCertificatore\.certificaRilevazione\(\s*deviceIdBytes12,\s*data\.timestamp,\s*fileHash,\s*tensioneInt,\s*armonicheInt\s*\);/,
        `const tx = await contrattoCertificatore.certificaRilevazione(
                    deviceIdBytes12,
                    data.timestamp,
                    fileHash
                );`
    );


    indexHtml = indexHtml.replace(
        /const tx = await contrattoElaboratore\.elaboraMediaTensione\(fileHash, tensioniArray\);/,
        `const deviceIdHex = ethers.hexlify(ethers.toUtf8Bytes(dato.deviceId));
                            const deviceIdBytes12 = ethers.zeroPadValue(deviceIdHex, 12);
                            const tensioneTarget = Math.round(dato.tensione * 100);
                            const armonicheTarget = [
                                Math.round(dato.armoniche.armonica_3 * 100),
                                Math.round(dato.armoniche.armonica_5 * 100),
                                Math.round(dato.armoniche.armonica_7 * 100)
                            ];
                            const tx = await contrattoElaboratore.elaboraMediaTensione(
                                deviceIdBytes12,
                                dato.timestamp,
                                fileHash,
                                tensioniArray,
                                tensioneTarget,
                                armonicheTarget
                            );`
    );


    indexHtml = indexHtml.replace(
        /const tx = await contrattoElaboratore\.elaboraMediaTensione\(targetHash, tensioniArray\);/,
        `const targetDato = datiCertificati[datiCertificati.length - 1];
                const deviceIdHex = ethers.hexlify(ethers.toUtf8Bytes(targetDato.deviceId));
                const deviceIdBytes12 = ethers.zeroPadValue(deviceIdHex, 12);
                const tensioneTarget = Math.round(targetDato.tensione * 100);
                const armonicheTarget = [
                    Math.round(targetDato.armoniche.armonica_3 * 100),
                    Math.round(targetDato.armoniche.armonica_5 * 100),
                    Math.round(targetDato.armoniche.armonica_7 * 100)
                ];
                const tx = await contrattoElaboratore.elaboraMediaTensione(
                    deviceIdBytes12,
                    targetDato.timestamp,
                    targetHash,
                    tensioniArray,
                    tensioneTarget,
                    armonicheTarget
                );`
    );

    fs.writeFileSync('./index.html', indexHtml);
    console.log("index.html updated successfully!");
}

main().catch(console.error);
