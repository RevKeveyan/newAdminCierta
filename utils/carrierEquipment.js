function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function normalizeEquipmentItems(rawEquipment) {
  if (!rawEquipment) return [];

  let equipment = rawEquipment;
  if (typeof equipment === 'string') {
    try {
      equipment = JSON.parse(equipment);
    } catch (error) {
      return [];
    }
  }

  if (!Array.isArray(equipment)) return [];

  return equipment
    .map(item => {
      const type = String(item?.type || '').trim();
      const sizes = normalizeStringList(item?.sizes || item?.size || []);
      return type ? { type, sizes } : null;
    })
    .filter(Boolean);
}

function normalizeCarrierEquipment(payload = {}) {
  const equipment = normalizeEquipmentItems(payload.equipment);
  const equipmentTypeList = normalizeStringList(payload.equipmentType);
  const sizeList = normalizeStringList(payload.size);

  let normalizedEquipment = equipment;
  if (normalizedEquipment.length === 0 && equipmentTypeList.length > 0) {
    normalizedEquipment = equipmentTypeList.map(type => ({
      type,
      sizes: sizeList
    }));
  }

  const typesFromEquipment = normalizedEquipment.map(item => item.type);
  const sizesFromEquipment = Array.from(
    new Set(normalizedEquipment.flatMap(item => item.sizes || []))
  );

  return {
    equipment: normalizedEquipment,
    equipmentType: typesFromEquipment.length > 0 ? typesFromEquipment : equipmentTypeList,
    size: sizesFromEquipment.length > 0 ? sizesFromEquipment : sizeList
  };
}

module.exports = {
  normalizeCarrierEquipment
};
