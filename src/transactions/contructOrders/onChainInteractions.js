const axios = require("axios");

const { SERVER_URL, DECIMALS_PER_ASSET } = require("../../utils/utils");
const { handleDepositResponse } = require("../handleOrderResponses");
const { restoreUserState } = require("../../utils/keyRetrieval");

const EXPRESS_APP_URL = `http://${SERVER_URL}:4000`; // process.env.EXPRESS_APP_URL;

//

async function _sendDepositInner(user, depositId, amount, token, pubKey) {
  if (!user || !amount || !token || !depositId || !pubKey) {
    throw new Error("Invalid input");
  }

  let tokenDecimals = DECIMALS_PER_ASSET[token];
  amount = Number.parseInt(amount * 10 ** tokenDecimals);

  let deposit = user.makeDepositOrder(depositId, amount, token, pubKey);

  await axios
    .post(`${EXPRESS_APP_URL}/execute_deposit`, deposit.toGrpcObject())
    .then((res) => {
      let deposit_response = res.data.response;

      if (deposit_response.successful) {
        handleDepositResponse(user, deposit_response, deposit);
      } else {
        let msg =
          "Deposit failed with error: \n" + deposit_response.error_message;
        console.log(msg);

        if (deposit_response.error_message.includes("Note does not exist")) {
          restoreUserState(user, true, false);
        }

        throw new Error(msg);
      }
    });
}

async function _sendWithdrawalInner(
  user,
  amount,
  token,
  recipient,
  withdrawalChainId,
  maxGasFee
) {
  if (!user || !amount || !token || !withdrawalChainId || !recipient) {
    throw new Error("Invalid input");
  }

  let tokenDecimals = DECIMALS_PER_ASSET[token];
  amount = Number.parseInt(amount * 10 ** tokenDecimals);

  let withdrawal = user.makeWithdrawalOrder(
    amount,
    token,
    recipient,
    withdrawalChainId,
    maxGasFee
  );

  await axios
    .post(`${EXPRESS_APP_URL}/execute_withdrawal`, withdrawal.toGrpcObject())
    .then((res) => {
      let withdrawal_response = res.data.response;

      if (withdrawal_response.successful) {
        for (let i = 0; i < withdrawal.notes_in.length; i++) {
          let note = withdrawal.notes_in[i];
          user.noteData[note.token] = user.noteData[note.token].filter(
            (n) => n.index != note.index
          );
          // removeNoteFromDb(note);
        }
      } else {
        let msg =
          "Withdrawal failed with error: \n" +
          withdrawal_response.error_message;
        console.log(msg);

        if (withdrawal_response.error_message.includes("Note does not exist")) {
          restoreUserState(user, true, false);
        }

        throw new Error(msg);
      }
    });
}

module.exports = {
  _sendDepositInner,
  _sendWithdrawalInner,
};
