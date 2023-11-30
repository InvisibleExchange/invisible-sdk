const bigInt = require("big-integer");
const { pedersen } = require("../../utils/pedersen.js");
const { getKeyPair } = require("starknet").ec;

const { trimHash } = require("../../transactions/stateStructs/Notes.js");

// ! CRYPTO HELPERS
function _subaddressPrivKeys(privSpendKey, privViewKey, randSeed) {
  // //ksi = ks + H(kv, i)
  // //kvi = kv + H(ks, i)

  const ksi = trimHash(pedersen([privSpendKey, randSeed]), 240);
  const kvi = trimHash(pedersen([privViewKey, randSeed]), 240);

  return { ksi, kvi };
}

function _oneTimeAddressPrivKey(Kvi, ks, count) {
  // ko = H(count , Kvi.x) + ks
  let h = trimHash(pedersen([count, BigInt(Kvi.getX())]), 240);

  return h + ks;
}

// Each output of a transaction should have this hiding
function _hideValuesForRecipient(Ko, amount, privateSeed) {
  // Todo: should replace Ko with Kv so someone can reveal their trades without revealing their private keys
  // r is the transaction priv key (randomly generated)
  // yt = H("comm_mask", H(rKv, t))  (NOTE: t is used to make the values unique and we are omitting it for now)
  // amount_t = bt XOR8 yt -> (where bt is the 64 bit amount of the note)

  //todo: might add an index to the blinding like:
  //todo|    - yt0 = H(Ko.X, privateSeed)
  //todo|    - yt1 = H(yto, 1), yt2 = H(yt1, 2), yt3 = H(yt2, 3), ...
  //todo| this allows as to create different blindings for two notes with the same address

  let yt = pedersen([BigInt(Ko.getX()), privateSeed]); // this is the blinding used in the commitment

  // Todo: Should adjust the amount to be at least 40-50 bits
  // ! If the amount is less than 40 bits then the first 20+ bits of the blinding are revealed
  // ! Either that or trim blinding to less bits
  let hash8 = trimHash(yt, 64);
  let hiddentAmount = bigInt(amount).xor(hash8).value;

  return { yt, hiddentAmount };
}

function _generateNewBliding(Ko, privateSeed) {
  let yt = pedersen([BigInt(Ko), privateSeed]);

  return yt;
}

function _revealHiddenValues(Ko, privateSeed, hiddentAmount, commitment) {
  let yt = pedersen([BigInt(Ko.getX()), privateSeed]);
  let hash8 = trimHash(yt, 64);
  let bt = bigInt(hiddentAmount).xor(hash8).value;

  if (pedersen([bt, yt]) != commitment) {
    throw "Invalid amount and blinding";
  }

  return { yt, bt };
}

function _checkOwnership(Ks, Kv, Ko, kv, token, count) {
  let { _, kvi } = _subaddressPrivKeys(0, kv, token);
  let Kvi = getKeyPair(kvi.toString(16)).getPublic();

  // Todo: finsih this function
}

module.exports = {
  _subaddressPrivKeys,
  _oneTimeAddressPrivKey,
  _generateNewBliding,
  _hideValuesForRecipient,
  _revealHiddenValues,
  _checkOwnership,
};

// & The generation of addresses
// User generates Ks and Kv as the original private public key pair (useful for revealing his history if necessary)

// Generates Kvi view key subaddresses for each token along with corresponding priv_keys (ksi)

// Generate a one time address for a note as such:
// count = num of notes/addresses generated for this token (used as the txR - making the addresses unique)
// Ko = H(count, Kvi)G + Ks

// & To prove ownership one needs: Ks, Kv, Ko, and kv:
// - first generate the Kvi with Kv,kv for that token
// - then generate Ks' = Ko - H(count, Kvi)G
// - check if Ks' == Ks

// & To find your own notes for token X:
// get Kvi
// addresses = []

// for i in NUM_TRADES:
// 	Ko = H(i, Kvi) + Ks
// 	addresses.append(Ko)

// loop over all notes onchain:
// 	check if note.address is in addresses:
// 		if so then its yours
