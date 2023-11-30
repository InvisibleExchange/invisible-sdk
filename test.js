const UserState = require("./src/users/Invisibl3User");

async function main(params) {
  let user = await UserState.loginUser("0x1234");

  console.log(user);
}

main();
