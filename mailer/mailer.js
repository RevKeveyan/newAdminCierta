const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

/**
 * Replace {{placeholders}} with actual values
 */
function renderTemplate(template, data) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const keys = key.split(".");
    let value = data;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) return "";
    }
    return String(value);
  });
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "465"),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Load HTML template from disk
 */
function loadTemplate(filename) {
  const filePath = path.join(__dirname, "templates", "emails", filename);
  return fs.readFileSync(filePath, "utf-8");
}

async function sendSupportRequestMail(data) {
  const template = loadTemplate("supportRequest.html");
  const html = renderTemplate(template, data);

  return transporter.sendMail({
    from: `"Cierta Support" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `New support request: ${data.subject}`,
    html,
  });
}

async function sendShippingRequestMail(data) {
  const template = loadTemplate("shippingRequest.html");
  const html = renderTemplate(template, {
    ...data,
    pickupDate: new Date(data.pickupDate).toLocaleDateString(),
    deliveryDate: new Date(data.deliveryDate).toLocaleDateString(),
  });

  return transporter.sendMail({
    from: `"Cierta Corporation" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `New shipping request from ${data.firstName} ${data.lastName}`,
    html,
  });
}

async function sendUserCreatedMail(data) {
  const template = loadTemplate("userCreated.html");
  const html = renderTemplate(template, data);

  return transporter.sendMail({
    from: `"Cierta Support" <${process.env.EMAIL_USER}>`,
    to: data.email,
    subject: `Your Cierta account has been created`,
    html,
  });
}

async function sendResetPasswordEmail(email, code) {
  const template = loadTemplate("resetPassword.html");
  const html = renderTemplate(template, { code });

  return transporter.sendMail({
    from: `"Cierta Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset Code",
    html,
  });
}

async function sendStatusUpdateMail(load, oldStatus, newStatus) {
  const emails = Array.isArray(load.costomerEmail)
    ? load.costomerEmail
    : [load.costomerEmail].filter(Boolean);

  if (!emails.length) return;

  const template = loadTemplate("statusUpdate.html");

  const html = renderTemplate(template, {
    ...load,
    oldStatus,
    newStatus,
    pickupDate: new Date(load.pickUpDate).toLocaleString(),
    deliveryDate: new Date(load.deliveryDate).toLocaleString(),
    assignedDate: load.assignedDate
      ? new Date(load.assignedDate).toLocaleString()
      : "N/A",
    tracking: load.tracing || "",
    delivered: newStatus === "delivered",
    vin: load.Vin || load._id,
  });

  const sendPromises = emails.map((email) =>
    transporter.sendMail({
      from: `"Cierta Notification" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Status Update for Shipment #${load.Vin || load._id}`,
      html,
    })
  );

  return Promise.all(sendPromises);
}

module.exports = {
  sendSupportRequestMail,
  sendShippingRequestMail,
  sendUserCreatedMail,
  sendStatusUpdateMail,
  sendResetPasswordEmail,
};
