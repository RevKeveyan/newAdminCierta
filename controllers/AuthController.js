const User = require('../models/User');
const ResetCode = require('../models/ResetCode');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendMail } = require('../utils/mailer'); // например, nodemailer
const crypto = require('crypto');
const userDTO = require('../DTO/user.dto');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = generateToken(user);
    res.status(200).json({ token, user: userDTO(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await ResetCode.findOneAndUpdate(
      { email },
      { code, expiresAt, attempts: 0, blocked: false },
      { upsert: true }
    );

    await sendMail(email, 'Reset your password', `Your verification code is: ${code}`);

    res.status(200).json({ message: 'Verification code sent to your email' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send code', details: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const reset = await ResetCode.findOne({ email });
    if (!reset) return res.status(404).json({ error: 'Code not found' });
    if (reset.blocked) return res.status(403).json({ error: 'Too many attempts. Contact support.' });
    if (reset.expiresAt < new Date()) return res.status(410).json({ error: 'Code expired' });

    if (reset.code !== code) {
      reset.attempts += 1;
      if (reset.attempts >= 3) {
        reset.blocked = true;
        await reset.save();
        return res.status(403).json({ error: 'Too many attempts. Contact support.' });
      }
      await reset.save();
      return res.status(400).json({ error: 'Incorrect code' });
    }

    const hashed = await bcrypt.hash(newPassword, 8);
    await User.findOneAndUpdate({ email }, { password: hashed });
    await ResetCode.deleteOne({ email });

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed', details: err.message });
  }
};
