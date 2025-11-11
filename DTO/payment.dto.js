const { pick } = require("./pick/pick");

function paymentStatusDTO(ps = {}) {
  return pick(ps, ["status", "date"]);
}
module.exports = paymentStatusDTO;

// dtos/loadPayment.dto.js

function toLoadPaymentDTO(lp = {}) {
  return {
    id: lp._id,
    loadId: lp.loadId,
    paidBy: lp.paidBy,
    amount: lp.amount,
    date: lp.date,
    type: lp.type, // "carrier" | "customer"
    note: lp.note,
  };
}

module.exports = { toLoadPaymentDTO };
