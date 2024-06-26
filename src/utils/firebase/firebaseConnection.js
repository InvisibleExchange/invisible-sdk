const { db } = require("./firebaseConfig.js");
const {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  where,
  query,
  orderBy,
  limit,
} = require("firebase/firestore");
const bigInt = require("big-integer");

const { Note, trimHash } = require("../../transactions/stateStructs/Notes.js");
const { hash2 } = require("../crypto_hash.js");

const { ec } = require("starknet").ec; //require("starknet/utils/ellipticCurve.js");

const BN = require("bn.js");
const {
  TabHeader,
  OrderTab,
} = require("../../transactions/stateStructs/OrderTab.js");

const EXCHANGE_CONFIG = require("../../../exchange-config.json");
const PRICE_DECIMALS_PER_ASSET = EXCHANGE_CONFIG["PRICE_DECIMALS_PER_ASSET"];

/* global BigInt */

// * ------------------------------------------------- * //
async function getAddressIndexes(address) {
  const querySnapshot = await getDocs(
    collection(db, `addr2idx/addresses/${address}`)
  );

  if (querySnapshot.empty) {
    return [];
  }

  let indexes = [];
  querySnapshot.forEach((doc) => {
    let index = doc.id;

    indexes.push(index);
  });

  return indexes;
}

// * ------------------------------------------------- * //
// ---- NOTES ---- //
async function fetchStoredNotes(address, blinding) {
  // Address should be the x coordinate of the address in decimal format

  let indexes = await getAddressIndexes(address);

  let notes = [];
  for (let index of indexes) {
    const noteDoc = await getDoc(doc(db, `notes`, index.toString()));

    if (!noteDoc.exists()) {
      continue;
    }

    let noteData = noteDoc.data();

    let addr = ec
      .keyFromPublic({
        x: new BN(noteData.address[0]),
        y: new BN(noteData.address[1]),
      })
      .getPublic();

    // let yt = hash2([BigInt(addr.getX()), privateSeed]);
    let hash8 = trimHash(blinding, 64);
    let amount = Number.parseInt(
      bigInt(noteData.hidden_amount).xor(hash8).value
    );

    if (hash2([BigInt(amount), blinding]) != noteData.commitment) {
      throw "Invalid amount and blinding";
    }

    let note = new Note(
      addr,
      BigInt(noteData.token),
      amount,
      blinding,
      BigInt(noteData.index)
    );

    notes.push(note);
  }

  return notes;
}

async function checkNoteExistance(address) {
  // Address should be the x coordinate of the address in decimal format

  const indexes = await getAddressIndexes(address);

  return indexes && indexes.length > 0;
}

// * ------------------------------------------------- * //
// ---- POSITIONS ---- //
async function fetchStoredPosition(address) {
  // returns the position at this address from the db

  let indexes = await getAddressIndexes(address);

  let positions = [];
  for (let index of indexes) {
    const positionDoc = await getDoc(doc(db, `positions`, index.toString()));

    if (!positionDoc.exists()) {
      continue;
    }

    let position = positionDoc.data();

    positions.push(position);
  }

  return positions;
}

async function fetchIndividualPosition(address, index) {
  // returns the position at this address from the db

  const positionData = await getDoc(doc(db, `positions/`, index.toString()));

  if (!positionData.exists()) {
    return null;
  }

  let position = positionData.data();

  return position;
}

async function checkPositionExistance(address) {
  // Address should be the x coordinate of the address in decimal format

  const indexes = await getAddressIndexes(address);

  return indexes && indexes.length > 0;
}

async function getLiquidatablePositions(indexPrice, token) {
  indexPrice = indexPrice * 10 ** PRICE_DECIMALS_PER_ASSET[token];

  // ? if long and liquidation_price >= indexPrice
  const q1 = query(
    collection(db, `liquidations`),
    where("liquidation_price", ">=", indexPrice),
    where("synthetic_token", "==", token),
    where("order_side", "==", "Long")
  );
  const querySnapshot1 = await getDocs(q1);

  // ? if short and liquidation_price <= indexPrice
  const q2 = query(
    collection(db, `liquidations`),
    where("liquidation_price", "<=", indexPrice),
    where("synthetic_token", "==", token),
    where("order_side", "==", "Short")
  );
  const querySnapshot2 = await getDocs(q2);

  let positions = [];
  let liquidationDocs = querySnapshot1.docs.concat(querySnapshot2.docs);

  let l = liquidationDocs.length;
  let counter = 0;
  liquidationDocs.forEach(async (doc) => {
    let [address, index] = doc.id.split("-");

    // let docData = doc.data();
    // let liqPrice = docData.liquidation_price;
    // let syntheticToken = docData.synthetic_token;
    // let orderSide = docData.order_side;

    let pos = await fetchIndividualPosition(address, index);

    if (pos) {
      positions.push(pos);
    }

    counter++;
  });

  while (counter < l) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return positions;
}

// * ------------------------------------------------- * //
// ---- ORDER TABS ---- //
async function fetchStoredTabs(address, baseBlinding, quoteBlinding) {
  // Address should be the x coordinate of the address in decimal format

  let indexes = await getAddressIndexes(address);

  let orderTabs = [];
  for (let index of indexes) {
    const tabDoc = await getDoc(doc(db, `order_tabs`, index.toString()));

    if (!tabDoc.exists()) {
      continue;
    }

    let tabData = tabDoc.data();

    let base_hash8 = trimHash(baseBlinding, 64);
    let baseAmount = Number.parseInt(
      bigInt(tabData.base_hidden_amount).xor(base_hash8).value
    );

    if (hash2([BigInt(baseAmount), baseBlinding]) != tabData.base_commitment) {
      throw "Invalid base amount and blinding";
    }

    let quote_hash8 = trimHash(quoteBlinding, 64);
    let quoteAmount = Number.parseInt(
      bigInt(tabData.quote_hidden_amount).xor(quote_hash8).value
    );
    if (
      hash2([BigInt(quoteAmount), quoteBlinding]) != tabData.quote_commitment
    ) {
      throw "Invalid quote amount and blinding";
    }

    let tabHeader = new TabHeader(
      tabData.base_token,
      tabData.quote_token,
      baseBlinding,
      quoteBlinding,
      tabData.pub_key
    );
    let orderTab = new OrderTab(
      tabData.index,
      tabHeader,
      baseAmount,
      quoteAmount
    );

    orderTabs.push(orderTab);
  }

  return orderTabs;
}

async function checkOrderTabExistance(address) {
  // Address should be the x coordinate of the address in decimal format

  let indexes = await getAddressIndexes(address);

  return indexes && indexes.length > 0;
}

// * ------------------------------------------------- * //
// ---- USER INFO ---- //
async function registerUser(userId) {
  let userAddressesDoc = doc(db, "users", userId.toString());
  let userAddressData = await getDoc(userAddressesDoc);

  if (userAddressData.exists()) {
    return;
  }

  let userData = {
    noteCounts: {},
    positionCounts: {},
    depositIds: [],
  };

  await setDoc(userAddressesDoc, userData);

  return userData;
}

async function storeUserData(userId, noteCounts, positionCounts) {
  //& stores privKey, the address can be derived from the privKey

  let userDataDoc = doc(db, "users", userId.toString());
  let userDataData = await getDoc(userDataDoc);

  if (!userDataData.exists()) {
    throw "Register user first";
  }

  await updateDoc(userDataDoc, {
    noteCounts,
    positionCounts,
  });
}

// * ------------------------------------------------- * //
async function storePrivKey(userId, privKey, isPosition, privateSeed) {
  let docRef;

  if (!privKey || !privateSeed) {
    return;
  }

  let encryptedPk = bigInt(privKey).xor(privateSeed).toString();

  if (isPosition) {
    docRef = doc(db, `users/${userId}/positionPrivKeys`, encryptedPk);
  } else {
    docRef = doc(db, `users/${userId}/privKeys`, encryptedPk);
  }

  await setDoc(docRef, {});
}

async function removePrivKey(userId, privKey, isPosition, privateSeed) {
  let docRef;

  let encryptedPk = bigInt(privKey).xor(privateSeed).toString();

  if (isPosition) {
    docRef = doc(db, `users/${userId}/positionPrivKeys`, encryptedPk);
  } else {
    docRef = doc(db, `users/${userId}/privKeys`, encryptedPk);
  }

  await deleteDoc(docRef);

  let docRef2 = doc(db, `users/${userId}/deprecatedKeys`, encryptedPk);
  await setDoc(docRef2, {});
}

// * ------------------------------------------------- * //
async function storeOrderId(
  userId,
  orderId,
  pfrNotePrivKey,
  isPerp,
  privateSeed
) {
  if (!orderId) {
    return;
  }

  let privSeedSquare = bigInt(privateSeed).pow(2).value;
  let mask = trimHash(privSeedSquare, 32);
  let encryptedOrderId = bigInt(orderId).xor(mask).toString();

  let encryptedNotePk = pfrNotePrivKey
    ? bigInt(pfrNotePrivKey).xor(privateSeed).toString()
    : null;

  let docRef;
  if (isPerp) {
    docRef = doc(db, `users/${userId}/perpetualOrderIds`, encryptedOrderId);
  } else {
    docRef = doc(db, `users/${userId}/orderIds`, encryptedOrderId);
  }

  await setDoc(docRef, {
    pfrPrivKey: encryptedNotePk,
  });
}

async function removeOrderId(userId, orderId, isPerp, privateSeed) {
  let privSeedSquare = bigInt(privateSeed).pow(2).value;
  let mask = trimHash(privSeedSquare, 32);
  let encryptedOrderId = bigInt(orderId).xor(mask).toString();

  let docRef;
  if (isPerp) {
    docRef = doc(db, `users/${userId}/perpetualOrderIds`, encryptedOrderId);
  } else {
    docRef = doc(db, `users/${userId}/orderIds`, encryptedOrderId);
  }

  await deleteDoc(docRef);

  let docRef2 = doc(db, `users/${userId}/deprecatedOrderIds`, encryptedOrderId);
  await setDoc(docRef2, {});
}

// * ------------------------------------------------- * //

async function fetchOnchainDeposits(depositIds, privateSeed) {
  if (!depositIds || depositIds.length == 0) {
    return [];
  }

  let newDepositIds = [];
  let deposits = [];
  for (const depositId of depositIds) {
    let depositDoc = doc(db, "deposits", depositId);
    let depositData = await getDoc(depositDoc);

    if (!depositData.exists()) {
      continue;
    }

    newDepositIds.push(depositId);

    deposits.push(depositData.data());
  }

  return { deposits, newDepositIds };
}

// * ------------------------------------------------- * //

async function fetchUserData(userId, privateSeed) {
  //& stores privKey : [address.x, address.y]

  let userDoc = doc(db, "users", userId.toString());
  let userData = await getDoc(userDoc);

  if (!userData.exists()) {
    await registerUser(userId);
    return {
      privKeys: [],
      positionPrivKeys: [],
      orderIds: [],
      perpetualOrderIds: [],
      noteCounts: {},
      positionCounts: {},
    };
  }

  let noteCounts = userData.data().noteCounts;
  let positionCounts = userData.data().positionCounts;

  let pfrKeys = {};

  // Note priv_keys
  let querySnapshot = await getDocs(collection(db, `users/${userId}/privKeys`));
  let privKeys = [];
  if (!querySnapshot.empty) {
    querySnapshot.forEach((doc) => {
      let decyrptedPk = bigInt(doc.id).xor(privateSeed).value;

      privKeys.push(BigInt(decyrptedPk));
    });
  }

  // position priv_keys
  querySnapshot = await getDocs(
    collection(db, `users/${userId}/positionPrivKeys`)
  );
  let positionPrivKeys = [];
  if (!querySnapshot.empty) {
    querySnapshot.forEach((doc) => {
      let decyrptedPk = bigInt(doc.id).xor(privateSeed).value;

      positionPrivKeys.push(decyrptedPk);
    });
  }

  // spot order ids
  querySnapshot = await getDocs(collection(db, `users/${userId}/orderIds`));
  let orderIds = [];
  if (!querySnapshot.empty) {
    querySnapshot.forEach((doc) => {
      let privSeedSquare = bigInt(privateSeed).pow(2).value;
      let mask = trimHash(privSeedSquare, 32);
      let decyrptedPk = bigInt(doc.id).xor(mask).value;

      let decryptedNotePk = doc.data().pfrPrivKey
        ? bigInt(doc.data().pfrPrivKey).xor(privateSeed).toString()
        : null;

      orderIds.push(Number.parseInt(decyrptedPk));
      if (decryptedNotePk) {
        pfrKeys[decyrptedPk] = decryptedNotePk;
      }
    });
  }

  // perpetual order ids
  querySnapshot = await getDocs(
    collection(db, `users/${userId}/perpetualOrderIds`)
  );
  let perpetualOrderIds = [];
  if (!querySnapshot.empty) {
    querySnapshot.forEach((doc) => {
      let privSeedSquare = bigInt(privateSeed).pow(2).value;
      let mask = trimHash(privSeedSquare, 32);
      let decyrptedPk = bigInt(doc.id).xor(mask).value;

      let decryptedNotePk = doc.data().pfrPrivKey
        ? bigInt(doc.data().pfrPrivKey).xor(privateSeed).toString()
        : null;

      perpetualOrderIds.push(Number.parseInt(decyrptedPk));
      if (decryptedNotePk) {
        pfrKeys[decyrptedPk] = decryptedNotePk;
      }
    });
  }

  return {
    privKeys,
    noteCounts,
    positionCounts,
    orderIds,
    perpetualOrderIds,
    positionPrivKeys,
    pfrKeys,
  };
}

// * ------------------------------------------------- * //

// ---- FILLS ---- //
async function fetchUserFills(user_id_) {
  let user_id = trimHash(user_id_, 64).toString();

  const q1 = query(
    collection(db, `fills`),
    where("user_id_a", "==", user_id),
    limit(20)
  );
  const querySnapshot1 = await getDocs(q1);

  const q2 = query(
    collection(db, `fills`),
    where("user_id_b", "==", user_id),
    limit(20)
  );
  const querySnapshot2 = await getDocs(q2);

  const q3 = query(
    collection(db, `perp_fills`),
    where("user_id_a", "==", user_id),
    limit(20)
  );
  const querySnapshot3 = await getDocs(q3);

  const q4 = query(
    collection(db, `perp_fills`),
    where("user_id_b", "==", user_id),
    limit(20)
  );
  const querySnapshot4 = await getDocs(q4);

  // [{base_token, amount, price, side, time, isPerp}]

  let fills = [];
  let spotSnapshotDocs = querySnapshot1.docs.concat(querySnapshot2.docs);
  spotSnapshotDocs.forEach((doc) => {
    let obj = doc.data();

    let fill = {
      amount: obj.amount,
      price: obj.price,
      base_token: obj.base_token,
      side: obj.user_id_a == user_id ? "Buy" : "Sell",
      time: obj.timestamp,
      isPerp: false,
    };

    fills.push(fill);
  });

  let perpSnapshotDocs = querySnapshot3.docs.concat(querySnapshot4.docs);
  perpSnapshotDocs.forEach((doc) => {
    let obj = doc.data();

    let fill = {
      amount: obj.amount,
      price: obj.price,
      base_token: obj.synthetic_token,
      side: obj.user_id_a == user_id ? "Buy" : "Sell",
      time: obj.timestamp,
      isPerp: true,
    };

    fills.push(fill);
  });

  // order the fills by time
  fills = fills.sort((a, b) => {
    return b.time - a.time;
  });

  return fills;
}

// * ------------------------------------------------- * //
async function fetchLatestFills(n, isPerp, token) {
  let q;
  if (isPerp) {
    q = query(
      collection(db, "perp_fills"),
      where("synthetic_token", "==", Number(token)),
      orderBy("timestamp", "desc"),
      limit(n)
    );
  } else {
    q = query(
      collection(db, `fills`),
      where("base_token", "==", Number(token)),
      orderBy("timestamp", "desc"),
      limit(n)
    );
  }

  const querySnapshot = await getDocs(q);
  let fills = querySnapshot.docs.map((doc) => doc.data());

  return fills;
}

// * ------------------------------------------------- * //

async function fetchOnchainMMActions(positionAddress) {
  let q = query(
    collection(db, `mm_actions`),
    where("position_address", "==", positionAddress.toString())
  );

  const querySnapshot = await getDocs(q);

  let mmActions = querySnapshot.docs.map((doc) => doc.data());

  return mmActions;
}

// ================================================================

// ---- POSITIONS ---- //

// ================================================================

module.exports = {
  fetchStoredNotes,
  fetchStoredPosition,
  fetchStoredTabs,
  fetchUserFills,
  fetchLatestFills,
  fetchIndividualPosition,
  //
  storeUserData,
  fetchUserData,
  storePrivKey,
  removePrivKey,
  storeOrderId,
  removeOrderId,

  fetchOnchainDeposits,
  fetchOnchainMMActions,

  checkNoteExistance,
  checkPositionExistance,
  checkOrderTabExistance,

  getLiquidatablePositions,
};

// storeOnchainDeposit,
// storeDepositId,
// removeDepositFromDb,
// fetchOnchainDeposits,
