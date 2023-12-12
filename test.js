const UserState = require("./src/users/Invisibl3User");
const { hash2, computeHashOnElements } = require("./src/utils/crypto_hash");

async function main(params) {
  // let user = await UserState.loginUser("0x1234");

  let h = hash2([BigInt(1), BigInt(2)]);

  let h2 = computeHashOnElements([
    BigInt(1),
    BigInt(2),
    BigInt(3),
    BigInt(4),
    BigInt(5),
  ]);

  console.log(h);
  console.log(h2);
}

main();
