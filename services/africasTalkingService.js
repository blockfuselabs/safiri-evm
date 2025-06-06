require("dotenv").config();
const https = require('https');

const {splitPK, encryptKey, decryptKey} = require("../utils/tool")
const africaStalkingData = require("africastalking");
const { User, Transaction } = require('../models');
const { ethers } = require('ethers');
const { Op } = require('sequelize');


const fs = require('fs');
const { sendSMS, messages } = require('./smsService');
const generateSafiriUsername  = require('../utils/usernameGeneration');
const { quoteOut, transferOut } = require('./onerampService'); // <-- Add this import

const africaStalking = africaStalkingData({
    apiKey: process.env.AFRICA_STALKING_API_KEY || "",
    username: process.env.AFRICA_STALKING_USERNAME || 'sandbox',
});

const matchedBanks = require("../utils/matchedBanks");
// Configuration
const provider = process.env.BASE_ETH_PROVIDER_URL || 'https://base-sepolia.g.alchemy.com/v2/9-PIwmEK19yyEu468y65gQSJEIjflXjA';

const ERC20_ABI = [
    "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
    "function transfer(address recipient, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
];

const ethProvider = new ethers.JsonRpcProvider(provider);
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS;


  const pageBanks = [
                                { name: "Access Bank", code: "044" },
                                { name: "UBA", code: "033" },
                                { name: "OPay", code: "999992" },
                                { name: "First Bank", code: "011" },
                                { name: "Moniepoint", code: "50515" },
                    ];

// uSER dETAILS TO SAVE to db
let userbankAccounttoStore;
let userbankCodetoStore;
let userbankAccountName;
let bankName;
const ussdAccess = async (req, res) => {
    const {sessionId, serviceCode, phoneNumber, text} = req.body;

    let response; 
    let fullName = '';
    let passcode = '';
    let userBankChoice = '';
   
    
    if(text == ''){
        response = 'CON Welcome to Safiri Wallet \n 1. Create an account \n 2. Check wallet balance \n 3. Transfer \n 4. Offramp'
    }

    else if(text == '1') {
        response = 'CON Enter full name ';
    }

    else if(text == '4') {
        response = 'CON Enter amount of crypto to offramp'
        
    }
    

    else if(text == '2') {
        try {
            const userExist = await User.findOne({ where: { phoneNumber } });

            if (!userExist){
                response = 'END You do not have an account. Please create one';
            } else {
               
                if (!userExist.status) {
                    response = 'END Your wallet is not yet active.';
                } else {
                    const tokenContract = await new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, ethProvider);
                    const userAddress = userExist.walletAddress;
        
                    const userBalance = await tokenContract.balanceOf(userAddress);
                    response = `END Your wallet balance: ${(Number(userBalance) / 1000000)} USDC`;

                    sendSMS(phoneNumber, messages.accountBalance(userExist.walletAddress, Number(userBalance)));
                }
            }
        } catch (error) {
            response = 'END Could not check balance at the moment';
            console.error("Balance check error:", error);
        }
    }

    else if(text == '3') {
        try {
            const userExist = await User.findOne({ where: { phoneNumber } });
            
            if (!userExist) {
                response = 'END You do not have an account. Please create one';
            } else if (!userExist.status) {
                response = 'END Your wallet is not yet active.';
            } else {
                response = 'CON Enter recipient username or phone number';
            }
        } catch (error) {
            console.error("Transfer initiation error:", error);
            response = 'END Could not initiate transfer';
        }
    }

    // More complex logics
    else if(text !== '') {
        
        let array = text.split('*')

        if(array.length < 1) {
            response = 'END Invalid input';
        }

        // offramping implementation
        if (parseInt(array[0]) == 4) {
                const userExist = await User.findOne({ where: { phoneNumber } });

                if (!userExist){
                    response = 'END You do not have an account. Please create one';
                } else {
                    const tokenContract = await new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, ethProvider);
                    const userAddress = userExist.walletAddress;

                    const userBalance = await tokenContract.balanceOf(userAddress);

                    if (array[1] > userBalance) {
                        response = 'END insufficient crypto bro'
                    }

                    console.log(`Your wallet balance is ${parseInt(userBalance)}`);

            // Step 1: Get quote and ask for confirmation
            if (array.length === 2) {
                const cryptoAmount = array[1];
                // Get quote from OneRamp
                const quote = await quoteOut('NGN', 'USDC', cryptoAmount, userExist.walletAddress);
                console.log(`Quote response: ${JSON.stringify(quote)}`);
                if (!quote.status) {
                    response = `END Failed to get quote: ${quote.error}`;
                } else {
                    // Store quoteId and amount temporarily on user (for demo; use cache/session in prod)
                    userExist.lastQuoteId = quote.quoteId;
                    userExist.lastCryptoAmount = cryptoAmount;
                    await userExist.save();

                    response = `CON You will receive ~${Number(quote.fiatAmount).toFixed(2)} NGN for ${cryptoAmount} USDT (fee: ${quote.fee}).\n1. Confirm\n2. Cancel`;
                }
            } 
        // Step 2: Confirm and send USDT, then initiate fiat payout
        else if (array.length === 3 && array[2] === '1') {
            // Retrieve quoteId and amount
            const quoteId = userExist.lastQuoteId;
            const cryptoAmount = userExist.lastCryptoAmount;
            if (!quoteId || !cryptoAmount) {
                response = 'END Session expired. Please start again.';
            } else {
                try {
                    // Send USDT to provider wallet
                    const privateKey = decryptKey(userExist.privateKey);
                    const userWallet = new ethers.Wallet(privateKey, ethProvider);
                    const tokenContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, userWallet);

                    const bankCode = matchedBanks[userExist.bankName].code;

                    // Initiate fiat payout
                    const bankDetails = {
                        code: bankCode,
                        accountNumber: userExist.accountNumber,
                        accountName: userExist.fullName
                    };
                    // Dummy KYC for demo; collect real KYC in production

                    //TODO: remove hardcoded info
                    const userDetails = {
                        name: userExist.fullName,
                        country: 'NG',
                        address: 'N/A',
                        phone: userExist.phoneNumber,
                        dob: '1990-01-01',
                        idNumber: '01010101',
                        idType: 'NIN',
                        additionalIdType: "BVN",
                        additionalIdNumber: "CM55677878678"
                    };
                    const transfer = await transferOut(quoteId, bankDetails, userDetails);

                    if (!transfer.status) {
                        response = `END Transfer failed: ${transfer.error}`;
                    } else {
                        response = 'END Offramp initiated. You will receive your funds soon.';
                        
                        try {
                            const tx = await tokenContract.transfer(transfer.transferAddress, cryptoAmount, { gasLimit: 300000 });
                            await tx.wait();
                            sendSMS(phoneNumber, `Your offramp is processing. Transfer ID: ${transfer.transferId}`);
                        } catch (err) {
                            if (
                                (err.code === 'INSUFFICIENT_FUNDS') ||
                                (err.info && err.info.error && err.info.error.message && err.info.error.message.includes('insufficient funds')) ||
                                (err.shortMessage && err.shortMessage.toLowerCase().includes('insufficient funds'))
                            ) {
                                response = 'END Insufficient funds to pay for gas. Please fund your wallet with ETH for gas fees.';
                            } else {
                                response = 'END Error sending USDT or initiating payout.';
                                console.error(err);
                            }
                        }
                    }
                } catch (error) {
                    response = 'END Error sending USDT or initiating payout.';
                    console.error(error);
                }
            }
        } 
        // Step 3: Cancel offramp
        else if (array.length === 3 && array[2] === '2') {
            response = 'END Offramp cancelled.';
        }
                }
        }
        
        // Create account option
        if(parseInt(array[0]) == 1){
            console.log(`Registration Array 1: ${array}`)
            if(array.length === 2) {
                if(parseInt(array[0]) == 1) {
                    fullName = array[1]
                    response = 'CON Enter your passcode'
                }
            }
            
            if(array.length === 3) {
                console.log(`Registration Array 2: ${array}`)
                if(parseInt(array[0]) == 1) {
                    fullName = array[1]
                    passcode = array[2]

                    if(!fullName || !phoneNumber || !passcode) {
                        response = 'END Incomplete signup details'
                    }
                  
                    response = "CON Select Your Bank\n"
                    // Display all banks in the array 
                    pageBanks.forEach((element, index) => {
                      response +=`${index + 1 }. ${element.name}\n`
                        
                    });
                    response+=`6. Search bank`
                } 
            }

            if(array.length == 4 ){
                if(parseInt(array[0]) == 1){
                    userBankChoice = array[3]
                    console.log(userBankChoice)
                    if (userBankChoice >=1 && userBankChoice <=5){
                        bankName=pageBanks[userBankChoice - 1].name
                        console.log("I am the bank name", bankName)
                        //GET BANK CODE AND THEN VALIDATE ACCOUNT
                        response = "CON Enter Account Number"
                    }
                    else if(userBankChoice == 6){

                        response = "CON Enter the first 3 letters of the Bank Name" 
                    }
                    else{
                        response = "END INvalid Input"
                    }
                }
            }
            if(array.length == 5 && array[3] !== '6'){
                if(parseInt(array[0]) == 1){
                    
                    // Store both usercode and bankaccount temporally
                    userBankChoice = array[3]
                    userAccountNumber = array[4]
                    let userbankCode = pageBanks[userBankChoice -1].code;
                    userbankCodetoStore = userbankCode;
                   
                    if( userAccountNumber.length !== 10 ||  isNaN(userAccountNumber.length)){
                        response = "END Invalid Account Number. It must be exactly 10 digits. Try again:";
                    }
                    else {
                        // validate account
                        try {
                            
                        let result = await ValidateUserAccountDetails(userAccountNumber, userbankCode)

                        console.log("Bank details", result)
                        if(result.status){
                            let userAccountName = result.data.account_name;
                            let userAccountNumber = result.data.account_number;
                            userbankAccounttoStore = userAccountNumber;
                            userbankAccountName = userAccountName;
                            
                            response = `CON Please Confirm your  Details\n 
                            Name:\b
                            ${userAccountName}\b

                            Account Number:
                            ${userAccountNumber}\b
                            1.Confirm \n2.  Re-enter details`
                        }else{
                             response = "END Incorrect account Number"
                        }
                        
                        console.log("i am the error 00", result)
                        } catch (error) {
                           
                            console.log("Error", error)
                            throw error
                          
                            
                        }

                      
                    }
                }
            }

            

            if(array.length == 5 && array[3] == '6'){
                if(parseInt(array[0]) == 1){
                let bankInitials = array[4]
                let allbanks = await getListOfAllBanks()
                let results = allbanks.filter((bank)=> bank.name.toLowerCase().startsWith(bankInitials.toLowerCase()));
                console.log("gggg", results)
                if (Array.isArray(results) && results.length === 0){

                response =`END Bank(s) with  this ${bankInitials} intials does not exit`

               
                }
                else{
                     response = "CON Select your bank\n"
                    results.forEach((bank, index)=>{
                    response+=`${index + 1}.  ${bank.name}\n`
                })
                }
    
            }
        }
        console.log("Value ", array[5])
        console.log("User", array[4])
        if(array.length == 6 && array[3] !== 6 && array[5] == '1')
        {
                    fullName = array[1]
                    passcode = array[2]


                     if(!userbankAccounttoStore || !userbankCodetoStore){

                        response = "END missing  Bank code and account Number"
                    }
                    else{

                  
                    try {
                        const userExist = await User.findOne({ where: { phoneNumber } });
                    
                        console.log("existence of user", userExist)
                    
                        if (userExist) {
                            response = "END You already have an account"; 
                        } else {
                            response = 'END Creating account, you will receive an SMS when complete';
                            
                            const wallet = ethers.Wallet.createRandom();

                            const privateKey = wallet.privateKey;
                            const walletAddress = wallet.address;

                            const [firstHalf] = splitPK(privateKey);

                            const encryptedKey = `${encryptKey(privateKey, firstHalf)}${firstHalf}`;

                            const safiriUsername = await generateSafiriUsername(fullName);
                            
                            const user = await User.create({
                                fullName,
                                phoneNumber,
                                safiriUsername: safiriUsername,
                                walletAddress: walletAddress,
                                privateKey: encryptedKey,
                                pin: passcode,
                                status: true,
                                bankCode: userbankCodetoStore,
                                accountNumber: userbankAccounttoStore,
                                accountName: userbankAccountName,
                                bankName:bankName
                            });

                            sendSMS(phoneNumber, messages.accountCreated(walletAddress))
                            console.log('User record created in database');
                        }
                    } catch (error) {
                        response = `END Error: ${error.message || "Unknown error"}`;
                    }
                      }
           
        }

         if(array.length == 6 && array[3] == '6'){
            console.log()
            response = "CON Enter Your 10 digit Account Number"               
            }
            if(array.length == 7 && array[3] == '6'){

                let bankInitials = array[4]
                let userbankCode = array[5] - 1
                let accountNumber = array[6]
                // Calling this method again to get bank code for the bank to store
                let allbanks = await getListOfAllBanks()
                
                let results = allbanks.filter((bank)=> bank.name.toLowerCase().startsWith(bankInitials.toLowerCase()));
                let bankCode = results[userbankCode].code
                //
                userbankAccounttoStore = accountNumber
                userbankCodetoStore = bankCode
                bankName = results[userbankCode].name;


                try {
                    let result = await ValidateUserAccountDetails(accountNumber, bankCode)
                     if(result.status){
                            let userAccountName = result.data.account_name;
                            let userAccountNumber = result.data.account_number;
                            userbankAccountName = userAccountName;
                            response = `CON Confirm Account Details \n Name: ${userAccountName} \n Account Number: ${userAccountNumber}
                             1.Confirm \n2.  Re-enter details
                            `
                     }
                    
                
                } catch (error) {
                    console.log("Error:", error)
                    response = "END Could not validite account"
                }
              
            
        } 
       
        if(array.length == 8 && array[3] == '6' && array[7] == '1'){

                    fullName = array[1]
                    passcode = array[2]

                     if(!userbankAccounttoStore || ! userbankCodetoStore){

                                response = "END missing  Bank code and account Number"
                    }
                    else{
                    try {
                        const userExist = await User.findOne({ where: { phoneNumber } });
                    
                        console.log("existence of user", userExist)
                    
                        if (userExist) {
                            response = "END You already have an account"; 
                        } else {
                            response = 'END Creating account, you will receive an SMS when complete';
                            
                            const wallet = ethers.Wallet.createRandom();

                            const privateKey = wallet.privateKey;
                            const walletAddress = wallet.address;

                            const [firstHalf] = splitPK(privateKey);

                            const encryptedKey = `${encryptKey(privateKey, firstHalf)}${firstHalf}`;

                            const safiriUsername = await generateSafiriUsername(fullName);
                            
                           
                            

                            
                            const user = await User.create({
                                fullName,
                                phoneNumber,
                                safiriUsername: safiriUsername,
                                walletAddress: walletAddress,
                                privateKey: encryptedKey,
                                pin: passcode,
                                status: true,
                                bankCode: userbankCodetoStore,
                                accountNumber: userbankAccounttoStore,
                                accountName:userbankAccountName,
                                bankName: bankName
                            });

                            sendSMS(phoneNumber, messages.accountCreated(walletAddress))
                            console.log('User record created in database');


                        
                    }
                    } catch (error) {
                        response = `END Error: ${error.message || "Unknown error"}`;
                    }
                }

        }
    }

        

        // Transfer option
        if(parseInt(array[0]) == 3) {
            if(array.length === 2) {
                const recipientIdentifier = array[1];
                
                try {
                    const recipient = await User.findOne({
                        where: {
                            [Op.or]: [
                                { safiriUsername: recipientIdentifier },
                                { phoneNumber: recipientIdentifier }
                            ],
                            status: true
                        }
                    });

                    if (!recipient) {
                        response = 'END Recipient not found or wallet not active';
                    } else {
                        console.log('Recipient found:', recipient);
                        response = 'CON Enter amount to transfer (USDT) to ' + recipient.fullName;
                    }
                } catch (error) {
                    console.error("Recipient lookup error:", error);
                    response = 'END Could not find recipient';
                }
            }

            
            if(array.length === 3) {
                
                console.log(`TF Amount Array: ${array}`)

                const recipientIdentifier = array[1];
                const amount = array[2];
                
                if (isNaN(amount) || parseFloat(amount) <= 0) {
                    response = 'END Please enter a valid amount';
                } else {
                    response = 'CON Enter your PIN to confirm transfer';
                }
            }
            
            if(array.length === 4) {
                const recipientIdentifier = array[1];
                const amount = array[2];
                const userPin = array[3];
                
                try {
                    const sender = await User.findOne({ where: { phoneNumber } });
                    
                    const recipient = await User.findOne({
                        where: {
                            [Op.or]: [
                                { safiriUsername: recipientIdentifier },
                                { phoneNumber: recipientIdentifier }
                            ],
                            status: true
                        }
                    });
                    
                    if (!sender) {
                        response = 'END You do not have an account';
                    } else if (sender.pin != userPin) {
                        response = 'END Incorrect PIN';
                    } else if (!recipient) {
                        response = 'END Recipient not found or wallet not active';
                    } else if (sender.phoneNumber === recipient.phoneNumber) {
                        response = 'END You cannot transfer to your own account';
                    } else {
                        response = 'END Transfer initiated. You will receive an SMS confirmation.';

                        const privateKey = decryptKey(sender.privateKey);
                        const userWallet = new ethers.Wallet(privateKey, ethProvider);
                        const tokenContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, userWallet);

                        const senderBalance = await tokenContract.balanceOf(sender.walletAddress);

                        if (senderBalance < amount) {
                            response = 'END USDT balance insufficient';
                        }

                        const transfer = await tokenContract.transfer(recipient.walletAddress, amount, {
                            gasLimit: 300000,
                        });
                        await transfer.wait();

                        if (transfer.hash != undefined) {
                            await Transaction.create({
                                user_id: sender.id,
                                txHash: transfer.hash,
                                amount: parseFloat(amount),
                                serviceBeneficiary: recipient.safiriUsername || recipient.phoneNumber,
                                date: new Date()
                            });
                        }

                
                        console.log(transfer.hash);

                        sendSMS(phoneNumber, messages.transactionSuccess(transfer.hash, amount, recipient.safiriUsername));
                        
                    }
                } catch (error) {
                    console.error("Transfer processing error:", error);
                    response = 'END Could not process transfer';
                }
            }
            
        }
    }


    

    res.set('Content-Type', 'text/plain');
    res.send(response);
}

// Add new function to handle transaction notifications
async function sendTransactionNotification(phoneNumber, success, details) {
    try {
        const message = success 
            ? messages.transactionSuccess(details.txHash, details.amount)
            : messages.transactionFailed(details.error);
            
        await sendSMS(phoneNumber, message);
    } catch (error) {
        console.error('Failed to send transaction notification:', error);
    }
}


async function  paginateBanks(banks, currentPage, perPage=5) {

    if(Array.isArray(banks)){
    let start = (currentPage - 1) * perPage;
    let end = perPage  +   start
    let totalPage = Math.ceil(banks.length/ perPage)
    let pageBanks= banks.slice(start, end);
    return {
    pageBanks,
    totalPage
    }
    }
}


async function getListOfAllBanks() {
  try {
    const response = await fetch('https://api.paystack.co/bank', {
      method: 'GET',
      headers: {
        Authorization: process.env.SECRET_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    const filter_data = result.data.map(bank => ({
      code: bank.code,
      name: bank.name
    }));

    return filter_data;

  } catch (error) {
    console.error('Error fetching banks:', error.message);
    throw error;
  }
}


async function ValidateUserAccountDetails(accountNumber, bankCode) {
  const url = `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;


  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: process.env.SECRET_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    return data; 

  } catch (error) {
    return { error: 'Failed to resolve account', details: error.message };
  }
}



module.exports = {
    ussdAccess,
    sendTransactionNotification
};