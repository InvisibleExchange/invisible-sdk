const { computeHashOnElements } = require("../../utils/pedersen.js");

const { getKeyPair, sign } = require("starknet").ec;

const {
  fetchStoredPosition,
  fetchStoredNotes,
  fetchStoredTabs,
} = require("../../utils/firebase/firebaseConnection.js");
const axios = require("axios");

const EXCHANGE_CONFIG = require("../../../exchange-config.json");

const SERVER_URL = EXCHANGE_CONFIG["SERVER_URL"];
const EXPRESS_APP_URL = `http://${SERVER_URL}:4000`;

/* global BigInt */

// ! ==============================================================================
// ! ==============================================================================

async function fetchNoteData(keyPairs, privateSeed) {
  // priv keys that don't point to a note stored in the database
  let emptyPrivKeys = [];
  //{token1: [note1,...,noteN],...,tokenN: ...]}
  let noteData = {};
  let notePrivKeys = {}; // {addr : privKey}

  let error;
  let promises = keyPairs.map((keyPair) => {
    let addr = keyPair.getPublic();
    let privKey = BigInt(keyPair.getPrivate());

    let blinding = _generateNewBliding(addr.getX(), privateSeed);

    return fetchStoredNotes(addr.getX().toString(), blinding)
      .then((notes_) => {
        if (!notes_ || notes_.length == 0) {
          emptyPrivKeys.push(privKey);

          return;
        }

        if (noteData[notes_[0].token]) {
          noteData[notes_[0].token].push(notes_[0]);
        } else {
          noteData[notes_[0].token] = [notes_[0]];
        }

        for (let j = 1; j < notes_.length; j++) {
          noteData[notes_[j].token].push(notes_[j]);
        }

        notePrivKeys[BigInt(addr.getX())] = privKey;
      })
      .catch((err) => {
        error = err;
      });
  });

  await Promise.all(promises);

  return { emptyPrivKeys, noteData, notePrivKeys, error };
}
// ? ==============================================================================

async function fetchPositionData(addressData) {
  let emptyPositionPrivKeys = [];
  let positionData = {};
  let posPrivKeys = {};

  let error;
  let promises = addressData.map((address) => {
    let addr = address.address;
    let privKey = BigInt(address.pk);

    return fetchStoredPosition(addr.getX().toString())
      .then((positions) => {
        if (!positions || positions.length == 0) {
          emptyPositionPrivKeys.push(privKey);
          return;
        }

        if (positionData[positions[0].position_header.synthetic_token]) {
          positionData[positions[0].position_header.synthetic_token].push(
            positions[0]
          );
        } else {
          positionData[positions[0].position_header.synthetic_token] = [
            positions[0],
          ];
        }

        for (let j = 1; j < positions.length; j++) {
          positionData[positions[j].position_header.synthetic_token].push(
            positions[j]
          );
        }

        posPrivKeys[BigInt(addr.getX())] = privKey;
      })
      .catch((err) => {
        error = err;
      });
  });

  await Promise.all(promises);

  return { emptyPositionPrivKeys, positionData, posPrivKeys, error };
}

// ? ==============================================================================

async function fetchOrderTabData(addressData, privateSeed) {
  let emptyTabPrivKeys = [];
  let orderTabData = {};
  let tabPrivKeys = {};

  let error;
  let promises = addressData.map((addrData) => {
    let addr = addrData.address.getX().toString();
    let privKey = BigInt(addrData.pk);

    let baseBlinding = _generateNewBliding(
      BigInt(addr),
      BigInt(privateSeed) + 1n
    );
    let quoteBlinding = _generateNewBliding(
      BigInt(addr),
      BigInt(privateSeed) + 2n
    );

    fetchStoredTabs(addr, baseBlinding, quoteBlinding)
      .then((tabs) => {
        if (!tabs || tabs.length == 0) {
          emptyTabPrivKeys.push(privKey);
          return;
        }

        if (orderTabData[tabs[0].tab_header.base_token]) {
          orderTabData[tabs[0].tab_header.base_token].push(tabs[0]);
        } else {
          orderTabData[tabs[0].tab_header.base_token] = [tabs[0]];
        }

        for (let j = 1; j < tabs.length; j++) {
          orderTabData[tabs[j].tab_header.base_token].push(tabs[j]);
        }

        tabPrivKeys[BigInt(addr)] = privKey;
      })
      .catch((err) => {
        error = err;
      });
  });

  await Promise.all(promises);

  return { emptyTabPrivKeys, orderTabData, tabPrivKeys, error };
}

// * ==============================================================================
function signMarginChange(
  direction,
  marginChange,
  notesIn,
  refundNote,
  closeOrderFields,
  position,
  positionPrivKey
) {
  //

  if (direction == "Add") {
    let hashInputs = notesIn.map((note) => note.note.hash);
    hashInputs.push(refundNote ? refundNote.hash : 0n);
    hashInputs.push(position.hash);

    let hash = computeHashOnElements(hashInputs);

    let privKeySum = notesIn.reduce((acc, note) => {
      return acc + note.privKey;
    }, 0n);

    let keyPair = getKeyPair(privKeySum);

    let sig = sign(keyPair, hash.toString(16));

    return sig;
  } else {
    const P = 2n ** 251n + 17n * 2n ** 192n + 1n;
    let changeAmount = P - BigInt(Math.abs(marginChange));

    let hashInputs = [changeAmount, closeOrderFields.hash(), position.hash];
    let hash = computeHashOnElements(hashInputs);

    let keyPair = getKeyPair(positionPrivKey);

    let sig = sign(keyPair, hash.toString(16));

    return sig;
  }
}

// * ==============================================================================
async function getActiveOrders(order_ids, perp_order_ids) {
  return await axios
    .post(`${EXPRESS_APP_URL}/get_orders`, {
      order_ids,
      perp_order_ids,
    })
    .then((res) => {
      let order_response = res.data.response;

      let badOrderIds = order_response.bad_order_ids;
      let orders = order_response.orders;
      let badPerpOrderIds = order_response.bad_perp_order_ids;
      let perpOrders = order_response.perp_orders;
      let pfrNotes = order_response.pfr_notes
        ? order_response.pfr_notes.map((n) => Note.fromGrpcObject(n))
        : [];

      return { badOrderIds, orders, badPerpOrderIds, perpOrders, pfrNotes };
    })
    .catch((err) => {
      console.log(err);
      throw err;
    });
}

// * ==============================================================================
async function handlePfrNoteData(
  userId,
  pfrKey,
  privateSeed,
  noteData,
  notePrivKeys
) {
  let pfrAddress = getKeyPair(pfrKey).getPublic().getX();
  let blinding = _generateNewBliding(pfrAddress, privateSeed);
  await fetchStoredNotes(pfrAddress, blinding).then((notes) => {
    if (notes && notes.length) {
      let token = notes[0].token;
      if (!noteData[token]) {
        noteData[token] = [];
      }
      noteData[token].push(...notes);
      notePrivKeys[pfrAddress] = pfrKey;

      // storePrivKey(userId, pfrKey, false);
    }
  });
}

function findNoteCombinations(notesData, target, dustAmount) {
  let result = [];
  let findNumbers = function (target, notesData, partial) {
    let s = 0;
    for (let i = 0; i < partial.length; i++) s += partial[i].amount;
    if (s >= target && s <= target + dustAmount) result.push(partial);
    if (s >= target) return;
    for (let i = 0; i < notesData.length; i++) {
      let remaining = [];
      let n = notesData[i];
      for (let j = i + 1; j < notesData.length; j++)
        remaining.push(notesData[j]);
      let partialRec = partial.slice(0);
      partialRec.push(n);
      findNumbers(target, remaining, partialRec);
    }
  };
  findNumbers(target, notesData, []);

  if (result.length == 0) return null;

  let maxLenIdx = 0;
  let maxLen = 0;
  for (let i = 1; i < result.length; i++) {
    if (result[i].length > maxLen) {
      maxLenIdx = i;
      maxLen = result[i].length;
    }
  }

  return result[maxLenIdx];
}

module.exports = {
  fetchNoteData,
  fetchPositionData,
  fetchOrderTabData,
  signMarginChange,
  handlePfrNoteData,
  findNoteCombinations,
  getActiveOrders,
};
