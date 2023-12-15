const { hash2, computeHashOnElements } = require("../../utils/crypto_hash");
const { getKeyPair, sign } = require("starknet").ec;

//* =============================================================================
//* ORDER TABS

class OrderTab {
  constructor(tab_idx, tab_header, base_amount, quote_amount) {
    this.tab_idx = tab_idx;
    this.tab_header = tab_header;
    this.base_amount = base_amount;
    this.quote_amount = quote_amount;
    this.hash = this.hash();
  }

  hash() {
    return OrderTab.hashOrderTab(
      this.tab_header.hash(),
      this.tab_header.base_blinding,
      this.tab_header.quote_blinding,
      this.base_amount,
      this.quote_amount
    );
  }

  static hashOrderTab(
    header_hash,
    base_blinding,
    quote_blinding,
    base_amount,
    quote_amount
  ) {
    let base_commitment = hash2([BigInt(base_amount), BigInt(base_blinding)]);
    let quote_commitment = hash2([
      BigInt(quote_amount),
      BigInt(quote_blinding),
    ]);

    let hashInputs = [header_hash, base_commitment, quote_commitment];

    return computeHashOnElements(hashInputs);
  }

  toGrpcObject() {
    return {
      tab_idx: this.tab_idx,
      tab_header: this.tab_header.toGrpcObject(),
      base_amount: this.base_amount,
      quote_amount: this.quote_amount,
    };
  }

  static fromGrpcObject(grpcMessage) {
    let tabHeader = TabHeader.fromGrpcObject(grpcMessage.tab_header);

    return new OrderTab(
      grpcMessage.tab_idx,
      tabHeader,
      grpcMessage.base_amount,
      grpcMessage.quote_amount
    );
  }

  signOpenTabOrder(
    basePrivKeys,
    quotePrivKeys,
    baseRefundNote,
    quoteRefundNote
  ) {
    let pkSum = 0n;
    for (let i = 0; i < basePrivKeys.length; i++) {
      pkSum += BigInt(basePrivKeys[i]);
    }
    for (let i = 0; i < quotePrivKeys.length; i++) {
      pkSum += BigInt(quotePrivKeys[i]);
    }

    const keyPair = getKeyPair(pkSum);

    let hashInputs = [
      0n,
      this.hash,
      baseRefundNote ? baseRefundNote.hash : 0n,
      quoteRefundNote ? quoteRefundNote.hash : 0n,
    ];

    let hash = computeHashOnElements(hashInputs);

    let sig = sign(keyPair, "0x" + hash.toString(16));

    return sig;
  }
}

class TabHeader {
  constructor(base_token, quote_token, base_blinding, quote_blinding, pub_key) {
    this.base_token = base_token;
    this.quote_token = quote_token;
    this.base_blinding = BigInt(base_blinding);
    this.quote_blinding = BigInt(quote_blinding);
    this.pub_key = BigInt(pub_key);
  }

  // & header_hash = H({ base_token, quote_token, pub_key})
  hash() {
    let hashInputs = [this.base_token, this.quote_token, this.pub_key];

    return computeHashOnElements(hashInputs);
  }

  toGrpcObject() {
    return {
      base_token: this.base_token,
      quote_token: this.quote_token,
      base_blinding: this.base_blinding.toString(),
      quote_blinding: this.quote_blinding.toString(),
      pub_key: this.pub_key.toString(),
    };
  }

  static fromGrpcObject(grpcMessage) {
    return new TabHeader(
      grpcMessage.base_token,
      grpcMessage.quote_token,
      grpcMessage.base_blinding,
      grpcMessage.quote_blinding,
      grpcMessage.pub_key
    );
  }
}

module.exports = {
  OrderTab,
  TabHeader,
};
