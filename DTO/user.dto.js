function mapUser(user) {
  if (!user) return null;

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: user.companyName,
    status: user.status,
    profileImage: user.profileImage,
    userFile: user.userFile,
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