const ethers = require("ethers");

const EXCHANGE_CONFIG = require("../../exchange-config.json");
const ONCHAIN_DECIMALS_PER_ASSET =
  EXCHANGE_CONFIG["ONCHAIN_DECIMALS_PER_ASSET"];
const SYMBOLS_TO_IDS = EXCHANGE_CONFIG["SYMBOLS_TO_IDS"];
const TOKEN_ID_2_ADDRESS = EXCHANGE_CONFIG["TOKEN_ID_2_ADDRESS"];

const path = require("path");
const dotenv = require("dotenv");
const { storeUserState } = require("./localStorage");
dotenv.config({ path: path.join(__dirname, "../.env") });

async function executeDepositTx(user, amount, token) {
  const network = "sepolia";

  let privateKey = process.env.ETH_PRIVATE_KEY;
  const provider = ethers.getDefaultProvider(network);
  const signer = new ethers.Wallet(privateKey, provider);

  const invisibleAddress = "0x9ECC2Ccc13Bf31790aaa88A985D3d24A5000d01a";
  const invisibleL1Abi = require("../abis/Invisible.json").abi;
  const invisibleContract = new ethers.Contract(
    invisibleAddress,
    invisibleL1Abi,
    signer ?? undefined
  );

  let depositStarkKey = user.getDepositStarkKey(token);

  let depositAmount =
    BigInt(amount * 1000) *
    10n ** BigInt(ONCHAIN_DECIMALS_PER_ASSET[token] - 3);

  // ! If ETH
  if (token == SYMBOLS_TO_IDS["ETH"]) {
    let tokenBalance = await signer.getBalance();

    if (tokenBalance < amount) {
      throw new Error("Not enough balance");
    }

    let txRes = await invisibleContract
      .makeDeposit(
        "0x0000000000000000000000000000000000000000",
        0,
        depositStarkKey,
        { gasLimit: 3000000, value: depositAmount }
      )
      .catch((err) => {
        if (err.message.includes("user rejected transaction")) {
          throw Error("User rejected transaction");
        }
      });
    let receipt = await txRes.wait();
    let txHash = receipt.transactionHash;

    // ? Get the events emitted by the transaction
    let deposit;
    receipt.logs.forEach((log) => {
      try {
        const event = invisibleContract.interface.parseLog(log);
        if (event) {
          if (event.name == "DepositEvent") {
            deposit = {
              depositId: event.args.depositId.toString(),
              starkKey: event.args.pubKey.toString(),
              tokenId: event.args.tokenId.toString(),
              amount: event.args.depositAmountScaled.toString(),
              timestamp: event.args.timestamp.toString(),
              txHash: txHash.toString(),
            };
            return;
          }
        }
      } catch (e) {
        console.log("e: ", e);
      }
    });

    return deposit;
  }
  // ! If ERC20
  else {
    // NOTE: Token has to be approved first!

    let tokenAddress = TOKEN_ID_2_ADDRESS[token];
    const erc20Abi = require("../abis/Erc20.json").abi;
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      signer ?? undefined
    );

    let userAddress = await signer.getAddress();

    let tokenBalance = await tokenContract.balanceOf(userAddress);

    if (tokenBalance < depositAmount) {
      throw new Error("Not enough balance");
    }

    let allowance = await tokenContract.allowance(
      userAddress,
      invisibleContract.address
    );

    if (allowance < depositAmount) {
      let txRes = await tokenContract
        .approve(invisibleContract.address, depositAmount)
        .catch((err) => {
          if (err.message.includes("user rejected transaction")) {
            throw Error("User rejected transaction");
          }
        });
      await txRes.wait();
    }

    let txRes = await invisibleContract
      .makeDeposit(tokenContract.address, depositAmount, depositStarkKey, {
        gasLimit: 3000000,
      })
      .catch((err) => {
        if (err.message.includes("user rejected transaction")) {
          throw Error("User rejected transaction");
        }
      });
    let receipt = await txRes.wait();
    let txHash = receipt.transactionHash;

    // ? Get the events emitted by the transaction
    let deposit;
    receipt.logs.forEach((log) => {
      try {
        const event = invisibleContract.interface.parseLog(log);
        if (event) {
          if (event.name == "DepositEvent") {
            deposit = {
              depositId: event.args.depositId.toString(),
              starkKey: event.args.pubKey.toString(),
              tokenId: event.args.tokenId.toString(),
              amount: event.args.depositAmountScaled.toString(),
              timestamp: event.args.timestamp.toString(),
              txHash: txHash.toString(),
            };
            return;
          }
        }
      } catch (e) {
        console.log("e: ", e);
      }
    });

    storeUserState(user.db, user).catch((err) => {
      console.log("err: ", err);
    });

    return deposit;
  }
}
