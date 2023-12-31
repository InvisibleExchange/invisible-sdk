const axios = require("axios");

const { sign, getKeyPair } = require("starknet").ec;

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { computeHashOnElements } = require("invisible-sdk/src/utils");

const EXCHANGE_CONFIG = require("../../exchange-config.json");

const SERVER_URL = EXCHANGE_CONFIG["SERVER_URL"];
const EXPRESS_APP_URL = EXCHANGE_CONFIG["EXPRESS_APP_URL"];
const PERP_MARKET_IDS = EXCHANGE_CONFIG["PERP_MARKET_IDS"];

const packageDefinition = protoLoader.loadSync("../engine.proto", {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const engine = grpc.loadPackageDefinition(packageDefinition).engine;

let client = new engine.Engine(SERVER_URL, grpc.credentials.createInsecure());

/**
 * mmAction: {
 *  mm_owner,
 * synthetic_asset,
 * position_address,
 * max_vlp_supply,
 * vlp_token,
 * action_id,
 * action_type,
 */
async function registerMM(marketMaker, mmAction) {
  if (mmAction.action_type !== "register_mm") {
    throw new Error("Invalid action type");
  }

  let position = marketMaker.positionData[mmAction.synthetic_asset].find(
    (pos) => pos.position_header.position_address === mmAction.position_address
  );
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side === "Long";

  let posPrivKey =
    marketMaker.positionPrivKeys[position.position_header.position_address];

  // & H = H({position.hash, vlp_token, max_vlp_supply})
  let messageHash = computeHashOnElements([
    position.hash,
    mmAction.vlp_token,
    mmAction.max_vlp_supply,
  ]);

  let keyPair = getKeyPair(posPrivKey);
  let sig = sign(keyPair, "0x" + messageHash.toString(16));
  let marketId = PERP_MARKET_IDS[mmAction.synthetic_asset];

  let registerMessage = {
    position: position,
    vlp_token: mmAction.vlp_token,
    max_vlp_supply: mmAction.max_vlp_supply,
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: mmAction.synthetic_asset,
  };

  await axios
    .post(`${EXPRESS_APP_URL}/register_onchain_mm`, registerMessage)
    .then((res) => {
      let response = res.data.response;

      if (response.successful) {
        console.log("response", response);
      } else {
        let msg = "Withdrawal failed with error: \n" + response.error_message;

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
        pos.position_header.position_address === mmAction.position_address
    );
    if (position) {
      break;
    }
  }
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side === "Long";

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
    initial_value: mmAction.usdc_amount,
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: position.position_header.synthetic_token,
  };

  await client.add_liquidity_mm(addLiqMessage, function (err, response) {
    if (err) {
      console.log(err);
    } else {
      console.log("response", response);
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
        pos.position_header.position_address === mmAction.position_address
    );
    if (position) {
      break;
    }
  }
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side === "Long";

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
    initial_value: mmAction.initial_value,
    vlp_amount: mmAction.vlp_amount,
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: position.position_header.synthetic_token,
  };

  await client.remove_liquidity_mm(removeLiqMessage, function (err, response) {
    if (err) {
      console.log(err);
    } else {
      console.log("response", response);
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
        pos.position_header.position_address === mmAction.position_address
    );
    if (position) {
      break;
    }
  }
  if (!position) {
    throw new Error("Invalid position address");
  }

  position.order_side = position.order_side === "Long";

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
    initial_value_sum: mmAction.initial_value_sum,
    vlp_amount_sum: mmAction.vlp_amount_sum,
    signature: { r: sig[0], s: sig[1] },
    market_id: marketId,
    synthetic_token: position.position_header.synthetic_token,
  };

  await client.close_onchain_mm(closeMmMessage, function (err, response) {
    if (err) {
      console.log(err);
    } else {
      console.log("response", response);
    }
  });
}

module.exports = {
  registerMM,
  addLiquidity,
  removeLiquidity,
  closeMM,
};
