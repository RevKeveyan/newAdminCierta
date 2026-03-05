const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
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
  const { isStatusUpdate = false, oldStatus = null, newStatus = null } = options;
  
  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return dateValue;
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateValue;
    }
  };
  
  const formatAddress = (address) => {
    if (!address) return '';
    const parts = [];
    if (address.address) parts.push(address.address);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zipCode) parts.push(address.zipCode);
    return parts.join(', ') || '';
  };

  const formatCarrierInfo = () => {
    if (!load.carrier) return '';
    const parts = ['<div style="margin-bottom: 20px; padding: 15px; background-color: #F4F4F4; border-radius: 5px;">'];
    parts.push('<h4 style="color: #1D75BF; margin-top: 0;">Carrier Information</h4>');
    const carrierName = load.carrier.name || load.carrier.companyName || '';
    if (carrierName) parts.push(`<p><strong>Name:</strong> ${carrierName}</p>`);
    if (load.carrier.email) parts.push(`<p><strong>Email:</strong> ${load.carrier.email}</p>`);
    const contactPhone = load.carrier.phoneNumber || '';
    if (contactPhone) parts.push(`<p><strong>Contact:</strong> ${contactPhone}</p>`);
    parts.push('</div>');
    return parts.join('');
  };

  const formatPickupInfo = () => {
    if (!load.pickup) return '';
    const parts = ['<div style="margin-bottom: 20px; padding: 15px; background-color: #E8F4F8; border-left: 4px solid #1D75BF; border-radius: 5px;">'];
    parts.push('<h4 style="color: #1D75BF; margin-top: 0;">Pickup Location</h4>');
    if (load.pickup.locationName) parts.push(`<p><strong>Location:</strong> ${load.pickup.locationName}</p>`);
    const pickupAddr = formatAddress(load.pickup.address);
    if (pickupAddr) parts.push(`<p><strong>Address:</strong> ${pickupAddr}</p>`);
    parts.push('</div>');
    return parts.join('');
  };

  const formatDeliveryInfo = () => {
    if (!load.delivery) return '';
    const parts = ['<div style="margin-bottom: 20px; padding: 15px; background-color: #E8F4F8; border-left: 4px solid #1D75BF; border-radius: 5px;">'];
    parts.push('<h4 style="color: #1D75BF; margin-top: 0;">Delivery Location</h4>');
    if (load.delivery.locationName) parts.push(`<p><strong>Location:</strong> ${load.delivery.locationName}</p>`);
    const deliveryAddr = formatAddress(load.delivery.address);
    if (deliveryAddr) parts.push(`<p><strong>Address:</strong> ${deliveryAddr}</p>`);
    parts.push('</div>');
    return parts.join('');
  };

  const formatDatesInfo = () => {
    const parts = ['<div style="margin-bottom: 20px; padding: 15px; background-color: #F4F4F4; border-radius: 5px;">'];
    parts.push('<h4 style="color: #1D75BF; margin-top: 0;">Important Dates</h4>');
    let hasDates = false;
    if (load.dates?.assignedDate) {
      const formattedDate = formatDate(load.dates.assignedDate);
      parts.push(`<p><strong>Assigned Date:</strong> ${formattedDate}</p>`);
      hasDates = true;
    }
    if (load.dates?.pickupDate || load.pickup?.date) {
      const dateValue = load.dates?.pickupDate || load.pickup?.date;
      const formattedDate = formatDate(dateValue);
      parts.push(`<p><strong>Pickup Date:</strong> ${formattedDate}</p>`);
      hasDates = true;
    }
    if (load.dates?.deliveryDate || load.delivery?.date) {
      const dateValue = load.dates?.deliveryDate || load.delivery?.date;
      const formattedDate = formatDate(dateValue);
      parts.push(`<p><strong>Delivery Date:</strong> ${formattedDate}</p>`);
      hasDates = true;
    }
    parts.push('</div>');
    return hasDates ? parts.join('') : '';
  };

  const emailTitle = isStatusUpdate ? 'Shipment Status Updated' : 'New Shipment Listed';
  const statusChangeInfo = isStatusUpdate && oldStatus && newStatus 
    ? `<p style="margin: 10px 0 0 0;"><s>${oldStatus}</s> → <strong>${newStatus}</strong></p>` 
    : '';
  const statusInfo = load.status ? `<p><strong>Status:</strong> <span style="color: #1D75BF; font-weight: bold;">${load.status}</span></p>` : '';

  return {
    emailTitle,
    statusChangeInfo,
    orderId: load.orderId || load._id?.toString() || 'N/A',
    statusInfo,
    carrierInfo: formatCarrierInfo(),
    pickupInfo: formatPickupInfo(),
    deliveryInfo: formatDeliveryInfo(),
    datesInfo: formatDatesInfo(),
  };
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
          from: `"Cierta Corporation" <${process.env.EMAIL_USER}>`,
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
      
      console.log(`[Mailer] Email ${index + 1}/${uniqueCustomerEmails.length}: Sending to customer ${email} (no CC)`);
      emailPromises.push(
        transporter.sendMail({
          from: `"Cierta Corporation" <${process.env.EMAIL_USER}>`,
          to: email,
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

module.exports = {
  sendSupportRequestMail,
  sendShippingRequestMail,
  sendUserCreatedMail,
  sendUserUpdatedMail,
  sendStatusUpdateMail,
  sendResetPasswordEmail,
  sendLoadDetailsEmail,
};
