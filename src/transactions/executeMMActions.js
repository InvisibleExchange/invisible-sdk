const axios = require("axios");

const { sign, getKeyPair } = require("starknet").ec;

const { computeHashOnElements } = require("invisible-sdk/src/utils");

const EXCHANGE_CONFIG = require("../../exchange-config.json");

const EXPRESS_APP_URL = EXCHANGE_CONFIG["EXPRESS_APP_URL"];
const PERP_MARKET_IDS = EXCHANGE_CONFIG["PERP_MARKET_IDS"];

/**
 * mmAction: {
 * mm_owner,
 * synthetic_asset,
 * position_address,
 * vlp_token,
 * action_id,
 * action_type,
 */
async function registerMM(marketMaker, mmAction) {
  if (mmAction.action_type !== "register_mm") {
    throw new Error("Invalid action type");
  }

  let position = marketMaker.positionData[mmAction.synthetic_asset].find(
    (pos) => pos.position_header.position_address == mmAction.position_address
  );
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side == "Long";

  let posPrivKey =
    marketMaker.positionPrivKeys[position.position_header.position_address];

  // & H = H({position.hash, vlp_token})
  let messageHash = computeHashOnElements([
    position.hash,
    mmAction.vlp_token,
  ]);

  let keyPair = getKeyPair(posPrivKey);
  let sig = sign(keyPair, "0x" + messageHash.toString(16));
  let marketId = PERP_MARKET_IDS[mmAction.synthetic_asset];


  let registerMessage = {
    position: position,
    vlp_token: mmAction.vlp_token,
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: mmAction.synthetic_asset,
    mm_action_id: mmAction.action_id,
  };

 

  return await axios
    .post(`${EXPRESS_APP_URL}/register_onchain_mm`, registerMessage)
    .then((res) => {
      let response = res.data.response;

      if (response.successful) {
        return response;
      } else {
        let msg = "Register failed with error: \n" + response.error_message;

        throw new Error(msg);
      }
    });
}

/**
 * mmAction: {
 * depositor,
 * position_address,
 * usdc_amount,
 * action_id,
 * action_type,
 */
async function addLiquidity(marketMaker, mmAction) {
  if (mmAction.action_type !== "add_liquidity") {
    throw new Error("Invalid action type");
  }

  let position;
  for (let syntheticToken of Object.keys(marketMaker.positionData)) {
    position = marketMaker.positionData[syntheticToken].find(
      (pos) =>
        pos.position_header.position_address == mmAction.position_address
    );
    if (position) {
      break;
    }
  }
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side == "Long";

  let posPrivKey =
    marketMaker.positionPrivKeys[position.position_header.position_address];

  // & header_hash = H({pos_hash, depositor, collateral_amount})
  let messageHash = computeHashOnElements([
    position.hash,
    mmAction.depositor,
    mmAction.usdc_amount,
  ]);

  let keyPair = getKeyPair(posPrivKey);
  let sig = sign(keyPair, "0x" + messageHash.toString(16));
  let marketId = PERP_MARKET_IDS[position.position_header.synthetic_token];

  let addLiqMessage = {
    position,
    depositor: mmAction.depositor,
    initial_value: mmAction.usdc_amount.toString(),
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: position.position_header.synthetic_token,
    mm_action_id: mmAction.action_id,
  };

  return await axios
    .post(`${EXPRESS_APP_URL}/add_liquidity_mm`, addLiqMessage)
    .then((res) => {
      let response = res.data.response;

      if (response.successful) {
        return response;
      } else {
        let msg =
          "add liquidity failed with error: \n" + response.error_message;

          throw new Error("stop");
        // throw new Error(msg);
      }
    });
}

/**
 * mmAction: {
 * depositor,
 * position_address,
 * initial_value,
 * vlp_amount,
 * action_id,
 * action_type,
 */
async function removeLiquidity(marketMaker, mmAction) {
  if (mmAction.action_type !== "remove_liquidity") {
    throw new Error("Invalid action type");
  }

  let position;
  for (let syntheticToken of Object.keys(marketMaker.positionData)) {
    position = marketMaker.positionData[syntheticToken].find(
      (pos) =>
        pos.position_header.position_address == mmAction.position_address
    );
    if (position) {
      break;
    }
  }
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side == "Long";

  let posPrivKey =
    marketMaker.positionPrivKeys[position.position_header.position_address];

  // & hash = H({position.hash, depositor, intial_value, vlp_amount})
  let messageHash = computeHashOnElements([
    position.hash,
    mmAction.depositor,
    mmAction.initial_value,
    mmAction.vlp_amount,
  ]);

  let keyPair = getKeyPair(posPrivKey);
  let sig = sign(keyPair, "0x" + messageHash.toString(16));
  let marketId = PERP_MARKET_IDS[position.position_header.synthetic_token];

  let removeLiqMessage = {
    position,
    depositor: mmAction.depositor,
    initial_value: mmAction.initial_value.toString(),
    vlp_amount: mmAction.vlp_amount.toString(),
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: position.position_header.synthetic_token,
    mm_action_id: mmAction.action_id,
  };

  return await axios
    .post(`${EXPRESS_APP_URL}/remove_liquidity_mm`, removeLiqMessage)
    .then((res) => {
      let response = res.data.response;

      if (response.successful) {
        return response;
      } else {
        let msg =
          "remove_liquidity  failed with error: \n" + response.error_message;

        throw new Error(msg);
      }
    });
}

/**
 * mmAction: {
 * mm_owner,
 * position_address,
 * initial_value_sum,
 * vlp_amount_sum,
 * action_id,
 * action_type,
 */
async function closeMM(marketMaker, mmAction) {
  if (mmAction.action_type !== "close_mm") {
    throw new Error("Invalid action type");
  }

  let position;
  for (let syntheticToken of Object.keys(marketMaker.positionData)) {
    position = marketMaker.positionData[syntheticToken].find(
      (pos) =>
        pos.position_header.position_address == mmAction.position_address
    );
    if (position) {
      break;
    }
  }
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side == "Long";

  let posPrivKey =
    marketMaker.positionPrivKeys[position.position_header.position_address];

  // & header_hash = H({pos_hash, initial_value_sum, vlp_amount_sum})
  let messageHash = computeHashOnElements([
    position.hash,
    mmAction.initial_value_sum,
    mmAction.vlp_amount_sum,
  ]);

  let keyPair = getKeyPair(posPrivKey);
  let sig = sign(keyPair, "0x" + messageHash.toString(16));
  let marketId = PERP_MARKET_IDS[position.position_header.synthetic_token];

  let closeMmMessage = {
    position,
    initial_value_sum: mmAction.initial_value_sum.toString(),
    vlp_amount_sum: mmAction.vlp_amount_sum.toString(),
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: position.position_header.synthetic_token,
    mm_action_id: mmAction.action_id,
  };

  return await axios
    .post(`${EXPRESS_APP_URL}/close_onchain_mm`, closeMmMessage)
    .then((res) => {
      let response = res.data.response;

      if (response.successful) {
        return response;
      } else {
        let msg =
          "close_onchain_mm failed with error: \n" + response.error_message;

        throw new Error(msg);
      }
    });
}

module.exports = {
  registerMM,
  addLiquidity,
  removeLiquidity,
  closeMM,
};
