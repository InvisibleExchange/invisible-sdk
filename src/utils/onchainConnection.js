

const interactionsAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; //Todo
const interactionsAbi =
  require("../../../../invisible_solidity/out/Interactions.sol/Interactions.json").abi;

const interactionsContract = new ethers.Contract(
  interactionsAddress,
  interactionsAbi,
  signer
);

const tokenAddresses = {
  12345: "0x0000000000000000000000000000000000000000",
  54321: "0x0000000000000000000000000000000000000000",
  55555: "0x0000000000000000000000000000000000000000",
};
async function makeDeposit(user, amount, token) {
  if (!amount || !tokenAddresses[token]) {
    alert("Set an amount and select a token");
    throw new Error("Set an amount and select a token");
  }

  let depositPubKey = user.getDepositStarkKey(token);
  let txRes = await interactionsContract.makeDeposit(
    "0x0000000000000000000000000000000000000000",
    0,
    BigInt(depositStarkKey.getX()),
    { gasLimit: 3000000, value: ethers.utils.parseEther(amount) }
  );
  let receipt = await txRes.wait();

  // If ETH
  if (token == 54321) {
    let txRes = await interactionsContract.makeDeposit(
      "0x0000000000000000000000000000000000000000",
      0,
      BigInt(depositStarkKey.getX()),
      { gasLimit: 3000000, value: ethers.utils.parseEther(amount) }
    );
    let receipt = await txRes.wait();
  } else {
    // NOTE: Token has to be approved first!

    let txRes = await interactionsContract.makeDeposit(
      tokenAddresses[token],
      ethers.utils.parseEther(amount), // todo: parse token amount with the right decimals
      BigInt(depositStarkKey.getX()),
      { gasLimit: 3000000 }
    );
    let receipt = await txRes.wait();
  }
}

async function listenForDeposit() {
  interactionsContract.on(
    "DepositEvent",
    (depositId, pubKey, tokenId, depositAmountScaled, timestamp) => {
      if (this.handledDeposits[depositId.toString()] || !this.user) return;
      let deposit = {
        depositId: depositId.toString(),
        starkKey: pubKey.toString(),
        tokenId: tokenId.toString(),
        depositAmountScaled: depositAmountScaled.toString(),
        timestamp: timestamp.toString(),
      };

      console.log("deposit: ", deposit);
      this.handledDeposits[depositId.toString()] = true;

      let deposits = this.state.pendingDeposits;
      deposits.push(deposit);
      this.setState({ pendingDeposits: deposits });

      storeOnchainDeposit(deposit);
      storeDepositId(this.user.userId, depositId.toString());
    }
  );
}
