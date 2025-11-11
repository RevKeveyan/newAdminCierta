module.exports = function pick(obj = {}, keys = []) {
  const out = {};
  keys.forEach((k) => {
    const v = obj?.[k];
    if (v !== undefined) out[k] = v;
  });
  return out;
};

exports.pick = pick;