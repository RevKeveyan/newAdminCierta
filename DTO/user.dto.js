function userDTO(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: user.companyName,
    status: user.status,
    profileImage: user.profileImage,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

// Export as an object with format method to match controller expectations
module.exports = userDTO;