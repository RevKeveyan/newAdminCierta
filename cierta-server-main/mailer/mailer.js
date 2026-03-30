const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { buildLoadShipmentEmailHtml } = require("./buildLoadEmailBody");
dotenv.config();

const emailSendCache = new Map();
const CACHE_TTL = 60000;

/**
 * Replace {{placeholders}} with actual values
 * Supports {{#if field}}...{{/if}} conditional blocks
 */
function renderTemplate(template, data) {
  let result = template;
  
  // Handle {{#if field}}...{{/if}} blocks
  result = result.replace(/{{\s*#if\s+([\w.]+)\s*}}([\s\S]*?){{\s*\/if\s*}}/g, (match, key, content) => {
    const keys = key.split(".");
    let value = data;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) return "";
    }
    if (value && value !== "" && value !== null && value !== false) {
      return renderTemplate(content, data);
    }
    return "";
  });
  
  // Handle regular {{placeholders}}
  result = result.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const keys = key.split(".");
    let value = data;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) return "";
    }
    return String(value);
  });
  
  return result;
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
  const filePath = path.join(__dirname, "templates",  filename);
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

async function sendUserUpdatedMail(data) {
  const template = loadTemplate("userUpdated.html");
  const html = renderTemplate(template, data);

  return transporter.sendMail({
    from: `"Cierta Support" <${process.env.EMAIL_USER}>`,
    to: data.email,
    subject: `Your Cierta account has been updated`,
    html,
  });
}

async function sendResetPasswordEmail(email, code) {
  const template = loadTemplate("resetPassword.html");
  const html = renderTemplate(template, { code });

  return transporter.sendMail({
    from: `"Cierta Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Password Reset Code `,
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

function formatLoadDataForEmail(load, options = {}) {
  const emailBodyHtml = buildLoadShipmentEmailHtml(load, options);
  return { emailBodyHtml };
}

async function sendLoadDetailsEmail(load, options = {}) {
  const { isStatusUpdate = false, oldStatus = null, newStatus = null } = options;
  
  const orderId = load.orderId || (load._id ? load._id.toString() : 'N/A');
  const cacheKey = `${orderId}-${isStatusUpdate}-${oldStatus}-${newStatus}`;
  const now = Date.now();
  
  if (emailSendCache.has(cacheKey)) {
    const cachedTime = emailSendCache.get(cacheKey);
    if (now - cachedTime < CACHE_TTL) {
      console.log(`[Mailer] Email already sent recently for ${cacheKey}, skipping duplicate send`);
      return Promise.resolve();
    }
  }
  
  emailSendCache.set(cacheKey, now);
  
  setTimeout(() => {
    emailSendCache.delete(cacheKey);
  }, CACHE_TTL);
  
  console.log(`[Mailer] sendLoadDetailsEmail called - Order: ${orderId}, IsStatusUpdate: ${isStatusUpdate}, OldStatus: ${oldStatus}, NewStatus: ${newStatus}`);
  
  const customerEmails = Array.isArray(load.customerEmails) 
    ? load.customerEmails.filter(Boolean).map(email => email.toLowerCase().trim())
    : load.customerEmails 
      ? [load.customerEmails].filter(Boolean).map(email => email.toLowerCase().trim())
      : [];
  
  const carrierEmails = Array.isArray(load.carrierEmails)
    ? load.carrierEmails.filter(Boolean).map(email => email.toLowerCase().trim())
    : load.carrierEmails
      ? [load.carrierEmails].filter(Boolean).map(email => email.toLowerCase().trim())
      : [];

  console.log(`[Mailer] Found ${customerEmails.length} customer email(s) and ${carrierEmails.length} carrier email(s)`);

  if (customerEmails.length === 0 && carrierEmails.length === 0) {
    console.log(`[Mailer] No emails found, skipping email send for order ${orderId}`);
    return Promise.resolve();
  }

  const template = loadTemplate("loadDetails.html");
  const emailData = formatLoadDataForEmail(load, { isStatusUpdate, oldStatus, newStatus });
  const html = renderTemplate(template, emailData);

  const subject = isStatusUpdate
    ? `Shipment Status Updated - Order #${orderId}`
    : `New Shipment Listed - Order #${orderId}`;

  const uniqueCustomerEmails = [...new Set(customerEmails)];
  const uniqueCarrierEmails = [...new Set(carrierEmails)];

  console.log(`[Mailer] Processing emails - Order: ${orderId}, Customer emails: ${uniqueCustomerEmails.length}, Carrier emails: ${uniqueCarrierEmails.length}, IsStatusUpdate: ${isStatusUpdate}`);
  console.log(`[Mailer] Unique customer emails:`, uniqueCustomerEmails);
  console.log(`[Mailer] Unique carrier emails:`, uniqueCarrierEmails);

  const emailPromises = [];
  const sentEmails = new Set();

  if (uniqueCarrierEmails.length > 0) {
    console.log(`[Mailer] Preparing ${uniqueCarrierEmails.length} email(s) for carrier emails`);
    uniqueCarrierEmails.forEach((email, index) => {
      if (sentEmails.has(email)) {
        console.warn(`[Mailer] Skipping duplicate carrier email: ${email}`);
        return;
      }
      sentEmails.add(email);
      
      const ccEmails = [];
      uniqueCarrierEmails.forEach((otherEmail) => {
        if (otherEmail !== email) {
          ccEmails.push(otherEmail);
        }
      });
      
      console.log(`[Mailer] Email ${index + 1}/${uniqueCarrierEmails.length}: Sending to carrier ${email}, CC (other carriers): ${ccEmails.join(', ') || 'none'}`);
      emailPromises.push(
        transporter.sendMail({
          from: `"Cierta" <${process.env.EMAIL_USER}>`,
          to: email,
          cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
          subject,
          html,
        }).then(() => {
          console.log(`[Mailer] Successfully sent email to carrier: ${email}`);
        }).catch((error) => {
          console.error(`[Mailer] Failed to send email to carrier ${email}:`, error);
          throw error;
        })
      );
    });
  }

  if (uniqueCustomerEmails.length > 0) {
    console.log(`[Mailer] Preparing ${uniqueCustomerEmails.length} separate email(s) for customer emails`);
    uniqueCustomerEmails.forEach((email, index) => {
      if (sentEmails.has(email)) {
        console.warn(`[Mailer] Skipping duplicate customer email: ${email}`);
        return;
      }
      sentEmails.add(email);
      
      const ccOtherCustomers = uniqueCustomerEmails.filter((e) => e !== email);
      console.log(
        `[Mailer] Email ${index + 1}/${uniqueCustomerEmails.length}: Sending to customer ${email}, CC (other customers): ${ccOtherCustomers.join(", ") || "none"}`
      );
      emailPromises.push(
        transporter.sendMail({
          from: `"Cierta" <${process.env.EMAIL_USER}>`,
          to: email,
          cc: ccOtherCustomers.length > 0 ? ccOtherCustomers.join(", ") : undefined,
          subject,
          html,
        }).then(() => {
          console.log(`[Mailer] Successfully sent email to customer: ${email}`);
        }).catch((error) => {
          console.error(`[Mailer] Failed to send email to customer ${email}:`, error);
          throw error;
        })
      );
    });
  }

  console.log(`[Mailer] Total unique emails to send: ${emailPromises.length} (${uniqueCarrierEmails.length} carriers + ${uniqueCustomerEmails.length} customers)`);
  return Promise.all(emailPromises);
}

function formatSendLoadFilesPlainToHtml(body) {
  const trimmed = (body || "").trim();
  const blocks = trimmed.split(/\n\n+/);
  const inner = blocks
    .map((block) => {
      const withBreaks = block.trim().replace(/\n/g, "<br/>");
      return `<p style="margin: 0 0 16px; color: #333; line-height: 1.5;">${withBreaks}</p>`;
    })
    .join("");
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${inner}</div>`;
}

function getSendLoadFilesEmailContent(orderId, mode) {
  const idPart = orderId != null && String(orderId).trim() !== "" ? String(orderId).trim() : null;
  const subjPrefix = idPart ? `${idPart}, ` : "";

  if (mode === "both") {
    const subject = `${subjPrefix}RC and BOL(s)`;
    const text = `Hi Team,

Please find the RC and BOL(s) enclosed herewith:

Please sign the RC and send it back to us once you have a chance. The BOL(s) must be printed by a driver before getting to a shipper unless otherwise specified in writing.

Thank you for your business!`;
    return { subject, html: formatSendLoadFilesPlainToHtml(text), text };
  }
  if (mode === "rcOnly") {
    const subject = `${subjPrefix}RC`;
    const text = `Hi Team,

Please find the RC enclosed herein:

Please sign it and send it back to us once you have a chance.

Thank you for your business!`;
    return { subject, html: formatSendLoadFilesPlainToHtml(text), text };
  }
  const subject = `${subjPrefix}BOL(s)`;
  const text = `Hi there,

Please find the BOL(s) enclosed herein:

Please let us know if you need anything else or if there are any questions.

Thank you for allowing Cierta to be of service to your satisfaction!`;
  return { subject, html: formatSendLoadFilesPlainToHtml(text), text };
}

async function sendLoadFilesEmail(to, orderId, attachments, mode) {
  const { subject, html, text } = getSendLoadFilesEmailContent(orderId, mode);
  const mailOptions = {
    from: `"Cierta" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  };
  if (Array.isArray(attachments) && attachments.length > 0) {
    mailOptions.attachments = attachments.map((att) => ({
      filename: att.filename || "document.pdf",
      content: att.content,
    }));
  }
  return transporter.sendMail(mailOptions);
}

module.exports = {
  sendSupportRequestMail,
  sendShippingRequestMail,
  sendUserCreatedMail,
  sendUserUpdatedMail,
  sendStatusUpdateMail,
  sendResetPasswordEmail,
  sendLoadDetailsEmail,
  sendLoadFilesEmail,
};
