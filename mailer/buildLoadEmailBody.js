function escapeHtml(str) {
  if (str == null || str === "") return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMeaningfulText(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "none" || lower === "null" || lower === "undefined") return false;
  if (/^[\s\-–—−‐_]+$/u.test(s)) return false;
  return true;
}

function formatDateTimeEmailOptional(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value).trim();
    return isMeaningfulText(s) ? s : null;
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function resolvePickupDateRaw(load) {
  const d = load.dates || {};
  if (d.pickupDate) return d.pickupDate;
  if (load.pickup?.date) return load.pickup.date;
  if (d.pickupAt) return d.pickupAt;
  if (d.pickupStartAt) return d.pickupStartAt;
  if (d.pickupDateStart && d.pickupDateEnd) return `${d.pickupDateStart} – ${d.pickupDateEnd}`;
  if (d.pickupDateStart) return d.pickupDateStart;
  return null;
}

function resolveDeliveryDateRaw(load) {
  const d = load.dates || {};
  if (d.deliveryDate) return d.deliveryDate;
  if (load.delivery?.date) return load.delivery.date;
  if (d.deliveryAt) return d.deliveryAt;
  if (d.deliveryStartAt) return d.deliveryStartAt;
  if (d.deliveryDateStart && d.deliveryDateEnd) return `${d.deliveryDateStart} – ${d.deliveryDateEnd}`;
  if (d.deliveryDateStart) return d.deliveryDateStart;
  return null;
}

function getTransportType(load) {
  const v = load.type?.vehicle;
  const f = load.type?.freight;
  if (v && f) return "Vehicles & Freight";
  if (v) return "Vehicles";
  if (f) return "Freight";
  return null;
}

function getShipmentDetailsLine(load) {
  const firstV = load.vehicle?.shipment?.[0];
  if (firstV?.vin && isMeaningfulText(firstV.vin)) return escapeHtml(String(firstV.vin).trim());
  const firstF = load.freight?.shipment?.[0];
  if (firstF) {
    const parts = [firstF.commodity, firstF.poNumber]
      .filter((x) => isMeaningfulText(x))
      .map((x) => String(x).trim());
    if (parts.length) return escapeHtml(parts.join(" · "));
  }
  return null;
}

function sectionWrap(title, body) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border:1px solid #e6edf5; background-color:#ffffff; margin:0 0 14px;">
  <tr>
    <td bgcolor="#f1f7ff" style="padding:10px 14px; font-family: Arial, Helvetica, sans-serif; color:#1d75bf; font-weight:700; font-size:13px; letter-spacing:0.2px;">
      ${escapeHtml(title)}
    </td>
  </tr>
  <tr>
    <td style="padding:12px 14px 14px; font-family: Arial, Helvetica, sans-serif; color:#1f2937; font-size:13px; line-height:1.45;">
      ${body}
    </td>
  </tr>
</table>`;
}

function line(label, valueHtml) {
  return `<p style="margin:0 0 6px; font-family: Arial, Helvetica, sans-serif; font-size:13px; line-height:1.45;"><span style="color:#6b7280;">${escapeHtml(label)}:</span> <strong style="color:#111827; font-weight:700;">${valueHtml}</strong></p>`;
}

function lineOptionalRaw(label, rawValue) {
  if (!isMeaningfulText(rawValue)) return "";
  return line(label, escapeHtml(String(rawValue).trim()));
}

function lineOptionalHtml(label, value) {
  if (!isMeaningfulText(value)) return "";
  return line(label, escapeHtml(String(value).trim()));
}

function formatLocationSectionHtml(title, loc) {
  if (!loc) return "";
  const name = (loc.locationName || "").trim();
  const addr = (loc.address?.address || "").trim();
  const city = (loc.address?.city || "").trim();
  const state = (loc.address?.state || "").trim();
  const zip = (loc.address?.zipCode ?? loc.address?.zip ?? "").toString().trim();
  const cityLine = [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : "");
  const phone = (loc.contactPhone || loc.address?.contactPhone || "").trim();
  const body = [
    lineOptionalRaw("Location", name),
    lineOptionalRaw("Address", addr),
    lineOptionalRaw("City/State", cityLine),
    lineOptionalRaw("Phone", phone),
  ].join("");
  if (!body.trim()) return "";
  return sectionWrap(title, body);
}

function resolveCarrierPerson(load) {
  const people = Array.isArray(load.loadCarrierPeople) ? load.loadCarrierPeople : [];
  const driver = people.find((p) => p && p.type === "driver") || people[0];
  const carrier = load.carrier && typeof load.carrier === "object" ? load.carrier : null;
  const companyName = (carrier?.companyName || carrier?.name || "").trim();
  const driverName = (driver?.fullName && String(driver.fullName).trim()) || "";
  const nameLine = driverName || companyName || (carrier && (carrier.name || "").trim()) || "";
  const contact =
    (driver?.phoneNumber && String(driver.phoneNumber).trim()) ||
    (carrier?.phoneNumber && String(carrier.phoneNumber).trim()) ||
    "";
  const email =
    (driver?.email && String(driver.email).trim()) ||
    (carrier?.email && String(carrier.email).trim()) ||
    "";
  return { companyName, driverName, nameLine, contact, email };
}

function resolveVehicleBlock(load) {
  const firstV = load.vehicle?.shipment?.[0];
  if (firstV) {
    return {
      make: firstV.make || "",
      model: firstV.model || "",
      year: firstV.year || "",
      color: "",
      mileage: "",
    };
  }
  return { make: "", model: "", year: "", color: "", mileage: "" };
}

function buildShipmentItemsHtml(load) {
  const rows = [];
  const vs = load.vehicle?.shipment;
  if (Array.isArray(vs)) {
    vs.forEach((v, i) => {
      const parts = [];
      if (isMeaningfulText(v.vin)) parts.push(`VIN ${String(v.vin).trim()}`);
      if (isMeaningfulText(v.make)) parts.push(String(v.make).trim());
      if (isMeaningfulText(v.model)) parts.push(String(v.model).trim());
      if (isMeaningfulText(v.year)) parts.push(String(v.year).trim());
      const lineText = parts.join(" · ");
      if (lineText) rows.push(line(`Vehicle ${i + 1}`, escapeHtml(lineText)));
    });
  }
  const fs = load.freight?.shipment;
  if (Array.isArray(fs)) {
    fs.forEach((f, i) => {
      const parts = [];
      if (isMeaningfulText(f.commodity)) parts.push(String(f.commodity).trim());
      if (isMeaningfulText(f.weight)) parts.push(`Weight ${String(f.weight).trim()}`);
      if (isMeaningfulText(f.poNumber)) parts.push(`PO ${String(f.poNumber).trim()}`);
      const lineText = parts.join(" · ");
      if (lineText) rows.push(line(`Freight ${i + 1}`, escapeHtml(lineText)));
    });
  }
  if (!rows.length) return "";
  return sectionWrap("Shipment Items", rows.join(""));
}

function buildVehicleSectionHtml(load) {
  if (!load.type?.vehicle) {
    return "";
  }
  const vehicle = resolveVehicleBlock(load);
  const parts = [
    lineOptionalRaw("Make", vehicle.make),
    lineOptionalRaw("Model", vehicle.model),
    lineOptionalRaw("Year", vehicle.year),
    lineOptionalRaw("Color", vehicle.color),
    lineOptionalRaw("Mileage", vehicle.mileage),
  ].join("");
  if (!parts.trim()) {
    return "";
  }
  return sectionWrap("Vehicle Information", parts);
}

function buildLoadShipmentEmailHtml(load, options = {}) {
  const { isStatusUpdate = false, oldStatus = null, newStatus = null } = options;
  const statusValue = isStatusUpdate && oldStatus != null && newStatus != null
    ? `<span style="color:#dbeafe; text-decoration:line-through;">${escapeHtml(oldStatus)}</span> <span style="color:#ffffff; font-weight:700;">→ ${escapeHtml(newStatus)}</span>`
    : `<span style="color:#ffffff; font-weight:700;">${escapeHtml(load.status || "Listed")}</span>`;

  const vinLabel = load.type?.vehicle ? "VIN" : "Shipment";
  const shipmentId = getShipmentDetailsLine(load);
  const transport = getTransportType(load);

  const summaryParts = [];
  if (shipmentId) summaryParts.push(line(vinLabel, shipmentId));
  if (transport) summaryParts.push(line("Transport Type", escapeHtml(transport)));
  if (load.orderId) summaryParts.push(line("Order ID", escapeHtml(String(load.orderId).trim())));
  const summaryHtml = summaryParts.length ? sectionWrap("Shipment Details", summaryParts.join("")) : "";

  const pickupHtml = formatLocationSectionHtml("Pickup Location", load.pickup);
  const deliveryHtml = formatLocationSectionHtml("Delivery Location", load.delivery);
  const itemsHtml = buildShipmentItemsHtml(load);

  const { companyName, driverName, nameLine, contact, email } = resolveCarrierPerson(load);
  let carrierParts = "";
  if (companyName && driverName) {
    carrierParts = [
      lineOptionalRaw("Company", companyName),
      lineOptionalRaw("Driver", driverName),
      lineOptionalRaw("Contact", contact),
      lineOptionalRaw("Email", email),
    ].join("");
  } else {
    carrierParts = [
      lineOptionalRaw("Name", nameLine),
      lineOptionalRaw("Contact", contact),
      lineOptionalRaw("Email", email),
    ].join("");
  }
  const carrierHtml = carrierParts.trim() ? sectionWrap("Carrier Information", carrierParts) : "";

  const vehicleSectionHtml = buildVehicleSectionHtml(load);

  const pickupDate = resolvePickupDateRaw(load);
  const deliveryDate = resolveDeliveryDateRaw(load);
  const assignedDate = load.dates?.assignedDate;
  const lastUpdated = load.updatedAt;
  const timelineParts = [
    lineOptionalHtml("Pickup Date", formatDateTimeEmailOptional(pickupDate)),
    lineOptionalHtml("Delivery Date", formatDateTimeEmailOptional(deliveryDate)),
    lineOptionalHtml("Assigned Date", formatDateTimeEmailOptional(assignedDate)),
    lineOptionalHtml("Last Updated", formatDateTimeEmailOptional(lastUpdated)),
  ].join("");
  const timelineHtml = timelineParts.trim() ? sectionWrap("Timeline", timelineParts) : "";

  const html = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; margin:0 0 14px;">
  <tr>
    <td bgcolor="#1d75bf" style="padding:14px 16px; font-family: Arial, Helvetica, sans-serif; color:#ffffff;">
      <p style="margin:0; font-size:12px; letter-spacing:0.2px;">Shipment Status</p>
      <p style="margin:6px 0 0; font-size:18px; line-height:1.25;">${statusValue}</p>
    </td>
  </tr>
</table>
${summaryHtml}
${itemsHtml}
${pickupHtml}
${deliveryHtml}
${carrierHtml}
${vehicleSectionHtml}
${timelineHtml}`;
  return html;
}

module.exports = {
  escapeHtml,
  buildLoadShipmentEmailHtml,
};
