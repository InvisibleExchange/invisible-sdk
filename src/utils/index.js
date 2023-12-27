const { restoreUserState } = require("./keyRetrieval");
const { hash2, computeHashOnElements } = require("./crypto_hash");
const utils = require("./utils");
const { getLiquidatablePositions } = require("./firebase/firebaseConnection");
const localStorage = require("./localStorage");

module.exports = {
  restoreUserState,
  hash2,
  computeHashOnElements,
  ...utils,
  getLiquidatablePositions,
  ...localStorage,
};
