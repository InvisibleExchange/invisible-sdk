const { Note, trimHash } = require("./src/transactions/stateStructs/Notes.js");
const UserState = require("./src/users/Invisibl3User.js");

function nameTokens() {
  // let BTC_hex =
  //   "0xda8562e7abc01a6f0d49a25d144ce6a9d7752a079c5d950ad5a93fd6d623f7fd";
  // let ETH_hex =
  //   "0xf4a3760644d064b3f7d82bb8e43ccb090a2dac8b55cc2894bf618c551b0bc2a8";
  // let USDC_hex =
  //   "0x8591ee9090c0c02ca1f103cb637131d8f358870aba145245ff083e138fdd705b";
  // let SOL_hex =
  //   "0x29296c07a5ba406f81057d14fdd0d58bd981b8e5701d901b590f84c71085191b";
  // let btcId = trimHash(BigInt(BTC_hex, 16), 32);
  // let ethId = trimHash(BigInt(ETH_hex, 16), 32);
  // let usdcId = trimHash(BigInt(USDC_hex, 16), 32);
  // let solId = trimHash(BigInt(SOL_hex, 16), 32);
  // console.log(btcId);
  // console.log(ethId);
  // console.log(usdcId);
  // console.log(solId);
  // console.log(btcId < 2 ** 32);
  // console.log(ethId < 2 ** 32);
  // console.log(usdcId < 2 ** 32);
  // console.log(solId < 2 ** 32);
  // // 3592681469
  // // 453755560
  // // 2413654107
  // // 277158171
}

async function main() {
  let user = UserState.loginUser(73853287523);



  // console.log(user);
}

main();
