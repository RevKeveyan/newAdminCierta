/**
 * Whitelist of fields to track in audit history for each entity
 * Used for computing changes and sending notifications
 */

module.exports = {
  /**
   * Load fields to track
   */
  load: [
    'status',
    'carrier',
    'customer',
    'customerRate',
    'carrierRate',
    'pickup.locationName',
    'pickup.address',
    'pickup.date',
    'pickup.contactPhone',
    'delivery.locationName',
    'delivery.address',
    'delivery.date',
    'delivery.contactPhone',
    'tracking',
    'orderId',
    'insurance.type',
    'insurance.customAmount',
    'dates.assignedDate',
    'dates.deadline',
    'dates.pickupDate',
    'dates.deliveryDate',
    'type.freight',
    'type.vehicle',
    'notes'
  ],

  /**
   * Customer fields to track
   */
  customer: [
    'companyName',
    'customerAddress.address',
    'customerAddress.city',
    'customerAddress.state',
    'customerAddress.zipCode',
    'emails',
    'phoneNumber',
    'paymentMethod',
    'paymentTerms',
    'creditLimit',
    'status'
  ],

  /**
   * Carrier fields to track
   */
  carrier: [
    'name',
    'companyName',
    'email',
    'phoneNumber',
    'mcNumber',
    'dotNumber',
    'address.address',
    'address.city',
    'address.state',
    'address.zipCode',
    'equipmentType',
    'size',
    'capabilities',
    'certifications',
    'status'
  ],

  /**
   * User fields to track
   */
  user: [
    'firstName',
    'lastName',
    'email',
    'companyName',
    'role',
    'status'
  ],

  /**
   * PaymentReceivable fields to track
   */
  paymentReceivable: [
    'status',
    'amount',
    'totalAmount',
    'customerRate',
    'rate',
    'dueDate',
    'invoiceDate',
    'receivedDate',
    'daysToPay',
    'invoiceStatus',
    'statusChangedAt',
    'payedDate'
  ],

  /**
   * PaymentPayable fields to track
   */
  paymentPayable: [
    'status',
    'amount',
    'grossAmount',
    'netAmount',
    'carrierRate',
    'rate',
    'dueDate',
    'paymentDate',
    'bank',
    'routing',
    'accountNumber',
    'statusChangedAt',
    'payedDate'
  ]
};


