const fs = require('fs');
const path = require('path');
const banksJson = require('./banks.json');
const bankDetails = require('./bankDetails');

const matchedBanks = {};

banksJson.data.forEach(bank => {
    if (!bank.name || !bank.code) return; // skip entries without name or code

    // Fuzzy match: check if either name contains the other (case-insensitive)
    const match = bankDetails.find(b => {
        const a = b.name.trim().toLowerCase();
        const bnk = bank.name.trim().toLowerCase();
        return a.includes(bnk) || bnk.includes(a);
    });

    if (match) {
        matchedBanks[bank.name] = {
            paystackCode: bank.code,
            swissCode: match.swisscode || match.code || null,
            details: match
        };
    }
});

// Write to matchedBanks.js
const output = `// Auto-generated mapping of bank names to {paystackCode, swissCode, details}\nmodule.exports = ${JSON.stringify(matchedBanks, null, 2)};\n`;

fs.writeFileSync(path.join(__dirname, 'matchedBanks.js'), output);

console.log('matchedBanks.js generated successfully!');