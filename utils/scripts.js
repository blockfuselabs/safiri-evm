const fs = require('fs');
const path = require('path');
const banksJson = require('./banks.json');
const bankDetails = require('./bankDetails');

const matchedBanks = {};

banksJson.data.forEach(bank => {
    // Try to find a matching bank by name (case-insensitive, trimmed)
    const match = bankDetails.find(
        b => b.name.trim().toLowerCase() === bank.name.trim().toLowerCase()
    );
    if (match) {
        matchedBanks[bank.name] = match;
    }
});

// Write to matchedBanks.js
const output = `// Auto-generated mapping of bank names to bankDetails\nmodule.exports = ${JSON.stringify(matchedBanks, null, 2)};\n`;

fs.writeFileSync(path.join(__dirname, 'matchedBanks.js'), output);

console.log('matchedBanks.js generated successfully!');