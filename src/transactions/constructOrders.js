const axios = require("axios");

const { SERVER_URL } = require("../utils/utils");

const {
  _sendWithdrawalInner,
  _sendDepositInner,
} = require("./contructOrders/onChainInteractions");
const {
  _sendSplitOrderInner,
  _sendChangeMarginInner,
} = require("./contructOrders/notePositionHelpers");
const {
  _sendSpotOrderInner,
  _sendPerpOrderInner,
  _sendLiquidationOrderInner,
} = require("./contructOrders/orderExecutions");
const {
  _sendAmendOrderInner,
  _sendCancelOrderInner,
} = require("./contructOrders/orderInteractions");
const {
  _sendOpenOrderTabInner,
  _sendModifyOrderTabInner,
} = require("./contructOrders/orderTabs");

/**
 * This constructs a spot swap and sends it to the backend
 * ## Params:
 * @param  order_side "Buy"/"Sell"
 * @param  expirationTime expiration time in seconds
 * @param  baseToken
 * @param  quoteToken (price token)
 * @param  baseAmount the amount of base tokens to be bought/sold (only for sell orders)
 * @param  quoteAmount the amount of quote tokens to be spent/received  (only for buy orders)
 * @param  price a) price of base token denominated in quote token (current price if market order)
 * @param  feeLimit fee limit in percentage (1 = 1%)
 * @param  tabAddress the address of the tab to be used (null if non-tab order)
 * @param  slippage  the slippage limit in percentage (1 = 1%) (null if limit)
 */
async function sendSpotOrder(
  user,
  order_side,
  expirationTime,
  baseToken,
  quoteToken,
  baseAmount,
  quoteAmount,
  price,
  feeLimit,
  tabAddress,
  slippage,
  isMarket,
  ACTIVE_ORDERS
) {
  return await _sendSpotOrderInner(
    user,
    order_side,
    expirationTime,
    baseToken,
    quoteToken,
    baseAmount,
    quoteAmount,
    price,
    feeLimit,
    tabAddress,
    slippage,
    isMarket,
    ACTIVE_ORDERS
  );
}

// * =====================================================================================================================================
// * =====================================================================================================================================
// * =====================================================================================================================================

/**
 * This constructs a perpetual swap and sends it to the backend
 * ## Params:
 * @param  order_side "Long"/"Short"
 * @param  expirationTime expiration time in seconds
 * @param  position_effect_type "Open"/"Modify"/"Close"
 * @param  positionAddress the address of the position to be modified/closed (null if open)
 * @param  syntheticToken the token of the position to be opened
 * @param  syntheticAmount the amount of synthetic tokens to be bought/sold
 * @param  price (null if market order)
 * @param  initial_margin if the position is being opened (else null)
 * @param  feeLimit fee limit in percentage (10 = 10%)
 * @param  slippage  the slippage limit in percentage (1 = 1%) (null if limit)
 * @param  isMarket if the order is a market order
 */
async function sendPerpOrder(
  user,
  order_side,
  expirationTime,
  position_effect_type,
  positionAddress,
  syntheticToken,
  syntheticAmount_,
  price,
  initial_margin,
  feeLimit,
  slippage,
  isMarket,
  ACTIVE_ORDERS
) {
  return await _sendPerpOrderInner(
    user,
    order_side,
    expirationTime,
    position_effect_type,
    positionAddress,
    syntheticToken,
    syntheticAmount_,
    price,
    initial_margin,
    feeLimit,
    slippage,
    isMarket,
    ACTIVE_ORDERS
  );
}

/**
 * This constructs a perpetual swap and sends it to the backend
 * ## Params:
 * @param  position  the position to be modified/closed (null if open)
 * @param  price (null if market order)
 * @param  syntheticToken the token of the position to be opened
 * @param  syntheticAmount the amount of synthetic tokens to be bought/sold
 * @param  initial_margin if the position is being opened (else null)
 * @param  slippage  the slippage limit in percentage (1 = 1%) (null if limit)
 */
async function sendLiquidationOrder(
  user,
  position,
  price,
  syntheticToken,
  syntheticAmount,
  initial_margin,
  slippage
) {
  return await _sendLiquidationOrderInner(
    user,
    position,
    price,
    syntheticToken,
    syntheticAmount,
    initial_margin,
    slippage
  );
}

// * =====================================================================================================================================

/**
 * Sends a cancell order request to the server
 * ## Params:
 * @param orderId order id of order to cancel
 * @param orderSide true-Bid, false-Ask
 * @param isPerp
 * @param marketId market id of the order
 * @param dontUpdateState -if cancelling a batch order you dont want to update the state
 */
async function sendCancelOrder(
  user,
  orderId,
  orderSide,
  isPerp,
  marketId,
  dontUpdateState = false
) {
  return await _sendCancelOrderInner(
    user,
    orderId,
    orderSide,
    isPerp,
    marketId,
    0,
    dontUpdateState
  );
}

// * =====================================================================================================================================

/**
 * Sends an amend order request to the server
 * ## Params:
 * @param orderId order id of order to cancel
 * @param orderSide "Buy"/"Sell"
 * @param isPerp
 * @param marketId market id of the order
 * @param newPrice new price of the order
 * @param newExpirationTime new expiration time in seconds
 * @param tabAddress the address of the order tab to be used (null if non-tab order)
 * @param match_only true if order should be matched only, false if matched and amended
 * @returns true if order should be removed, false otherwise
 */

async function sendAmendOrder(
  user,
  orderId,
  order_side,
  isPerp,
  marketId,
  newPrice,
  newExpirationTime,
  tabAddress,
  match_only,
  ACTIVE_ORDERS
) {
  return await _sendAmendOrderInner(
    user,
    orderId,
    order_side,
    isPerp,
    marketId,
    newPrice,
    newExpirationTime,
    tabAddress,
    match_only,
    ACTIVE_ORDERS,
    0
  );
}

// * =====================================================================================================================================

async function sendDeposit(user, depositId, amount, token, pubKey) {
  return await _sendDepositInner(user, depositId, amount, token, pubKey);
}

// * ======================================================================

async function sendWithdrawal(
  user,
  withdrawalChainId,
  amount,
  token,
  starkKey
) {
  return await _sendWithdrawalInner(
    user,
    withdrawalChainId,
    amount,
    token,
    starkKey
  );
}

// * ======================================================================

/**
 * Restructures notes to have new amounts. This is useful if you don't want to wait for an order to be filled before you receive a refund.
 * ## Params:
 * @param token - token to restructure notes for
 * @param newAmounts - array of new amounts
 */
async function sendSplitOrder(user, token, newAmounts) {
  return await _sendSplitOrderInner(user, token, newAmounts);
}

// * ======================================================================

/**
 * Sends a change margin order to the server, which add or removes margin from a position
 * ## Params:
 * @param positionAddress address of the position to change margin on
 * @param syntheticToken token of the position
 * @param amount amount of margin to add or remove
 * @param direction "Add"/"Remove"
 */
async function sendChangeMargin(
  user,
  positionAddress,
  syntheticToken,
  amount,
  direction
) {
  return await _sendChangeMarginInner(
    user,
    positionAddress,
    syntheticToken,
    amount,
    direction
  );
}

// * ======================================================================

/**
 * Sends a request to open an order tab
 * ## Params:
 * @param baseAmount the amount of base token to supply
 * @param quoteAmount the amount of quote token to supply
 * @param marketId  determines which market (base/quote token) to use
 */
async function sendOpenOrderTab(user, baseAmount, quoteAmount, marketId) {
  return await _sendOpenOrderTabInner(user, baseAmount, quoteAmount, marketId);
}

// * ======================================================================

/**
 * Sends a request to open an order tab
 * ## Params:
 * @param marketId  determines which market (base/quote token) to use
 * @param orderTab  the order tab to close
 * @param expirationTime  time untill order tab expires
 */
async function sendCloseOrderTab(user, marketId, tabAddress) {
  return await _sendCloseOrderTabInner(user, marketId, tabAddress);
}

// * ======================================================================

async function sendModifyOrderTab(
  user,
  isAdd,
  baseAmount,
  quoteAmount,
  tabAddress,
  marketId
) {
  return await _sendModifyOrderTabInner(
    user,
    isAdd,
    baseAmount,
    quoteAmount,
    tabAddress,
    marketId
  );
}

// * ======================================================================

module.exports = {
  sendSpotOrder,
  sendPerpOrder,
  sendCancelOrder,
  sendDeposit,
  sendWithdrawal,
  sendAmendOrder,
  sendSplitOrder,
  sendChangeMargin,
  sendLiquidationOrder,
  sendOpenOrderTab,
  sendCloseOrderTab,
  sendModifyOrderTab,
};

// // ========================
