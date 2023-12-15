const {
  LiquidationOrder,
} = require("../transactions/orderStructs/LiquidationOrder");

const { hash2, computeHashOnElements } = require("../utils/crypto_hash.js");
const { getKeyPair } = require("starknet").ec;

const {
  _subaddressPrivKeys,
  _oneTimeAddressPrivKey,
  _hideValuesForRecipient,
  _revealHiddenValues,
  _generateNewBliding,
} = require("./utils/crypto.js");

const {
  fetchNoteData,
  fetchPositionData,
  signMarginChange,
  findNoteCombinations,
  fetchOrderTabData,
  getActiveOrders,
} = require("./utils/userData.js");

const DUST_AMOUNT_PER_ASSET = {
  12345: 2500, // BTC ~ 5c
  54321: 25000, // ETH ~ 5c
  55555: 50000, // USDC ~ 5c
};
const COLLATERAL_TOKEN = 55555;
const SPOT_MARKET_IDS_2_TOKENS = {
  11: { base: 12345, quote: 55555 },
  12: { base: 54321, quote: 55555 },
};

const CHAIN_IDS = {
  "ETH Mainnet": 9090909,
  Starknet: 7878787,
  ZkSync: 5656565,
};

const { Note, trimHash } = require("../transactions/stateStructs/Notes.js");
const {
  LimitOrder,

  SpotNotesInfo,
} = require("../transactions/orderStructs/LimitOrder");
const {
  TabHeader,
  OrderTab,
} = require("../transactions/stateStructs/OrderTab");

const Deposit = require("../transactions/orderStructs/Deposit");
const {
  OpenOrderFields,
  CloseOrderFields,
  PerpOrder,
} = require("../transactions/orderStructs/PerpOrder");
const Withdrawal = require("../transactions/orderStructs/Withdrawal");
const {
  storeUserState,
  getUserState,
  initDb,
} = require("../utils/localStorage.js");
const { restoreUserState } = require("../utils/keyRetrieval.js");

/* global BigInt */

const USER_ID_MASK =
  172815432917432758348972343289652348293569370432238525823094893243n;
const PRIVATE_SEED_MASK =
  3289567280438953725403208532754302390573452930958285878326574839523n;
const VIEW_KEY_MASK =
  7689472303258934252343208597532492385943798632767034892572348289573n;
const SPEND_KEY_MASK =
  8232958253823489479856437527982347891347326348905738437643519378455n;
// const COMMITMENT_MASK = 112233445566778899n;
// const AMOUNT_MASK = 998877665544332112n;

module.exports = class UserState {
  // Each user has a class where he stores all his information (should never be shared with anyone)
  // private keys should be 240 bits
  constructor(_privViewKey, _privSpendKey) {
    if (
      _privViewKey.toString(2).length > 240 ||
      _privSpendKey.toString(2).length > 240
    ) {
      throw new Error("private keys should be 240 bits");
    }

    this.userId = computeHashOnElements([
      USER_ID_MASK,
      _privViewKey,
      _privSpendKey,
    ]);
    this.privViewKey = _privViewKey; //kv
    this.privSpendKey = _privSpendKey; //ks

    // ? privateSeed only uses the privViewKey because it allows someone to disclose their history,
    // ? without allowing them to spend their funds
    this.privateSeed = computeHashOnElements([
      PRIVATE_SEED_MASK,
      _privViewKey,
      _privSpendKey,
    ]);

    // ? Number of notes/positions/tabs generated by the user for each token
    this.noteCounts = {};
    this.positionCounts = {};
    this.orderTabCounts = {};

    this.pubViewKey = getKeyPair(_privViewKey);
    this.pubSpendKey = getKeyPair(_privSpendKey);

    this.orderIds = [];
    this.perpetualOrderIds = [];

    this.orders = []; // {base_asset,expiration_timestamp,fee_limit,notes_in,order_id,order_side,price,qty_left,quote_asset,refund_note}
    this.perpetualOrders = []; // {order_id,expiration_timestamp,qty_left,price,synthetic_token,order_side,position_effect_type,fee_limit,position_address,notes_in,refund_note,initial_margin}

    // this.noteData structure is as follows:  {token1: [note1,..., noteN],...,tokenN: ...]}
    this.noteData = {};
    this.notePrivKeys = {}; // Maps {noteAddress: privKey}
    // this.positionData structure is as follows:  {token1: [positionJson1,...],...,tokenN: [positionJsonN,...]}
    this.positionData = {};
    this.positionPrivKeys = {}; // Maps {posAddress: privKey}
    //
    // this.orderTabData structure is as follows:  {token1: [tabJson1,...],...,tokenN: [tabJsonN,...]}
    this.orderTabData = {};
    this.tabPrivKeys = {}; // Maps {tabAddress: privKey}
    //
    this.refundNotes = {}; // {orderId: refundNote}
    this.filledAmounts = {}; // {orderId: filledAmount}
    this.closingPositions = {}; // {orderId: position}
    this.awaittingOrder = false; // set to true when an order is created and to false when it's accepted (filled if market)
    //
    // this.pfrKeys = {}; // Maps {orderId: pfrPrivKey}
    this.fills = []; // [{base_token, amount, price, side, time, isPerp}]

    this.db = null;
  }

  //* FETCH USER DATA  =========================================================

  getAvailableAmount(token) {
    let sum = 0;
    if (!this.noteData[token]) {
      return 0;
    }
    for (let n of this.noteData[token]) {
      sum += n.amount;
    }

    return sum;
  }

  async login() {
    this.db = await initDb();

    let userData = await getUserState(this.db, this.userId);

    // ? Get Note Data ============================================
    let keyPairs =
      userData.privKeys.length > 0
        ? userData.privKeys.map((pk) => getKeyPair(pk))
        : [];

    let { emptyPrivKeys, noteData, notePrivKeys, error } = await fetchNoteData(
      keyPairs,
      this.privateSeed
    );
    if (error) {
      await restoreUserState(this, true, false).catch(console.log);
    }

    // ? Get Position Data ============================================
    let addressData =
      userData.positionPrivKeys.length > 0
        ? userData.positionPrivKeys.map((pk) => {
            return { pk: pk, address: getKeyPair(pk).getPublic() };
          })
        : [];

    let {
      emptyPositionPrivKeys,
      positionData,
      posPrivKeys,
      error: error2,
    } = await fetchPositionData(addressData);
    if (error2) {
      await restoreUserState(this, false, true).catch(console.log);
    }

    // ? Get Position Data ============================================
    let tabPkData =
      userData.tabPrivKeys.length > 0
        ? userData.tabPrivKeys.map((pk) => {
            return { pk: pk, address: getKeyPair(pk).getPublic() };
          })
        : [];
      
    let { emptyTabPrivKeys, orderTabData, tabPrivKeys } =
      await fetchOrderTabData(tabPkData, this.privateSeed);

    // ? Get Fill Data ============================================

    // let fills = await fetchUserFills(this.userId);

    // ? Get Order Data ============================================

    let positionDataNew = {};
    for (let [token, arr] of Object.entries(positionData)) {
      let newArr = [];
      for (let pos of arr) {
        // Check if a position with the same index is already in the newArr
        if (!newArr.find((p) => p.index == pos.index)) {
          newArr.push(pos);
        }
      }

      positionDataNew[token] = newArr;
    }

    this.noteData = noteData;
    this.notePrivKeys = notePrivKeys;
    this.noteCounts = userData.noteCounts;
    this.positionCounts = userData.positionCounts;
    this.orderTabCounts = userData.orderTabCounts;

    this.positionData = positionDataNew;
    this.positionPrivKeys = posPrivKeys;

    this.tabPrivKeys = tabPrivKeys;
    this.orderTabData = orderTabData;

    this.orderIds = [...new Set(userData.orderIds)];
    this.perpetualOrderIds = [...new Set(userData.perpetualOrderIds)];
    // this.pfrKeys = userData.pfrKeys;
    // this.fills = [...new Set(fills)];

    return { emptyPrivKeys, emptyPositionPrivKeys, emptyTabPrivKeys };
  }

  async handleActiveOrders(
    badOrderIds,
    orders,
    badPerpOrderIds,
    perpOrders,
    pfrNotes,
    emptyPrivKeys,
    emptyPositionPrivKeys
  ) {
    // ? Remove bad orders from orderIds
    for (let badOrderId of badOrderIds) {
      let idx = this.orderIds.indexOf(badOrderId);
      if (idx > -1) {
        this.orderIds.splice(idx, 1);
      }
    }
    // ? Remove bad orders from perpetualOrderIds
    for (let badOrderId of badPerpOrderIds) {
      let idx = this.perpetualOrderIds.indexOf(badOrderId);
      if (idx > -1) {
        this.perpetualOrderIds.splice(idx, 1);
      }
    }

    // ? Get the indexes of notes that are used in active orders (not partially filled)
    let activeOrderNoteIndexes = [];
    for (let order of orders) {
      for (let note of order.notes_in) {
        activeOrderNoteIndexes.push(note.index.toString());
      }

      if (order.refund_note) {
        this.refundNotes[order.order_id] = Note.fromGrpcObject(
          order.refund_note
        );
      }
    }
    for (let order of perpOrders) {
      if (order.position_effect_type == 0) {
        for (let note of order.notes_in) {
          activeOrderNoteIndexes.push(note.index.toString());
        }

        if (order.refund_note) {
          this.refundNotes[order.order_id] = Note.fromGrpcObject(
            order.refund_note
          );
        }
      }
    }

    // ? if there are no spot orders and no open/close orders than get rid of emptyPrivKeys
    let noActiveOrders = orders.length == 0;
    for (let order of perpOrders) {
      noActiveOrders =
        noActiveOrders &&
        (order.position_effect_type != 0 ||
          order.position_effect_type != "Open") &&
        (order.position_effect_type != 2 ||
          order.position_effect_type != "Close");
    }

    // ? Get the notes that aren't currently used in active orders and save the addresses of those that are
    let frozenAddresses = [];
    let newNoteData = {};

    for (const [token, arr] of Object.entries(this.noteData)) {
      newNoteData[token] = [];

      for (const note of arr) {
        if (!activeOrderNoteIndexes.includes(note.index.toString())) {
          newNoteData[token].push(note);
        } else {
          frozenAddresses.push(note.address.getX().toString());
        }
      }
    }

    // ? Remove pfr notes from noteData
    for (const note of pfrNotes) {
      let token = note.token;
      let addr = note.address.getX().toString();

      if (!newNoteData[token]) {
        newNoteData[token] = [];
      }

      if (!frozenAddresses.includes(addr)) {
        // Find the index of the note with the same hash
        let idx = newNoteData[token].findIndex(
          (n) => n.hash == note.hash && n.index == note.index
        );

        newNoteData[token].splice(idx, 1);
      }
    }

    // If bad order Id and pfrAddress exists, add the note to the user's noteData
    this.orders = orders;
    this.perpetualOrders = perpOrders;

    let noteDataNew = {};
    for (let [token, arr] of Object.entries(newNoteData)) {
      let newArr = [];
      for (let pos of arr) {
        // Check if a note with the same index is already in the newArr
        if (!newArr.find((n) => n.index == pos.index)) {
          newArr.push(pos);
        }
      }

      noteDataNew[token] = newArr;
    }

    this.noteData = noteDataNew;

    await storeUserState(this.db, this).catch(console.log);
  }

  //* GENERATE ORDERS  ==========================================================

  // ? ORDERS ============================================================
  makePerpetualOrder(
    expiration_timestamp,
    position_effect_type,
    positionAddress,
    order_side,
    synthetic_token,
    collateral_token,
    synthetic_amount,
    collateral_amount,
    fee_limit,
    initial_margin,
    allow_partial_liquidation = true
  ) {
    if (!["Open", "Close", "Modify"].includes(position_effect_type)) {
      alert(
        "Invalid position effect type (liquidation orders created seperately)"
      );
      throw "Invalid position effect type (liquidation orders created seperately)";
    }

    if (!["Long", "Short"].includes(order_side)) {
      alert("Invalid order side");
      throw "Invalid order side";
    }

    let open_order_fields = null;
    let close_order_fields = null;

    let privKeys = null;

    let positionPrivKey = null;
    let perpPosition = null;

    if (position_effect_type == "Open") {
      // ? Get the notesIn and priv keys for these notes
      let { notesIn, refundAmount } = this.getNotesInAndRefundAmount(
        collateral_token,
        initial_margin
      );

      // ? Generate the dest spent and dest received addresses and blindings
      privKeys = notesIn.map((x) => x.privKey);

      let refundNote;
      if (refundAmount > DUST_AMOUNT_PER_ASSET[collateral_token]) {
        let { KoR, koR, ytR } = this.getDestReceivedAddresses(synthetic_token);
        this.notePrivKeys[KoR.getX().toString()] = koR;

        refundNote = new Note(
          KoR,
          collateral_token,
          refundAmount,
          ytR,
          notesIn[0].note.index
        );

        // storePrivKey(this.userId, koR, false, this.privateSeed);
      }

      let { positionPrivKey, positionAddress } =
        this.getPositionAddress(synthetic_token);
      this.positionPrivKeys[positionAddress.getX().toString()] =
        positionPrivKey;

      open_order_fields = new OpenOrderFields(
        initial_margin,
        collateral_token,
        notesIn.map((n) => n.note),
        refundNote,
        positionAddress.getX().toString(),
        allow_partial_liquidation
      );
    } else if (position_effect_type == "Close") {
      let { KoR, koR, ytR } = this.getDestReceivedAddresses(collateral_token);
      this.notePrivKeys[KoR.getX().toString()] = koR;

      close_order_fields = new CloseOrderFields(KoR, ytR);

      // ? Get the position priv Key for this position
      if (this.positionData[synthetic_token].length > 0) {
        for (let pos of this.positionData[synthetic_token]) {
          if (pos.position_header.position_address == positionAddress) {
            perpPosition = pos;
            break;
          }
        }
        positionPrivKey = this.positionPrivKeys[positionAddress];

        if (perpPosition.order_side == "Long") {
          order_side = "Short";
        } else {
          order_side = "Long";
        }
      } else {
        throw "No open position to close";
      }
    } else {
      // ? Get the position priv Key for this position
      if (this.positionData[synthetic_token].length > 0) {
        for (let pos of this.positionData[synthetic_token]) {
          if (pos.position_header.position_address == positionAddress) {
            perpPosition = pos;
            break;
          }
        }
        positionPrivKey = this.positionPrivKeys[positionAddress];
      }
    }

    let privKeySum;
    if (privKeys) {
      privKeySum = privKeys.reduce((a, b) => a + b, 0n);
    }

    let perpOrder = new PerpOrder(
      expiration_timestamp,
      perpPosition,
      position_effect_type,
      order_side,
      synthetic_token,
      synthetic_amount,
      collateral_amount,
      fee_limit,
      open_order_fields,
      close_order_fields
    );

    let _signature = perpOrder.signOrder(privKeys, positionPrivKey);

    // ? Store the userData locally
    storeUserState(this.db, this).catch(console.log);

    return { perpOrder, pfrKey: privKeySum };
  }

  makeLiquidationOrder(
    liquidatedPosition,
    synthetic_amount,
    collateral_amount,
    initial_margin,
    allow_partial_liquidation = true
  ) {
    // ? Get the position priv Key for this position
    let order_side = liquidatedPosition.order_side;

    // ? Get the notesIn and priv keys for these notes
    let { notesIn, refundAmount } = this.getNotesInAndRefundAmount(
      COLLATERAL_TOKEN,
      initial_margin
    );

    // ? Generate the dest spent and dest received addresses and blindings
    let privKeys = notesIn.map((x) => x.privKey);

    let refundNote;
    if (refundAmount > DUST_AMOUNT_PER_ASSET[COLLATERAL_TOKEN]) {
      let { KoR, koR, ytR } = this.getDestReceivedAddresses(COLLATERAL_TOKEN);
      this.notePrivKeys[KoR.getX().toString()] = koR;

      refundNote = new Note(
        KoR,
        COLLATERAL_TOKEN,
        refundAmount,
        ytR,
        notesIn[0].note.index
      );
    }

    let { positionPrivKey, positionAddress } = this.getPositionAddress(
      liquidatedPosition.position_header.synthetic_token
    );
    this.positionPrivKeys[positionAddress.getX().toString()] = positionPrivKey;

    let open_order_fields = new OpenOrderFields(
      initial_margin,
      COLLATERAL_TOKEN,
      notesIn.map((n) => n.note),
      refundNote,
      positionAddress.getX().toString(),
      allow_partial_liquidation
    );

    let perpOrder = new LiquidationOrder(
      liquidatedPosition,
      order_side,
      liquidatedPosition.position_header.synthetic_token,
      synthetic_amount,
      collateral_amount,
      open_order_fields
    );

    let _sig = perpOrder.signOrder(privKeys);

    // ? Store the userData locally
    storeUserState(this.db, this).catch(console.log);

    return perpOrder;
  }

  makeLimitOrder(
    expiration_timestamp,
    token_spent,
    token_received,
    amount_spent,
    amount_received,
    fee_limit,
    orderSide,
    orderTabAddress
  ) {
    let spot_note_info;
    let orderTab;
    let privKey;
    if (orderTabAddress) {
      let baseToken = orderSide == "Buy" ? token_received : token_spent;

      // ? Get the order tab
      if (this.orderTabData[baseToken].length > 0) {
        for (let tab of this.orderTabData[baseToken]) {
          if (tab.tab_header.pub_key == orderTabAddress) {
            orderTab = tab;
            break;
          }
        }
      }
      privKey = this.tabPrivKeys[orderTabAddress];
    } else {
      // ? Get the notesIn and priv keys for these notes
      let { notesIn, refundAmount } = this.getNotesInAndRefundAmount(
        token_spent,
        amount_spent
      );

      if (notesIn.length == 0) {
        throw "No notes to spend";
      }

      // ? Generate the dest spent and dest received addresses and blindings

      let privKeys = notesIn.map((x) => x.privKey);
      privKey = privKeys.reduce((a, b) => a + b, 0n);

      let { KoR, koR, ytR } = this.getDestReceivedAddresses(token_received);

      this.notePrivKeys[KoR.getX().toString()] = koR;

      let refundNote;
      if (refundAmount > DUST_AMOUNT_PER_ASSET[token_spent]) {
        let {
          KoR: KoR2,
          koR: koR2,
          ytR: ytR2,
        } = this.getDestReceivedAddresses(token_spent);
        this.notePrivKeys[KoR2.getX().toString()] = koR2;

        refundNote = new Note(
          KoR2,
          token_spent,
          refundAmount,
          ytR2,
          notesIn[0].note.index
        );
      }

      // ? generate the refund note
      spot_note_info = new SpotNotesInfo(
        KoR,
        ytR,
        notesIn.map((x) => x.note),
        refundNote
      );
    }

    // ? generate the refund note

    let limitOrder = new LimitOrder(
      expiration_timestamp,
      token_spent,
      token_received,
      amount_spent,
      amount_received,
      fee_limit,
      spot_note_info,
      orderTab
    );

    let _sig = limitOrder.signOrder(privKey);

    // ? Store the userData locally
    storeUserState(this.db, this).catch(console.log);

    return limitOrder;
  }

  // ? ONCHAIN INTERACTIONS ============================================================
  makeDepositOrder(depositId, depositAmount, depositToken, starkKey) {
    // TODO !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    let depositStarkKey = this.getDepositStarkKey(depositToken);
    let privKey = this._getDepositStarkPrivKey(depositToken);

    // if (starkKey != depositStarkKey) {
    //   throw new Error("Unknown stark key");
    // }
    // TODO !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    let chainId = Number.parseInt(BigInt(depositId) / 2n ** 32n);
    if (!Object.values(CHAIN_IDS).includes(chainId)) {
      throw new Error("Unknown chain id");
    }

    let { KoR, koR, ytR } = this.getDestReceivedAddresses(depositToken);
    let note = new Note(KoR, depositToken, depositAmount, ytR);
    this.notePrivKeys[KoR.getX().toString()] = koR;

    let sig = Deposit.signDeposit(depositId, [note], privKey);

    let deposit = new Deposit(
      depositId,
      depositToken,
      depositAmount,
      depositStarkKey,
      [note],
      sig
    );

    // ? Store the userData locally
    storeUserState(this.db, this).catch(console.log);

    return deposit;
  }

  makeWithdrawalOrder(
    withdrawAmount,
    withdrawToken,
    withdrawStarkKey,
    withdrawalChainId
  ) {
    // ? Get the notesIn and priv keys for these notes
    let { notesIn, refundAmount } = this.getNotesInAndRefundAmount(
      withdrawToken,
      withdrawAmount
    );

    // ? Generate the dest spent and dest received addresses and blindings
    let privKeys = notesIn.map((x) => x.privKey);
    notesIn = notesIn.map((x) => x.note);
    let { KoR, koR, ytR } = this.getDestReceivedAddresses(withdrawToken);
    this.notePrivKeys[KoR.getX().toString()] = koR;

    // ? generate the refund note
    let refundNote = new Note(
      KoR,
      withdrawToken,
      refundAmount,
      ytR,
      notesIn[0].index
    );

    let signature = Withdrawal.signWithdrawal(
      notesIn,
      privKeys,
      refundNote,
      withdrawStarkKey,
      withdrawalChainId
    );

    let withdrawal = new Withdrawal(
      withdrawalChainId,
      withdrawToken,
      withdrawAmount,
      withdrawStarkKey,
      notesIn,
      refundNote,
      signature
    );

    // ? Store the userData locally
    storeUserState(this.db, this).catch(console.log);

    return withdrawal;
  }

  restructureNotes(token, newAmount) {
    if (!newAmount) return null;

    if (newAmount > this.getAvailableAmount(token)) {
      return null;
    }

    let { notesIn, refundAmount } = this.getNotesInAndRefundAmount(
      token,
      newAmount,
      true
    );

    if (!notesIn || notesIn.length == 0) return null;

    let address0 = notesIn[0].note.address;
    let blinding0 = notesIn[0].note.blinding;
    let address1 = notesIn[notesIn.length - 1].note.address;
    let blinding1 = notesIn[notesIn.length - 1].note.blinding;

    let newNote = new Note(address0, token, newAmount, blinding0);

    // ? generate the refund note
    let refundNote;
    if (refundAmount > 0) {
      refundNote = new Note(address1, token, refundAmount, blinding1);
    }

    return {
      notesIn: notesIn.map((n) => n.note),
      newNote,
      refundNote,
    };
  }

  changeMargin(positionAddress, token, direction, amount) {
    if (amount == 0) throw Error("amount is zero");

    let position;
    let positionPrivKey;
    for (let position_ of this.positionData[token]) {
      if (position_.position_header.position_address == positionAddress) {
        position = position_;
        positionPrivKey = this.positionPrivKeys[positionAddress];

        break;
      }
    }
    if (position == null) throw Error("Position not found");

    let notes_in;
    let refund_note;
    let close_order_fields;
    let signature;

    if (direction == "Add") {
      // ? Get the notesIn and priv keys for these notes

      let { notesIn, refundAmount } = this.getNotesInAndRefundAmount(
        position.collateral_token,
        amount
      );

      // ? generate the refund note
      if (refundAmount > 0) {
        refund_note = new Note(
          notesIn[0].note.address,
          notesIn[0].note.token,
          refundAmount,
          notesIn[0].note.blinding,
          notesIn[0].note.index
        );
      }

      signature = signMarginChange(
        direction,
        amount,
        notesIn,
        refund_note,
        close_order_fields,
        position,
        positionPrivKey
      );

      notes_in = notesIn.map((n) => n.note);
    } else if (direction == "Remove") {
      let { KoR, koR, ytR } = this.getDestReceivedAddresses(
        position.collateral_token
      );
      this.notePrivKeys[KoR.getX().toString()] = koR;

      close_order_fields = new CloseOrderFields(KoR, ytR);

      signature = signMarginChange(
        direction,
        amount,
        notes_in,
        refund_note,
        close_order_fields,
        position,
        positionPrivKey
      );

      // ? Store the userData locally
      storeUserState(this.db, this).catch(console.log);
    } else throw Error("Invalid direction");

    return {
      notes_in,
      refund_note,
      close_order_fields,
      position,
      signature,
    };
  }

  // ? ORDER TAB ============================================================
  openNewOrderTab(baseAmount, quoteAmount, marketId) {
    let baseToken = SPOT_MARKET_IDS_2_TOKENS[marketId].base;
    let quoteToken = SPOT_MARKET_IDS_2_TOKENS[marketId].quote;

    // ? Get notes in and refund amount
    let { notesIn: baseNotesIn, refundAmount: baseRefundAmount } =
      this.getNotesInAndRefundAmount(baseToken, baseAmount);
    let { notesIn: quoteNotesIn, refundAmount: quoteRefundAmount } =
      this.getNotesInAndRefundAmount(quoteToken, quoteAmount);

    // ? Build refund notes if necessary
    let baseRefundNote;
    if (baseRefundAmount > DUST_AMOUNT_PER_ASSET[baseToken]) {
      let { KoR, koR, ytR } = this.getDestReceivedAddresses(baseToken);
      this.notePrivKeys[KoR.getX().toString()] = koR;

      baseRefundNote = new Note(
        KoR,
        baseToken,
        baseRefundAmount,
        ytR,
        baseNotesIn[0].note.index
      );
    }
    let quoteRefundNote;
    if (quoteRefundAmount > DUST_AMOUNT_PER_ASSET[quoteToken]) {
      let { KoR, koR, ytR } = this.getDestReceivedAddresses(quoteToken);
      this.notePrivKeys[KoR.getX().toString()] = koR;

      quoteRefundNote = new Note(
        KoR,
        quoteToken,
        quoteRefundAmount,
        ytR,
        quoteNotesIn[0].note.index
      );
    }

    let { tabPrivKey, tabAddress, baseBlinding, quoteBlinding } =
      this.getOrderTabAddress(baseToken);
    this.tabPrivKeys[tabAddress.getX().toString()] = tabPrivKey;

    let tabHeader = new TabHeader(
      baseToken,
      quoteToken,
      baseBlinding,
      quoteBlinding,
      tabAddress.getX().toString()
    );
    let orderTab = new OrderTab(0, tabHeader, baseAmount, quoteAmount);

    let signature = orderTab.signOpenTabOrder(
      baseNotesIn.map((n) => n.privKey),
      quoteNotesIn.map((n) => n.privKey),
      baseRefundNote,
      quoteRefundNote
    );

    let grpcMessage = {
      base_notes_in: baseNotesIn.map((n) => n.note.toGrpcObject()),
      base_refund_note: baseRefundNote ? baseRefundNote.toGrpcObject() : null,
      quote_notes_in: quoteNotesIn.map((n) => n.note.toGrpcObject()),
      quote_refund_note: quoteRefundNote
        ? quoteRefundNote.toGrpcObject()
        : null,
      order_tab: orderTab.toGrpcObject(),
      add_only: false,
      signature: {
        r: signature[0].toString(),
        s: signature[1].toString(),
      },
      market_id: marketId,
    };

    return grpcMessage;
  }

  closeOrderTab(tabAddress, baseToken, quoteToken) {
    let baseRes = this.getDestReceivedAddresses(baseToken);
    this.notePrivKeys[baseRes.KoR.getX().toString()] = baseRes.koR;
    let baseCloseOrderFields = new CloseOrderFields(baseRes.KoR, baseRes.ytR);

    let quoteRes = this.getDestReceivedAddresses(quoteToken);
    this.notePrivKeys[quoteRes.KoR.getX().toString()] = quoteRes.koR;
    let quoteCloseOrderFields = new CloseOrderFields(
      quoteRes.KoR,
      quoteRes.ytR
    );

    // ? Get the order tab
    let orderTab;
    if (this.orderTabData[baseToken].length > 0) {
      for (let tab of this.orderTabData[baseToken]) {
        if (tab.tab_header.pub_key == tabAddress) {
          orderTab = tab;
          break;
        }
      }
    }
    let tabPrivKey = this.tabPrivKeys[tabAddress];

    if (!orderTab) return;

    let signature = orderTab.signCloseTabOrder(
      orderTab.base_amount,
      orderTab.quote_amount,
      baseCloseOrderFields,
      quoteCloseOrderFields,
      tabPrivKey
    );

    return {
      orderTab,
      tabPrivKey,
      baseCloseOrderFields,
      quoteCloseOrderFields,
      signature,
    };
  }

  modifyOrderTab(baseAmount, quoteAmount, marketId, tabAddress, isAdd) {
    let baseToken = SPOT_MARKET_IDS_2_TOKENS[marketId].base;
    let quoteToken = SPOT_MARKET_IDS_2_TOKENS[marketId].quote;

    // ? Get the order tab
    let orderTab;
    if (this.orderTabData[baseToken].length > 0) {
      for (let tab of this.orderTabData[baseToken]) {
        if (tab.tab_header.pub_key == tabAddress) {
          orderTab = tab;
          break;
        }
      }
    }

    if (!orderTab) return;

    if (isAdd) {
      // ? Get notes in and refund amount
      let { notesIn: baseNotesIn, refundAmount: baseRefundAmount } =
        this.getNotesInAndRefundAmount(baseToken, baseAmount);
      let { notesIn: quoteNotesIn, refundAmount: quoteRefundAmount } =
        this.getNotesInAndRefundAmount(quoteToken, quoteAmount);

      // ? Build refund notes if necessary
      let baseRefundNote;
      if (baseRefundAmount > DUST_AMOUNT_PER_ASSET[baseToken]) {
        let { KoR, koR, ytR } = this.getDestReceivedAddresses(baseToken);
        this.notePrivKeys[KoR.getX().toString()] = koR;

        baseRefundNote = new Note(
          KoR,
          baseToken,
          baseRefundAmount,
          ytR,
          baseNotesIn[0].note.index
        );
      }
      let quoteRefundNote;
      if (quoteRefundAmount > DUST_AMOUNT_PER_ASSET[quoteToken]) {
        let { KoR, koR, ytR } = this.getDestReceivedAddresses(quoteToken);
        this.notePrivKeys[KoR.getX().toString()] = koR;

        quoteRefundNote = new Note(
          KoR,
          quoteToken,
          quoteRefundAmount,
          ytR,
          quoteNotesIn[0].note.index
        );
      }

      let pkSum = baseNotesIn
        .concat(quoteNotesIn)
        .map((n) => n.privKey)
        .reduce((a, b) => a + b, 0n);

      let signature = orderTab.signModifyTabOrder(
        pkSum,
        baseRefundNote,
        quoteRefundNote,
        null,
        null,
        isAdd
      );

      return {
        orderTab,
        baseNotesIn,
        quoteNotesIn: quoteNotesIn.map((n) => n.note),
        baseRefundNote: baseRefundNote.map((n) => n.note),
        quoteRefundNote,
        signature,
      };
    } else {
      let baseRes = this.getDestReceivedAddresses(baseToken);
      this.notePrivKeys[baseRes.KoR.getX().toString()] = baseRes.koR;
      let baseCloseOrderFields = new CloseOrderFields(baseRes.KoR, baseRes.ytR);

      let quoteRes = this.getDestReceivedAddresses(quoteToken);
      this.notePrivKeys[quoteRes.KoR.getX().toString()] = quoteRes.koR;
      let quoteCloseOrderFields = new CloseOrderFields(
        quoteRes.KoR,
        quoteRes.ytR
      );

      let tabPk = this.tabPrivKeys[tabAddress];
      let signature = orderTab.signModifyTabOrder(
        tabPk,
        null,
        null,
        baseCloseOrderFields,
        quoteCloseOrderFields,
        isAdd
      );

      return {
        orderTab,
        baseCloseOrderFields,
        quoteCloseOrderFields,
        signature,
      };
    }
  }

  // * ORDER HELPERS ============================================================
  getDestReceivedAddresses(tokenReceived) {
    // & This returns the dest received address and blinding

    // ? Get a pseudo-random deterministic number
    // ? from the private seed and token count to generate an address
    let noteCount2 = this.noteCounts[tokenReceived] ?? 0;

    // ? Update the note count
    this.noteCounts[tokenReceived] = (noteCount2 + 1) % 32;

    // ? Generate a new address and private key pair
    let koR = this.oneTimeAddressPrivKey(noteCount2, tokenReceived, "note");
    let KoR = getKeyPair(koR).getPublic();

    // ? Get the blinding for the note
    let ytR = this.generateBlinding(KoR);

    return { KoR, koR, ytR };
  }

  getNotesInAndRefundAmount(token, spendAmount, isNoteSplit) {
    // ? Get the notes in and refund note
    let notesIn = [];
    let amount = 0;

    if (!this.noteData[token]) throw new Error("Insufficient funds");

    let notes = [...this.noteData[token]];
    notes = notes.sort((a, b) => a.amount - b.amount);

    let dustAmount = DUST_AMOUNT_PER_ASSET[token];
    let notesIn_ = findNoteCombinations(notes, spendAmount, dustAmount);

    if (notesIn_ && notesIn_.length > 0) {
      if (isNoteSplit && notesIn_.length <= 5) {
        return { notesIn: null, refundAmount: 0 };
      }

      for (let noteIn of notesIn_) {
        this.noteData[token] = this.noteData[token].filter(
          (n) => n.index != noteIn.index
        );

        const privKey = this.notePrivKeys[BigInt(noteIn.address.getX())];
        notesIn.push({ privKey, note: noteIn });
      }

      return { notesIn: notesIn, refundAmount: 0 };
    }

    let l = notes.length;
    for (let i = 0; i < l; i++) {
      const note = notes.pop();
      const privKey = this.notePrivKeys[BigInt(note.address.getX())];

      amount += note.amount;
      notesIn.push({ privKey, note });

      // ? Get the refund note
      if (amount >= spendAmount) {
        let refundAmount = amount - Number.parseInt(spendAmount);

        if (isNoteSplit && refundAmount < DUST_AMOUNT_PER_ASSET[token]) {
          return { notesIn: null, refundAmount: 0 };
        }

        this.noteData[token] = notes;

        return { notesIn, refundAmount };
      }
    }

    // ? If we get here, we don't have enough notes to cover the amount
    throw new Error("Insufficient funds");
  }

  getPositionAddress(syntheticToken) {
    let posCount = this.positionCounts[syntheticToken] ?? 0;

    this.positionCounts[syntheticToken] = (posCount + 1) % 16;

    let positionPrivKey = this.oneTimeAddressPrivKey(
      posCount,
      syntheticToken,
      "position"
    );
    let positionAddress = getKeyPair(positionPrivKey).getPublic();

    return { positionPrivKey, positionAddress };
  }

  getOrderTabAddress(baseToken) {
    let tabCount = this.orderTabCounts[baseToken] ?? 0;

    this.orderTabCounts[baseToken] = (tabCount + 1) % 16;

    let tabPrivKey = this.oneTimeAddressPrivKey(
      tabCount,
      baseToken,
      "order_tab"
    );
    let tabAddress = getKeyPair(tabPrivKey).getPublic();

    let baseBlinding = _generateNewBliding(
      tabAddress.getX(),
      this.privateSeed + 1n
    );
    let quoteBlinding = _generateNewBliding(
      tabAddress.getX(),
      this.privateSeed + 2n
    );

    return { tabPrivKey, tabAddress, baseBlinding, quoteBlinding };
  }

  getDepositStarkKey(depositToken) {
    let depositStarkKey = getKeyPair(this._getDepositStarkPrivKey(depositToken))
      .getPublic()
      .getX();
    return BigInt(depositStarkKey);
  }

  _getDepositStarkPrivKey(depositToken) {
    // TODO: This is a temporary function to get the deposit stark key
    return hash2([this.privateSeed, depositToken]);
  }

  //* HELPERS ===========================================================================

  subaddressPrivKeys(randSeed) {
    return _subaddressPrivKeys(this.privSpendKey, this.privViewKey, randSeed);
  }

  oneTimeAddressPrivKey(count, token, type) {
    let seed;
    switch (type) {
      case "note":
        let noteSeedRandomness =
          328965294021249504871258328423859990890523432589236523n;
        seed = hash2([noteSeedRandomness, token]);
        break;
      case "position":
        let positionSeedRandomness =
          87311195862357333589832472352389732849239571003295829n;
        seed = hash2([positionSeedRandomness, token]);
        break;
      case "order_tab":
        let orderTabSeedRandomness =
          3289651004221748755344442085963285230025892366052333n;
        seed = hash2([orderTabSeedRandomness, token]);
        break;

      default:
        break;
    }

    let { ksi, kvi } = this.subaddressPrivKeys(seed);
    let Kvi = getKeyPair(kvi).getPublic();

    return _oneTimeAddressPrivKey(Kvi, ksi, count);
  }

  generateBlinding(Ko) {
    return _generateNewBliding(Ko.getX(), this.privateSeed);
  }

  // Hides the values for the recipient
  hideValuesForRecipient(Ko, amount) {
    return _hideValuesForRecipient(Ko, amount, this.privateSeed);
  }

  // Used to reveal the blindings and amounts of the notes addressed to this user's ith subaddress
  revealHiddenValues(Ko, hiddenAmount, commitment) {
    return _revealHiddenValues(Ko, this.privateSeed, hiddenAmount, commitment);
  }

  // // Checks if the transaction is addressed to this user's its subaddress
  // checkOwnership(rKsi, Ko, ith = 1) {
  //   return _checkOwnership(rKsi, Ko, this.privSpendKey, this.privViewKey, ith);
  // }

  //* TESTS =======================================================

  static async loginUser(privKey_) {
    let user = UserState.fromPrivKey(privKey_);

    let { emptyPrivKeys, emptyPositionPrivKeys } = await user.login();

    let { badOrderIds, orders, badPerpOrderIds, perpOrders, pfrNotes } =
      await getActiveOrders(user.orderIds, user.perpetualOrderIds);

    await user.handleActiveOrders(
      badOrderIds,
      orders,
      badPerpOrderIds,
      perpOrders,
      pfrNotes,
      emptyPrivKeys,
      emptyPositionPrivKeys
    );

    return user;
  }

  static fromPrivKey(privKey_) {
    privKey_ = privKey_.toString();

    try {
      if (!privKey_.startsWith("0x")) privKey_ = "0x" + privKey_;

      let privKey = BigInt(privKey_, 16);

      // & Generates a privViewKey and privSpendKey from one onchain private key and generates a user from it
      let privViewKey = trimHash(
        hash2([VIEW_KEY_MASK, BigInt(privKey, 16)]),
        240
      );
      let privSpendKey = trimHash(
        hash2([SPEND_KEY_MASK, BigInt(privKey, 16)]),
        240
      );

      let user = new UserState(privViewKey, privSpendKey);

      return user;
    } catch (e) {
      console.log(e);
      throw Error("Enter a hexademical private key");
    }
  }

  static getkeyPairsFromPrivKeys(privKeys) {
    let keyPairs = [];
    for (let privKey of privKeys) {
      let keyPair = getKeyPair(privKey);
      keyPairs.push(keyPair);
    }

    return keyPairs;
  }
};

//
//
//
//
//
//
//
//
//
//
