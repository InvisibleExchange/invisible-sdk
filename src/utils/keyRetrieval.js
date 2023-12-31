const EXCHANGE_CONFIG = require("../../exchange-config.json");

const PRICE_DECIMALS_PER_ASSET = EXCHANGE_CONFIG["PRICE_DECIMALS_PER_ASSET"];
const IDS_TO_SYMBOLS = EXCHANGE_CONFIG["IDS_TO_SYMBOLS"];
const ASSETS = EXCHANGE_CONFIG["ASSETS"];

const {
  checkNoteExistance,
  checkPositionExistance,
  checkOrderTabExistance,
} = require("./firebase/firebaseConnection");
const { storeUserState } = require("./localStorage");

// ! RESTORE KEY DATA ========================================================================

/**
 *
 * @param {UserState} user
 * @param {"note"|"position"|"order_tab"} type
 * @param {number[]} tokens
 */
async function restoreKeyData(user, type = "note", tokens = ASSETS) {
  // ? Get all the addresses from the datatbase =====

  switch (type) {
    case "note":
      let privKeys = {};
      for (let token of tokens) {
        if (!IDS_TO_SYMBOLS[token]) continue;

        let counter = 0;

        user.noteCounts[token] = 0;
        for (let i = 0; i < 32; i++) {
          let { KoR, koR, _ } = user.getDestReceivedAddresses(token);

          checkNoteExistance(KoR.getX().toString()).then((keyExists) => {
            if (keyExists) {
              privKeys[KoR.getX().toString()] = koR;
            }

            counter++;
          });
        }

        while (counter < 32) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      return privKeys;
    case "position":
      let positionPrivKeys = {};
      for (let token of tokens) {
        if (!PRICE_DECIMALS_PER_ASSET[token]) continue;

        let counter = 0;

        user.positionCounts[token] = 0;
        for (let i = 0; i < 16; i++) {
          let { positionPrivKey, positionAddress } =
            user.getPositionAddress(token);

          checkPositionExistance(positionAddress.getX().toString()).then(
            (keyExists) => {
              if (keyExists) {
                positionPrivKeys[positionAddress.getX().toString()] =
                  positionPrivKey;
              }

              counter++;
            }
          );
        }

        while (counter < 16) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      return positionPrivKeys;
    case "order_tabs":
      let tabPrivKeys = {};
      for (let token of tokens) {
        if (!IDS_TO_SYMBOLS[token]) continue;

        let counter = 0;

        user.orderTabCounts[token] = 0;
        for (let i = 0; i < 16; i++) {
          let { tabPrivKey, tabAddress } = user.getOrderTabAddress(token);

          checkOrderTabExistance(tabAddress.getX().toString()).then(
            (keyExists) => {
              if (keyExists) {
                tabPrivKeys[tabAddress.getX().toString()] = tabPrivKey;
              }

              counter++;
            }
          );
        }

        while (counter < 16) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      return tabPrivKeys;

    default:
      break;
  }
}

/**
 *
 * @param {UserState} user
 * @param {boolean} restoreNotes  - if true retrieve note keys
 * @param {boolean} restorePositions - if true retrieve position keys
 */
async function restoreUserState(
  user,
  restoreNotes,
  restorePositions,
  restoreTabs
) {
  if (restoreNotes) {
    let privKeys = await restoreKeyData(user, "note");
    console.log("note keyData: ", privKeys);

    user.notePrivKeys = privKeys;
  }
  if (restorePositions) {
    let posPrivKeys = await restoreKeyData(user, "position");
    console.log("position keyData: ", posPrivKeys);

    user.positionPrivKeys = posPrivKeys;
  }
  if (restoreTabs) {
    let tabPrivKeys = await restoreKeyData(user, "order_tabs");
    console.log("orderTab keyData: ", tabPrivKeys);

    user.tabPrivKeys = tabPrivKeys;
  }

  await storeUserState(user.db, user);
}

module.exports = { restoreUserState };
