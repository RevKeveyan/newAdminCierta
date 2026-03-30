function pick(obj = {}, keys = []) {
  const out = {};
  keys.forEach((k) => {
    const v = obj?.[k];
    if (v !== undefined) out[k] = v;
  });
  return out;
}

module.exports = pick;
module.exports.pick = pick;
