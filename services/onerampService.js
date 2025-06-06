const axios = require('axios');



const quoteOut = async (fiatType, cryptoType, cryptoAmount, userAddress) => {
  const ONERAMP_SECRET_KEY = process.env.ONERAMP_SECRET_KEY;
  const ADDRESS = userAddress || process.env.ONERAMP_ADDRESS;

  console.log(userAddress, ADDRESS);

  if (!cryptoAmount) {
    return { status: false, error: 'Amount is required' };
  }

  if (!fiatType) {
    return { status: false, error: 'Fiat type is required' };
  }

  if (!cryptoType) {
    return { status: false, error: 'Crypto type is required' };
  }

  try {
    const response = await axios.post(
      "https://api.oneramp.io/quote-out",
      {
        fiatType,
        cryptoType,
        cryptoAmount,
        country: "NG",
        address: ADDRESS,
        network: "base"
      },
      {
        headers: {
          'Authorization': `Bearer ${ONERAMP_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    await console.log('quoteOut', {
      request: {
        fiatType,
        cryptoType,
        cryptoAmount,
        country: "NG",
        address: ADDRESS
      },
      response: response.data
    });

    const quoteData = response.data.quote;

    if (!quoteData) {
      return { status: false, error: 'Quote data not found' };
    }

    return {
      status: true,
      fiatAmount: quoteData.fiatAmount,
      cryptoAmount: quoteData.cryptoAmount,
      fee: quoteData.fee,
      amountPaid: quoteData.amountPaid,
      guaranteedUntil: quoteData.guaranteedUntil,
      quoteId: quoteData.quoteId,
      id: quoteData.id,
      kyc: response.data.kyc,
      fiatAccount: response.data.fiatAccount
    };
  } catch (error) {
     console.error('quoteOutError', {
      request: {
        fiatType,
        cryptoType,
        cryptoAmount,
        country: "NG",
        address: ADDRESS
      },
      error: error.response?.data || error.message
    });
    console.error('Error fetching quote data:', error.response?.data || error.message);
    return { status: false, error: 'Failed to fetch quote data. Please try again.' };
  }
};

const transferOut = async (quoteId, bankDetails, userDetails, operator = "bank") => {
  const ONERAMP_SECRET_KEY = process.env.ONERAMP_SECRET_KEY;

  if (!quoteId) {
    return { status: false, error: 'Quote ID is required' };
  }

  if (!bankDetails) {
    return { status: false, error: 'Bank details are required' };
  }

  if (!bankDetails.code || !bankDetails.accountNumber || !bankDetails.accountName) {
    return { status: false, error: 'Bank code, account number, and account name are required' };
  }

  if (!userDetails) {
    return { status: false, error: 'User details are required' };
  }

  const requiredUserFields = ['name', 'country', 'address', 'phone', 'dob', 'idNumber', 'idType'];
  for (const field of requiredUserFields) {
    if (!userDetails[field]) {
      return { status: false, error: `User ${field} is required` };
    }
  }

  try {
    const idempotencyKey = `transfer_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    const requestData = {
      operator: "bank",
      quoteId,
      bank: {
        code: bankDetails.code,
        accountNumber: bankDetails.accountNumber,
        accountName: bankDetails.accountName
      },
      userDetails: {
        name: userDetails.name,
        country: userDetails.country,
        address: userDetails.address,
        phone: userDetails.phone,
        dob: userDetails.dob,
        idNumber: userDetails.idNumber,
        idType: userDetails.idType,
        ...(userDetails.additionalIdType && { additionalIdType: userDetails.additionalIdType }),
        ...(userDetails.additionalIdNumber && { additionalIdNumber: userDetails.additionalIdNumber })
      }
    };

    const response = await axios.post(
      "https://api.oneramp.io/transfer-out",
      requestData,
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ONERAMP_SECRET_KEY}`,
        },
      }
    );

    console.log('transferOut', {
      request: requestData,
      idempotencyKey,
      response: response.data
    });

    console.error('transferOut', {
      request: requestData,
      idempotencyKey,
      response: response.data
    });

    const transferData = response.data;

    return {
      status: true,
      transferId: transferData.transferId,
      transferStatus: transferData.transferStatus,
      transferAddress: transferData.transferAddress,
      idempotencyKey
    };
  } catch (error) {
    await console.error('transferOutError', {
      request: {
        operator,
        quoteId,
        bank: bankDetails,
        userDetails
      },
      error: error.response?.data || error.message
    });
    console.error('Error initiating transfer:', error.response?.data || error.message);
    return { status: false, error: 'Failed to initiate transfer. Please try again.' };
  }
};

module.exports = {
  quoteOut,
  transferOut
};