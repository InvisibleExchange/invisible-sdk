const { DECIMALS_PER_ASSET } = require("./utils");

function consistencyChecks(orderA, orderB, spentAmountA, spentAmountB) {
  // ? Check that the tokens swapped match
  if (
    orderA.token_spent !== orderB.token_received ||
    orderA.token_received !== orderB.token_spent
  ) {
    alert("Tokens swapped do not match");
    throw "Tokens swapped do not match";
  }

  // ? Check that the amounts swapped dont exceed the order amounts
  if (
    orderA.amount_spent < spentAmountA ||
    orderB.amount_spent < spentAmountB
  ) {
    alert("Amounts swapped exceed order amounts");
    throw "Amounts swapped exceed order amounts";
  }

  // Todo: Fees taken

  // ? Verify consistency of amounts swaped
  if (
    spentAmountA * orderA.amount_received >
      spentAmountB * orderA.amount_spent ||
    spentAmountB * orderB.amount_received > spentAmountA * orderB.amount_spent
  ) {
    alert("Amount swapped ratios");
  }
}

function perpConsisencyChecks(orderA, orderB, spentCollateral, spentSynthetic) {
  if (orderA.synthetic_token != orderB.synthetic_token) {
    alert("Tokens swapped do not match");
    throw "Tokens swapped do not match";
  }

  // ? Checks if order sides are different and returns the long order as orderA
  if (orderA.order_side != "Long" || orderB.order_side != "Short") {
    let tempOrder = orderA;
    orderA = orderB;
    orderB = tempOrder;

    if (orderA.order_side != "Long" || orderB.order_side != "Short") {
      alert("Order side missmatch");
      throw "Order side missmatch";
    }
  }

  // ? Check that the amounts swapped don't exceed the order amounts
  if (
    orderA.collateral_amount < spentCollateral ||
    orderB.synthetic_amount < spentSynthetic
  ) {
    alert("Amounts swapped exceed order amounts");
    throw "Amounts swapped exceed order amounts";
  }

  if (
    spentCollateral * orderA.synthetic_amount >
      spentSynthetic * orderA.collateral_amount ||
    spentSynthetic * orderB.collateral_amount >
      spentCollateral * orderB.synthetic_amount
  ) {
    alert("Amount swapped ratios are inconsistent");
    throw "Amount swapped ratios are inconsistent";
  }

  // Todo: Fees taken
}

// ===================================================================================

// user,
// order_side,
// position_effect_type,
// syntheticToken,
// syntheticAmount,
// COLLATERAL_TOKEN,
// collateralAmount,
// initial_margin,
// feeLimit

function checkPerpOrderValidity(
  user,
  orderSide,
  posEffectType,
  expirationTime,
  syntheticToken,
  syntheticAmount,
  collateralToken,
  collateralAmount,
  initialMargin,
  feeLimit
) {
  if (
    !expirationTime ||
    !syntheticToken ||
    !syntheticAmount ||
    feeLimit === null
  ) {
    console.log("Please fill in all fields");
    throw "Unfilled fields";
  }

  if (orderSide != "Long" && orderSide != "Short") {
    console.log("Order side must be either Long or Short");
    throw "Order side invalid";
  }

  if (posEffectType == "Open") {
    if (!collateralToken || !initialMargin) {
      throw "Unfilled fields2";
    }

    if (initialMargin > user.getAvailableAmount(collateralToken)) {
      throw "Insufficient balance";
    }
  } else {
    if (!user.positionData[syntheticToken]) {
      console.log("Position does not exist. Try opening a position first");
      throw "order invalid";
    }
  }
}

function getQuoteQty(qty_, price_, baseAsset, quoteAsset) {
  let baseDecimals = DECIMALS_PER_ASSET[baseAsset];
  let quoteDecimals = DECIMALS_PER_ASSET[quoteAsset];

  let qty = qty_ / 10 ** baseDecimals;

  let quoteQty = qty * price_;
  // quoteQty = Number.parseInt(quoteQty * 100) / 100;

  return Number.parseInt(quoteQty * 10 ** quoteDecimals);
}

function getQtyFromQuote(quoteQty_, price_, baseAsset, quoteAsset) {
  let baseDecimals = DECIMALS_PER_ASSET[baseAsset];
  let quoteDecimals = DECIMALS_PER_ASSET[quoteAsset];

  let quoteQty = quoteQty_ / 10 ** quoteDecimals;

  let qty = quoteQty / price_;
  // qty = Number.parseInt(qty * 100) / 100;

  return Number.parseInt(qty * 10 ** baseDecimals);
}

module.exports = {
  checkPerpOrderValidity,
  getQuoteQty,
  getQtyFromQuote,
};
