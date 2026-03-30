function mapUser(user) {
  if (!user) return null;

  // Format allowedCustomers - if populated, extract id and companyName
  let allowedCustomers = [];
  if (user.allowedCustomers && Array.isArray(user.allowedCustomers)) {
    allowedCustomers = user.allowedCustomers.map(customer => {
      if (customer && typeof customer === 'object') {
        // If populated (has companyName), return object with id and companyName
        if (customer.companyName) {
          return {
            id: customer._id || customer.id,
            companyName: customer.companyName
          };
        }
        // If just ID, return as string
        return customer._id || customer.id || customer;
      }
      return customer;
    });
  }

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: user.companyName,
    status: user.status,
    profileImage: user.profileImage,
    pdfs: user.pdfs || [],
    allowedCustomers: allowedCustomers,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/**
 * For historical compatibility the module exports a callable function (used by
 * AuthController) while also exposing a `format` method expected by
 * UniversalBaseController and UserController.
 */
const userDTO = (user) => mapUser(user);
userDTO.format = mapUser;

module.exports = userDTO;