// Helper function for address DTO (same as in load.dto.js)
function addressDTO(address) {
  if (!address) return null;
  return {
    address: address.address,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode || address.zip?.toString(),
    // Обратная совместимость
    name: address.name,
    zip: address.zip,
    loc: address.loc,
    contactPhone: address.contactPhone
  };
}

/**
 * Customer DTO
 */
class CustomerDTO {
  /**
   * Форматирует один документ customer
   */
  static format(customer) {
    if (!customer) return null;
    
    // Format allowedUsers - if populated, extract id, firstName, lastName, email
    let allowedUsers = [];
    if (customer.allowedUsers && Array.isArray(customer.allowedUsers)) {
      allowedUsers = customer.allowedUsers.map(user => {
        if (user && typeof user === 'object') {
          // If populated (has firstName or email), return object with user data
          if (user.firstName || user.email) {
            return {
              id: user._id || user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email
            };
          }
          // If just ID, return as string
          return user._id || user.id || user;
        }
        return user;
      });
    }
    
    // Format representativePeoples - embedded subdocuments, no populate needed
    let representativePeoples = [];
    if (customer.representativePeoples && Array.isArray(customer.representativePeoples)) {
      representativePeoples = customer.representativePeoples.map(person => {
        if (person && typeof person === 'object') {
          return {
            id: person._id || person.id,
            fullName: person.fullName,
            email: person.email,
            phoneNumber: person.phoneNumber
          };
        }
        return person;
      });
    }
    
    return {
      id: customer._id || customer.id,
      companyName: customer.companyName,
      type: customer.type || 'customer',
      customerAddress: addressDTO(customer.customerAddress),
      email: customer.email || null,
      phoneNumber: customer.phoneNumber,
      // Платежная информация
      paymentMethod: customer.paymentMethod,
      paymentTerms: customer.paymentTerms,
      creditLimit: customer.creditLimit,
      allowedUsers: allowedUsers,
      representativePeoples: representativePeoples,
      status: customer.status,
      images: customer.images || [],
      pdfs: customer.pdfs || [],
      loads: customer.loads || [],
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    };
  }
}

module.exports = CustomerDTO;

