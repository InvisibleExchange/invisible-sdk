const { getKeyPair, sign } = require("starknet").ec;
const { computeHashOnElements } = require("../../utils/crypto_hash");

/* global BigInt */
class LiquidationOrder {
  constructor(
    position, // Position being liquidated
    order_side,
    synthetic_token,
    synthetic_amount,
    collateral_amount,
    open_order_fields
  ) {
    this.position = position ? { ...position } : null;
    this.order_side = order_side;
    this.synthetic_token = synthetic_token;
    this.synthetic_amount = synthetic_amount;
    this.collateral_amount = collateral_amount;
    // -------------------
    this.open_order_fields = open_order_fields;
    // -------------------
    this.signature = null;
  }

  hashOrder() {
    let order_side = this.order_side == "Long";

    let position_address = this.position.position_header.position_address;
    let fields_hash = this.open_order_fields.hash();

    let hash_inputs = [
      position_address,
      order_side ? 1n : 0n,
      this.synthetic_token,
      this.synthetic_amount,
      this.collateral_amount,
      fields_hash,
    ];

    let order_hash = computeHashOnElements(hash_inputs);

    return order_hash;
  }

  signOrder(privKeys) {
    let orderHash = this.hashOrder();

    let pkSum = 0n;
    for (const pk of privKeys) {
      pkSum += pk;
    }

    let keyPair = getKeyPair(pkSum);

    let sig = sign(keyPair, "0x" + orderHash.toString(16));

    this.signature = sig;
    return sig;
  }

  toGrpcObject() {
    let order_side = this.order_side == "Long";

    let open_order_fields = this.open_order_fields.toGrpcObject();

    this.position.order_side = this.position.order_side == "Long";

    return {
      position: this.position,
      order_side,
      synthetic_token: this.synthetic_token.toString(),
      synthetic_amount: this.synthetic_amount.toString(),
      collateral_amount: this.collateral_amount.toString(),
      open_order_fields,
      signature: {
        r: this.signature[0].toString(),
        s: this.signature[1].toString(),
      },
    };
  }
}

module.exports = {
  LiquidationOrder,
};
