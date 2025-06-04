const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const ONERAMP_API_URL = process.env.ONERAMP_API_URL;
const ONERAMP_API_KEY = process.env.ONERAMP_API_KEY;

async function getQuoteOut({ fiatType, cryptoType, cryptoAmount, country, address }) {
    try {
        const response = await axios.post(`${ONERAMP_API_URL}/quote-out`, {
            fiatType,
            cryptoType,
            cryptoAmount,
            country,
            address
        }, {
            headers: {
                Authorization: `Bearer ${ONERAMP_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error in getQuoteOut:', error.response?.data || error.message);
        throw new Error('Failed to get quote from OneRamp');
    }
}

async function transferOut({ quoteId, bank, userDetails }) {
    try {
        const response = await axios.post(`${ONERAMP_API_URL}/transfer-out`, {
            operator: 'bank',
            quoteId,
            bank,
            userDetails
        }, {
            headers: {
                Authorization: `Bearer ${ONERAMP_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': uuidv4()
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error in transferOut:', error.response?.data || error.message);
        throw new Error('Failed to initiate transfer via OneRamp');
    }
}

module.exports = {
    getQuoteOut,
    transferOut
};