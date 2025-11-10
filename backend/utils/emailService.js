const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter;

const initializeTransporter = () => {
  if (transporter) return transporter;

  // Use environment variables for email configuration
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  };

  transporter = nodemailer.createTransport(emailConfig);
  
  return transporter;
};

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} resetUrl - Password reset URL with token
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    const transport = initializeTransporter();
    
    const mailOptions = {
      from: `"FetchNews" <${process.env.SMTP_FROM_EMAIL || 'noreply@fetchnews.app'}>`,
      to: email,
      subject: 'Password Reset Request - FetchNews',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi there,</p>
              <p>We received a request to reset your password for your FetchNews account. Click the button below to reset your password:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
              <p><strong>This link will expire in 10 minutes.</strong></p>
              <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              <p>Best regards,<br>The FetchNews Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} FetchNews. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hi there,
        
        We received a request to reset your password for your FetchNews account.
        
        To reset your password, visit this link:
        ${resetUrl}
        
        This link will expire in 10 minutes.
        
        If you didn't request a password reset, you can safely ignore this email.
        
        Best regards,
        The FetchNews Team
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send email verification email
 * @param {string} email - Recipient email address
 * @param {string} verificationUrl - Email verification URL with token
 */
const sendVerificationEmail = async (email, verificationUrl) => {
  try {
    const transport = initializeTransporter();
    
    const mailOptions = {
      from: `"FetchNews" <${process.env.SMTP_FROM_EMAIL || 'noreply@fetchnews.app'}>`,
      to: email,
      subject: 'Verify Your Email - FetchNews',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✉️ Welcome to FetchNews!</h1>
            </div>
            <div class="content">
              <p>Hi there,</p>
              <p>Thank you for signing up for FetchNews! We're excited to have you on board.</p>
              <p>To get started, please verify your email address by clicking the button below:</p>
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
              <p>If you didn't create a FetchNews account, you can safely ignore this email.</p>
              <p>Best regards,<br>The FetchNews Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} FetchNews. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to FetchNews!
        
        Hi there,
        
        Thank you for signing up for FetchNews! We're excited to have you on board.
        
        To get started, please verify your email address by visiting this link:
        ${verificationUrl}
        
        This link will expire in 24 hours.
        
        If you didn't create a FetchNews account, you can safely ignore this email.
        
        Best regards,
        The FetchNews Team
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check if email is from a disposable email provider
 * @param {string} email - Email address to check
 * @returns {boolean} - True if disposable email
 */
const isDisposableEmail = (email) => {
  // Common disposable email domains
  const disposableDomains = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
    '10minutemail.com', 'trashmail.com', 'fakeinbox.com', 'maildrop.cc',
    'temp-mail.org', 'getnada.com', 'yopmail.com', 'sharklasers.com',
    'guerrillamailblock.com', 'spam4.me', 'grr.la', 'getairmail.com'
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.includes(domain);
};

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  isValidEmail,
  isDisposableEmail
};

